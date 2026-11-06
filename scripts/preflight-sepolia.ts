// SPDX-License-Identifier: MIT
/**
 * Checks everything the Sepolia deploy + seed needs before spending gas.
 * Usage: npx hardhat run scripts/preflight-sepolia.ts --network sepolia
 */
import hre from "hardhat";

const { ethers } = hre as any;
const USDC = process.env.USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WETH = process.env.WETH_ADDRESS || "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const FEED = process.env.PRICE_FEED || "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
const FEED_ABI = ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];

async function main() {
  const problems: string[] = [];
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 11155111n) problems.push(`RPC is chain ${chainId}, expected Sepolia 11155111`);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("PRIVATE_KEY not set in .env");
  const ethBal = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer ${deployer.address}  ${ethers.formatEther(ethBal)} ETH`);
  if (ethBal < ethers.parseEther("0.15")) problems.push("deployer needs ≥ 0.15 Sepolia ETH (6 contracts incl. a 24 KB router)");

  const roles: Record<string, string | undefined> = {
    ATTESTER_PRIVATE_KEY: process.env.ATTESTER_PRIVATE_KEY,
    KEEPER_PRIVATE_KEY: process.env.KEEPER_PRIVATE_KEY,
  };
  for (const [k, v] of Object.entries(roles)) {
    if (!v) { console.log(`${k}: not set → role falls back to deployer`); continue; }
    const w = new ethers.Wallet(v, ethers.provider);
    const b = await ethers.provider.getBalance(w.address);
    console.log(`${k.replace("_PRIVATE_KEY", "").toLowerCase()} ${w.address}  ${ethers.formatEther(b)} ETH`);
    if (k === "KEEPER_PRIVATE_KEY" && b < ethers.parseEther("0.02")) problems.push("keeper needs ≥ 0.02 Sepolia ETH for gas");
  }

  const makerKey = process.env.MAKER_PRIVATE_KEY;
  if (!makerKey) problems.push("MAKER_PRIVATE_KEY not set (LP wallet that ships the 3 strategies)");
  else {
    const m = new ethers.Wallet(makerKey, ethers.provider);
    const usdc = await new ethers.Contract(USDC, ERC20, ethers.provider).balanceOf(m.address);
    const weth = await new ethers.Contract(WETH, ERC20, ethers.provider).balanceOf(m.address);
    const eth = await ethers.provider.getBalance(m.address);
    const needUsdc = ethers.parseUnits(process.env.SEED_USDC || "100000", 6);
    const needWeth = ethers.parseEther(process.env.SEED_AMM_WETH || "40");
    console.log(`maker ${m.address}  ${ethers.formatUnits(usdc, 6)} USDC  ${ethers.formatEther(weth)} WETH  ${ethers.formatEther(eth)} ETH`);
    if (usdc < needUsdc) problems.push(`maker needs ${ethers.formatUnits(needUsdc, 6)} USDC (faucet.circle.com) or lower SEED_USDC`);
    if (weth + eth < needWeth + ethers.parseEther("0.02")) problems.push(`maker needs ${ethers.formatEther(needWeth)} WETH-or-ETH (auto-wrapped) + 0.02 ETH gas`);
  }

  const [, answer, , updatedAt] = await new ethers.Contract(FEED, FEED_ABI, ethers.provider).latestRoundData();
  const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
  console.log(`Chainlink ETH/USD ${Number(answer) / 1e8}  (updated ${age}s ago)`);
  if (process.env.ORACLE_MODE !== "operator" && age > Number(process.env.MAX_PRICE_STALENESS || 7200))
    problems.push("Chainlink Sepolia feed older than MAX_PRICE_STALENESS — use ORACLE_MODE=operator or raise maxPriceStaleness");

  if (problems.length) { console.log("\n✘ not ready:\n  - " + problems.join("\n  - ")); process.exit(1); }
  console.log("\n✔ ready: npm run deploy:sepolia && npm run seed:sepolia");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
