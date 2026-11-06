"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, http, type Address, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, CHAIN_ID, RPC_URL } from "@/config";

/**
 * One-click demo wallets for the LOCAL chain only (chain 31337). These are Hardhat's public, well-known
 * test keys — they hold value only on a throwaway local node. Never enabled on Sepolia/mainnet.
 */
export const DEMO_ROLES = {
  borrower: { label: "Demo borrower", key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" }, // hardhat #3 · 0x90F7…b906 (fresh, 20 WETH)
  anon: { label: "Demo anon", key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },     // hardhat #2 · 0x3C44…93BC (pre-opened position)
  maker: { label: "Demo maker", key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },   // hardhat #1 · 0x7099…79C8 (LP)
} as const;
export type DemoRole = keyof typeof DEMO_ROLES;

interface Ctx {
  available: boolean;
  active: boolean;
  role?: DemoRole;
  label?: string;
  address?: Address;
  wallet?: WalletClient;
  enable: (r: DemoRole) => void;
  disable: () => void;
}
const DemoCtx = createContext<Ctx | null>(null);

export function DemoWalletProvider({ children }: { children: ReactNode }) {
  const available = CHAIN_ID === 31337;
  const [role, setRole] = useState<DemoRole>();
  const value = useMemo<Ctx>(() => {
    if (!available || !role) return { available, active: false, enable: setRole, disable: () => setRole(undefined) };
    const account = privateKeyToAccount(DEMO_ROLES[role].key);
    const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
    return { available, active: true, role, label: DEMO_ROLES[role].label, address: account.address, wallet, enable: setRole, disable: () => setRole(undefined) };
  }, [available, role]);
  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export const useDemoWallet = () => {
  const c = useContext(DemoCtx);
  if (!c) throw new Error("DemoWalletProvider missing");
  return c;
};
