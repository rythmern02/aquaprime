"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNetwork } from "@/hooks/useNetwork";
import { CHAIN_ID } from "@/config";
import { fmt } from "@/lib/format";
import { ease } from "./ui";

const LiquidityOrb = dynamic(() => import("@/components/fx/LiquidityOrb"), { ssr: false });

/** Live protocol numbers as a ruled ledger row. Kept export name for any old imports. */
export function LiveTicker() {
  const { data, isError } = useNetwork();
  const cells: [string, string | undefined, string?][] = [
    ["ETH / USD", data && `$${fmt(data.price, 6, 2)}`],
    ["Capital efficiency", data && `${data.slac.toFixed(2)}×`],
    ["Quoting power", data && `$${fmt(data.virtualUsdc, 6, 0)}`],
    ["Locked in pools", "$0", "text-signal"],
    ["Borrowers", data && String(data.borrowers)],
    ["Block", data && `#${data.block.toString()}`],
  ];
  return (
    <div className="border-y border-rule" aria-live="polite">
      {isError
        ? <p className="py-4 font-mono text-xs text-signal">Live data unavailable. The chain RPC didn&apos;t answer.</p>
        : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {cells.map(([k, v, tone], i) => (
              <div key={k} className={`flex flex-col gap-1.5 py-4 pr-4 ${i ? "lg:border-l lg:border-rule lg:pl-5" : ""}`}>
                <dt className="label">{k}</dt>
                <dd className={`num text-lg ${tone ?? "text-fg"}`}>{v ?? <span className="inline-block h-4 w-16 animate-pulse rounded-sm bg-raised align-middle" />}</dd>
              </div>
            ))}
          </dl>
        )}
    </div>
  );
}

function Callout({ className, n, children, side = "left" }: { className: string; n: string; children: React.ReactNode; side?: "left" | "right" }) {
  return (
    <li className={`absolute flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3 ${className} ${side === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-fg">{n}</span>
      <span>{children}</span>
      <span className="h-px w-10 bg-fg-4" aria-hidden />
    </li>
  );
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-14">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="wrap grid min-h-[calc(100svh-3.5rem)] grid-rows-[1fr_auto] pb-8">
        <div className="grid items-center gap-10 py-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
              className="label mb-8 flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-signal" aria-hidden />
              {CHAIN_ID === 31337 ? "Running on a local chain" : "Live on Sepolia"} — built on 1inch Aqua &amp; SwapVM
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}
              className="h-display text-[clamp(3rem,8.4vw,7.25rem)] leading-[0.92]">
              Your capital<br /><span className="serif text-[1.08em]">never</span> leaves.
            </motion.h1>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15, ease }}
              className="mt-10 grid max-w-2xl gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <p className="text-[17px] leading-relaxed text-fg-2">
                Lend straight from your wallet. Borrow at 115% if you&apos;re a verified human. And when a loan goes bad,
                a custom SwapVM opcode sells only the slice of collateral that makes it solvent again.
              </p>
              <div className="flex flex-wrap gap-2 sm:flex-col">
                <Link href="/app" className="btn-primary !min-h-[44px] !px-5">Open the playground <ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <a href="#simulator" className="btn-ghost !min-h-[44px] !px-5">Crash ETH yourself</a>
              </div>
            </motion.div>
          </div>

          <motion.figure initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.2 }}
            className="relative mx-auto aspect-square w-full max-w-[480px] lg:col-span-5">
            <div className="absolute inset-[6%] rounded-full border border-dashed border-rule-2" aria-hidden />
            <div className="absolute left-1/2 top-0 h-full w-px bg-rule" aria-hidden />
            <div className="absolute left-0 top-1/2 h-px w-full bg-rule" aria-hidden />
            <LiquidityOrb className="absolute inset-0" />
            <ul className="pointer-events-none absolute inset-0 hidden sm:block" aria-label="One wallet backs three strategies">
              <Callout className="-left-2 top-[14%]" n="A">Credit line</Callout>
              <Callout className="-right-2 top-[44%]" n="B" side="right">LP backstop · 0xf1</Callout>
              <Callout className="bottom-[10%] left-[2%]" n="C">AquaAMM</Callout>
            </ul>
            <figcaption className="label absolute bottom-0 right-0 text-right">Fig. 1 — one wallet,<br />three live strategies</figcaption>
          </motion.figure>
        </div>
        <LiveTicker />
      </div>
    </section>
  );
}
