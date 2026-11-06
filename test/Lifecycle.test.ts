// SPDX-License-Identifier: MIT
/**
 * Integration: the entire AquaPrime lifecycle in one story, with conservation checks.
 *   maker ships 3 strategies → anon + human borrow → 30 days of interest → ETH crashes →
 *   keeper starts auctions → grace → zero-capital flash liquidation via LP backstop →
 *   borrowers repay & withdraw → auctions closed → maker docks everything.
 */
import "@nomicfoundation/hardhat-chai-matchers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";

const { ethers } = require("hardhat");
const usdc = (n: number | string) => ethers.parseUnits(String(n), 6);
const weth = (n: number | string) => ethers.parseEther(String(n));
const px = (n: number) => BigInt(Math.round(n * 1e8));
const E18 = 10n ** 18n;
const ORDER_TUPLE = ["tuple(address maker, uint256 traits, bytes data)"];
const plain = (o: any) => ({ maker: o.maker, traits: o.traits, data: o.data });
const enc = (o: any) => ethers.AbiCoder.defaultAbiCoder().encode(ORDER_TUPLE, [[o.maker, o.traits, o.data]]);
const fmtU = (v: bigint) => ethers.formatUnits(v, 6);
const fmtE = (v: bigint) => ethers.formatEther(v);

