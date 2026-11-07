import { defineChain, type Address, type Hex } from "viem";
import { hardhat, sepolia, mainnet } from "viem/chains";
import { DEPLOYMENTS as RAW } from "./deployments";

export type OrderStruct = { maker: Address; traits: Hex; data: Hex };
export type Order = { maker: Address; traits: bigint; data: Hex };
export const toOrder = (o: OrderStruct | Order): Order => ({ maker: o.maker, traits: BigInt(o.traits), data: o.data });

export interface Deployment {
  chainId: number;
  network: string;
  deployBlock?: number;
  oracleMode: "operator" | "chainlink";
  contracts: {
    aqua: Address; weth: Address; usdc: Address; priceFeed: Address; router: Address;
    builder: Address; registry: Address; executor: Address; aquaAMM: Address;
  };
  roles: { deployer: Address; treasury: Address; attester: Address; keeper: Address };
  strategies?: {
    maker: Address;
    creditLine?: { hash: Hex; aprBps: number; salt: number; amount: string };
    backstop?: { order: OrderStruct; hash: Hex; discountBps: number; amount: string };
    amm?: { order: OrderStruct; hash: Hex; amounts: string[]; tokens: Address[] };
  };
}

// Every chain/market the deploy script has written to ./deployments (index.ts is generated).
const DEPLOYMENTS = RAW as Record<string, Deployment>;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

/**
 * Ordered RPC list for public-network reads: the configured RPC first, then independent public endpoints.
 * Shared public RPCs rate-limit (HTTP 429) under load — a single one is a single point of failure for a
 * fail-closed client. Override with NEXT_PUBLIC_RPC_FALLBACKS (comma-separated).
 */
const DEFAULT_FALLBACKS: Record<number, string[]> = {
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.drpc.org", "https://1rpc.io/sepolia", "https://rpc.sepolia.org"],
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"],
};
export function rpcList(chainId: number, primary?: string): string[] {
  const extra = process.env.NEXT_PUBLIC_RPC_FALLBACKS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_FALLBACKS[chainId] ?? [];
  return [...new Set([primary, ...extra].filter((u): u is string => !!u))];
}

/** Optional market on the chain, e.g. "demo" → deployments/11155111-demo.json (Sepolia's labelled demo market). */
export const MARKET = process.env.NEXT_PUBLIC_MARKET || "";
export const IS_DEMO_MARKET = MARKET === "demo";

export const deployment: Deployment = (() => {
  const key = MARKET ? `${CHAIN_ID}-${MARKET}` : String(CHAIN_ID);
  const d = DEPLOYMENTS[key];
  if (!d) throw new Error(`No AquaPrime deployment "${key}". Run the deploy script first.`);
  return d;
})();

export const chain = (() => {
  if (CHAIN_ID === hardhat.id) return defineChain({ ...hardhat, rpcUrls: { default: { http: [RPC_URL] } } });
  if (CHAIN_ID === sepolia.id) return defineChain({ ...sepolia, rpcUrls: { default: { http: [RPC_URL] } } });
  if (CHAIN_ID === mainnet.id) return defineChain({ ...mainnet, rpcUrls: { default: { http: [RPC_URL] } } });
  return defineChain({
    id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
})();

export const isLocalRpc = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)(:\d+)?/i.test(url);

export const EXPLORER: Record<number, string> = { 11155111: "https://sepolia.etherscan.io", 1: "https://etherscan.io" };
export const txUrl = (hash: string) => (EXPLORER[CHAIN_ID] ? `${EXPLORER[CHAIN_ID]}/tx/${hash}` : undefined);

export const WORLD = {
  appId: (process.env.NEXT_PUBLIC_WORLD_APP_ID || "") as `app_${string}`,
  action: process.env.NEXT_PUBLIC_WORLD_ACTION || "aquaprime-human-prime-tier",
  environment: (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT || "production") as "production" | "staging" | "sandbox",
};
