"use client";
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { CHAIN_ID, rpcList } from "@/config";

/**
 * EF Anon-RPC: every JSON-RPC read AquaPrime makes (Aqua balances, health factors, liquidation
 * quotes, SwapVM `quote()` simulations) is sent through a hash-pinned anon-client worker running in
 * a null-origin sandboxed iframe, so the RPC provider cannot link liquidation interest to the user's
 * IP / session and front-run it. Fail-closed: if the worker cannot start we surface an error instead
 * of silently falling back to a direct connection.
 */
let worker: AnonRpcWorker | undefined;

/** True for failures where another endpoint may succeed (rate limit, outage), not for genuine RPC errors. */
/** Anything except a genuine execution error (revert) may succeed on another endpoint: rate limits, plan limits, outages. */
export const isTransient = (status: number, code?: number, message = "") => status === 429 || status >= 500 || code === -32005 || code === 429 || !/revert/i.test(message);

/**
 * The bootstrap only reads the public worker-registry contract (nothing user-specific), so falling back
 * across several public RPCs costs no privacy and removes a single point of failure.
 */
function bootstrapProvider() {
  const urls = rpcList(CHAIN_ID, process.env.NEXT_PUBLIC_ANON_BOOTSTRAP_RPC || undefined);
  if (!urls.length) urls.push("https://ethereum-rpc.publicnode.com");
  let id = 0, preferred = 0;
  return {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      let last: unknown;
      for (let k = 0; k < urls.length; k++) {
        const i = (preferred + k) % urls.length;
        try {
          const res = await fetch(urls[i], {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
          });
          const j = await res.json().catch(() => ({ error: { code: res.status, message: `HTTP ${res.status}` } }));
          if (j.error && isTransient(res.status, j.error.code, j.error.message)) { last = new Error(j.error.message); continue; }
          if (j.error) throw new Error(j.error.message);
          preferred = i;
          return j.result;
        } catch (e) { last = e; }
      }
      throw last instanceof Error ? last : new Error("All bootstrap RPCs failed");
    },
  };
}

export function getAnonWorker(): AnonRpcWorker {
  if (!worker) {
    let config: unknown = undefined;
    try {
      config = process.env.NEXT_PUBLIC_ANON_WORKER_CONFIG ? JSON.parse(process.env.NEXT_PUBLIC_ANON_WORKER_CONFIG) : undefined;
    } catch { /* ignore malformed config */ }
    worker = new AnonRpcWorker({
      address: (process.env.NEXT_PUBLIC_ANON_SPECIFIER_ADDRESS || "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e") as `0x${string}`,
      config: config as never,
      iframeUrl: "/anon-rpc-iframe.html",
      preExisting: { rpcProvider: bootstrapProvider() },
    });
  }
  return worker;
}

export async function privateRpcFetch(rpcUrl: string, payload: unknown) {
  const w = getAnonWorker();
  await w.ready;
  const res = await w.fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    anonOptions: { isolationKey: "aquaprime-reader" },
  } as RequestInit);
  return res.json();
}
