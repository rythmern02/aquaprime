"use client";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { deployment, type Order, type OrderStruct } from "@/config";
import { useAuctionRegisters } from "@/hooks/useProtocol";
import { disassemble, splitOrder, type Instruction } from "@/lib/swapvm";
import { bps, eth, short, usd } from "@/lib/format";

const BANK_STYLE: Record<Instruction["bank"], string> = {
  aquaprime: "border-prime-500/70 bg-prime-500/15 text-prime-400",
  curve: "border-aqua-500/60 bg-aqua-500/10 text-aqua-300",
  fee: "border-amber-500/60 bg-amber-500/10 text-amber-300",
  control: "border-slate-500/50 bg-slate-500/10 text-slate-300",
  access: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300",
};

type Tab = "auction" | "backstop" | "amm";

export function BytecodePanel({ borrower, auctionActive }: { borrower?: Address; auctionActive?: boolean }) {
  const [tab, setTab] = useState<Tab>("backstop");
  const regs = useAuctionRegisters(borrower, auctionActive);
  const effectiveTab: Tab = tab === "auction" && !auctionActive ? "backstop" : tab;

  const order: Order | OrderStruct | undefined =
    effectiveTab === "auction" ? regs.data?.order
    : effectiveTab === "backstop" ? deployment.strategies?.backstop?.order
    : deployment.strategies?.amm?.order;

  const decoded = useMemo(() => {
    if (!order) return undefined;
    const parts = splitOrder(order.traits, order.data);
    return { ...parts, ins: disassemble(parts.program) };
  }, [order]);

  const q = regs.data?.quote;
  const rows: [string, string, string, string][] = regs.data ? [
    ["balanceIn", usd(regs.data.before.balanceIn), usd(q?.debtToCover), "Aqua USDC → debt slice priced at the live discount"],
    ["balanceOut", eth(regs.data.before.balanceOut), eth(q?.collateralOut), "Aqua WETH (all collateral) → surgical cap"],
    ["amountIn", usd(regs.data.before.amountIn), regs.data.quoted ? usd(regs.data.quoted.amountIn) : "revert", "taker-defined (exactIn)"],
    ["amountOut", "0", regs.data.quoted ? eth(regs.data.quoted.amountOut) : "revert", "computed by LimitSwap under the cap"],
    ["amountNetPulled", "0", "0", "no in-program fee pulls"],
  ] : [];

  return (
    <section className="panel flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="panel-title">02 · SwapVM Bytecode &amp; Register Dissector</div>
          <h2 className="mt-1 text-lg font-semibold text-white">What actually runs on AquaPrimeRouter</h2>
        </div>
        <span className="chip border-prime-500/50 text-prime-400">custom bank 0xf0+</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["auction", "Liquidation auction · 0xf0", auctionActive],
          ["backstop", "LP backstop · 0xf1", true],
          ["amm", "AquaAMM · stock", true],
        ] as const).map(([k, label, enabled]) => (
          <button key={k} disabled={!enabled}
            className={`btn !px-3 !py-1.5 text-xs ${effectiveTab === k ? "bg-ink-700 text-white" : "border border-ink-700 text-slate-400 hover:text-white"}`}
            onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {!auctionActive && <p className="-mt-3 text-[11px] text-slate-500">The 0xf0 auction order exists only while a position is underwater — the registry ships it into Aqua on demand.</p>}

      {decoded && order && (
        <>
          <div className="rounded-xl border border-ink-700 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed break-all">
            <span className="text-slate-500">maker</span> <span className="text-slate-300">{short(order.maker, 6)}</span>{" "}
            <span className="text-slate-500">pair</span> <span className="text-slate-300">{short(decoded.tokenA)}/{short(decoded.tokenB)}</span>
            {decoded.hooksHex.length > 2 && <> <span className="text-slate-500">hooks</span> <span className="text-slate-400">{decoded.hooksHex.slice(0, 26)}…</span></>}
            <div className="mt-2 flex flex-wrap gap-1">
              {decoded.ins.map((i) => (
                <span key={i.offset} className={`rounded border px-1.5 py-0.5 ${BANK_STYLE[i.bank]}`} title={i.name}>
                  <b>{i.rawHex.slice(2, 4)}</b><span className="opacity-60">{i.rawHex.slice(4, 6)}</span>{i.rawHex.slice(6, 30)}{i.rawHex.length > 30 ? "…" : ""}
                </span>
              ))}
            </div>
          </div>

          <ol className="flex flex-col gap-1.5">
            {decoded.ins.map((i, n) => (
              <li key={i.offset} className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2">
                <span className={`chip shrink-0 font-mono ${BANK_STYLE[i.bank]}`}>0x{i.opcode.toString(16).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">
                    {i.name} {i.custom && <span className="ml-1 text-[10px] uppercase tracking-wider text-prime-400">custom</span>}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {Object.entries(i.decoded).map(([k, v]) => <span key={k} className="mr-3">{k}=<span className="text-slate-200">{v.length > 20 ? short(v, 6) : v}</span></span>)}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-600">pc {i.offset}{n < decoded.ins.length - 1 ? " →" : ""}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {effectiveTab === "auction" && regs.data && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-300">SwapVM registers — before vs after 0xf0 + curve</div>
            <span className="font-mono text-[11px] text-slate-500">discount {q ? bps(q.discountBps) : "—"}</span>
          </div>
          <table className="w-full font-mono text-[12px]">
            <thead><tr className="text-left text-slate-500"><th className="py-1">register</th><th>Aqua load</th><th>after 0xf0</th><th className="hidden xl:table-cell">note</th></tr></thead>
            <tbody>
              {rows.map(([k, b, a, note]) => (
                <tr key={k} className="border-t border-ink-800">
                  <td className="py-1.5 text-slate-300">{k}</td>
                  <td className="text-slate-400">{b}</td>
                  <td className={a === "revert" ? "text-rose-300" : "text-aqua-300"}>{a}</td>
                  <td className="hidden text-[11px] text-slate-500 xl:table-cell">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {regs.data.quoteError && <p className="mt-2 text-xs text-amber-300">router.quote(): {regs.data.quoteError}</p>}
        </div>
      )}
    </section>
  );
}
