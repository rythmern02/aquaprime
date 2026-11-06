"use client";
import { AnonRpcWorker } from "@anon-rpc/browser-harness";

/**
 * EF Anon-RPC: every JSON-RPC read AquaPrime makes (Aqua balances, health factors, liquidation
 * quotes, SwapVM `quote()` simulations) is sent through a hash-pinned anon-client worker running in
 * a null-origin sandboxed iframe, so the RPC provider cannot link liquidation interest to the user's
 * IP / session and front-run it. Fail-closed: if the worker cannot start we surface an error instead
 * of silently falling back to a direct connection.
 */
let worker: AnonRpcWorker | undefined;

function bootstrapProvider() {
  const url = process.env.NEXT_PUBLIC_ANON_BOOTSTRAP_RPC || "https://ethereum-rpc.publicnode.com";
  let id = 0;
  return {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
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
