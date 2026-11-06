"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { encodeAbiParameters, parseEther, parseUnits, type Address, type Hex } from "viem";
import type { IDKitResult, RpContext } from "@worldcoin/idkit";
import { deployment } from "@/config";
import { aquaAbi, registryAbi, tokenAbi } from "@/abi/generated";
import { useReads } from "@/app/providers";
import { revertReason, useTx, type LogLine } from "./useTx";

const c = deployment.contracts;
export type Log = (l: LogLine["level"], m: string, tx?: string) => void;

export async function api<T>(path: string, body?: unknown) {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T & { error?: string; code?: string } };
}

/** Every user-facing protocol action, shared by the playground steps. Each returns true on success. */
export function useAquaActions(log: Log) {
  const { send, pending, account } = useTx();
  const { client } = useReads();
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();

  // every action — wallet tx or backend call — refreshes on-chain views immediately, success or not
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); return true; } catch (e) { log("err", `${label}: ${revertReason(e)}`); return false; }
    finally { setBusy(null); await qc.invalidateQueries(); }
  };

  const ensureAllowance = async (token: Address, spender: Address, amount: bigint) => {
    const cur = await client.readContract({ address: token, abi: tokenAbi, functionName: "allowance", args: [account!, spender] });
    if (cur < amount) log("info", "Approval granted", await send("approve", { address: token, abi: tokenAbi as never, functionName: "approve", args: [spender, amount] }));
  };

  return {
    busy: busy ?? pending,
    account,

    depositAndBorrow: (collateralEth: string, borrowUsdc: string, creditLine?: Hex) => run("Deposit & borrow", async () => {
      const coll = parseEther(collateralEth || "0");
      if (coll > 0n) {
        await ensureAllowance(c.weth, c.registry, coll);
        log("ok", `Deposited ${collateralEth} WETH as collateral`, await send("deposit", { address: c.registry, abi: registryAbi as never, functionName: "depositCollateral", args: [coll] }));
      }
      const amt = parseUnits(borrowUsdc || "0", 6);
      if (amt > 0n) {
        const line = creditLine ?? deployment.strategies?.creditLine?.hash;
        if (!line) throw new Error("No credit line available");
        log("ok", `Borrowed ${borrowUsdc} USDC — pulled straight from the lender's wallet via aqua.pull`, await send("borrow", { address: c.registry, abi: registryAbi as never, functionName: "borrow", args: [amt, line] }));
      }
    }),

    repay: (borrower: Address, usdc: string) => run("Repay", async () => {
      const amt = parseUnits(usdc, 6);
      await ensureAllowance(c.usdc, c.registry, amt);
      log("ok", `Repaid ${usdc} USDC — pushed back into the lender's Aqua credit line`, await send("repay", { address: c.registry, abi: registryAbi as never, functionName: "repay", args: [borrower, amt] }));
    }),

    shipCreditLine: (usdc: string, aprPct: string) => run("Ship credit line", async () => {
      const amt = parseUnits(usdc, 6);
      const aprBps = Math.round(Number(aprPct) * 100);
      const salt = BigInt(Math.floor(Date.now() / 1000));
      const strategy = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint32" }, { type: "uint64" }], [account!, c.usdc, aprBps, salt]);
      const cur = await client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "allowance", args: [account!, c.aqua] });
      await send("approve", { address: c.usdc, abi: tokenAbi as never, functionName: "approve", args: [c.aqua, cur + amt] });
      log("ok", `aqua.ship — ${usdc} USDC of virtual credit, 0 tokens moved`, await send("ship", { address: c.aqua, abi: aquaAbi as never, functionName: "ship", args: [c.registry, strategy, [c.usdc], [amt]] }));
      log("ok", "Credit line registered", await send("register", { address: c.registry, abi: registryAbi as never, functionName: "registerCreditLine", args: [aprBps, salt] }));
    }),

    dock: (app: Address, hash: Hex, tokens: Address[], name: string) => run("Dock", async () => {
      log("ok", `aqua.dock(${name}) — strategy retired, 0 tokens moved`, await send("dock", { address: c.aqua, abi: aquaAbi as never, functionName: "dock", args: [app, hash, tokens] }));
    }),

    rpContext: async () => {
      const r = await api<RpContext>("/api/world/rp-context", {});
      if (!r.ok) { log("err", r.data.error || "World ID is not configured on this server"); return undefined; }
      return r.data as RpContext;
    },

    verifyProof: async (result: IDKitResult) => {
      const r = await api<{ nullifier: string; deadline: string; signature: Hex }>("/api/world/verify", { wallet: account, result });
      if (!r.ok) { log("err", `World rejected the proof: ${r.data.error}`); throw new Error(r.data.error); }
      const h = await send("verifyHuman", { address: c.registry, abi: registryAbi as never, functionName: "verifyHuman", args: [BigInt(r.data.nullifier), BigInt(r.data.deadline), r.data.signature] });
      log("ok", "Human Prime tier unlocked on-chain — 115% collateral + 3-minute grace", h);
    },

    setOracle: (price: number) => run("Push price", async () => {
      const r = await api<{ txHash: string }>("/api/oracle", { price });
      if (!r.ok) throw new Error(r.data.error);
      log("warn", `ETH/USD oracle → $${price.toLocaleString()}`, r.data.txHash);
    }),

    startAuction: (borrower: Address) => run("Ship auction", async () => {
      const r = await api<{ txHash: string }>("/api/keeper/start-auction", { borrower });
      if (!r.ok) throw new Error(r.data.error);
      log("ok", "Keeper shipped the 0xf0-guarded SwapVM auction into Aqua", r.data.txHash);
    }),

    skipGrace: () => run("Skip grace", async () => {
      const r = await api("/api/dev/time-travel", { seconds: 181 });
      if (!r.ok) throw new Error(r.data.error);
      log("info", "Local chain advanced 181 s — grace window over");
    }),

    /** Protected action: Agent Pass approval in a popup, then the backend decides. */
    approveAndExecute: (borrower: Address, idpLabel: string) => run("Agent Pass", async () => {
      const r = await api<{ attemptId: string; authorizeUrl: string }>("/api/agentpass/start", { borrower });
      if (!r.ok) throw new Error(r.data.error);
      log("info", "Keeper paused — requesting a fresh human approval…");
      const popup = window.open(r.data.authorizeUrl, "agentpass", "width=480,height=760");
      const outcome = await new Promise<{ status: string; reason?: string }>((resolve) => {
        const onMsg = (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin || ev.data?.type !== "aquaprime-agentpass" || ev.data?.attemptId !== r.data.attemptId) return;
          cleanup(); resolve(ev.data);
        };
        const timer = setInterval(() => { if (!popup || popup.closed) { cleanup(); resolve({ status: "closed" }); } }, 800);
        const cleanup = () => { window.removeEventListener("message", onMsg); clearInterval(timer); };
        window.addEventListener("message", onMsg);
      });
      log(outcome.status === "approved" ? "ok" : "warn", outcome.status === "approved" ? "Human approval validated by the backend" : `Approval not granted (${outcome.reason || outcome.status})`);
      const e = await api<{ txHash: string; approvedBy?: { sub?: string } }>("/api/keeper/execute", { attemptId: r.data.attemptId, borrower });
      if (e.ok) log("ok", `Surgical fill executed in one tx · approved via ${idpLabel}`, e.data.txHash);
      else log("err", `HTTP ${e.status} — Action blocked: ${e.data.error}`);
    }),

    deniedPath: (borrower: Address) => run("Denied path", async () => {
      const r = await api<{ attemptId: string }>("/api/agentpass/start", { borrower });
      if (!r.ok) throw new Error(r.data.error);
      log("info", "Approval requested, then abandoned before a human completed it");
      const e = await api("/api/keeper/execute", { attemptId: r.data.attemptId, borrower });
      log(e.ok ? "ok" : "err", e.ok ? "Unexpectedly executed" : `HTTP ${e.status} — Action blocked: ${e.data.error}`);
    }),
  };
}
