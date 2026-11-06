"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ArrowRight, Bot, Check, Fingerprint, Github, Lock, ShieldCheck, X, Zap } from "lucide-react";
import { useNetwork, type FeedItem } from "@/hooks/useNetwork";
import { deployment, txUrl, CHAIN_ID } from "@/config";
import { fmt, short } from "@/lib/format";

const ease = [0.22, 1, 0.36, 1] as const;
const reveal = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" } };

/* ───────────────────────────── VM pipeline ───────────────────────────── */

const STEPS = [
  { op: "aqua", name: "Aqua load", bytes: "safeBalances()", desc: "SwapVM loads the registry's virtual balances from Aqua: all 10 WETH of collateral is on the table.",
    regs: { balanceIn: "$0", balanceOut: "10.000 WETH", amountIn: "$2,844.84", amountOut: "0" } },
  { op: "0xf0", name: "SolvencyDutchGuard", bytes: "f0 28 0165…eb8f 3c44…93bc", desc: "Custom opcode: reverts if HF ≥ 1 or a human's grace window is open, then caps the registers to the exact slice that restores HF to 1.02.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "0" }, hot: ["balanceIn", "balanceOut"] },
  { op: "0x19", name: "LimitSwap", bytes: "19 01 00", desc: "Stock pricing curve runs inside the guard at the Dutch-auction price.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "1.343 WETH" }, hot: ["amountOut"] },
  { op: "✓", name: "Post-curve check", bytes: "amountOut ≤ cap", desc: "Back in 0xf0: if the curve tried to hand out more than the cap the whole swap reverts — SurgicalCapExceeded.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "1.343 WETH" }, done: true },
];

export function VmPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto) return;
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, [inView, auto]);
  const s = STEPS[i];
  return (
    <section ref={ref} className="mx-auto max-w-6xl px-4 py-28">
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mb-12 max-w-2xl">
        <div className="eyebrow mb-4">Inside the VM</div>
        <h2 className="h-display text-4xl md:text-5xl">The rule lives <span className="text-gradient">in the bytecode.</span></h2>
        <p className="mt-4 text-ink-400">Not in a keeper&apos;s goodwill. Not in an off-chain bot. One custom SwapVM instruction, enforced on every fill.</p>
      </motion.div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <ol className="flex flex-col gap-3" aria-label="SwapVM program steps">
          {STEPS.map((st, k) => (
            <li key={st.name}>
              <button onClick={() => { setI(k); setAuto(false); }} aria-current={k === i}
                className={`focus-ring card flex w-full items-start gap-4 !p-4 text-left transition ${k === i ? "!border-pulse/50 shadow-glow-pulse" : "opacity-60 hover:opacity-100"}`}>
                <span className={`num grid h-11 w-14 shrink-0 place-items-center rounded-xl text-sm ${st.op === "0xf0" ? "bg-pulse/20 text-pulse-300" : "bg-white/[0.05] text-ink-300"}`}>{st.op}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">{st.name}{st.op === "0xf0" && <span className="chip border-pulse/40 text-pulse-300">custom</span>}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-ink-500">{st.bytes}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="card flex flex-col gap-5">
          <AnimatePresence mode="wait">
            <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
              className="min-h-[72px] text-sm leading-relaxed text-ink-300">{s.desc}</motion.p>
          </AnimatePresence>
          <table className="w-full text-sm">
            <caption className="eyebrow mb-3 text-left">SwapVM registers</caption>
            <tbody>
              {Object.entries(s.regs).map(([k, v]) => {
                const hot = s.hot?.includes(k);
                return (
                  <tr key={k} className="border-t border-white/5">
                    <th scope="row" className="py-3 text-left font-mono font-normal text-ink-400">{k}</th>
                    <td className="py-3 text-right">
                      <motion.span key={v + i} initial={hot ? { color: "#C8FF5A", scale: 1.08 } : false} animate={{ color: hot ? "#C8FF5A" : "#E8EEF8", scale: 1 }}
                        className="num inline-block">{v}</motion.span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {s.done && <div className="chip w-fit border-bloom/40 bg-bloom/10 text-bloom"><Check className="h-3 w-3" aria-hidden /> 13.4% of collateral sold instead of 50–100%</div>}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Live network ───────────────────────────── */

const FEED_META: Record<FeedItem["kind"], { label: string; tone: string }> = {
  borrow: { label: "Borrowed via aqua.pull", tone: "text-tide" },
  repay: { label: "Repaid via aqua.push", tone: "text-tide" },
  human: { label: "Verified human (World ID)", tone: "text-bloom" },
  auction: { label: "0xf0 auction shipped", tone: "text-amber" },
  liquidation: { label: "Surgical liquidation", tone: "text-pulse-300" },
  credit: { label: "Credit line registered", tone: "text-ink-300" },
};

function feedAmount(f: FeedItem) {
  if (f.kind === "borrow" || f.kind === "repay") return `$${fmt(f.amount, 6, 2)}`;
  if (f.kind === "liquidation") return `$${fmt(f.amount, 6, 0)} → HF ${f.extra ? (Number(f.extra / 10n ** 14n) / 1e4).toFixed(2) : "—"}`;
  if (f.kind === "auction") return `HF ${f.amount ? (Number(f.amount / 10n ** 14n) / 1e4).toFixed(3) : "—"}`;
  return "";
}

export function LiveNetwork() {
  const { data, isLoading, isError, refetch } = useNetwork();
  const tiles = [
    { k: "Maker wallet (real)", v: data ? `$${fmt(data.walletUsdc, 6, 0)}` : null },
    { k: "Virtual liquidity", v: data ? `$${fmt(data.virtualUsdc, 6, 0)}` : null, tone: "text-tide" },
    { k: "SLAC", v: data ? `${data.slac.toFixed(2)}×` : null, tone: "text-gradient" },
    { k: "Interest revenue", v: data ? `$${fmt(data.revenue.interest, 6, 2)}` : null },
  ];
  return (
    <section id="live" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-28">
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="eyebrow mb-4">Live · {CHAIN_ID === 31337 ? "local chain · direct reads" : "Sepolia · read through Anon-RPC"}</div>
          <h2 className="h-display text-4xl md:text-5xl">Not a mockup. <span className="text-ink-400">The chain, right now.</span></h2>
        </div>
        <span className="num text-sm text-ink-400">block #{data?.block.toString() ?? "…"}</span>
      </motion.div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid grid-cols-2 gap-4">
          {tiles.map((t) => (
            <div key={t.k} className="card !p-5">
              <div className="eyebrow">{t.k}</div>
              {t.v === null ? <div className="mt-3 h-8 w-24 animate-shimmer rounded-lg bg-[linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.1),rgba(255,255,255,.04))] bg-[length:200%_100%]" />
                : <div className={`num mt-2 text-3xl ${t.tone ?? "text-ink-50"}`}>{t.v}</div>}
            </div>
          ))}
          <div className="card col-span-2 !p-5 text-xs leading-relaxed text-ink-400">
            Registry <a className="font-mono text-ink-300 underline decoration-white/20 underline-offset-2 hover:text-ink-50" href={txUrl("")?.replace("/tx/", "/address/") + deployment.contracts.registry} target="_blank" rel="noreferrer">{short(deployment.contracts.registry, 6)}</a>
            {" · "}Router <span className="font-mono text-ink-300">{short(deployment.contracts.router, 6)}</span>
            {" · "}Aqua <span className="font-mono text-ink-300">{short(deployment.contracts.aqua, 6)}</span>
          </div>
        </div>
        <div className="card !p-0">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <span className="eyebrow">Activity</span>
            <span className="chip border-tide/30 text-tide"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tide" />live</span>
          </div>
          {isError && <div className="p-6 text-sm text-ember">Couldn&apos;t read events. <button className="underline" onClick={() => refetch()}>Retry</button></div>}
          {isLoading && <div className="space-y-3 p-6">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 rounded-xl bg-white/[0.03]" />)}</div>}
          {data && data.feed.length === 0 && (
            <div className="p-6 text-sm text-ink-400">No activity yet. <Link href="/app" className="text-tide underline">Be the first borrower →</Link></div>
          )}
          <ul className="max-h-[360px] divide-y divide-white/5 overflow-auto">
            <AnimatePresence initial={false}>
              {data?.feed.map((f) => (
                <motion.li key={f.tx + f.kind} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <div className={FEED_META[f.kind].tone}>{FEED_META[f.kind].label}</div>
                    <div className="font-mono text-[11px] text-ink-500">{short(f.who)} · #{f.block.toString()}</div>
                  </div>
                  <div className="num shrink-0 text-ink-50">{feedAmount(f)}</div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Keeper story ───────────────────────────── */

export function KeeperStory() {
  const beats = [
    { icon: Bot, t: "Agent spots HF 0.95", d: "A deterministic keeper (no LLM) watches every position and ships the 0xf0 auction — permissionless housekeeping." },
    { icon: Lock, t: "…and pauses.", d: "Spending a hot key to sell someone's collateral is a human decision. The agent files a proposal and waits." },
    { icon: Fingerprint, t: "Fresh World ID check", d: "Agent Pass step-up: max_age=0, nonce, acr allow-list, operator binding. Approvals are single-use, 120 s, bound to one borrower." },
    { icon: Zap, t: "One-transaction rescue", d: "Fill the surgical slice → sell it into an LP's 0xf1 backstop → repay the lender through Aqua. Zero capital needed." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-28">
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mb-12 max-w-2xl">
        <div className="eyebrow mb-4">Human-in-the-loop agents</div>
        <h2 className="h-display text-4xl md:text-5xl">Autonomous, <span className="text-ink-400">not unaccountable.</span></h2>
      </motion.div>
      <div className="grid gap-5 md:grid-cols-4">
        {beats.map((b, k) => (
          <motion.div key={b.t} {...reveal} transition={{ duration: 0.7, delay: k * 0.08, ease }} className="card relative">
            <span className="num absolute right-5 top-5 text-xs text-ink-600">0{k + 1}</span>
            <b.icon className="mb-6 h-6 w-6 text-tide" aria-hidden />
            <h3 className="font-display text-lg font-semibold">{b.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">{b.d}</p>
          </motion.div>
        ))}
      </div>
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="card flex items-start gap-4 !border-bloom/20">
          <Check className="mt-0.5 h-5 w-5 text-bloom" aria-hidden />
          <p className="text-sm text-ink-300"><span className="text-ink-50">Approved →</span> one transaction, HF 0.956 → 1.020, lender repaid through <span className="font-mono">aqua.push</span>.</p>
        </div>
        <div className="card flex items-start gap-4 !border-ember/20">
          <X className="mt-0.5 h-5 w-5 text-ember" aria-hidden />
          <p className="text-sm text-ink-300"><span className="text-ink-50">Cancelled, expired, replayed, wrong human →</span> HTTP 403. The transaction is never built.</p>
        </div>
      </motion.div>
    </section>
  );
}

/* ───────────────────────────── Trust + CTA + footer ───────────────────────────── */

export function Trust() {
  const crops = [
    ["CR", "Censorship-resistant", "Repay, liquidate and close auctions are permissionless. Pausing only stops new borrows."],
    ["O", "Open source", "MIT-licensed, builds with one command, contracts source-verified on Sourcify."],
    ["P", "Private", "Every read goes through EF Anon-RPC. No trackers, no analytics, fonts self-hosted."],
    ["S", "Secure", "Keys stay in your wallet. The VM enforces the surgical cap. Stale oracle → liquidations halt."],
  ];
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-28">
      <motion.div {...reveal} transition={{ duration: 0.8, ease }} className="mb-12 max-w-2xl">
        <div className="eyebrow mb-4">Built on</div>
        <h2 className="h-display text-4xl md:text-5xl">Standing on <span className="text-ink-400">very good shoulders.</span></h2>
      </motion.div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["1inch Aqua", "Official canonical contract — shared, zero-custody liquidity"], ["1inch SwapVM", "Redeployed engine + custom opcodes 0xf0 / 0xf1"], ["World ID", "IDKit Proof of Human + Agent Pass step-up"], ["EF Anon-RPC", "Nox mixnet reads, fail-closed"]].map(([t, d]) => (
          <div key={t} className="card !p-5"><div className="font-display font-semibold">{t}</div><p className="mt-2 text-xs leading-relaxed text-ink-400">{d}</p></div>
        ))}
      </div>
      <div className="card grid gap-6 sm:grid-cols-2 md:grid-cols-4">
        {crops.map(([l, t, d]) => (
          <div key={t}>
            <div className="num mb-3 grid h-10 w-10 place-items-center rounded-xl bg-tide/10 text-tide">{l}</div>
            <div className="text-sm font-medium">{t}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24">
      <motion.div {...reveal} transition={{ duration: 0.9, ease }}
        className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-tide/15 via-pulse/10 to-bloom/10 p-10 md:p-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-tide/20 blur-3xl" />
        <h2 className="h-display max-w-3xl text-4xl md:text-6xl">Lend it. Borrow it. <span className="text-gradient">Crash it.</span> Rescue it.</h2>
        <p className="mt-5 max-w-xl text-ink-300">The full lifecycle runs in your browser in about two minutes — with a one-click demo wallet, no install.</p>
        <Link href="/app" className="btn-primary mt-9 !min-h-[56px] !px-8 text-base">Open the playground <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-10 text-sm text-ink-400">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-tide via-pulse to-bloom"><span className="h-3 w-3 rounded-full bg-abyss" /></span>
          <span>AquaPrime · capital that never leaves</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-bloom" aria-hidden /> No trackers</span>
          <span>MIT</span>
          <a href="https://github.com/rythmern02/treaz" target="_blank" rel="noreferrer" className="focus-ring flex items-center gap-1.5 rounded-full hover:text-ink-50"><Github className="h-4 w-4" aria-hidden /> Source</a>
          <span>ETHGlobal Mumbai 2026</span>
        </div>
      </div>
    </footer>
  );
}
