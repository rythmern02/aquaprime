"use client";
import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { simulate } from "@/lib/riskmath";
import { ease, SectionHead } from "./ui";

const money = (n: number, dp = 0) => `$${n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;
const BONE = "#EDEBE5", SIGNAL = "#FF5B24", WARN = "#E3A63C";

function Slider({ label, value, min, max, step, onChange, fmt, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; hint?: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="border-t border-rule py-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline justify-between">
        <label htmlFor={id} className="label">{label}</label>
        <span className="num text-[15px] text-fg">{fmt(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="focus-ring h-[3px] w-full cursor-pointer appearance-none rounded-none accent-fg"
        style={{ background: `linear-gradient(90deg, ${BONE} ${pct}%, #34332E ${pct}%)` }} />
      {hint && <div className="mt-2 text-xs text-fg-4">{hint}</div>}
    </div>
  );
}

function Gauge({ hf }: { hf: number }) {
  const v = Math.min(Math.max(hf, 0), 2);
  const angle = (v / 2) * 180;
  const tone = hf < 1 ? SIGNAL : hf < 1.1 ? WARN : BONE;
  const r = 80, cx = 100, cy = 100;
  const pt = (a: number, rr = r) => [cx - rr * Math.cos((a * Math.PI) / 180), cy - rr * Math.sin((a * Math.PI) / 180)];
  const [x, y] = pt(angle);
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[280px]" role="img" aria-label={`Health factor ${hf === Infinity ? "infinite" : hf.toFixed(3)}`}>
      {Array.from({ length: 21 }, (_, i) => {
        const a = i * 9, [x1, y1] = pt(a, 88), [x2, y2] = pt(a, i % 5 ? 92 : 96);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === 10 ? SIGNAL : "#4A4843"} strokeWidth="1" />;
      })}
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#24231F" strokeWidth="3" />
      <motion.path d={`M20 100 A80 80 0 0 1 ${x} ${y}`} fill="none" stroke={tone} strokeWidth="3"
        initial={false} animate={{ d: `M20 100 A80 80 0 0 1 ${x} ${y}` }} transition={{ duration: 0.35, ease }} />
      <text x="100" y="8" textAnchor="middle" fontSize="7.5" fill="#8C887F" fontFamily="var(--font-mono)">1.00</text>
      <text x="100" y="84" textAnchor="middle" fontSize="32" fill={tone} fontFamily="var(--font-mono)" letterSpacing="-1">{hf === Infinity ? "∞" : hf.toFixed(3)}</text>
      <text x="100" y="102" textAnchor="middle" fontSize="7.5" fill="#8C887F" fontFamily="var(--font-mono)" letterSpacing="1.2">HEALTH FACTOR</text>
    </svg>
  );
}

function Bar({ label, eth, total, price, tone, note }: { label: string; eth: number; total: number; price: number; tone: string; note: string }) {
  const pct = total > 0 ? Math.min(eth / total, 1) * 100 : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="label">{label}</span>
        <span className="num text-sm text-fg">{eth.toFixed(3)} ETH <span className="text-fg-4">/ {money(eth * price)}</span></span>
      </div>
      <div className="relative h-3 bg-raised">
        <motion.div className={`hatch absolute inset-y-0 left-0 border-r ${tone}`} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease }} />
      </div>
      <div className="mt-1.5 text-xs text-fg-4">{note}</div>
    </div>
  );
}

