// SPDX-License-Identifier: MIT
import "@nomicfoundation/hardhat-chai-matchers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const { ethers } = require("hardhat");

const usdc = (n: number | string) => ethers.parseUnits(String(n), 6);
const weth = (n: number | string) => ethers.parseEther(String(n));
const px = (n: number) => BigInt(Math.round(n * 1e8));
const E18 = 10n ** 18n;
const ORDER_TUPLE = ["tuple(address maker, uint256 traits, bytes data)"];
const plain = (o: any) => ({ maker: o.maker, traits: o.traits, data: o.data });
const encodeOrder = (o: any) => ethers.AbiCoder.defaultAbiCoder().encode(ORDER_TUPLE, [[o.maker, o.traits, o.data]]);

async function fixture() {
  const [owner, lender, borrower, human, keeper, attester, treasury, outsider]: Signer[] = await ethers.getSigners();
  const aqua = await ethers.deployContract("Aqua");
  const wethT = await ethers.deployContract("WETHMock");
  const usdcT = await ethers.deployContract("TokenMockDecimals", ["USD Coin", "USDC", 6]);
  const feed = await ethers.deployContract("OperatorPriceFeed", [8, "ETH / USD", px(2500), await owner.getAddress()]);
  const router = await ethers.deployContract("AquaPrimeRouter", [await aqua.getAddress(), await wethT.getAddress(), await owner.getAddress()]);
  const builder = await ethers.deployContract("StrategyBuilder");
  const registry = await ethers.deployContract("CreditPositionRegistry", [
    await aqua.getAddress(), await router.getAddress(), await builder.getAddress(), await wethT.getAddress(), await usdcT.getAddress(),
    await feed.getAddress(), await treasury.getAddress(), await attester.getAddress(), await owner.getAddress(),
  ]);
  const executor = await ethers.deployContract("LiquidationExecutor", [await aqua.getAddress(), await router.getAddress(), await registry.getAddress(), await owner.getAddress()]);
  await executor.setOperator(await keeper.getAddress(), true);

  await usdcT.mint(await lender.getAddress(), usdc(200_000));
  await usdcT.connect(lender).approve(await aqua.getAddress(), ethers.MaxUint256);
  for (const b of [borrower, human, outsider]) await wethT.connect(b).deposit({ value: weth(50) });

  const [creditStrategy, creditHash] = await registry.creditLineStrategy(await lender.getAddress(), 800, 1);
  await aqua.connect(lender).ship(await registry.getAddress(), creditStrategy, [await usdcT.getAddress()], [usdc(100_000)]);
  await registry.connect(lender).registerCreditLine(800, 1);

  const backstop = plain(await builder.buildBackstopOrder(await lender.getAddress(), await executor.getAddress(), await feed.getAddress(),
    await wethT.getAddress(), await usdcT.getAddress(), 100, 3600, 1));
  await aqua.connect(lender).ship(await router.getAddress(), encodeOrder(backstop), [await wethT.getAddress(), await usdcT.getAddress()], [0, usdc(100_000)]);

  return { owner, lender, borrower, human, keeper, attester, treasury, outsider, aqua, wethT, usdcT, feed, router, builder, registry, executor, creditHash, backstop };
}

async function open(f: any, who: Signer, c: bigint, d: bigint) {
  await f.wethT.connect(who).approve(await f.registry.getAddress(), c);
  await f.registry.connect(who).depositCollateral(c);
  if (d > 0n) await f.registry.connect(who).borrow(d, f.creditHash);
}

async function human(f: any, who: Signer, nullifier: bigint) {
  const { chainId } = await ethers.provider.getNetwork();
  const deadline = BigInt(await time.latest()) + 600n;
  const sig = await f.attester.signTypedData(
    { name: "AquaPrime", version: "1", chainId, verifyingContract: await f.registry.getAddress() },
    { HumanAttestation: [{ name: "wallet", type: "address" }, { name: "nullifier", type: "uint256" }, { name: "deadline", type: "uint256" }] },
    { wallet: await who.getAddress(), nullifier, deadline });
  await f.registry.connect(who).verifyHuman(nullifier, deadline, sig);
}

