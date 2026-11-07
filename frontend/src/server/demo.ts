import "server-only";
import crypto from "crypto";
import { parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployment, IS_DEMO_MARKET } from "@/config";
import { priceFeedAbi, registryAbi, tokenAbi } from "@/abi/generated";
import { HttpError } from "./env";
import { freshBlock, sendTx, serverPublicClient, walletFromEnv } from "./chain";
import { transact } from "./store";
import { clientKey } from "./ratelimit";

/**
 * Hosted judge demo on the labelled Sepolia demo market.
 *
 * One live session at a time (10-minute lease). Starting a session resets a server-held demo borrower to a
 * fixed, slightly-healthy position (HF ≈ 1.11, anonymous tier) with the operator feed at the REAL Chainlink
 * price — so a judge can crash ETH, ship the 0xf0 auction, see the denied path and approve the rescue without a
 * wallet or gas. Serverless functions time out, so the reset is a reconcile loop: each call looks at chain state,
 * sends at most one transaction, and reports progress until `ready`.
 */

const LEASE_MS = 10 * 60_000;
const COLLATERAL = 2_000_000_000_000_000n;            // 0.002 WETH per session
const TARGET_HF = 1.11;
const CHAINLINK_ETH_USD: Record<number, Address> = { 11155111: "0x694AA1769357215DE4FAC081bf1f309aDC325306" };
const wethAbi = parseAbi(["function deposit() payable"]);
const MAX = 2n ** 256n - 1n;

export const demoEnabled = () => IS_DEMO_MARKET && !!process.env.DEMO_BORROWER_PRIVATE_KEY && deployment.oracleMode === "operator";
const dailyCap = () => Number(process.env.DEMO_DAILY_CAP || 40);
const perClientCap = () => Number(process.env.DEMO_PER_CLIENT_CAP || 6);
const today = () => new Date().toISOString().slice(0, 10);

export function demoBorrower(): Address {
  return privateKeyToAccount(process.env.DEMO_BORROWER_PRIVATE_KEY as Hex).address;
}

export async function status() {
  if (!demoEnabled()) return { enabled: false as const };
  const s = await transact((st) => st.demo ?? {});
  const busy = !!s.lease && s.lease.until > Date.now();
  return { enabled: true as const, busy, until: busy ? s.lease!.until : undefined, borrower: demoBorrower(),
    remainingToday: Math.max(0, dailyCap() - (s.day === today() ? s.total ?? 0 : 0)) };
}

/** Acquire the lease and count the session against the quotas. */
export async function startSession(req: Request) {
  if (!demoEnabled()) throw new HttpError(404, "The hosted demo is not enabled on this deployment", "demo_disabled");
  const who = crypto.createHash("sha256").update(clientKey(req)).digest("hex").slice(0, 16); // never store raw IPs
  return transact((s) => {
    const d = (s.demo ??= {});
    const now = Date.now();
    if (d.day !== today()) { d.day = today(); d.total = 0; d.perClient = {}; }
    if (d.lease && d.lease.until > now)
      throw new HttpError(409, `Another judge is mid-rescue — free again in ${Math.ceil((d.lease.until - now) / 1000)}s`, "demo_busy");
    if ((d.total ?? 0) >= dailyCap()) throw new HttpError(429, "Today's demo budget is used up — try again tomorrow", "demo_cap");
    if ((d.perClient![who] ?? 0) >= perClientCap()) throw new HttpError(429, "You've run today's demo sessions from this network", "demo_client_cap");
    d.total = (d.total ?? 0) + 1;
    d.perClient![who] = (d.perClient![who] ?? 0) + 1;
    d.lease = { id: crypto.randomUUID(), until: now + LEASE_MS, borrower: demoBorrower() };
    return d.lease;
  });
}

/** Throws unless `leaseId` holds the live lease. Guards every market-moving call while the demo is on. */
export async function assertLease(leaseId: string | null | undefined) {
  if (!demoEnabled()) return;
  const lease = await transact((s) => s.demo?.lease);
  if (!lease || lease.until < Date.now()) throw new HttpError(409, "Start a demo session first", "demo_no_session");
  if (lease.id !== leaseId) throw new HttpError(409, "Another judge is mid-rescue — please wait for their session to end", "demo_busy");
}

export async function endSession(leaseId: string) {
  await transact((s) => { if (s.demo?.lease?.id === leaseId) delete s.demo.lease; });
}

async function basePriceE8(): Promise<bigint> {
  const pc = serverPublicClient();
  const feed = CHAINLINK_ETH_USD[deployment.chainId];
  if (!feed) return 250_000_000_000n;
  const r = await pc.readContract({ address: feed, abi: priceFeedAbi, functionName: "latestRoundData" });
  return (r[1] / 1_000_000n) * 1_000_000n; // round to $0.01
}

