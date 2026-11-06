"use client";
import { motion } from "framer-motion";
import type { LogLine } from "@/hooks/useTx";
import { txUrl } from "@/config";
import { eth, hf as fmtHf, short, usd } from "@/lib/format";

const ease = [0.22, 1, 0.36, 1] as const;

export function HealthRing({ value, size = 168 }: { value?: bigint; size?: number }) {
  const v = value === undefined ? undefined : value > 10n ** 30n ? Infinity : Number(value) / 1e18;
  const shown = v === undefined ? 0 : v === Infinity ? 2 : Math.min(v, 2);
  const tone = v === undefined ? "#4A5568" : v < 1 ? "#FF4D6D" : v < 1.1 ? "#FFB547" : "#5CF2E6";
  const r = 70, len = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={`Health factor ${v === undefined ? "unknown" : fmtHf(value)}`}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="10" />
        <motion.circle cx="80" cy="80" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={len} initial={false} animate={{ strokeDashoffset: len * (1 - shown / 2) }} transition={{ duration: 0.8, ease }}
          style={{ filter: `drop-shadow(0 0 8px ${tone})` }} />
        <circle cx="80" cy="10" r="3" fill="#E8EEF8" opacity=".5" transform="rotate(180 80 80)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-3xl" style={{ color: tone }}>{v === undefined ? "—" : fmtHf(value)}</div>
          <div className="eyebrow mt-1">health</div>
        </div>
      </div>
    </div>
  );
}

export function Activity({ lines }: { lines: LogLine[] }) {
  const tone = { info: "text-ink-300", ok: "text-bloom", err: "text-ember", warn: "text-amber" };
  return (
    <div className="card !p-0">
      <div className="border-b border-white/5 px-5 py-3"><span className="eyebrow">Activity</span></div>
      <ol className="max-h-64 overflow-auto px-5 py-3 text-[13px]" aria-live="polite">
        {lines.length === 0 && <li className="py-2 text-ink-500">Your transactions will stream here.</li>}
        {lines.map((l, i) => (
          <motion.li key={l.t + i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 py-1.5 ${tone[l.level]}`}>
            <span className="num shrink-0 text-ink-600">{new Date(l.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="min-w-0">
              {l.msg}
              {l.tx && (txUrl(l.tx)
                ? <a className="ml-2 font-mono text-tide underline underline-offset-2" href={txUrl(l.tx)} target="_blank" rel="noreferrer">{short(l.tx, 4)}</a>
                : <span className="ml-2 font-mono text-ink-500">{short(l.tx, 4)}</span>)}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function PositionCard({ pos, price }: { pos?: { collateral: bigint; debt: bigint; healthFactor: bigint; human: boolean; maxBorrowable: bigint; auctionActive: boolean }; price?: bigint }) {
  return (
    <div className="card flex flex-col items-center gap-5">
      <HealthRing value={pos?.healthFactor} />
      <div className="flex flex-wrap justify-center gap-2">
        <span className={`chip ${pos?.human ? "border-bloom/40 bg-bloom/10 text-bloom" : "border-white/10 text-ink-400"}`}>{pos?.human ? "Human · 115%" : "Anonymous · 150%"}</span>
        {pos?.auctionActive && <span className="chip border-amber/40 bg-amber/10 text-amber">0xf0 auction live</span>}
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
