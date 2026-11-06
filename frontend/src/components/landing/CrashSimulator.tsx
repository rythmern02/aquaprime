"use client";
import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { simulate } from "@/lib/riskmath";

const LiquidityOrb = dynamic(() => import("@/components/fx/LiquidityOrb"), { ssr: false });
const ease = [0.22, 1, 0.36, 1] as const;
const money = (n: number, dp = 0) => `$${n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;

function Slider({ label, value, min, max, step, onChange, fmt, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; hint?: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-ink-300">{label}</label>
        <span className="num text-sm text-ink-50">{fmt(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="focus-ring h-2 w-full cursor-pointer appearance-none rounded-full accent-tide"
        style={{ background: `linear-gradient(90deg, #5CF2E6 ${pct}%, rgba(255,255,255,.08) ${pct}%)` }} />
      {hint && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}

function Dial({ hf }: { hf: number }) {
  const v = Math.min(Math.max(hf, 0), 2);
  const angle = (v / 2) * 180;
  const tone = hf < 1 ? "#FF4D6D" : hf < 1.1 ? "#FFB547" : "#5CF2E6";
  const r = 80, cx = 100, cy = 100;
  const pt = (a: number) => [cx - r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
  const [x, y] = pt(angle);
  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[260px]" role="img" aria-label={`Health factor ${hf.toFixed(2)}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" strokeLinecap="round" />
      <path d="M100 20 A80 80 0 0 1 180 100" fill="none" stroke="rgba(92,242,230,.15)" strokeWidth="12" strokeLinecap="round" />
      <motion.path d={`M20 100 A80 80 0 0 1 ${x} ${y}`} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round"
        initial={false} animate={{ d: `M20 100 A80 80 0 0 1 ${x} ${y}` }} transition={{ duration: 0.4, ease }}
        style={{ filter: `drop-shadow(0 0 10px ${tone})` }} />
      <line x1="100" y1="14" x2="100" y2="30" stroke="#E8EEF8" strokeOpacity=".4" />
      <text x="100" y="10" textAnchor="middle" fontSize="8" fill="#93A1B8" fontFamily="var(--font-mono)">1.0</text>
      <text x="100" y="92" textAnchor="middle" fontSize="30" fill={tone} fontFamily="var(--font-mono)">{hf === Infinity ? "∞" : hf.toFixed(3)}</text>
      <text x="100" y="110" textAnchor="middle" fontSize="8" fill="#93A1B8" letterSpacing="2">HEALTH FACTOR</text>
    </svg>
  );
}

function Bar({ label, eth, total, price, tone, note }: { label: string; eth: number; total: number; price: number; tone: string; note: string }) {
  const pct = total > 0 ? Math.min(eth / total, 1) * 100 : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="text-ink-300">{label}</span>
        <span className="num text-ink-50">{eth.toFixed(3)} ETH <span className="text-ink-500">· {money(eth * price)}</span></span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div className={`h-full rounded-full ${tone}`} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease }} />
      </div>
      <div className="mt-1 text-[11px] text-ink-500">{note}</div>
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
  const stress = Math.min(Math.max((1.15 - r.hf) / 0.35, 0), 1);

  return (
    <section id="simulator" className="relative mx-auto max-w-6xl scroll-mt-28 px-4 py-28">
      <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease }}
        className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="eyebrow mb-4">Crash simulator · same math as the contract</div>
          <h2 className="h-display text-4xl md:text-5xl">Drag ETH down. <span className="text-ink-400">Watch what you keep.</span></h2>
        </div>
        <div role="radiogroup" aria-label="Borrower tier" className="glass flex rounded-full p-1 text-sm">
          {[["World ID human", true], ["Anonymous", false]].map(([l, v]) => (
            <button key={String(l)} role="radio" aria-checked={human === v} onClick={() => setHuman(v as boolean)}
              className={`focus-ring min-h-[40px] rounded-full px-4 transition ${human === v ? "bg-white/10 text-ink-50" : "text-ink-400"}`}>{l as string}</button>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="card flex flex-col gap-6">
          <Slider label="ETH price" value={price} min={1200} max={3200} step={10} onChange={setPrice} fmt={(v) => money(v)}
            hint={`Liquidation price ${money(r.liqPrice)} · ratio ${(r.ratio * 100).toFixed(0)}%`} />
          <Slider label="Collateral" value={collateral} min={1} max={50} step={0.5} onChange={setCollateral} fmt={(v) => `${v} ETH`} />
          <Slider label="Debt" value={debt} min={1000} max={80000} step={250} onChange={setDebt} fmt={(v) => money(v)} />
          <Slider label="Time into Dutch auction" value={elapsed} min={0} max={600} step={10} onChange={setElapsed}
            fmt={(v) => `${v}s · ${(discountBps / 100).toFixed(2)}% discount`} hint="The price a liquidator pays falls over time — so keepers race to fill early." />
        </div>

        <div className="card relative flex flex-col gap-6 overflow-hidden">
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 opacity-25">
            <LiquidityOrb stress={stress} rings={under ? 1 : 3} className="h-full w-full" />
          </div>
          <div className="relative flex items-center gap-6">
            <Dial hf={r.hf} />
            <AnimatePresence mode="wait">
              <motion.div key={under ? "u" : "s"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="max-w-[220px]">
                {under ? (
                  <>
                    <div className="chip mb-2 border-ember/40 bg-ember/10 text-ember">insolvent → 0xf0 auction</div>
                    <p className="text-sm text-ink-300">Restores health to <span className="num text-bloom">{r.hfAfter.toFixed(2)}</span> by repaying <span className="num text-ink-50">{money(r.surgical.debtToCover)}</span>.</p>
                  </>
                ) : (
                  <>
                    <div className="chip mb-2 border-tide/40 bg-tide/10 text-tide">healthy</div>
                    <p className="text-sm text-ink-300">0xf0 reverts with <span className="font-mono text-ink-50">PositionHealthy</span> — nobody can touch you.</p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="relative flex flex-col gap-5">
            <Bar label="AquaPrime sells" eth={r.surgical.collateralOut + r.surgical.fee} total={collateral} price={price} tone="bg-gradient-to-r from-tide to-bloom"
              note={under ? `Exact slice at a ${(discountBps / 100).toFixed(2)}% discount + 0.5% protocol fee` : "Nothing — position is solvent"} />
            <Bar label="Legacy lender sells" eth={r.legacy.collateralOut} total={collateral} price={price} tone="bg-gradient-to-r from-ember to-amber"
              note={under ? `${r.hf < 0.95 ? "100%" : "50%"} close factor at a fixed 5% bonus` : "Nothing — position is solvent"} />
          </div>

          <div className="relative flex items-end justify-between rounded-2xl border border-bloom/20 bg-bloom/[0.05] p-5">
            <div>
              <div className="eyebrow">you keep, vs legacy</div>
              <motion.div key={Math.round(r.savedCollateral * price)} initial={{ scale: 0.95, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}
                className="num text-4xl text-bloom">{money(r.savedCollateral * price)}</motion.div>
            </div>
            <div className="text-right text-xs text-ink-400">
              {r.savedCollateral.toFixed(3)} ETH<br />stays in your position
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
