// SPDX-License-Identifier: MIT
/**
 * AquaPrime deterministic keeper agent (no LLM).
 *
 * Loop: discover borrowers from `Borrowed` events → read on-chain health →
 *   HF < 1 and no auction  → registry.startAuction()   (permissionless housekeeping, no approval)
 *   auction live, grace over → file a proposal to the backend and PAUSE: the liquidation fill is a
 *                              protected action that only executes after a fresh World ID Agent Pass
 *                              approval from the human operator (/api/keeper/execute).
 * The agent itself never holds authority to fill — that lives behind the human checkpoint.
 *
 * Env: RPC_URL, KEEPER_PRIVATE_KEY, KEEPER_API_URL (default http://localhost:3000), KEEPER_API_TOKEN,
 *      KEEPER_INTERVAL_MS (default 6000)
 */
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import "dotenv/config";

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const API = process.env.KEEPER_API_URL || "http://localhost:3000";
const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS || 6000);
const E18 = 10n ** 18n;

const REGISTRY_ABI = [
  "event Borrowed(address indexed borrower, bytes32 indexed creditLine, uint256 amount)",
  "function liquidationQuote(address) view returns (tuple(uint256 healthFactor,uint256 debtToCover,uint256 collateralOut,uint256 auctionStart,uint256 discountBps,bool auctionActive))",
  "function startAuction(address) returns (bytes32)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const { chainId } = await provider.getNetwork();
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "frontend", "src", "config", "deployments", `${chainId}.json`), "utf8"));
  const wallet = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
  const registry = new ethers.Contract(dep.contracts.registry, REGISTRY_ABI, wallet);
  const borrowers = new Set<string>();
  const proposed = new Map<string, number>();
  let fromBlock = 0;

  console.log(`[keeper] chain ${chainId} registry ${dep.contracts.registry} as ${wallet.address}`);
  for (;;) {
    try {
      const head = await provider.getBlockNumber();
      for (const ev of await registry.queryFilter(registry.filters.Borrowed(), fromBlock, head))
        borrowers.add((ev as ethers.EventLog).args.borrower);
      fromBlock = head + 1;
      const now = BigInt((await provider.getBlock("latest"))!.timestamp);

      for (const b of borrowers) {
        const q = await registry.liquidationQuote(b);
        if (q.healthFactor >= E18) { proposed.delete(b); continue; }
        if (!q.auctionActive) {
          const tx = await registry.startAuction(b);
          await tx.wait();
          console.log(`[keeper] ${b} HF ${ethers.formatUnits(q.healthFactor, 18)} → auction shipped (${tx.hash})`);
          continue;
        }
        if (now < q.auctionStart) {
          console.log(`[keeper] ${b} in World ID grace window (${q.auctionStart - now}s left) — waiting`);
          continue;
        }
        if (Date.now() - (proposed.get(b) ?? 0) < 60_000) continue;
        const reason = `HF ${ethers.formatUnits(q.healthFactor, 18).slice(0, 6)}; repay ${ethers.formatUnits(q.debtToCover, 6)} USDC for ${ethers.formatEther(q.collateralOut).slice(0, 8)} WETH`;
        const res = await fetch(`${API}/api/keeper/proposals`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.KEEPER_API_TOKEN}` },
          body: JSON.stringify({ borrower: b, reason }),
        });
        proposed.set(b, Date.now());
        console.log(`[keeper] ${b} ${reason} → PAUSED, awaiting Agent Pass human approval (${res.status})`);
      }
    } catch (e) {
      console.error(`[keeper] tick failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main();
