"use client";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { deployment, type Order, type OrderStruct } from "@/config";
import { useAuctionRegisters } from "@/hooks/useProtocol";
import { disassemble, splitOrder, type Instruction } from "@/lib/swapvm";
import { bps, eth, short, usd } from "@/lib/format";

const BANK_STYLE: Record<Instruction["bank"], string> = {
  aquaprime: "border-signal/70 bg-signal/15 text-signal",
  curve: "border-fg/60 bg-fg/10 text-fg",
  fee: "border-warn/60 bg-warn/10 text-warn",
  control: "border-fg-4/50 bg-fg-4/10 text-fg-2",
  access: "border-ok/60 bg-ok/10 text-ok",
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
          <div className="label">02 · SwapVM Bytecode &amp; Register Dissector</div>
          <h2 className="mt-1 text-lg font-semibold text-fg">What actually runs on AquaPrimeRouter</h2>
        </div>
        <span className="tag border-signal/50 text-signal">custom bank 0xf0+</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["auction", "Liquidation auction · 0xf0", auctionActive],
          ["backstop", "LP backstop · 0xf1", true],
          ["amm", "AquaAMM · stock", true],
        ] as const).map(([k, label, enabled]) => (
          <button key={k} disabled={!enabled}
            className={`btn !px-3 !py-1.5 text-xs ${effectiveTab === k ? "bg-raised text-fg" : "border border-rule text-fg-3 hover:text-fg"}`}
            onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {!auctionActive && <p className="-mt-3 text-[11px] text-fg-4">The 0xf0 auction order exists only while a position is underwater — the registry ships it into Aqua on demand.</p>}

      {decoded && order && (
        <>
          <div className="rounded border border-rule bg-bg p-3 font-mono text-[11px] leading-relaxed break-all">
            <span className="text-fg-4">maker</span> <span className="text-fg-2">{short(order.maker, 6)}</span>{" "}
            <span className="text-fg-4">pair</span> <span className="text-fg-2">{short(decoded.tokenA)}/{short(decoded.tokenB)}</span>
            {decoded.hooksHex.length > 2 && <> <span className="text-fg-4">hooks</span> <span className="text-fg-3">{decoded.hooksHex.slice(0, 26)}…</span></>}
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
              <li key={i.offset} className="flex items-start gap-3 rounded-lg border border-rule bg-panel px-3 py-2">
                <span className={`tag shrink-0 font-mono ${BANK_STYLE[i.bank]}`}>0x{i.opcode.toString(16).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg">
                    {i.name} {i.custom && <span className="ml-1 text-[10px] uppercase tracking-wider text-signal">custom</span>}
                  </div>
                  <div className="font-mono text-[11px] text-fg-3">
                    {Object.entries(i.decoded).map(([k, v]) => <span key={k} className="mr-3">{k}=<span className="text-fg">{v.length > 20 ? short(v, 6) : v}</span></span>)}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-fg-4">pc {i.offset}{n < decoded.ins.length - 1 ? " →" : ""}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {effectiveTab === "auction" && regs.data && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-fg-2">SwapVM registers — before vs after 0xf0 + curve</div>
            <span className="font-mono text-[11px] text-fg-4">discount {q ? bps(q.discountBps) : "—"}</span>
          </div>
          <table className="w-full font-mono text-[12px]">
            <thead><tr className="text-left text-fg-4"><th className="py-1">register</th><th>Aqua load</th><th>after 0xf0</th><th className="hidden xl:table-cell">note</th></tr></thead>
            <tbody>
              {rows.map(([k, b, a, note]) => (
                <tr key={k} className="border-t border-rule">
                  <td className="py-1.5 text-fg-2">{k}</td>
                  <td className="text-fg-3">{b}</td>
                  <td className={a === "revert" ? "text-signal" : "text-fg"}>{a}</td>
                  <td className="hidden text-[11px] text-fg-4 xl:table-cell">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {regs.data.quoteError && <p className="mt-2 text-xs text-warn">router.quote(): {regs.data.quoteError}</p>}
        </div>
      )}
    </section>
  );
}
