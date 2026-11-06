import "server-only";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "@/config";
import { requireEnv, serverRpcUrl } from "./env";

export const serverPublicClient = () => createPublicClient({ chain, transport: http(serverRpcUrl()) });

export function walletFromEnv(envName: string) {
  const account = privateKeyToAccount(requireEnv(envName) as Hex);
  return createWalletClient({ account, chain, transport: http(serverRpcUrl()) });
}
