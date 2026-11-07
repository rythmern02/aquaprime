"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, custom } from "wagmi";
import { injected } from "@wagmi/core";
import type { PublicClient } from "viem";
import { chain } from "@/config";
import { initialReadMode, makePublicClient, type ReadMode } from "@/lib/clients";
import { getAnonWorker } from "@/lib/anonRpc";
import { DemoWalletProvider } from "@/hooks/useDemoWallet";

type EIP1193 = { request(args: { method: string; params?: unknown }): Promise<unknown> };

// Wagmi is used ONLY for the user's wallet (signing). Its transport is the wallet's own provider,
// so the app never sends reads to a third-party RPC outside Anon-RPC.
const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  ssr: true,
  transports: {
    [chain.id]: custom({
      request: (args) => {
        const eth = (globalThis as unknown as { ethereum?: EIP1193 }).ethereum;
        if (!eth) throw new Error("No injected wallet");
        return eth.request(args);
      },
    }),
  },
});

interface ReadCtx {
  client: PublicClient;
  mode: ReadMode;
  anonStatus: "booting" | "ready" | "degraded" | "failed" | "n/a";
  anonError?: string;
  setMode: (m: ReadMode) => void;
}
const ReadContext = createContext<ReadCtx | null>(null);
export const useReads = () => {
  const c = useContext(ReadContext);
  if (!c) throw new Error("ReadContext missing");
  return c;
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchInterval: 6000, retry: 1 } } }));
  const [mode, setModeState] = useState<ReadMode>("direct-local");
  const [anonStatus, setAnonStatus] = useState<ReadCtx["anonStatus"]>("n/a");
  const [anonError, setAnonError] = useState<string>();

  useEffect(() => setModeState(initialReadMode()), []);

  useEffect(() => {
    if (mode !== "anon") { setAnonStatus("n/a"); return; }
    setAnonStatus("booting");
    let cancelled = false;
    getAnonWorker().ready
      .then(() => !cancelled && setAnonStatus("ready"))
      .catch((e: unknown) => { if (!cancelled) { setAnonStatus("failed"); setAnonError(String((e as Error)?.message ?? e)); } });
    return () => { cancelled = true; };
  }, [mode]);

  const client = useMemo(() => makePublicClient(mode, (h) => setAnonStatus(h === "degraded" ? "degraded" : "ready")), [mode]);
  const setMode = (m: ReadMode) => {
    try { localStorage.setItem("aquaprime.readMode", m); } catch { /* ignore */ }
    setModeState(m);
    queryClient.invalidateQueries();
  };

  // DemoWalletProvider sits ABOVE wagmi: WagmiProvider re-mounts its subtree while it rehydrates/reconnects,
  // which would otherwise wipe the selected demo wallet.
  return (
    <DemoWalletProvider>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ReadContext.Provider value={{ client, mode, anonStatus, anonError, setMode }}>{children}</ReadContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
    </DemoWalletProvider>
  );
}