const takerTraits = (taker: string, isAToB: boolean, extra: object = {}) =>
  TakerTraitsLib.build({ taker, isExactIn: true, isAToB, useTransferFromAndAquaPush: true, ...extra });

describe("AquaPrime · edge cases & invariants", function () {
  describe("opcode 0xf0 guard", function () {
    it("rejects the wrong swap direction (selling WETH into the auction)", async function () {
      const f = await loadFixture(fixture);
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(await f.borrower.getAddress());
      const order = plain(await f.registry.auctionOrder(await f.borrower.getAddress()));
      await f.wethT.connect(f.outsider).approve(await f.router.getAddress(), weth(1));
      const wethIsA = BigInt(await f.wethT.getAddress()) < BigInt(await f.usdcT.getAddress());
      await expect(f.router.connect(f.outsider).swap(order, weth(1), takerTraits(await f.outsider.getAddress(), wethIsA)))
        .to.be.revertedWithCustomError(f.router, "SolvencyGuardDirectionMismatch");
    });

    it("only governs orders whose maker is the registry (copycat makers revert)", async function () {
      const f = await loadFixture(fixture);
      const wethA = await f.wethT.getAddress(), usdcA = await f.usdcT.getAddress();
      // an outsider ships an order whose program points the 0xf0 guard at the real registry
      const fake = plain(await f.builder.buildAuctionOrder(await f.registry.getAddress(), wethA, usdcA, await f.borrower.getAddress(), 1));
      const forged = { ...fake, maker: await f.outsider.getAddress() };
      await f.wethT.connect(f.outsider).approve(await f.aqua.getAddress(), weth(1));
      await f.aqua.connect(f.outsider).ship(await f.router.getAddress(), encodeOrder(forged), [wethA, usdcA], [weth(1), 0]);
      await f.usdcT.mint(await f.keeper.getAddress(), usdc(100));
      await f.usdcT.connect(f.keeper).approve(await f.router.getAddress(), usdc(100));
      await expect(f.router.connect(f.keeper).swap(forged, usdc(100), takerTraits(await f.keeper.getAddress(), BigInt(usdcA) < BigInt(wethA))))
        .to.be.revertedWithCustomError(f.router, "SolvencyGuardMakerMismatch");
    });

    it("router.quote() matches what swap() executes", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      const order = plain(await f.registry.auctionOrder(who));
      const q = await f.registry.liquidationQuote(who);
      const amount = q.debtToCover / 2n;
      const traits = takerTraits(await f.outsider.getAddress(), BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress()));
      await f.usdcT.mint(await f.outsider.getAddress(), amount);
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), amount);
      await ethers.provider.send("evm_setAutomine", [false]);
      const [qIn, qOut] = await f.router.connect(f.outsider).quote.staticCall(order, amount, traits);
      const tx = await f.router.connect(f.outsider).swap(order, amount, traits);
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);
      const rc = await tx.wait();
      const ev = rc.logs.map((l: any) => { try { return f.router.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === "Swapped");
      expect(ev.args.amountIn).to.equal(qIn);
      // same block ⇒ same Dutch discount ⇒ identical output
      expect(ev.args.amountOut).to.be.closeTo(qOut, qOut / 1000n);
    });
  });

  describe("surgical math — property test", function () {
    it("for 40 random insolvent positions, one full-slice fill lands HF in [1.0, 1.03] or exhausts collateral", async function () {
      const f = await loadFixture(fixture);
      let seed = 1337;
      const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      const signers = (await ethers.getSigners()).slice(8, 48);
      await f.usdcT.mint(await f.outsider.getAddress(), usdc(5_000_000));
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), ethers.MaxUint256);
      await f.feed.setAnswer(px(2500));
      // dedicated 2M USDC credit line so the 40 positions don't exhaust the fixture's 100k line
      await f.usdcT.mint(await f.lender.getAddress(), usdc(2_000_000));
      const [bigS, bigH] = await f.registry.creditLineStrategy(await f.lender.getAddress(), 800, 77);
      await f.aqua.connect(f.lender).ship(await f.registry.getAddress(), bigS, [await f.usdcT.getAddress()], [usdc(2_000_000)]);
      await f.registry.connect(f.lender).registerCreditLine(800, 77);
      const cases: { who: Signer; human: boolean }[] = [];
      for (let i = 0; i < signers.length; i++) {
        const s = signers[i];
        const isHuman = rand() < 0.5;
        const coll = 1 + Math.floor(rand() * 20);
        await f.wethT.connect(s).deposit({ value: weth(coll) });
        if (isHuman) await human(f, s, 10_000n + BigInt(i));
        const ratio = isHuman ? 1.15 : 1.5;
        const debt = Math.floor((coll * 2500 / ratio) * (0.80 + rand() * 0.19));
        await f.wethT.connect(s).approve(await f.registry.getAddress(), weth(coll));
        await f.registry.connect(s).depositCollateral(weth(coll));
        await f.registry.connect(s).borrow(usdc(debt), bigH);
        cases.push({ who: s, human: isHuman });
      }
      await f.feed.setAnswer(px(2500 * (0.70 + rand() * 0.15)));
      const usdcIsA = BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress());
      let liquidated = 0;
      for (const c of cases) {
        const who = await c.who.getAddress();
        if ((await f.registry.healthFactor(who)) >= E18) continue;
        await f.registry.startAuction(who);
        if (c.human) await time.increase(181);
        const order = plain(await f.registry.auctionOrder(who));
        const q = await f.registry.liquidationQuote(who);
        const before = await f.registry.position(who);
        // insolvent: the slice is *all* collateral (net of fee) — HF can't be restored, bad debt is expected
        const insolvent = q.collateralOut * 10_050n / 10_000n >= before.collateral * 999n / 1000n;
        await f.router.connect(f.outsider).swap(order, q.debtToCover * 999n / 1000n, takerTraits(await f.outsider.getAddress(), usdcIsA));
        const pos = await f.registry.position(who);
        if (!insolvent) {
          expect(pos.healthFactor, `HF after for ${who}`).to.be.gte(E18 * 99n / 100n);
          expect(pos.healthFactor).to.be.lte(E18 * 103n / 100n);
        }
        await f.feed.heartbeat();
        liquidated++;
      }
      expect(liquidated).to.be.gte(10);
    });
  });

  describe("borrower lifecycle rules", function () {
    it("collateral withdrawal: free without debt, blocked if it breaks health or during an auction", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), 0n);
      await f.registry.connect(f.borrower).withdrawCollateral(weth(2));
      await f.registry.connect(f.borrower).borrow(usdc(10_000), f.creditHash);
      await expect(f.registry.connect(f.borrower).withdrawCollateral(weth(5))).to.be.revertedWithCustomError(f.registry, "InsufficientHealth");
      await f.feed.setAnswer(px(1700));
      await f.registry.startAuction(who);
      await expect(f.registry.connect(f.borrower).withdrawCollateral(weth(1))).to.be.revertedWithCustomError(f.registry, "AuctionInProgress");
      await expect(f.registry.connect(f.borrower).borrow(usdc(1), f.creditHash)).to.be.revertedWithCustomError(f.registry, "AuctionInProgress");
    });

    it("a position is pinned to one credit line while it has debt", async function () {
      const f = await loadFixture(fixture);
      const [s2, h2] = await f.registry.creditLineStrategy(await f.lender.getAddress(), 500, 2);
      await f.aqua.connect(f.lender).ship(await f.registry.getAddress(), s2, [await f.usdcT.getAddress()], [usdc(10_000)]);
      await f.registry.connect(f.lender).registerCreditLine(500, 2);
      await open(f, f.borrower, weth(10), usdc(1000));
      await expect(f.registry.connect(f.borrower).borrow(usdc(1), h2)).to.be.revertedWithCustomError(f.registry, "CreditLineMismatch");
    });

    it("cannot register a credit line that was never shipped", async function () {
      const f = await loadFixture(fixture);
      await expect(f.registry.connect(f.outsider).registerCreditLine(800, 99)).to.be.revertedWithCustomError(f.registry, "CreditLineNotActive");
    });

    it("borrowing more than the lender's Aqua allocation reverts (Aqua is the cap)", async function () {
      const f = await loadFixture(fixture);
      await f.wethT.connect(f.outsider).deposit({ value: weth(100) });
      await expect(open(f, f.outsider, weth(140), usdc(100_001))).to.be.reverted;
    });

    it("repayment after the lender docks goes straight to the lender wallet", async function () {
      const f = await loadFixture(fixture);
      await open(f, f.borrower, weth(10), usdc(5000));
      await f.aqua.connect(f.lender).dock(await f.registry.getAddress(), f.creditHash, [await f.usdcT.getAddress()]);
      await f.usdcT.connect(f.borrower).approve(await f.registry.getAddress(), usdc(5000));
      await expect(f.registry.connect(f.borrower).repay(await f.borrower.getAddress(), usdc(5000)))
        .to.emit(f.registry, "Repaid");
      // tiny interest accrues between blocks; ~all of it reaches the lender wallet directly (minus 10% reserve)
      expect(await f.usdcT.balanceOf(await f.lender.getAddress())).to.be.closeTo(usdc(200_000) - usdc(5000) + usdc(5000), usdc(1) / 100n);
      expect(await f.registry.creditLineAvailable(f.creditHash)).to.equal(0n);
    });

    it("anyone can repay on a borrower's behalf; overpayment is not taken", async function () {
      const f = await loadFixture(fixture);
      await open(f, f.borrower, weth(10), usdc(1000));
      await f.usdcT.mint(await f.outsider.getAddress(), usdc(5000));
      await f.usdcT.connect(f.outsider).approve(await f.registry.getAddress(), usdc(5000));
      const before = await f.usdcT.balanceOf(await f.outsider.getAddress());
      await f.registry.connect(f.outsider).repay(await f.borrower.getAddress(), usdc(5000));
      const paid = before - (await f.usdcT.balanceOf(await f.outsider.getAddress()));
      expect(paid).to.be.closeTo(usdc(1000), usdc(1) / 100n); // debt incl. a few blocks of interest, never the full 5000
      expect((await f.registry.position(await f.borrower.getAddress())).debt).to.equal(0n);
    });
  });

  describe("auctions", function () {
    it("Dutch discount ramps linearly from start to max over the auction duration", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      expect(await f.registry.currentDiscountBps(who)).to.be.closeTo(150n, 2n);
      await time.increase(300);
      expect(await f.registry.currentDiscountBps(who)).to.be.closeTo(375n, 2n);
      await time.increase(1000);
      expect(await f.registry.currentDiscountBps(who)).to.equal(600n);
    });

    it("closeAuction refuses while insolvent, works after the borrower tops up", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      await expect(f.registry.closeAuction(who)).to.be.revertedWithCustomError(f.registry, "PositionStillLiquidatable");
      await f.wethT.connect(f.borrower).approve(await f.registry.getAddress(), weth(5));
      await f.registry.connect(f.borrower).depositCollateral(weth(5));
      await expect(f.registry.closeAuction(who)).to.emit(f.registry, "AuctionClosed");
      expect((await f.registry.position(who)).auctionActive).to.equal(false);
    });

    it("cannot start a second auction while one is live", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      await expect(f.registry.startAuction(who)).to.be.revertedWithCustomError(f.registry, "AuctionInProgress");
    });

    it("deep crash: collateral is exhausted and the shortfall is recorded as bad debt", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(900));
      await f.registry.startAuction(who);
      const q = await f.registry.liquidationQuote(who);
      expect(q.debtToCover).to.be.lt(usdc(16_000));
      // exact-out: buy ALL remaining collateral (net of fee) — the guard prices it, caps it, and the hook books bad debt
      await f.usdcT.mint(await f.outsider.getAddress(), usdc(20_000));
      await f.usdcT.connect(f.outsider).approve(await f.router.getAddress(), usdc(20_000));
      const order = plain(await f.registry.auctionOrder(who));
      const traits = TakerTraitsLib.build({ taker: await f.outsider.getAddress(), isExactIn: false,
        isAToB: BigInt(await f.usdcT.getAddress()) < BigInt(await f.wethT.getAddress()), useTransferFromAndAquaPush: true });
      await expect(f.router.connect(f.outsider).swap(order, q.collateralOut, traits)).to.emit(f.registry, "BadDebt");
      expect((await f.registry.position(who)).collateral).to.equal(0n);
      expect(await f.registry.totalBadDebt()).to.be.gt(0n);
    });
  });

  describe("access control & config", function () {
    it("maker hooks are router-only; unused hooks always revert", async function () {
      const f = await loadFixture(fixture);
      const a = ethers.ZeroAddress, z = ethers.ZeroHash;
      await expect(f.registry.postTransferIn(a, a, a, a, 0, 0, z, "0x", "0x")).to.be.revertedWithCustomError(f.registry, "OnlyRouter");
      await expect(f.registry.preTransferIn(a, a, a, a, 0, 0, z, "0x", "0x")).to.be.revertedWithCustomError(f.registry, "HookNotSupported");
      await expect(f.registry.preTransferOut(a, a, a, a, 0, 0, z, "0x", "0x")).to.be.revertedWithCustomError(f.registry, "HookNotSupported");
      await expect(f.registry.postTransferOut(a, a, a, a, 0, 0, z, "0x", "0x")).to.be.revertedWithCustomError(f.registry, "HookNotSupported");
    });

    it("admin setters are owner-only", async function () {
      const f = await loadFixture(fixture);
      const p = await f.registry.params();
      const x = f.registry.connect(f.outsider);
      await expect(x.setParams([...p])).to.be.revertedWithCustomError(f.registry, "OwnableUnauthorizedAccount");
      await expect(x.setPriceFeed(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.registry, "OwnableUnauthorizedAccount");
      await expect(x.setHumanAttester(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.registry, "OwnableUnauthorizedAccount");
      await expect(x.setBorrowPaused(true)).to.be.revertedWithCustomError(f.registry, "OwnableUnauthorizedAccount");
      await expect(f.executor.connect(f.outsider).setOperator(await f.outsider.getAddress(), true)).to.be.revertedWithCustomError(f.executor, "OwnableUnauthorizedAccount");
    });

    it("rejects risk params where a liquidation could not restore health", async function () {
      const f = await loadFixture(fixture);
      const p = [...(await f.registry.params())];
      const bad = [...p]; bad[4] = 9_000; // maxDiscountBps 90%
      await expect(f.registry.setParams(bad)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      const bad2 = [...p]; bad2[1] = 10_000; // human ratio 100%
      await expect(f.registry.setParams(bad2)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
    });

    it("pausing blocks new borrows but never repayment", async function () {
      const f = await loadFixture(fixture);
      await open(f, f.borrower, weth(10), usdc(1000));
      await f.registry.setBorrowPaused(true);
      await expect(f.registry.connect(f.borrower).borrow(usdc(1), f.creditHash)).to.be.revertedWithCustomError(f.registry, "BorrowingPaused");
      await f.usdcT.connect(f.borrower).approve(await f.registry.getAddress(), usdc(1000));
      await expect(f.registry.connect(f.borrower).repay(await f.borrower.getAddress(), usdc(1000))).to.emit(f.registry, "Repaid");
    });
  });

  describe("executor & backstop", function () {
    it("keeper sets a profit floor; the whole liquidation reverts below it", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      await expect(f.executor.connect(f.keeper).liquidate(who, f.backstop, 0, usdc(1_000_000), await f.keeper.getAddress()))
        .to.be.revertedWithCustomError(f.executor, "InsufficientProfit");
    });

    it("stale oracle makes the 0xf1 backstop refuse to bid", async function () {
      const f = await loadFixture(fixture);
      const who = await f.borrower.getAddress();
      await open(f, f.borrower, weth(10), usdc(16_000));
      await f.feed.setAnswer(px(2300));
      await f.registry.startAuction(who);
      // registry tolerance raised so only the backstop's own 3600 s bound trips
      const p = [...(await f.registry.params())]; p[9] = 86_400;
      await f.registry.setParams(p);
      await time.increase(3700);
      await expect(f.executor.connect(f.keeper).liquidate(who, f.backstop, 0, 0, await f.keeper.getAddress()))
        .to.be.revertedWithCustomError(f.router, "BackstopStalePrice");
    });

    it("the executor cannot be re-entered through its callback outside a liquidation", async function () {
      const f = await loadFixture(fixture);
      await expect(f.executor.preTransferInCallback(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, ethers.ZeroHash, "0x"))
        .to.be.revertedWithCustomError(f.executor, "NotRouter");
    });
  });
});
