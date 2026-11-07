"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, MousePointer2 } from "lucide-react";
import { useNetwork } from "@/hooks/useNetwork";
import { CHAIN_ID } from "@/config";
import { fmt } from "@/lib/format";
import { ease } from "./ui";

const Ocean = dynamic(() => import("@/components/fx/Ocean"), { ssr: false, loading: () => <div className="sky absolute inset-0" /> });

/** Live protocol numbers, floating on the water. */
export function LiveTicker() {
  const { data, isError } = useNetwork();
  const cells: [string, string | undefined, string?][] = [
    ["ETH / USD", data && `$${fmt(data.price, 6, 2)}`],
    ["Capital efficiency", data && `${data.slac.toFixed(2)}×`, "text-ocean"],
    ["Quoting power", data && `$${fmt(data.virtualUsdc, 6, 0)}`],
    ["Locked in pools", "$0"],
    ["Borrowers", data && String(data.borrowers)],
    ["Block", data && `#${data.block.toString()}`],
  ];
  return (
    <div className="card px-2" aria-live="polite">
      {isError
        ? <p className="px-4 py-4 font-mono text-xs text-signal">Live data unavailable. The chain RPC didn&apos;t answer.</p>
        : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {cells.map(([k, v, tone], i) => (
              <div key={k} className={`flex-col gap-1 px-4 py-4 ${i >= 4 ? "hidden sm:flex" : "flex"} ${i ? "lg:border-l lg:border-rule" : ""}`}>
                <dt className="label">{k}</dt>
                <dd className={`num text-lg ${tone ?? "text-fg"}`}>{v ?? <span className="inline-block h-4 w-16 animate-pulse rounded bg-raised align-middle" />}</dd>
              </div>
            ))}
          </dl>
        )}
    </div>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <Ocean className="absolute inset-0 -z-10" eventSource={ref} />
      <div className="wrap flex flex-1 flex-col pt-28 sm:pt-32">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease }}
          className="tag mb-7 w-fit border-white bg-white/70 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ocean" aria-hidden />
          {CHAIN_ID === 31337 ? "Local chain" : "Live on Sepolia"} · 1inch Aqua × SwapVM
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease }}
          className="h-display max-w-4xl text-[clamp(3.1rem,8.6vw,7.5rem)] leading-[0.9]">
          Your capital <span className="serif text-ocean-deep">never</span> leaves.
        </motion.h1>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .2, ease }}
          className="mt-7 flex max-w-xl flex-col gap-7">
          <p className="text-[17px] leading-relaxed text-fg-2">
            Lend straight from your wallet. Borrow at 115% if you&apos;re a verified human. When a loan goes bad,
            a custom SwapVM opcode sells only the slice of collateral that makes it whole again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary !min-h-[48px] !px-6">Open the playground <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <a href="#simulator" className="btn-ghost !min-h-[48px] !px-6">Crash ETH yourself</a>
          </div>
        </motion.div>
        <p className="label mt-auto hidden items-center gap-2 pb-4 pt-10 text-white/90 drop-shadow md:flex"><MousePointer2 className="h-3.5 w-3.5" aria-hidden /> Move across the water</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent via-bg/70 to-bg" aria-hidden />
      <div className="wrap pb-6">
        <LiveTicker />
      </div>
    </section>
  );
}