describe("AquaPrime · full lifecycle (integration)", function () {
  this.timeout(120_000);

  it("runs maker → borrow → crash → human-approved rescue → repay → dock with conserved balances", async function () {
    const [owner, maker, anon, human, keeper, attester, treasury]: Signer[] = await ethers.getSigners();
    const A = async (s: Signer) => s.getAddress();

    // ── deploy ──
    const aqua = await ethers.deployContract("Aqua");
    const wethT = await ethers.deployContract("WETHMock");
    const usdcT = await ethers.deployContract("TokenMockDecimals", ["USD Coin", "USDC", 6]);
    const feed = await ethers.deployContract("OperatorPriceFeed", [8, "ETH / USD", px(2500), await A(owner)]);
    const router = await ethers.deployContract("AquaPrimeRouter", [await aqua.getAddress(), await wethT.getAddress(), await A(owner)]);
    const builder = await ethers.deployContract("StrategyBuilder");
    const registry = await ethers.deployContract("CreditPositionRegistry", [await aqua.getAddress(), await router.getAddress(), await builder.getAddress(),
      await wethT.getAddress(), await usdcT.getAddress(), await feed.getAddress(), await A(treasury), await A(attester), await A(owner)]);
    const executor = await ethers.deployContract("LiquidationExecutor", [await aqua.getAddress(), await router.getAddress(), await registry.getAddress(), await A(owner)]);
    const amm = await ethers.deployContract("AquaAMM", [await aqua.getAddress()]);
    await executor.setOperator(await A(keeper), true);
    const [W, U, R, RT, EX] = [await wethT.getAddress(), await usdcT.getAddress(), await registry.getAddress(), await router.getAddress(), await executor.getAddress()];

    // ── funding ──
    await usdcT.mint(await A(maker), usdc(100_000));
    await wethT.connect(maker).deposit({ value: weth(40) });
    for (const b of [anon, human]) await wethT.connect(b).deposit({ value: weth(10) });
    await usdcT.mint(await A(anon), usdc(2_000));   // to pay interest later
    await usdcT.mint(await A(human), usdc(2_000));
    const participants = [maker, anon, human, keeper, treasury];
    const supplyU = await usdcT.totalSupply(), supplyW = await wethT.totalSupply();

    // ── 1. maker ships 3 strategies from one wallet ──
    await usdcT.connect(maker).approve(await aqua.getAddress(), ethers.MaxUint256);
    await wethT.connect(maker).approve(await aqua.getAddress(), ethers.MaxUint256);
    const [cs, creditHash] = await registry.creditLineStrategy(await A(maker), 800, 1);
    await aqua.connect(maker).ship(R, cs, [U], [usdc(100_000)]);
    await registry.connect(maker).registerCreditLine(800, 1);
    const backstop = plain(await builder.buildBackstopOrder(await A(maker), EX, await feed.getAddress(), W, U, 100, 3600, 1));
    await aqua.connect(maker).ship(RT, enc(backstop), [W, U], [0, usdc(100_000)]);
    const ammOrder = plain(await amm.buildProgram(await A(maker), W, U, 3_000_000, 0, 0, 0, 0, ethers.ZeroAddress, 1, 0));
    const wethIsA = BigInt(W) < BigInt(U);
    await aqua.connect(maker).ship(RT, enc(ammOrder), wethIsA ? [W, U] : [U, W], wethIsA ? [weth(40), usdc(100_000)] : [usdc(100_000), weth(40)]);
    expect(await usdcT.balanceOf(await A(maker))).to.equal(usdc(100_000)); // 300k virtual, 0 moved

    // ── 2. borrowers ──
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = BigInt(await time.latest()) + 600n;
    const sig = await attester.signTypedData({ name: "AquaPrime", version: "1", chainId, verifyingContract: R },
      { HumanAttestation: [{ name: "wallet", type: "address" }, { name: "nullifier", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      { wallet: await A(human), nullifier: 42n, deadline });
    await registry.connect(human).verifyHuman(42n, deadline, sig);
    for (const [b, d] of [[anon, 15_000], [human, 19_000]] as const) {
      await wethT.connect(b).approve(R, weth(10));
      await registry.connect(b).depositCollateral(weth(10));
      await registry.connect(b).borrow(usdc(d), creditHash);
    }
    expect(await registry.creditLineAvailable(creditHash)).to.equal(usdc(66_000));

    // ── 3. a month passes ──
    await time.increase(30 * 86_400);
    await feed.heartbeat();
    const anonDebt0 = (await registry.position(await A(anon))).debt;
    expect(anonDebt0).to.be.gt(usdc(15_090)); // ~8% APR × 30d

    // ── 4. crash: both go underwater ──
    await feed.setAnswer(px(2100));
    for (const b of [anon, human]) expect(await registry.healthFactor(await A(b))).to.be.lt(E18);
    await registry.connect(keeper).startAuction(await A(anon));
    await registry.connect(keeper).startAuction(await A(human));

    // human: grace blocks the keeper; anon: immediate
    await expect(executor.connect(keeper).liquidate(await A(human), backstop, 0, 0, await A(keeper))).to.be.revertedWithCustomError(router, "HumanGracePeriodActive");
    const anonColl0 = (await registry.position(await A(anon))).collateral;
    await executor.connect(keeper).liquidate(await A(anon), backstop, 0, 1, await A(keeper));
    await time.increase(181);
    await executor.connect(keeper).liquidate(await A(human), backstop, 0, 1, await A(keeper));

    for (const b of [anon, human]) {
      const p = await registry.position(await A(b));
      expect(p.healthFactor).to.be.gte(E18);
      expect(p.healthFactor).to.be.lte(1_025n * E18 / 1000n);
      expect(p.auctionActive).to.equal(false);
    }
    const anonSold = anonColl0 - (await registry.position(await A(anon))).collateral;
    expect(anonSold).to.be.lt(weth(3)); // surgical: <30% of collateral

    // ── 5. borrowers repay in full, withdraw, auctions docked ──
    for (const b of [anon, human]) {
      const who = await A(b);
      const debt = (await registry.position(who)).debt;
      const need = debt + usdc(1);
      if ((await usdcT.balanceOf(who)) < need) await usdcT.mint(who, need); // top-up only if short
      await usdcT.connect(b).approve(R, need);
      await registry.connect(b).repay(who, need);
      expect((await registry.position(who)).debt).to.equal(0n);
      await registry.closeAuction(who);
      const coll = (await registry.position(who)).collateral;
      await registry.connect(b).withdrawCollateral(coll);
    }

    // ── 6. maker docks every strategy ──
    await aqua.connect(maker).dock(R, creditHash, [U]);
    await aqua.connect(maker).dock(RT, await router.hash(backstop), [W, U]);
    await aqua.connect(maker).dock(RT, await router.hash(ammOrder), wethIsA ? [W, U] : [U, W]);

    // ── conservation & custody ──
    for (const c of [R, EX, RT]) {
      expect(await usdcT.balanceOf(c), `USDC left in ${c}`).to.equal(0n);
      expect(await wethT.balanceOf(c), `WETH left in ${c}`).to.equal(0n);
    }
    const sum = async (t: any) => (await Promise.all(participants.map(async (s) => t.balanceOf(await A(s))))).reduce((a: bigint, b: bigint) => a + b, 0n);
    expect(await sum(usdcT)).to.equal(await usdcT.totalSupply());
    expect(await sum(wethT)).to.equal(await wethT.totalSupply());
    expect(await wethT.totalSupply()).to.equal(supplyW);

    const makerU = await usdcT.balanceOf(await A(maker)), makerW = await wethT.balanceOf(await A(maker));
    const treasuryU = await usdcT.balanceOf(await A(treasury)), treasuryW = await wethT.balanceOf(await A(treasury));
    const keeperU = await usdcT.balanceOf(await A(keeper));
    // maker: earned interest (90%) and swapped some USDC into discounted WETH via the backstop
    const makerValueBefore = 100_000 + 40 * 2100, makerValueAfter = Number(fmtU(makerU)) + Number(fmtE(makerW)) * 2100;
    expect(makerValueAfter).to.be.gt(makerValueBefore);
    expect(treasuryU).to.be.gt(0n);
    expect(treasuryW).to.be.gt(0n);
    expect(keeperU).to.be.gt(0n);

    console.log("\n      lifecycle P&L @ ETH $2,100");
    console.table({
      maker: { USDC: fmtU(makerU), WETH: fmtE(makerW), "Δ value $": (makerValueAfter - makerValueBefore).toFixed(2) },
      treasury: { USDC: fmtU(treasuryU), WETH: fmtE(treasuryW), "Δ value $": (Number(fmtU(treasuryU)) + Number(fmtE(treasuryW)) * 2100).toFixed(2) },
      keeper: { USDC: fmtU(keeperU), WETH: "0", "Δ value $": fmtU(keeperU) },
      "anon sold": { USDC: "-", WETH: fmtE(anonSold), "Δ value $": "-" },
    });
    expect(await usdcT.totalSupply()).to.be.gte(supplyU);
  });
});
