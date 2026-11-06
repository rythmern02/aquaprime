"use client";
import { createPublicClient, custom, http, type PublicClient } from "viem";
import { chain, isLocalRpc, RPC_URL } from "@/config";
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

let rpcId = 0;
export function makePublicClient(mode: ReadMode): PublicClient {
  if (mode !== "anon") return createPublicClient({ chain, transport: http(RPC_URL, { batch: true }) }) as PublicClient;
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        const r = await privateRpcFetch(RPC_URL, { jsonrpc: "2.0", id: ++rpcId, method, params: params ?? [] });
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
