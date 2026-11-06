// SPDX-License-Identifier: MIT
/**
 * Ships the Maker's three zero-custody Aqua strategies from ONE wallet (SLAC demo) and, on local
 * networks, funds demo borrowers.
 *
 *   A. Credit line         app = CreditPositionRegistry     USDC
 *   B. Liquidation backstop app = AquaPrimeRouter (0xf1)    USDC (+0 WETH)
 *   C. XYC AMM (AquaAMM)    app = AquaPrimeRouter            USDC + WETH
 *
 * Usage:  npx hardhat run scripts/seed-strategies.ts --network localhost
 * Env:    MAKER_PRIVATE_KEY (live nets), SEED_USDC (default 100000), SEED_AMM_WETH (default 40)
 */
import hre from "hardhat";
import { readDeployment, writeDeployment } from "./lib/deployment-file";

const { ethers, network } = hre as any;
const ORDER_TUPLE = ["tuple(address maker, uint256 traits, bytes data)"];

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const dep = readDeployment(chainId);
  const c = dep.contracts;
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  const signers = await ethers.getSigners();
  const maker = process.env.MAKER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.MAKER_PRIVATE_KEY, ethers.provider)
    : signers[1];
  const makerAddr = await maker.getAddress();
  const usdcAmt = ethers.parseUnits(process.env.SEED_USDC || "100000", 6);
  const ammWeth = ethers.parseEther(process.env.SEED_AMM_WETH || "40");

  const aqua = await ethers.getContractAt("Aqua", c.aqua, maker);
  const usdc = await ethers.getContractAt("TokenMockDecimals", c.usdc);
  const weth = await ethers.getContractAt("WETHMock", c.weth);
  const registry = await ethers.getContractAt("CreditPositionRegistry", c.registry, maker);
  const builder = await ethers.getContractAt("StrategyBuilder", c.builder);
  const router = await ethers.getContractAt("AquaPrimeRouter", c.router);
  const aquaAMM = await ethers.getContractAt("AquaAMM", c.aquaAMM);

  if (isLocal) {
    const [deployer] = signers;
    await (await usdc.connect(deployer).mint(makerAddr, usdcAmt)).wait();
    await (await weth.connect(maker).deposit({ value: ammWeth })).wait();
    // demo borrowers: accounts #2 (anonymous) and #3 (human) get WETH collateral
    for (const b of [signers[2], signers[3]]) await (await weth.connect(b).deposit({ value: ethers.parseEther("20") })).wait();
  }

  // one-time approvals: Aqua can pull only what strategies allow, only when a fill happens
  await (await usdc.connect(maker).approve(c.aqua, ethers.MaxUint256)).wait();
  await (await weth.connect(maker).approve(c.aqua, ethers.MaxUint256)).wait();

  const salt = BigInt(Math.floor(Date.now() / 1000));

  // ── A. credit line ──
  const aprBps = 800;
  const [creditStrategy, creditHash] = await registry.creditLineStrategy(makerAddr, aprBps, salt);
  await (await aqua.ship(c.registry, creditStrategy, [c.usdc], [usdcAmt])).wait();
  await (await registry.registerCreditLine(aprBps, salt)).wait();

  // ── B. liquidation backstop (0xf1) ──
  const discountBps = 100;
  const b = await builder.buildBackstopOrder(makerAddr, c.executor, c.priceFeed, c.weth, c.usdc, discountBps, 3600, salt);
  const backstop = { maker: b.maker, traits: ethers.toBeHex(b.traits, 32), data: b.data };
  await (await aqua.ship(c.router, ethers.AbiCoder.defaultAbiCoder().encode(ORDER_TUPLE, [[backstop.maker, backstop.traits, backstop.data]]),
    [c.weth, c.usdc], [0, usdcAmt])).wait();
  const backstopHash = await router.hash(backstop);

  // ── C. XYC AMM ──
  const a = await aquaAMM.buildProgram(makerAddr, c.weth, c.usdc, 3_000_000, 0, 0, 0, 0, ethers.ZeroAddress, salt, 0);
  const amm = { maker: a.maker, traits: ethers.toBeHex(a.traits, 32), data: a.data };
  const wethIsA = BigInt(c.weth) < BigInt(c.usdc);
  const ammTokens = wethIsA ? [c.weth, c.usdc] : [c.usdc, c.weth];
  const ammAmounts = wethIsA ? [ammWeth, usdcAmt] : [usdcAmt, ammWeth];
  await (await aqua.ship(c.router, ethers.AbiCoder.defaultAbiCoder().encode(ORDER_TUPLE, [[amm.maker, amm.traits, amm.data]]),
    ammTokens, ammAmounts)).wait();
  const ammHash = await router.hash(amm);

  writeDeployment(chainId, {
    strategies: {
      maker: makerAddr,
      creditLine: { hash: creditHash, aprBps, salt: Number(salt), amount: usdcAmt.toString() },
      backstop: { order: backstop, hash: backstopHash, discountBps, amount: usdcAmt.toString() },
      amm: { order: amm, hash: ammHash, tokens: ammTokens, amounts: ammAmounts.map(String) },
    },
  });

  const wallet = await usdc.balanceOf(makerAddr);
  console.log(`Maker ${makerAddr}`);
  console.log(`  wallet USDC: ${ethers.formatUnits(wallet, 6)}`);
  console.log(`  virtual USDC across 3 strategies: ${ethers.formatUnits(usdcAmt * 3n, 6)}`);
  console.log(`  SLAC: ${(Number(usdcAmt * 3n) / Number(wallet)).toFixed(2)}x`);
}

main().catch((e) => { console.error(e); process.exit(1); });
