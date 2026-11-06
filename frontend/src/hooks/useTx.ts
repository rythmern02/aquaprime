"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { BaseError, ContractFunctionRevertedError, type Abi, type Address, type Hex } from "viem";
import { chain } from "@/config";
import { useReads } from "@/app/providers";

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

/** Wallet-signed write; receipt is awaited through the (Anon-RPC) read client. */
export function useTx() {
  const { data: wallet } = useWalletClient();
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { client } = useReads();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  async function send(label: string, p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
    if (!isConnected || !wallet) throw new Error("Connect a wallet first");
    if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
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
  return { send, pending, account: wallet?.account.address };
}