/** One reconcile step toward the start state. Returns `ready` once nothing is left to do. */
export async function stepSession(leaseId: string): Promise<{ ready: boolean; label: string; txHash?: Hex }> {
  await assertLease(leaseId);
  const pc = serverPublicClient();
  const c = deployment.contracts;
  const b = demoBorrower();
  const borrowerWallet = walletFromEnv("DEMO_BORROWER_PRIVATE_KEY");
  const operator = walletFromEnv("ORACLE_OPERATOR_PRIVATE_KEY");
  const line = deployment.strategies?.creditLine?.hash as Hex | undefined;
  if (!line) throw new HttpError(500, "Demo market has no credit line seeded", "demo_unseeded");

  const blockNumber = await freshBlock(pc);
  const [base, round, pos, params, weth, wethAllow, usdc, usdcAllow, eth] = await Promise.all([
    basePriceE8(),
    pc.readContract({ address: c.priceFeed, abi: priceFeedAbi, functionName: "latestRoundData", blockNumber }),
    pc.readContract({ address: c.registry, abi: registryAbi, functionName: "position", args: [b], blockNumber }),
    pc.readContract({ address: c.registry, abi: registryAbi, functionName: "params", blockNumber }),
    pc.readContract({ address: c.weth, abi: tokenAbi, functionName: "balanceOf", args: [b], blockNumber }),
    pc.readContract({ address: c.weth, abi: tokenAbi, functionName: "allowance", args: [b, c.registry], blockNumber }),
    pc.readContract({ address: c.usdc, abi: tokenAbi, functionName: "balanceOf", args: [b], blockNumber }),
    pc.readContract({ address: c.usdc, abi: tokenAbi, functionName: "allowance", args: [b, c.registry], blockNumber }),
    pc.getBalance({ address: b, blockNumber }),
  ]);
  if (eth < 300_000_000_000_000n) throw new HttpError(503, "The demo wallet needs Sepolia ETH — ping the team", "demo_unfunded");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = async (label: string, w: typeof borrowerWallet, p: Record<string, any>) => {
    const { hash } = await sendTx(label, w, p);
    return { ready: false, label, txHash: hash };
  };


  const price = round[1] as bigint;
  const off = price > base ? price - base : base - price;
  if (off * 1000n > base * 5n) // > 0.5% away from the real Chainlink price
    return send(`Oracle reset to Chainlink $${(Number(base) / 1e8).toFixed(2)}`, operator, { address: c.priceFeed, abi: priceFeedAbi, functionName: "setAnswer", args: [base] });

  if (pos.auctionActive) return send("Closed the previous auction", borrowerWallet, { address: c.registry, abi: registryAbi, functionName: "closeAuction", args: [b] });

  const hf = Number(pos.healthFactor) / 1e18;
  const atTarget = pos.collateral === COLLATERAL && pos.debt > 0n && Math.abs(hf - TARGET_HF) < 0.03;
  if (atTarget) return { ready: true, label: `Position ready · HF ${hf.toFixed(3)}` };

  if (pos.debt > 0n) {
    if (usdc < pos.debt) throw new HttpError(503, "Demo wallet can't cover its old debt — ping the team", "demo_unfunded");
    if (usdcAllow < pos.debt + 1_000_000n) return send("Approved USDC for repayment", borrowerWallet, { address: c.usdc, abi: tokenAbi, functionName: "approve", args: [c.registry, MAX] });
    return send("Repaid the previous session's debt", borrowerWallet, { address: c.registry, abi: registryAbi, functionName: "repay", args: [b, pos.debt + 1_000_000n] });
  }
  if (pos.collateral > 0n && pos.collateral !== COLLATERAL)
    return send("Withdrew leftover collateral", borrowerWallet, { address: c.registry, abi: registryAbi, functionName: "withdrawCollateral", args: [pos.collateral] });
  if (pos.collateral === 0n) {
    if (weth < COLLATERAL) return send("Wrapped ETH into WETH", borrowerWallet, { address: c.weth, abi: wethAbi, functionName: "deposit", value: COLLATERAL - weth });
    if (wethAllow < COLLATERAL) return send("Approved WETH as collateral", borrowerWallet, { address: c.weth, abi: tokenAbi, functionName: "approve", args: [c.registry, MAX] });
    return send("Deposited 0.002 WETH", borrowerWallet, { address: c.registry, abi: registryAbi, functionName: "depositCollateral", args: [COLLATERAL] });
  }
  // collateral in place, no debt → borrow so HF lands on the target at the base price (anonymous 150% tier)
  const ratioBps = BigInt(params[0] as number); // anonRatioBps
  const value = (COLLATERAL * base) / 10n ** 20n; // USDC 6dp: 1e18 WETH × 1e8 price → 1e6
  const debt = (value * 10_000n * 100n) / (ratioBps * BigInt(Math.round(TARGET_HF * 100)));
  return send(`Borrowed $${(Number(debt) / 1e6).toFixed(2)} USDC via aqua.pull`, borrowerWallet, { address: c.registry, abi: registryAbi, functionName: "borrow", args: [debt, line] });
}
