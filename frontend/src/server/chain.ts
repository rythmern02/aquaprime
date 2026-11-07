import "server-only";
import { createPublicClient, createWalletClient, fallback, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, CHAIN_ID, rpcList } from "@/config";
import { requireEnv, serverRpcUrl } from "./env";

/**
 * Next.js caches server-side fetch() — including viem's JSON-RPC POSTs — in its Data Cache and serves a stale
 * copy first. Chain state must never come from that cache (the keeper decides liquidations from it), so every
 * RPC call opts out explicitly.
 */
const rpc = () => fallback(rpcList(CHAIN_ID, serverRpcUrl()).map((u) => http(u, { fetchOptions: { cache: "no-store" } })));

export const serverPublicClient = () => createPublicClient({ chain, transport: rpc() });

export function walletFromEnv(envName: string) {
  const account = privateKeyToAccount(requireEnv(envName) as Hex);
  return createWalletClient({ account, chain, transport: rpc() });
}

/* ───────────── read-your-writes on load-balanced public RPCs ─────────────
 * Public RPCs sit behind load balancers whose nodes can lag a block or two. Right after a confirmed tx a lagging
 * node still answers with the old state — e.g. a healthy price just after a crash, or "price not reset yet",
 * which once made the demo resend an oracle update that then ran out of gas. So: every server tx records the
 * block it landed in (shared via the store for serverless), and later reads/simulations pin to a block at or
 * after it. A lagging node then errors on the unknown block and the fallback transport moves on.
 */
let lastTxBlock = 0n;

async function rememberBlock(n: bigint) {
  if (n > lastTxBlock) lastTxBlock = n;
  const { transact } = await import("./store");
  await transact((s) => { if (BigInt(s.lastTxBlock ?? 0) < n) s.lastTxBlock = Number(n); });
}

/** A block number at or after the last server-confirmed tx (waits briefly for the RPC to catch up). */
export async function freshBlock(pc = serverPublicClient()): Promise<bigint> {
  const { transact } = await import("./store");
  const stored = BigInt(await transact((s) => s.lastTxBlock ?? 0));
  const target = stored > lastTxBlock ? stored : lastTxBlock;
  for (let i = 0; i < 20; i++) {
    const bn = await pc.getBlockNumber({ cacheTime: 0 });
    if (bn >= target) return bn;
    await new Promise((r) => setTimeout(r, 750));
  }
  return target;
}

/**
 * Simulate (at a fresh block) → estimate gas with a 30% buffer → send → wait → record the block.
 * Throws HttpError 502 if the tx reverts on-chain.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendTx(label: string, wallet: ReturnType<typeof walletFromEnv>, p: Record<string, any>): Promise<{ hash: Hex; blockNumber: bigint }> {
  const { HttpError } = await import("./env");
  const pc = serverPublicClient();
  const blockNumber = await freshBlock(pc);
  const { request } = await pc.simulateContract({ ...p, account: wallet.account, blockNumber } as never);
  const est = await pc.estimateContractGas({ ...p, account: wallet.account, blockNumber } as never);
  const hash = await wallet.writeContract({ ...(request as object), gas: (est * 13n) / 10n } as never);
  const r = await pc.waitForTransactionReceipt({ hash });
  await rememberBlock(r.blockNumber);
  if (r.status !== "success") throw new HttpError(502, `${label} reverted on-chain`, "reverted");
  return { hash, blockNumber: r.blockNumber };
}
