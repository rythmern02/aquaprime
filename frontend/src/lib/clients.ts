"use client";
import { createPublicClient, custom, http, type PublicClient } from "viem";
import { chain, CHAIN_ID, isLocalRpc, RPC_URL, rpcList } from "@/config";
import { privateRpcFetch } from "./anonRpc";

export type ReadMode = "anon" | "direct-local" | "direct-optout";

/**
 * Reads default to Anon-RPC. The only intentional exclusion: a localhost RPC (hardhat node) is not
 * reachable from an anonymity network exit, so local development reads go direct and the navbar
 * says so. Users can also explicitly opt out (persisted per-browser, never silently).
 */
export function initialReadMode(): ReadMode {
  if (isLocalRpc(RPC_URL)) return "direct-local";
  try {
    if (localStorage.getItem("aquaprime.readMode") === "direct-optout") return "direct-optout";
  } catch { /* storage unavailable */ }
  return "anon";
}

let rpcId = 0, preferred = 0;
/**
 * `onHealth` reports mixnet read health: "degraded" after several consecutive failed reads (the Nox network can be
 * slow or partially down), "ok" again on the next success. The UI then OFFERS the opt-out — it never switches itself.
 */
export function makePublicClient(mode: ReadMode, onHealth?: (h: "ok" | "degraded") => void): PublicClient {
  if (mode !== "anon") return createPublicClient({ chain, transport: http(RPC_URL, { batch: true }) }) as PublicClient;
  const urls = rpcList(CHAIN_ID, RPC_URL);
  let failures = 0;
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        // every attempt still goes through the mixnet; we only rotate which public RPC the exit talks to
        let r: { result?: unknown; error?: { code?: number; message: string; data?: unknown } } | undefined, lastErr: unknown;
        for (let k = 0; k < urls.length; k++) {
          const i = (preferred + k) % urls.length;
          try {
            r = await privateRpcFetch(urls[i], { jsonrpc: "2.0", id: ++rpcId, method, params: params ?? [] });
            // only a genuine execution error (revert) is final; rate/plan limits and outages rotate to the next RPC
            if (r?.error && !/revert/i.test(r.error.message)) { lastErr = new Error(r.error.message); r = undefined; continue; }
            preferred = i; break;
          } catch (e) { lastErr = e; r = undefined; }
        }
        if (!r) {
          if (++failures === 3) onHealth?.("degraded");
          throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
        }
        if (failures >= 3) onHealth?.("ok");
        failures = 0;
        if (r.error) {
          const err = new Error(r.error.message) as Error & { code?: number; data?: unknown };
          err.code = r.error.code;
          err.data = r.error.data;
          throw err;
        }
        return r.result;
      },
    }),
  }) as PublicClient;
}
