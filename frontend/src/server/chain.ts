import "server-only";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "@/config";
import { requireEnv, serverRpcUrl } from "./env";

/**
 * Next.js caches server-side fetch() — including viem's JSON-RPC POSTs — in its Data Cache and serves a stale
 * copy first. Chain state must never come from that cache (the keeper decides liquidations from it), so every
 * RPC call opts out explicitly.
 */
const rpc = () => http(serverRpcUrl(), { fetchOptions: { cache: "no-store" } });

export const serverPublicClient = () => createPublicClient({ chain, transport: rpc() });

export function walletFromEnv(envName: string) {
  const account = privateKeyToAccount(requireEnv(envName) as Hex);
  return createWalletClient({ account, chain, transport: rpc() });
}
