import "server-only";
import { type Address, type Hex } from "viem";
import { deployment, toOrder } from "@/config";
import { executorAbi, registryAbi } from "@/abi/generated";
import { serverPublicClient, walletFromEnv } from "./chain";
import { HttpError } from "./env";

const E18 = 10n ** 18n;

export interface KeeperPlan {
  borrower: Address;
  healthFactor: bigint;
  auctionActive: boolean;
  auctionStart: bigint;
  now: bigint;
  debtToCover: bigint;
  collateralOut: bigint;
  discountBps: bigint;
  ready: boolean;
  reason?: string;
}

/** Deterministic keeper policy — no LLM, no heuristics beyond on-chain state. */
export async function planLiquidation(borrower: Address): Promise<KeeperPlan> {
  const pc = serverPublicClient();
  const c = deployment.contracts;
  const [q, block] = await Promise.all([
    pc.readContract({ address: c.registry, abi: registryAbi, functionName: "liquidationQuote", args: [borrower] }),
    pc.getBlock(),
  ]);
  const plan: KeeperPlan = {
    borrower,
    healthFactor: q.healthFactor,
    auctionActive: q.auctionActive,
    auctionStart: q.auctionStart,
    now: block.timestamp,
    debtToCover: q.debtToCover,
    collateralOut: q.collateralOut,
    discountBps: q.discountBps,
    ready: false,
  };
  if (q.healthFactor >= E18) plan.reason = "Position is healthy (HF ≥ 1.0)";
  else if (q.auctionActive && block.timestamp < q.auctionStart) plan.reason = "World ID human grace window active";
  else plan.ready = true;
  return plan;
}

/** Permissionless housekeeping: ship the 0xf0-guarded auction for an insolvent position. */
export async function startAuction(borrower: Address): Promise<Hex> {
  const c = deployment.contracts;
  const plan = await planLiquidation(borrower);
  if (plan.healthFactor >= E18) throw new HttpError(409, "Position is healthy (HF ≥ 1.0)", "healthy");
  if (plan.auctionActive) throw new HttpError(409, "Auction already running", "auction_active");
  const wallet = walletFromEnv("KEEPER_PRIVATE_KEY");
  const pc = serverPublicClient();
  const { request } = await pc.simulateContract({
    account: wallet.account, address: c.registry, abi: registryAbi, functionName: "startAuction", args: [borrower],
  });
  const h = await wallet.writeContract(request);
  await pc.waitForTransactionReceipt({ hash: h });
  return h;
}

/** Pre-flight for the protected action; never consumes an approval. */
export async function assertExecutable(borrower: Address): Promise<KeeperPlan> {
  const plan = await planLiquidation(borrower);
  if (!plan.ready) throw new HttpError(409, plan.reason || "Not liquidatable", "not_liquidatable");
  if (!plan.auctionActive) throw new HttpError(409, "No auction shipped yet — start the auction first", "no_auction");
  if (!deployment.strategies?.backstop?.order) throw new HttpError(503, "No LP backstop strategy seeded", "no_backstop");
  return plan;
}

/**
 * THE protected action. Callers MUST have validated and consumed a fresh Agent Pass approval.
 * executor.liquidate fills the surgical 0xf0 slice and routes the collateral into the LP backstop
 * (aqua.pull USDC from the LP wallet, aqua.push WETH into it) in one transaction.
 */
export async function executeLiquidation(borrower: Address): Promise<Hex> {
  const c = deployment.contracts;
  const backstop = toOrder(deployment.strategies!.backstop!.order);
  const wallet = walletFromEnv("KEEPER_PRIVATE_KEY");
  const pc = serverPublicClient();
  const { request } = await pc.simulateContract({
    account: wallet.account,
    address: c.executor,
    abi: executorAbi,
    functionName: "liquidate",
    args: [borrower, backstop, 0n, 0n, wallet.account.address],
  });
  const h = await wallet.writeContract(request);
  const receipt = await pc.waitForTransactionReceipt({ hash: h });
  if (receipt.status !== "success") throw new HttpError(502, "Liquidation transaction reverted", "reverted");
  return h;
}
