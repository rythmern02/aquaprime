"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { ease, reveal, SectionHead } from "./ui";

function Segmented<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: [string, T][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-rule-2 p-0.5">
      {options.map(([l, v]) => (
        <button key={l} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`focus-ring min-h-[36px] flex-1 rounded px-3 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${value === v ? "bg-fg text-bg" : "text-fg-3 hover:text-fg"}`}>{l}</button>
      ))}
    </div>
  );
}

function ZeroCustody() {
  const ys = [26, 85, 144];
  return (
    <svg viewBox="0 0 320 170" className="w-full" aria-hidden>
      <rect x="12" y="58" width="96" height="54" fill="none" stroke="#EDEBE5" strokeWidth="1" />
      <text x="22" y="78" fill="#8C887F" fontSize="9" fontFamily="var(--font-mono)" letterSpacing=".06em">YOUR WALLET</text>
      <text x="22" y="100" fill="#EDEBE5" fontSize="15" fontFamily="var(--font-mono)">25,000</text>
      {ys.map((y, i) => (
        <g key={y}>
          <path d={`M108 85 C 160 85, 176 ${y}, 226 ${y}`} stroke={i === 0 ? "#FF5B24" : "#66635C"} strokeWidth="1" fill="none" strokeDasharray="2 4">
            <animate attributeName="stroke-dashoffset" from="24" to="0" dur={`${1.2 + i * 0.35}s`} repeatCount="indefinite" />
          </path>
          <rect x="226" y={y - 12} width="82" height="24" fill="#111110" stroke="#34332E" />
          <text x="234" y={y + 4} fontSize="9.5" fill="#BDB9B0" fontFamily="var(--font-mono)" letterSpacing=".04em">{["A CREDIT", "B BACKSTOP", "C AMM"][i]}</text>
        </g>
      ))}
    </svg>
  );
}

function Scalpel() {
  const [legacy, setLegacy] = useState(false);
  const cut = legacy ? 0.52 : 0.134;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="relative h-14 border border-rule-2">
          <motion.div className={`hatch absolute inset-y-0 right-0 border-l ${legacy ? "border-signal text-signal/70" : "border-fg text-fg/60"}`}
            animate={{ width: `${cut * 100}%` }} transition={{ duration: 0.7, ease }} />
          <div className="absolute inset-y-0 left-3 flex items-center font-mono text-[11px] text-fg-3">10.000 WETH</div>
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-fg-3">
          <span>kept</span>
          <span className={legacy ? "text-signal" : "text-fg"}>{(cut * 100).toFixed(1)}% sold</span>
        </div>
      </div>
      <Segmented label="Liquidation engine" value={legacy} onChange={setLegacy} options={[["0xf0 surgical", false], ["Legacy 50%", true]]} />
    </div>
  );
}

function HumanTier() {
  const [human, setHuman] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-4">
        <div>
          <div className="label">Collateral required</div>
          <motion.div key={String(human)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num mt-1 text-5xl text-fg">{human ? "115" : "150"}<span className="text-2xl text-fg-3">%</span></motion.div>
        </div>
        <div className="text-right">
          <div className="label">Grace</div>
          <div className="num mt-1 text-lg text-fg-2">{human ? "180 s" : "0 s"}</div>
        </div>
      </div>
      <Segmented label="Borrower tier" value={human} onChange={setHuman} options={[["World ID human", true], ["Anonymous", false]]} />
    </div>
  );
}

const items = [
  { n: "1.1", t: "Lend without depositing.", d: "Your USDC stays in your wallet and backs three strategies at once through 1inch Aqua. It moves once, at the moment someone borrows, straight to them.", viz: <ZeroCustody /> },
  { n: "1.2", t: "Liquidate with a scalpel.", d: "Opcode 0xf0 computes the exact collateral slice that restores health to 1.02, and the VM refuses to sell a wei more.", viz: <Scalpel /> },
  { n: "1.3", t: "Humans borrow cheaper.", d: "One World ID, one Prime wallet, bound on-chain. Sybils can't farm the tier and nobody learns who you are.", viz: <HumanTier /> },
];

export function Pillars() {
  return (
    <section className="wrap py-28">
      <SectionHead id="how" index="01" kicker="Mechanism" title={<>Three ideas, <span className="text-fg-3">one credit market.</span></>} />
      <div className="mt-14 grid border-t border-rule md:grid-cols-3">
        {items.map((c, i) => (
          <motion.article key={c.n} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
            className={`flex flex-col gap-8 py-8 md:px-8 ${i ? "border-t border-rule md:border-l md:border-t-0" : "md:pl-0"} ${i === 2 ? "md:pr-0" : ""}`}>
            <div className="num text-xs text-fg-4">{c.n}</div>
            <div className="flex min-h-[170px] flex-col justify-center">{c.viz}</div>
            <div>
              <h3 className="text-xl font-medium tracking-[-0.02em]">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-3">{c.d}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
