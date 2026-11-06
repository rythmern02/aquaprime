// SPDX-License-Identifier: MIT
import "@nomicfoundation/hardhat-chai-matchers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const { ethers } = require("hardhat");

const usdc = (n: number | string) => ethers.parseUnits(String(n), 6);
const weth = (n: number | string) => ethers.parseEther(String(n));
const px = (n: number) => BigInt(Math.round(n * 1e8)); // 8-decimal Chainlink-style answer
const ORDER_TUPLE = ["tuple(address maker, uint256 traits, bytes data)"];
const encodeOrder = (o: any) => ethers.AbiCoder.defaultAbiCoder().encode(ORDER_TUPLE, [[o.maker, o.traits, o.data]]);
const plain = (o: any) => ({ maker: o.maker, traits: o.traits, data: o.data });
const E18 = 10n ** 18n;

async function deployFixture() {
  const [owner, lender, borrower, human, keeper, attester, treasury, outsider]: Signer[] = await ethers.getSigners();

  const aqua = await ethers.deployContract("Aqua");
  const wethT = await ethers.deployContract("WETHMock");
  const usdcT = await ethers.deployContract("TokenMockDecimals", ["USD Coin", "USDC", 6]);
  const feed = await ethers.deployContract("OperatorPriceFeed", [8, "ETH / USD", px(2500), await owner.getAddress()]);
  const router = await ethers.deployContract("AquaPrimeRouter", [await aqua.getAddress(), await wethT.getAddress(), await owner.getAddress()]);
  const builder = await ethers.deployContract("StrategyBuilder");
  const registry = await ethers.deployContract("CreditPositionRegistry", [
    await aqua.getAddress(), await router.getAddress(), await builder.getAddress(),
    await wethT.getAddress(), await usdcT.getAddress(), await feed.getAddress(),
    await treasury.getAddress(), await attester.getAddress(), await owner.getAddress(),
  ]);
  const executor = await ethers.deployContract("LiquidationExecutor", [
    await aqua.getAddress(), await router.getAddress(), await registry.getAddress(), await owner.getAddress(),
  ]);
  await executor.setOperator(await keeper.getAddress(), true);
  const aquaAMM = await ethers.deployContract("AquaAMM", [await aqua.getAddress()]);

  // ── Funding: LP wallet holds 100k USDC + 40 WETH, borrowers hold WETH ──
  await usdcT.mint(await lender.getAddress(), usdc(100_000));
  await wethT.connect(lender).deposit({ value: weth(40) });
  for (const b of [borrower, human]) await wethT.connect(b).deposit({ value: weth(10) });
  await usdcT.connect(lender).approve(await aqua.getAddress(), ethers.MaxUint256);
  await wethT.connect(lender).approve(await aqua.getAddress(), ethers.MaxUint256);

  // ── Strategy A: Aqua credit line (app = registry) ──
  const [creditStrategy, creditHash] = await registry.creditLineStrategy(await lender.getAddress(), 800, 1);
  await aqua.connect(lender).ship(await registry.getAddress(), creditStrategy, [await usdcT.getAddress()], [usdc(100_000)]);
  await registry.connect(lender).registerCreditLine(800, 1);

  // ── Strategy B: oracle backstop bid (0xf1), fillable only by the executor ──
  const backstop = plain(await builder.buildBackstopOrder(
    await lender.getAddress(), await executor.getAddress(), await feed.getAddress(),
    await wethT.getAddress(), await usdcT.getAddress(), 100, 3600, 1,
  ));
  await aqua.connect(lender).ship(await router.getAddress(), encodeOrder(backstop),
    [await wethT.getAddress(), await usdcT.getAddress()], [0, usdc(100_000)]);

  // ── Strategy C: XYC AMM (stock AquaAMM program) on the same router ──
  const amm = plain(await aquaAMM.buildProgram(await lender.getAddress(), await wethT.getAddress(), await usdcT.getAddress(),
    0, 0, 0, 0, 0, ethers.ZeroAddress, 7, 0));
  const [ammA] = [amm.data.slice(0, 42)];
  const ammAmounts = ammA.toLowerCase() === (await wethT.getAddress()).toLowerCase()
    ? [weth(40), usdc(100_000)] : [usdc(100_000), weth(40)];
  const ammTokens = ammA.toLowerCase() === (await wethT.getAddress()).toLowerCase()
    ? [await wethT.getAddress(), await usdcT.getAddress()] : [await usdcT.getAddress(), await wethT.getAddress()];
  await aqua.connect(lender).ship(await router.getAddress(), encodeOrder(amm), ammTokens, ammAmounts);

  return { owner, lender, borrower, human, keeper, attester, treasury, outsider,
    aqua, wethT, usdcT, feed, router, builder, registry, executor, aquaAMM,
    creditHash, backstop, amm };
}

