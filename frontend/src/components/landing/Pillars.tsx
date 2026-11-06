"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { Fingerprint, Scissors, Wallet } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;
const reveal = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" } };

function ZeroCustody() {
  return (
    <svg viewBox="0 0 320 170" className="w-full" aria-hidden>
      <defs>
        <linearGradient id="fl" x1="0" x2="1"><stop offset="0" stopColor="#5CF2E6" /><stop offset="1" stopColor="#8B5CFF" /></linearGradient>
      </defs>
      <rect x="18" y="55" width="90" height="60" rx="16" fill="#0C1322" stroke="#5CF2E6" strokeOpacity=".5" />
      <text x="63" y="82" textAnchor="middle" fill="#E8EEF8" fontSize="11" fontFamily="var(--font-mono)">YOUR</text>
      <text x="63" y="98" textAnchor="middle" fill="#E8EEF8" fontSize="11" fontFamily="var(--font-mono)">WALLET</text>
      {[30, 85, 140].map((y, i) => (
        <g key={y}>
          <path d={`M108 85 C 170 85, 180 ${y}, 240 ${y}`} stroke="url(#fl)" strokeWidth="1.5" fill="none" strokeDasharray="4 6">
            <animate attributeName="stroke-dashoffset" from="40" to="0" dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite" />
          </path>
          <circle cx="258" cy={y} r="16" fill="#0C1322" stroke={["#5CF2E6", "#8B5CFF", "#C8FF5A"][i]} strokeOpacity=".7" />
          <text x="258" y={y + 4} textAnchor="middle" fontSize="10" fill="#E8EEF8" fontFamily="var(--font-mono)">{["A", "B", "C"][i]}</text>
        </g>
      ))}
    </svg>
  );
}

function Scalpel() {
  const [legacy, setLegacy] = useState(false);
  const cut = legacy ? 0.52 : 0.13;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-16 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-tide/30 via-tide/20 to-pulse/30">
        <motion.div className={`absolute inset-y-0 right-0 ${legacy ? "bg-ember/70" : "bg-bloom/80"}`}
          animate={{ width: `${cut * 100}%` }} transition={{ duration: 0.8, ease }} />
        <div className="absolute inset-0 grid place-items-center text-xs font-medium text-abyss mix-blend-screen">
          <span className="num text-ink-50">{Math.round(cut * 100)}% of collateral sold</span>
        </div>
      </div>
      <div role="radiogroup" aria-label="Liquidation engine" className="glass flex rounded-full p-1 text-xs">
        {[["AquaPrime 0xf0", false], ["Legacy close-factor", true]].map(([l, v]) => (
          <button key={String(l)} role="radio" aria-checked={legacy === v} onClick={() => setLegacy(v as boolean)}
            className={`focus-ring min-h-[36px] flex-1 rounded-full px-3 transition ${legacy === v ? "bg-white/10 text-ink-50" : "text-ink-400"}`}>{l as string}</button>
        ))}
      </div>
    </div>
  );
}

function HumanTier() {
  const [human, setHuman] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">collateral required</div>
          <motion.div key={String(human)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`num text-5xl ${human ? "text-bloom" : "text-ink-300"}`}>{human ? "115%" : "150%"}</motion.div>
        </div>
        <div className="text-right text-xs text-ink-400">
          <div>grace window</div>
          <div className="num text-lg text-ink-50">{human ? "3 min" : "0 s"}</div>
        </div>
      </div>
      <button onClick={() => setHuman((h) => !h)} aria-pressed={human}
        className={`focus-ring flex min-h-[44px] items-center justify-between rounded-full border px-4 text-sm transition ${human ? "border-bloom/40 bg-bloom/10 text-bloom" : "border-white/10 text-ink-300"}`}>
        <span>{human ? "Verified human (World ID)" : "Anonymous wallet"}</span>
        <span className={`relative h-6 w-11 rounded-full transition ${human ? "bg-bloom" : "bg-white/15"}`}>
          <motion.span layout className="absolute top-1 h-4 w-4 rounded-full bg-abyss" style={{ left: human ? 24 : 4 }} />
        </span>
      </button>
    </div>
  );
}

const cards = [
  { icon: Wallet, tone: "text-tide", k: "01 · Zero custody", t: "Lend without depositing.", d: "Your USDC stays in your wallet and backs three strategies at once through 1inch Aqua. It moves only at the instant someone borrows — straight to them.", viz: <ZeroCustody /> },
  { icon: Scissors, tone: "text-pulse-300", k: "02 · Surgical liquidation", t: "A scalpel, not a sledgehammer.", d: "Custom SwapVM opcode 0xf0 computes the exact collateral slice that restores health to 1.02 — and the VM itself refuses to sell a wei more.", viz: <Scalpel /> },
  { icon: Fingerprint, tone: "text-bloom", k: "03 · Proof of human", t: "Humans borrow cheaper.", d: "One World ID = one Prime wallet, bound on-chain. Sybils can't farm it, and no one learns who you are.", viz: <HumanTier /> },
];

export function Pillars() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-28">
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mb-14 max-w-2xl">
        <div className="eyebrow mb-4">How it works</div>
        <h2 className="h-display text-4xl md:text-5xl">Three ideas. <span className="text-ink-400">One credit market.</span></h2>
      </motion.div>
      <div className="grid gap-5 md:grid-cols-3">
        {cards.map((c, i) => (
          <motion.article key={c.k} {...reveal} transition={{ duration: 0.8, delay: i * 0.1, ease }}
            whileHover={{ y: -6 }} className="card group flex flex-col gap-6 transition-colors hover:border-white/15">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.04] ${c.tone}`}><c.icon className="h-5 w-5" aria-hidden /></span>
              <span className="eyebrow">{c.k}</span>
            </div>
            <div className="min-h-[170px]">{c.viz}</div>
            <div>
              <h3 className="font-display text-xl font-semibold">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{c.d}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
