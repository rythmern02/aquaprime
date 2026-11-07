"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { BaseError, ContractFunctionRevertedError, type Abi, type Address, type Hex } from "viem";
import { chain } from "@/config";
import { useReads } from "@/app/providers";
import { useDemoWallet } from "./useDemoWallet";

export interface LogLine { t: number; level: "info" | "ok" | "err" | "warn"; msg: string; tx?: string }

export function useLog() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const push = (level: LogLine["level"], msg: string, tx?: string) =>
    setLines((l) => [{ t: Date.now(), level, msg, tx }, ...l].slice(0, 60));
  return { lines, push };
}

export function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data?.errorName) return `${r.data.errorName}(${(r.data.args ?? []).map(String).join(", ")})`;
    return e.shortMessage;
  }
  return (e as Error)?.message ?? String(e);
}

/**
 * Wallet-signed write; receipt is awaited through the (Anon-RPC) read client.
 *
 * The account comes from the connected address, not from `useWalletClient()` — that hook is empty while the
 * wallet sits on another network, which used to leave a connected user stuck on the start screen. Writes
 * switch the wallet to the app chain first (wagmi adds the chain if the wallet doesn't know it) and then
 * fetch a fresh wallet client, so the first action works without a reload.
 */
export function useTx() {
  const config = useConfig();
  const { address: injectedAddress, chainId: injectedChain, isConnected: injectedConnected } = useAccount();
  const demo = useDemoWallet();
  const isConnected = demo.active || injectedConnected;
  const chainId = demo.active ? chain.id : injectedChain;
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { client } = useReads();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const wrongChain = !demo.active && injectedConnected && injectedChain !== chain.id;

  const switchToApp = () => switchChainAsync({ chainId: chain.id });

  async function send(label: string, p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
    if (!isConnected) throw new Error("Connect a wallet first");
    if (chainId !== chain.id) await switchToApp();
    const wallet = demo.active ? demo.wallet : await getWalletClient(config, { chainId: chain.id });
    if (!wallet) throw new Error("Wallet unavailable — reconnect and try again");
    setPending(label);
    try {
      const { request } = await client.simulateContract({ ...p, account: wallet.account } as never);
      const hash = await wallet.writeContract(request as never);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${label} reverted`);
      await qc.invalidateQueries();
      return hash;
    } finally {
      setPending(null);
    }
  }
  const account: Address | undefined = demo.active ? demo.wallet?.account?.address : injectedAddress;
  return { send, pending, account, wrongChain, walletChainId: chainId, switchToApp, switching };
}
