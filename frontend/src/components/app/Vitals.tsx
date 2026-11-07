"use client";
import { motion } from "framer-motion";
import type { LogLine } from "@/hooks/useTx";
import { txUrl } from "@/config";
import { C } from "@/lib/theme";
import { eth, hf as fmtHf, short, usd } from "@/lib/format";

const ease = [0.2, 0.8, 0.2, 1] as const;

export function HealthRing({ value, size = 168 }: { value?: bigint; size?: number }) {
  const v = value === undefined ? undefined : value > 10n ** 30n ? Infinity : Number(value) / 1e18;
  const shown = v === undefined ? 0 : v === Infinity ? 2 : Math.min(v, 2);
  const tone = v === undefined ? C.fg4 : v < 1 ? C.signal : v < 1.1 ? C.warn : C.ocean;
  const r = 70, len = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={`Health factor ${v === undefined ? "unknown" : fmtHf(value)}`}>
        <circle cx="80" cy="80" r={r} fill="none" stroke={C.rule} strokeWidth="6" />
        <motion.circle cx="80" cy="80" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={len} initial={false} animate={{ strokeDashoffset: len * (1 - shown / 2) }} transition={{ duration: 0.8, ease }} />
        <line x1="80" y1="2" x2="80" y2="18" stroke={C.signal} strokeWidth="1.5" transform="rotate(180 80 80)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-3xl" style={{ color: tone }}>{v === undefined ? "—" : fmtHf(value)}</div>
          <div className="label mt-1">health</div>
        </div>
      </div>
    </div>
  );
}

export function Activity({ lines }: { lines: LogLine[] }) {
  const tone = { info: "text-fg-2", ok: "text-ok", err: "text-signal", warn: "text-warn" };
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-rule px-5 py-3"><span className="label">Activity</span></div>
      <ol className="max-h-64 overflow-auto px-5 py-3 text-[13px]" aria-live="polite">
        {lines.length === 0 && <li className="py-2 text-fg-4">Your transactions will stream here.</li>}
        {lines.map((l, i) => (
          <motion.li key={l.t + i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 py-1.5 ${tone[l.level]}`}>
            <span className="num shrink-0 text-fg-4">{new Date(l.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="min-w-0">
              {l.msg}
              {l.tx && (txUrl(l.tx)
                ? <a className="ml-2 font-mono text-fg underline underline-offset-2" href={txUrl(l.tx)} target="_blank" rel="noreferrer">{short(l.tx, 4)}</a>
                : <span className="ml-2 font-mono text-fg-4">{short(l.tx, 4)}</span>)}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function PositionCard({ pos, price }: { pos?: { collateral: bigint; debt: bigint; healthFactor: bigint; human: boolean; maxBorrowable: bigint; auctionActive: boolean }; price?: bigint }) {
  return (
    <div className="panel p-6 flex flex-col items-center gap-5">
      <HealthRing value={pos?.healthFactor} />
      <div className="flex flex-wrap justify-center gap-2">
        <span className={`tag ${pos?.human ? "border-ok/40 bg-ok/10 text-ok" : "border-rule text-fg-3"}`}>{pos?.human ? "Human · 115%" : "Anonymous · 150%"}</span>
        {pos?.auctionActive && <span className="tag border-warn/40 bg-warn/10 text-warn">0xf0 auction live</span>}
      </div>
      <dl className="w-full">
        <div className="kv"><dt>Collateral</dt><dd>{eth(pos?.collateral, 3)}</dd></div>
        <div className="kv"><dt>Debt</dt><dd>{usd(pos?.debt)}</dd></div>
        <div className="kv"><dt>Can still borrow</dt><dd>{usd(pos?.maxBorrowable, 0)}</dd></div>
        <div className="kv"><dt>ETH oracle</dt><dd>{usd(price, 0)}</dd></div>
      </dl>
    </div>
  );
}