async function signHuman(f: any, wallet: string, nullifier: bigint, deadline: bigint, signer = f.attester) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    { name: "AquaPrime", version: "1", chainId, verifyingContract: await f.registry.getAddress() },
    { HumanAttestation: [
      { name: "wallet", type: "address" }, { name: "nullifier", type: "uint256" }, { name: "deadline", type: "uint256" },
    ] },
    { wallet, nullifier, deadline },
  );
}

async function openPosition(f: any, who: Signer, collateral: bigint, debt: bigint) {
  await f.wethT.connect(who).approve(await f.registry.getAddress(), collateral);
  await f.registry.connect(who).depositCollateral(collateral);
  await f.registry.connect(who).borrow(debt, f.creditHash);
}

async function makeHuman(f: any, who: Signer, nullifier = 4242n) {
  const deadline = BigInt(await time.latest()) + 600n;
  const sig = await signHuman(f, await who.getAddress(), nullifier, deadline);
  await f.registry.connect(who).verifyHuman(nullifier, deadline, sig);
}

describe("AquaPrime", function () {
  describe("Maker: zero-custody shared liquidity (SLAC)", function () {
    it("backs three live strategies with one wallet — 3.0x SLAC, zero tokens moved", async function () {
      const f = await loadFixture(deployFixture);
      const lender = await f.lender.getAddress();
      expect(await f.usdcT.balanceOf(lender)).to.equal(usdc(100_000)); // nothing left the wallet

      const [a] = await f.aqua.rawBalances(lender, await f.registry.getAddress(), f.creditHash, await f.usdcT.getAddress());
      const bHash = await f.router.hash(f.backstop);
      const cHash = await f.router.hash(f.amm);
      const [b] = await f.aqua.rawBalances(lender, await f.router.getAddress(), bHash, await f.usdcT.getAddress());
      const [c] = await f.aqua.rawBalances(lender, await f.router.getAddress(), cHash, await f.usdcT.getAddress());
      const virtual = BigInt(a) + BigInt(b) + BigInt(c);
      expect(virtual).to.equal(usdc(300_000));
      expect(virtual * 10n / (await f.usdcT.balanceOf(lender))).to.equal(30n); // SLAC 3.0x
    });

    it("stock AquaAMM bytecode executes on AquaPrimeRouter (opcode-table compatibility)", async function () {
      const f = await loadFixture(deployFixture);
      await f.usdcT.mint(await f.outsider.getAddress(), usdc(2_500));
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), usdc(2_500));
      const usdcIsA = BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress());
      const traits = TakerTraitsLib.build({
        taker: await f.outsider.getAddress(), isExactIn: true, isAToB: usdcIsA,
        threshold: weth("0.9"), useTransferFromAndAquaPush: true,
      });
      await expect(f.router.connect(f.outsider).swap(f.amm, usdc(2_500), traits))
        .to.changeTokenBalance(f.usdcT, f.lender, usdc(2_500));
    });

    it("dock() retires a strategy without touching the wallet", async function () {
      const f = await loadFixture(deployFixture);
      const cHash = await f.router.hash(f.amm);
      const tokens = [await f.wethT.getAddress(), await f.usdcT.getAddress()];
      await f.aqua.connect(f.lender).dock(await f.router.getAddress(), cHash, tokens);
      const [, count] = await f.aqua.rawBalances(await f.lender.getAddress(), await f.router.getAddress(), cHash, tokens[1]);
      expect(count).to.equal(0xff);
      expect(await f.usdcT.balanceOf(await f.lender.getAddress())).to.equal(usdc(100_000));
    });
  });

  describe("Borrower: Aqua-pulled credit + World ID tiers", function () {
    it("pulls USDC straight from the lender wallet into the borrower wallet", async function () {
      const f = await loadFixture(deployFixture);
      await f.wethT.connect(f.borrower).approve(await f.registry.getAddress(), weth(10));
      await f.registry.connect(f.borrower).depositCollateral(weth(10));
      const tx = f.registry.connect(f.borrower).borrow(usdc(15_000), f.creditHash);
      await expect(tx).to.changeTokenBalances(f.usdcT, [f.lender, f.borrower], [-usdc(15_000), usdc(15_000)]);
      expect(await f.registry.creditLineAvailable(f.creditHash)).to.equal(usdc(85_000));
      expect(await f.usdcT.balanceOf(await f.registry.getAddress())).to.equal(0n); // registry never holds LP funds
    });

    it("anonymous wallets are capped at 150% collateral", async function () {
      const f = await loadFixture(deployFixture);
      // 10 WETH @ 2500 = 25,000 → max debt 16,666
      await expect(openPosition(f, f.borrower, weth(10), usdc(17_000)))
        .to.be.revertedWithCustomError(f.registry, "InsufficientHealth");
    });

    it("World ID verified humans unlock 115% collateral", async function () {
      const f = await loadFixture(deployFixture);
      await makeHuman(f, f.human);
      expect(await f.registry.liquidationRatioBps(await f.human.getAddress())).to.equal(11_500);
      await openPosition(f, f.human, weth(10), usdc(21_000)); // > anon cap, < 21,739 human cap
      expect((await f.registry.position(await f.human.getAddress())).human).to.equal(true);
    });

    it("rejects forged, expired and Sybil (re-used nullifier) attestations", async function () {
      const f = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const who = await f.borrower.getAddress();
      const forged = await signHuman(f, who, 1n, now + 600n, f.outsider);
      await expect(f.registry.connect(f.borrower).verifyHuman(1n, now + 600n, forged))
        .to.be.revertedWithCustomError(f.registry, "InvalidAttestation");
      const expired = await signHuman(f, who, 1n, now - 1n);
      await expect(f.registry.connect(f.borrower).verifyHuman(1n, now - 1n, expired))
        .to.be.revertedWithCustomError(f.registry, "AttestationExpired");
      // attestation is bound to the wallet — someone else cannot replay it
      const good = await signHuman(f, who, 7n, now + 600n);
      await expect(f.registry.connect(f.outsider).verifyHuman(7n, now + 600n, good))
        .to.be.revertedWithCustomError(f.registry, "InvalidAttestation");
      await f.registry.connect(f.borrower).verifyHuman(7n, now + 600n, good);
      // same human (nullifier) cannot bind a second wallet
      const sybil = await signHuman(f, await f.human.getAddress(), 7n, now + 600n);
      await expect(f.registry.connect(f.human).verifyHuman(7n, now + 600n, sybil))
        .to.be.revertedWithCustomError(f.registry, "NullifierAlreadyBound");
    });

    it("repayment pushes principal back into the lender's Aqua credit line; interest funds the treasury", async function () {
      const f = await loadFixture(deployFixture);
      await openPosition(f, f.borrower, weth(10), usdc(10_000));
      await time.increase(365 * 24 * 3600);
      await f.feed.heartbeat(); // keep the oracle fresh after the time jump
      const pos = await f.registry.position(await f.borrower.getAddress());
      expect(pos.interest).to.be.gt(usdc(800)); // ~8% APR (compounding on interaction)
      const owed = pos.debt + usdc(10);
      await f.usdcT.mint(await f.borrower.getAddress(), owed);
      await f.usdcT.connect(f.borrower).approve(await f.registry.getAddress(), owed);
      const treasuryBefore = await f.usdcT.balanceOf(await f.treasury.getAddress());
      await f.registry.connect(f.borrower).repay(await f.borrower.getAddress(), owed);
      const after = await f.registry.position(await f.borrower.getAddress());
      expect(after.debt).to.equal(0n);
      const cut = (await f.usdcT.balanceOf(await f.treasury.getAddress())) - treasuryBefore;
      expect(cut).to.be.gt(0n);
      // lender capacity restored (+ 90% of interest)
      expect(await f.registry.creditLineAvailable(f.creditHash)).to.be.gt(usdc(100_000));
      expect(await f.usdcT.balanceOf(await f.registry.getAddress())).to.equal(0n);
    });
  });

  describe("Surgical liquidation — SwapVM opcode 0xf0", function () {
    async function crashedHuman() {
      const f = await loadFixture(deployFixture);
      await makeHuman(f, f.human);
      await openPosition(f, f.human, weth(10), usdc(17_000));
      await f.feed.setAnswer(px(1900)); // −24% crash
      return f;
    }

    it("cannot start an auction on a healthy position", async function () {
      const f = await loadFixture(deployFixture);
      await openPosition(f, f.borrower, weth(10), usdc(10_000));
      await expect(f.registry.startAuction(await f.borrower.getAddress()))
        .to.be.revertedWithCustomError(f.registry, "PositionNotLiquidatable");
    });

    it("ships a registry-owned SwapVM auction into Aqua when HF < 1", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      expect(await f.registry.healthFactor(who)).to.be.lt(E18);
      await expect(f.registry.startAuction(who)).to.emit(f.registry, "AuctionStarted");
      const order = plain(await f.registry.auctionOrder(who));
      const hash = await f.router.hash(order);
      const [bal] = await f.aqua.rawBalances(await f.registry.getAddress(), await f.router.getAddress(), hash, await f.wethT.getAddress());
      expect(bal).to.equal(weth(10));
      // program starts with custom opcode 0xf0
      const programStart = order.data.length - 2 * (2 + 40 + 2 + 1 + 2 + 8);
      expect(order.data.slice(programStart, programStart + 2)).to.equal("f0");
    });

    it("0xf0 blocks fills during the World ID human grace window", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      await f.registry.startAuction(who);
      await expect(f.executor.connect(f.keeper).liquidate(who, f.backstop, 0, 0, await f.keeper.getAddress()))
        .to.be.revertedWithCustomError(f.router, "HumanGracePeriodActive");
    });

    it("keeper flash-liquidates only the surgical slice: HF → 1.02, LP backstop absorbs, everyone paid", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      await f.registry.startAuction(who);
      await time.increase(181);

      const lender = await f.lender.getAddress();
      const before = {
        lenderUsdc: await f.usdcT.balanceOf(lender),
        lenderWeth: await f.wethT.balanceOf(lender),
        credit: await f.registry.creditLineAvailable(f.creditHash),
        treasuryWeth: await f.wethT.balanceOf(await f.treasury.getAddress()),
        pos: await f.registry.position(who),
      };
      const quote = await f.registry.liquidationQuote(who);

      await expect(f.executor.connect(f.keeper).liquidate(who, f.backstop, 0, 1, await f.keeper.getAddress()))
        .to.emit(f.registry, "SurgicalLiquidation");

      const pos = await f.registry.position(who);
      // HF restored to ~1.02, not a wipe-out
      expect(pos.healthFactor).to.be.gte(E18);
      expect(pos.healthFactor).to.be.lte(1_025n * E18 / 1000n);
      const seized = before.pos.collateral - pos.collateral;
      expect(seized).to.be.lt(weth(4)); // < 40% of collateral
      expect(pos.collateral).to.be.gt(weth(6));
      expect(pos.auctionActive).to.equal(false);

      // repayment went back into the lender's credit line through aqua.push
      expect(await f.registry.creditLineAvailable(f.creditHash) - before.credit).to.be.closeTo(quote.debtToCover, quote.debtToCover / 100n); // discount ticks per block
      // backstop: LP paid USDC from wallet (aqua.pull) and received WETH (aqua.push)
      expect(await f.wethT.balanceOf(lender)).to.be.gt(before.lenderWeth);
      // keeper earned the spread, treasury earned the liquidation fee
      expect(await f.usdcT.balanceOf(await f.keeper.getAddress())).to.be.gt(0n);
      expect(await f.wethT.balanceOf(await f.treasury.getAddress())).to.be.gt(before.treasuryWeth);
      // nothing stranded in protocol contracts
      expect(await f.usdcT.balanceOf(await f.registry.getAddress())).to.equal(0n);
      expect(await f.usdcT.balanceOf(await f.executor.getAddress())).to.equal(0n);
      expect(await f.wethT.balanceOf(await f.executor.getAddress())).to.equal(0n);
    });

    it("rejects fills beyond the surgical cap (SurgicalCapExceeded)", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      await f.registry.startAuction(who);
      await time.increase(181);
      const q = await f.registry.liquidationQuote(who);
      const amount = q.debtToCover + usdc(500);
      await f.usdcT.mint(await f.outsider.getAddress(), amount);
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), amount);
      const traits = TakerTraitsLib.build({
        taker: await f.outsider.getAddress(), isExactIn: true,
        isAToB: BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress()),
        useTransferFromAndAquaPush: true,
      });
      const order = plain(await f.registry.auctionOrder(who));
      await expect(f.router.connect(f.outsider).swap(order, amount, traits))
        .to.be.revertedWithCustomError(f.router, "SurgicalCapExceeded");
    });

    it("any taker can fill the exact slice directly (permissionless), then the auction stops", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      await f.registry.startAuction(who);
      await time.increase(181);
      const q = await f.registry.liquidationQuote(who);
      await f.usdcT.mint(await f.outsider.getAddress(), q.debtToCover * 2n);
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), ethers.MaxUint256);
      const traits = TakerTraitsLib.build({
        taker: await f.outsider.getAddress(), isExactIn: true,
        isAToB: BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress()),
        useTransferFromAndAquaPush: true,
      });
      const order = plain(await f.registry.auctionOrder(who));
      const q2 = await f.registry.liquidationQuote(who); // discount ticks each block
      await f.router.connect(f.outsider).swap(order, q2.debtToCover * 99n / 100n, traits);
      expect(await f.registry.healthFactor(who)).to.be.gte(E18);
      await expect(f.router.connect(f.outsider).swap(order, usdc(10), traits))
        .to.be.revertedWithCustomError(f.router, "NoActiveAuction");
      await f.registry.closeAuction(who);
      const [, count] = await f.aqua.rawBalances(await f.registry.getAddress(), await f.router.getAddress(),
        await f.router.hash(order), await f.wethT.getAddress());
      expect(count).to.equal(0xff); // docked
    });

    it("anonymous positions have no grace window and use the 150% ratio", async function () {
      const f = await loadFixture(deployFixture);
      await openPosition(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      const who = await f.borrower.getAddress();
      await f.registry.startAuction(who);
      await f.executor.connect(f.keeper).liquidate(who, f.backstop, 0, 0, await f.keeper.getAddress());
      const hf = await f.registry.healthFactor(who);
      expect(hf).to.be.gte(E18);
      expect(hf).to.be.lte(1_025n * E18 / 1000n);
    });

    it("the LP backstop (0xf1) is only fillable by the executor", async function () {
      const f = await loadFixture(deployFixture);
      await f.wethT.connect(f.outsider).deposit({ value: weth(1) });
      await f.wethT.connect(f.outsider).approve(await f.router.getAddress(), weth(1));
      const traits = TakerTraitsLib.build({
        taker: await f.outsider.getAddress(), isExactIn: true,
        isAToB: BigInt(await f.wethT.getAddress()) < BigInt(await f.usdcT.getAddress()),
        useTransferFromAndAquaPush: true,
      });
      await expect(f.router.connect(f.outsider).swap(f.backstop, weth(1), traits))
        .to.be.revertedWithCustomError(f.router, "WhitelistInvalidTaker");
    });

    it("only allow-listed keeper operators can trigger the executor", async function () {
      const f = await crashedHuman();
      await expect(f.executor.connect(f.outsider).liquidate(await f.human.getAddress(), f.backstop, 0, 0, await f.outsider.getAddress()))
        .to.be.revertedWithCustomError(f.executor, "NotOperator");
    });

    it("stale oracle halts liquidations instead of liquidating on bad data", async function () {
      const f = await crashedHuman();
      const who = await f.human.getAddress();
      await f.registry.startAuction(who);
      await time.increase(3601);
      await expect(f.registry.liquidationQuote(who)).to.be.revertedWithCustomError(f.registry, "StalePrice");
    });
  });
});