export function CrashSimulator() {
  const [collateral, setCollateral] = useState(10);
  const [debt, setDebt] = useState(17000);
  const [price, setPrice] = useState(1900);
  const [human, setHuman] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const discountBps = 150 + (450 * elapsed) / 600;
  const r = useMemo(() => simulate({ collateral, debt, price, human, discountBps }), [collateral, debt, price, human, discountBps]);
  const under = r.hf < 1;

  return (
    <section className="wrap py-28">
      <SectionHead id="simulator" index="02" kicker="Simulator" title={<>Drag ETH down. <span className="text-fg-3">Watch what you keep.</span></>}>
        The numbers below run the same surgical formula as the contract. Nothing is mocked: change any input and the slice is recomputed.
      </SectionHead>

      <div className="mt-14 grid overflow-hidden rounded-lg border border-rule lg:grid-cols-12">
        <div className="bg-panel p-6 sm:p-8 lg:col-span-5">
          <div role="radiogroup" aria-label="Borrower tier" className="mb-8 flex rounded-md border border-rule-2 p-0.5">
            {([["World ID human", true], ["Anonymous", false]] as const).map(([l, v]) => (
              <button key={l} role="radio" aria-checked={human === v} onClick={() => setHuman(v)}
                className={`focus-ring min-h-[36px] flex-1 rounded px-3 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${human === v ? "bg-fg text-bg" : "text-fg-3 hover:text-fg"}`}>{l}</button>
            ))}
          </div>
          <Slider label="ETH price" value={price} min={1200} max={3200} step={10} onChange={setPrice} fmt={(v) => money(v)}
            hint={`Liquidates below ${money(r.liqPrice)} — collateral ratio ${(r.ratio * 100).toFixed(0)}%`} />
          <Slider label="Collateral" value={collateral} min={1} max={50} step={0.5} onChange={setCollateral} fmt={(v) => `${v.toFixed(1)} ETH`} />
          <Slider label="Debt" value={debt} min={1000} max={80000} step={250} onChange={setDebt} fmt={(v) => money(v)} />
          <Slider label="Time into auction" value={elapsed} min={0} max={600} step={10} onChange={setElapsed}
            fmt={(v) => `${v}s · ${(discountBps / 100).toFixed(2)}%`} hint="The liquidator's discount grows from 1.5% to 6% over ten minutes, so keepers race to fill early." />
        </div>

        <div className="flex flex-col gap-8 border-t border-rule p-6 sm:p-8 lg:col-span-7 lg:border-l lg:border-t-0">
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <Gauge hf={r.hf} />
            <div className="max-w-xs" aria-live="polite">
              <div className={`tag mb-3 ${under ? "border-signal/50 text-signal" : "text-fg-2"}`}>{under ? "Underwater · 0xf0 auction" : "Healthy"}</div>
              {under
                ? <p className="text-sm leading-relaxed text-fg-2">Repaying <span className="num text-fg">{money(r.surgical.debtToCover)}</span> of debt brings health back to <span className="num text-fg">{r.hfAfter.toFixed(2)}</span>. That&apos;s all the auction may sell.</p>
                : <p className="text-sm leading-relaxed text-fg-2">Opcode 0xf0 reverts with <span className="font-mono text-fg">PositionHealthy</span>. Nobody can touch this position.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <Bar label="AquaPrime sells" eth={r.surgical.collateralOut + r.surgical.fee} total={collateral} price={price} tone="border-fg bg-fg/80 text-transparent"
              note={under ? `Exact slice at ${(discountBps / 100).toFixed(2)}% discount, plus the 0.5% protocol fee` : "Nothing — the position is solvent"} />
            <Bar label="Legacy lender sells" eth={r.legacy.collateralOut} total={collateral} price={price} tone="border-signal text-signal/70"
              note={under ? `${r.hf < 0.95 ? "100%" : "50%"} close factor at a flat 5% bonus` : "Nothing — the position is solvent"} />
          </div>

          <div className="mt-auto flex items-end justify-between gap-6 border-t border-rule pt-6">
            <div>
              <div className="label">You keep, compared with legacy</div>
              <div className="num mt-2 text-[clamp(2.4rem,5vw,3.5rem)] leading-none text-fg">{money(r.savedCollateral * price)}</div>
            </div>
            <div className="num pb-1 text-right text-sm text-fg-3">+{r.savedCollateral.toFixed(3)} ETH</div>
          </div>
        </div>
      </div>
    </section>
  );
}
