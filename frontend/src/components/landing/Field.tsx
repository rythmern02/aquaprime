"use client";
import { useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { HiggsField } from "@/components/fx/HiggsField";
import { useNetwork } from "@/hooks/useNetwork";
import { fmt } from "@/lib/format";
import { reveal } from "./ui";

/**
 * "Liquidity is a field, not a pool." The lattice is Aqua's virtual balance: everywhere at once, massless
 * until a trade passes through it — then, and only there, real tokens move.
 */
export function Field() {
  const { data } = useNetwork();
  const massRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const onMass = useCallback((m: number) => {
    const pct = Math.min(m * 500, 100);
    if (massRef.current) massRef.current.textContent = `${pct.toFixed(1)}%`;
    if (barRef.current) barRef.current.style.width = `${pct}%`;
  }, []);
  return (
    <section className="relative isolate overflow-hidden bg-bg">
      <div className="absolute inset-0 -z-10 cursor-crosshair"><HiggsField onMass={onMass} /></div>
      <div className="wrap pointer-events-none grid min-h-[620px] content-between gap-16 py-24 md:grid-cols-12">
        <motion.div {...reveal} className="md:col-span-7">
          <div className="label mb-5"><span className="text-fg">00</span> / The idea</div>
          <h2 className="h-display text-[clamp(2.4rem,5.6vw,4.6rem)] leading-[0.95]">
            Liquidity is a <span className="serif text-ocean">field</span>,<br />not a pool.
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-fg-3">
            With 1inch Aqua, a lender&apos;s USDC never sits in a contract. It&apos;s a field of virtual balances spread
            across every strategy at once — massless until a trade moves through it. Only there, only then, do real
            tokens leave the wallet. Move through the field. Click to send a trade.
          </p>
        </motion.div>
        <motion.dl {...reveal} className="card pointer-events-auto grid grid-cols-2 self-end md:col-span-4 md:col-start-9">
          <div className="border-b border-r border-rule p-5">
            <dt className="label">Virtual liquidity</dt>
            <dd className="num mt-1 text-2xl text-fg">{data ? `$${fmt(data.virtualUsdc, 6, 0)}` : "…"}</dd>
          </div>
          <div className="border-b border-rule p-5">
            <dt className="label">Locked</dt>
            <dd className="num mt-1 text-2xl text-fg">$0</dd>
          </div>
          <div className="col-span-2 p-5">
            <dt className="label flex justify-between"><span>Field with mass right now</span><span ref={massRef} className="text-ocean">0%</span></dt>
            <dd className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised"><span ref={barRef} className="block h-full w-0 rounded-full bg-gradient-to-r from-ocean-aqua to-ocean transition-[width] duration-150" /></dd>
          </div>
        </motion.dl>
      </div>
    </section>
  );
}
