// SPDX-License-Identifier: MIT
/**
 * Opens a demo position from a local hardhat account (no browser wallet needed).
 *   BORROWER_INDEX (default 2 = anonymous), COLLATERAL (WETH, default 10), DEBT (USDC, default 15000)
 * Usage: npx hardhat run scripts/demo-borrower.ts --network localhost
 */
import hre from "hardhat";
import { readDeployment } from "./lib/deployment-file";

const { ethers } = hre as any;

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const d = readDeployment(chainId);
  const signers = await ethers.getSigners();
  const b = signers[Number(process.env.BORROWER_INDEX || 2)];
  const coll = ethers.parseEther(process.env.COLLATERAL || "10");
  const debt = ethers.parseUnits(process.env.DEBT || "15000", 6);
  const weth = await ethers.getContractAt("WETHMock", d.contracts.weth, b);
  const registry = await ethers.getContractAt("CreditPositionRegistry", d.contracts.registry, b);
  if ((await weth.balanceOf(b.address)) < coll) await (await weth.deposit({ value: coll })).wait();
  await (await weth.approve(d.contracts.registry, coll)).wait();
  await (await registry.depositCollateral(coll)).wait();
  await (await registry.borrow(debt, d.strategies!.creditLine!.hash)).wait();
  const p = await registry.position(b.address);
  console.log(`borrower ${b.address}  collateral ${ethers.formatEther(p.collateral)} WETH  debt ${ethers.formatUnits(p.debt, 6)} USDC  HF ${ethers.formatUnits(p.healthFactor, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
