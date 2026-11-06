"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Caustics } from "@/components/fx/Caustics";
import { useNetwork } from "@/hooks/useNetwork";
import { CHAIN_ID } from "@/config";
import { fmt } from "@/lib/format";

const LiquidityOrb = dynamic(() => import("@/components/fx/LiquidityOrb"), { ssr: false });

const words = ["never", "leaves."];
const ease = [0.22, 1, 0.36, 1] as const;

function Stat({ label, value, tone = "text-ink-50" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-[150px] flex-col gap-1 px-6">
      <span className="eyebrow">{label}</span>
      <span className={`num text-xl ${tone}`}>{value}</span>
    </div>
  );
}

export function LiveTicker() {
  const { data, isLoading, isError } = useNetwork();
  const items = [
    <Stat key="p" label="ETH / USD oracle" value={isLoading ? "…" : data ? `$${fmt(data.price, 6, 2)}` : "—"} />,
    <Stat key="s" label="Capital efficiency" value={data ? `${data.slac.toFixed(2)}×` : "…"} tone="text-tide" />,
    <Stat key="v" label="Active quoting power" value={data ? `$${fmt(data.virtualUsdc, 6, 0)}` : "…"} />,
    <Stat key="w" label="Tokens locked in pools" value="$0" tone="text-bloom" />,
    <Stat key="b" label="Borrowers" value={data?.borrowers ?? "…"} />,
    <Stat key="r" label="Protocol revenue" value={data ? `$${fmt(data.revenue.interest, 6, 2)}` : "…"} />,
    <Stat key="k" label="Block" value={data ? `#${data.block.toString()}` : "…"} tone="text-ink-300" />,
  ];
  return (
    <div className="glass relative overflow-hidden rounded-full py-3" aria-live="polite">
      {isError && <p className="px-6 text-sm text-ember">Live data unavailable — the chain RPC didn&apos;t answer.</p>}
      {!isError && (
        <div className="flex w-max animate-marquee divide-x divide-white/5 hover:[animation-play-state:paused]">
          {items}{items.map((x, i) => <span key={`d${i}`} aria-hidden className="contents">{x}</span>)}
        </div>
      )}
    </div>
  );
}

export function Hero() {
  const { scrollY } = useScroll();
  const orbY = useTransform(scrollY, [0, 600], [0, 120]);
  const fade = useTransform(scrollY, [0, 500], [1, 0]);
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden px-4 pb-10 pt-28">
      <Caustics className="-z-10 opacity-90" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-abyss" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <motion.div style={{ opacity: fade }}>
          <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}
            className="chip mb-6 border-tide/30 bg-tide/[0.06] text-tide">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tide" /> {CHAIN_ID === 31337 ? "Local demo chain" : "Live on Sepolia"} · 1inch Aqua × SwapVM
          </motion.span>
          <h1 className="h-display text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.95]">
            <motion.span className="block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }}>
              Your capital
            </motion.span>
            <span className="block">
              {words.map((w, i) => (
                <motion.span key={w} className={`mr-[0.25em] inline-block ${i === 0 ? "text-gradient" : ""}`}
                  initial={{ opacity: 0, y: 40, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease }}>{w}</motion.span>
              ))}
            </span>
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Lend straight from your wallet. Borrow at 115% if you&apos;re human. Get liquidated by a scalpel, not a sledgehammer —
            a custom SwapVM opcode sells <em className="not-italic text-ink-50">only</em> the slice that makes you solvent.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7, ease }}
            className="mt-9 flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary !min-h-[52px] !px-7 text-base">
              Try the live playground <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#simulator" className="btn-ghost !min-h-[52px] !px-7 text-base">
              <Play className="h-4 w-4" aria-hidden /> Crash ETH yourself
            </a>
          </motion.div>
        </motion.div>

        <motion.div style={{ y: orbY }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease }} className="relative mx-auto aspect-square w-full max-w-[520px]">
          <LiquidityOrb className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="eyebrow">one wallet</div>
              <div className="num text-3xl text-ink-50">3 jobs</div>
            </div>
          </div>
          <ul className="pointer-events-none absolute inset-0 text-[11px]">
            <li className="chip absolute left-0 top-[18%] border-tide/30 bg-abyss/60 text-tide">credit line</li>
            <li className="chip absolute right-0 top-[38%] border-pulse/40 bg-abyss/60 text-pulse-300">liquidation backstop</li>
            <li className="chip absolute bottom-[14%] left-[12%] border-bloom/30 bg-abyss/60 text-bloom">AMM</li>
          </ul>
        </motion.div>
      </div>

      <div className="mx-auto mt-12 w-full max-w-6xl">
        <LiveTicker />
      </div>
    </section>
  );
}
