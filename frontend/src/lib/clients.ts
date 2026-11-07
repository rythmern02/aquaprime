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
export function makePublicClient(mode: ReadMode): PublicClient {
  if (mode !== "anon") return createPublicClient({ chain, transport: http(RPC_URL, { batch: true }) }) as PublicClient;
  const urls = rpcList(CHAIN_ID, RPC_URL);
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
            if (r?.error && (r.error.code === -32005 || r.error.code === 429)) { lastErr = new Error(r.error.message); r = undefined; continue; }
            preferred = i; break;
          } catch (e) { lastErr = e; r = undefined; }
        }
        if (!r) throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
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
