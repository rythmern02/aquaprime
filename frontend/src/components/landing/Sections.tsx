"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, X } from "lucide-react";
import { useNetwork, type FeedItem } from "@/hooks/useNetwork";
import { deployment, txUrl, CHAIN_ID } from "@/config";
import { fmt, short } from "@/lib/format";
import { Mark, reveal, SectionHead } from "./ui";
import { Waves } from "@/components/fx/Waves";

/* ───────────────────────────── 03 · VM pipeline ───────────────────────────── */

const STEPS = [
  { op: "aqua", name: "Aqua load", bytes: "safeBalances()", desc: "SwapVM loads the registry's virtual balances from Aqua. All 10 WETH of collateral is on the table.",
    regs: { balanceIn: "$0", balanceOut: "10.000 WETH", amountIn: "$2,844.84", amountOut: "0" } },
  { op: "0xf0", name: "SolvencyDutchGuard", bytes: "f0 28 0165…eb8f 3c44…93bc", desc: "Our opcode. It reverts if health is above 1 or a human's grace window is still open, then caps the registers to the slice that restores health to 1.02.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "0" }, hot: ["balanceIn", "balanceOut"] },
  { op: "0x19", name: "LimitSwap", bytes: "19 01 00", desc: "The stock pricing curve runs inside the guard, at the current Dutch-auction price.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "1.343 WETH" }, hot: ["amountOut"] },
  { op: "end", name: "Post-curve check", bytes: "amountOut ≤ cap", desc: "Control returns to 0xf0. If the curve tried to hand out more than the cap, the whole swap reverts with SurgicalCapExceeded.",
    regs: { balanceIn: "$2,844.84", balanceOut: "1.343 WETH", amountIn: "$2,844.84", amountOut: "1.343 WETH" }, done: true },
];

export function VmPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto) return;
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 2800);
    return () => clearInterval(t);
  }, [inView, auto]);
  const s = STEPS[i];
  return (
    <section ref={ref} className="wrap py-28">
      <SectionHead index="03" kicker="Inside the VM" title={<>The rule lives <span className="serif">in the bytecode.</span></>}>
        Not in a keeper&apos;s goodwill, not in an off-chain bot. One custom SwapVM instruction, enforced on every fill.
      </SectionHead>
      <div className="card mt-14 grid overflow-hidden lg:grid-cols-12">
        <ol className="lg:col-span-6" aria-label="SwapVM program steps">
          {STEPS.map((st, k) => (
            <li key={st.name} className={k ? "border-t border-rule" : ""}>
              <button onClick={() => { setI(k); setAuto(false); }} aria-current={k === i}
                className={`focus-ring relative grid w-full grid-cols-[64px_1fr] items-center gap-4 px-5 py-5 text-left transition-colors ${k === i ? "bg-raised" : "hover:bg-raised/50"}`}>
                {k === i && <motion.span layoutId="vm-bar" className="absolute inset-y-0 left-0 w-[3px] bg-ocean" />}
                <span className={`num text-sm ${st.op === "0xf0" ? "text-ocean" : "text-fg-3"}`}>{st.op}</span>
                <span className="min-w-0">
                  <span className={`block font-medium ${k === i ? "text-fg" : "text-fg-2"}`}>{st.name}{st.op === "0xf0" && <span className="tag ml-2 border-ocean/40 text-ocean">custom</span>}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-fg-4">{st.bytes}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-6 border-t border-rule bg-white p-6 sm:p-8 lg:col-span-6 lg:border-l lg:border-t-0">
          <AnimatePresence mode="wait">
            <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="min-h-[72px] text-[15px] leading-relaxed text-fg-2">{s.desc}</motion.p>
          </AnimatePresence>
          <table className="w-full text-sm">
            <caption className="label mb-2 text-left">SwapVM registers</caption>
            <tbody>
              {Object.entries(s.regs).map(([k, v]) => {
                const hot = s.hot?.includes(k);
                return (
                  <tr key={k} className="border-t border-rule">
                    <th scope="row" className="py-3 text-left font-mono text-[13px] font-normal text-fg-3">{k}</th>
                    <td className={`num py-3 text-right transition-colors duration-300 ${hot ? "text-ocean" : "text-fg"}`}>{v}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {s.done && <div className="tag w-fit border-ok/40 text-ok"><Check className="h-3 w-3" aria-hidden /> 13.4% sold instead of 50–100%</div>}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 04 · Live network ───────────────────────────── */

const FEED_META: Record<FeedItem["kind"], string> = {
  borrow: "Borrow · aqua.pull",
  repay: "Repay · aqua.push",
  human: "World ID verified",
  auction: "0xf0 auction shipped",
  liquidation: "Surgical liquidation",
  credit: "Credit line registered",
};

function feedAmount(f: FeedItem) {
  if (f.kind === "borrow" || f.kind === "repay") return `$${fmt(f.amount, 6, 2)}`;
  if (f.kind === "liquidation") return `$${fmt(f.amount, 6, 0)} → HF ${f.extra ? (Number(f.extra / 10n ** 14n) / 1e4).toFixed(2) : "—"}`;
  if (f.kind === "auction") return `HF ${f.amount ? (Number(f.amount / 10n ** 14n) / 1e4).toFixed(3) : "—"}`;
  return "—";
}

export function LiveNetwork() {
  const { data, isLoading, isError, refetch } = useNetwork();
  const tiles: [string, string | undefined, string?][] = [
    ["Maker wallet, real", data && `$${fmt(data.walletUsdc, 6, 0)}`],
    ["Virtual liquidity", data && `$${fmt(data.virtualUsdc, 6, 0)}`],
    ["Capital efficiency", data && `${data.slac.toFixed(2)}×`, "text-ocean"],
    ["Interest revenue", data && `$${fmt(data.revenue.interest, 6, 2)}`],
  ];
  const addr = (a: string) => txUrl("")?.replace("/tx/", "/address/") + a;
  return (
    <section className="wrap py-28">
      <SectionHead id="live" index="04" kicker={CHAIN_ID === 31337 ? "Live · local chain" : "Live · Sepolia via Anon-RPC"}
        title={<>Not a mockup. <span className="text-fg-3">The chain, right now.</span></>} />
      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule shadow-float lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-px bg-rule lg:col-span-5">
          {tiles.map(([k, v, tone]) => (
            <div key={k} className="flex flex-col justify-between gap-6 bg-white p-6">
              <div className="label">{k}</div>
              {v === undefined
                ? <div className="h-8 w-24 animate-pulse rounded-sm bg-raised" />
                : <div className={`num text-[28px] leading-none ${tone ?? "text-fg"}`}>{v}</div>}
            </div>
          ))}
          <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 bg-white p-6 font-mono text-[11px] text-fg-3">
            {([["Registry", deployment.contracts.registry], ["Router", deployment.contracts.router], ["Aqua", deployment.contracts.aqua]] as const).map(([k, a]) => (
              <span key={k}>{k} {txUrl("") ? <a className="link text-fg-2" href={addr(a)} target="_blank" rel="noreferrer">{short(a, 4)}</a> : <span className="text-fg-2">{short(a, 4)}</span>}</span>
            ))}
            <span className="ml-auto">block <span className="text-fg-2">#{data?.block.toString() ?? "…"}</span></span>
          </div>
        </div>
        <div className="bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-rule px-6 py-4">
            <span className="label">Ledger</span>
            <span className="label flex items-center gap-2"><span className="h-1.5 w-1.5 animate-blink rounded-full bg-ocean" aria-hidden />Streaming</span>
          </div>
          {isError && <div className="p-6 text-sm text-signal">Couldn&apos;t read events. <button className="link" onClick={() => refetch()}>Retry</button></div>}
          {isLoading && <div className="space-y-px p-6">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 animate-pulse bg-panel" />)}</div>}
          {data && data.feed.length === 0 && <div className="p-6 text-sm text-fg-3">No activity yet. <Link href="/app" className="link text-fg">Open the first position</Link></div>}
          <ul className="max-h-[380px] overflow-auto">
            <AnimatePresence initial={false}>
              {data?.feed.map((f) => (
                <motion.li key={f.tx + f.kind} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule px-6 py-3 text-sm last:border-b-0 sm:grid-cols-[180px_1fr_auto]">
                  <span className={f.kind === "liquidation" || f.kind === "auction" ? "text-signal" : "text-fg"}>{FEED_META[f.kind]}</span>
                  <span className="hidden font-mono text-[11px] text-fg-4 sm:block">{short(f.who)} · #{f.block.toString()}</span>
                  <span className="num text-right text-fg-2">{feedAmount(f)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 05 · Keeper story ───────────────────────────── */

export function KeeperStory() {
  const beats = [
    ["Spots HF 0.95", "A deterministic keeper (no LLM) watches every position and ships the 0xf0 auction. That part is permissionless housekeeping."],
    ["Then pauses", "Spending a hot key to sell someone's collateral is a human decision, so the agent files a proposal and waits."],
    ["Asks a human", "Agent Pass step-up: max_age=0, nonce, acr allow-list and operator binding. Approvals are single-use, last 120 s and cover one borrower."],
    ["Rescues in one tx", "Fill the slice, sell it into an LP's 0xf1 backstop, repay the lender through Aqua. The keeper needs no capital."],
  ];
  return (
    <section className="wrap py-28">
      <SectionHead index="05" kicker="Agents" title={<>Autonomous, <span className="serif">not unaccountable.</span></>} />
      <ol className="mt-14 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule shadow-float sm:grid-cols-2 lg:grid-cols-4">
        {beats.map(([t, d], k) => (
          <motion.li key={t} {...reveal} transition={{ ...reveal.transition, delay: k * 0.05 }} className="bg-white p-6">
            <div className="num mb-8 flex items-center gap-3 text-xs text-fg-4">
              <span className={k === 2 ? "text-ocean" : "text-fg"}>{String(k + 1).padStart(2, "0")}</span>
              <span className="h-px flex-1 bg-rule" aria-hidden />
            </div>
            <h3 className="text-lg font-medium tracking-[-0.02em]">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">{d}</p>
          </motion.li>
        ))}
      </ol>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule shadow-float md:grid-cols-2">
        <div className="flex items-start gap-4 bg-white p-6">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
          <p className="text-sm text-fg-2"><span className="text-fg">Approved:</span> one transaction, health 0.956 → 1.020, lender repaid through <span className="font-mono">aqua.push</span>.</p>
        </div>
        <div className="flex items-start gap-4 bg-white p-6">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden />
          <p className="text-sm text-fg-2"><span className="text-fg">Cancelled, expired, replayed or the wrong human:</span> HTTP 403, and the transaction is never built.</p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 06 · Stack, CTA, footer ───────────────────────────── */

export function Trust() {
  const stack = [
    ["1inch Aqua", "The canonical contract. Shared, zero-custody liquidity."],
    ["1inch SwapVM", "Redeployed engine with our opcodes 0xf0 and 0xf1."],
    ["World ID", "IDKit Proof of Human, plus Agent Pass step-up for agents."],
    ["EF Anon-RPC", "Every browser read over the Nox mixnet. Fails closed."],
  ];
  const crops = [
    ["Censorship-resistant", "Repay, liquidate and close are permissionless. Pausing only stops new borrows."],
    ["Open source", "MIT-licensed, one-command build, contracts verified on Sourcify."],
    ["Private", "Reads over Anon-RPC. No trackers or analytics, fonts self-hosted."],
    ["Secure", "Keys stay in your wallet. The VM enforces the cap. A stale oracle halts liquidations."],
  ];
  return (
    <section className="wrap py-28">
      <SectionHead id="stack" index="06" kicker="Stack" title={<>Built on <span className="text-fg-3">very good shoulders.</span></>} />
      <div className="mt-14 grid gap-14 lg:grid-cols-12">
        <dl className="lg:col-span-6">
          {stack.map(([t, d]) => (
            <div key={t} className="grid grid-cols-[140px_1fr] gap-4 border-t border-rule py-4 text-sm">
              <dt className="font-medium text-fg">{t}</dt><dd className="text-fg-3">{d}</dd>
            </div>
          ))}
        </dl>
        <div className="lg:col-span-6">
          <div className="label mb-4">CROPS</div>
          <ul className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule shadow-float sm:grid-cols-2">
            {crops.map(([t, d]) => (
              <li key={t} className="bg-white p-5">
                <div className="text-sm font-medium text-fg">{t}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-fg-3">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden pt-28">
      <motion.div {...reveal} className="wrap relative z-10 pb-44 text-center">
        <h2 className="h-display mx-auto max-w-4xl text-[clamp(2.6rem,7vw,6rem)] leading-[0.95]">
          Lend it. Borrow it. <span className="serif text-ocean">Crash it.</span> Rescue it.
        </h2>
        <p className="mx-auto mt-6 max-w-md text-fg-3">The whole lifecycle takes about two minutes, with a one-click demo wallet and nothing to install.</p>
        <Link href="/app" className="btn-ocean mt-9 !min-h-[52px] !px-7 text-[15px]">Dive in <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </motion.div>
      <Waves tone="deep" className="absolute inset-x-0 bottom-0 h-40" />
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-ocean-deep text-white/70">
      <div className="wrap grid gap-8 py-12 text-sm md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5 text-white"><Mark className="h-5 w-5" /><span className="font-semibold">AquaPrime</span></div>
          <p className="mt-3 max-w-xs text-white/60">Zero-custody credit and surgical liquidations, built on 1inch Aqua and SwapVM.</p>
        </div>
        <ul className="flex flex-wrap content-start gap-x-6 gap-y-2 md:col-span-7 md:justify-end">
          <li>No trackers</li>
          <li>MIT</li>
          <li><a href="https://github.com/rythmern02/aquaprime" target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded underline decoration-white/30 underline-offset-4 hover:text-white">Source <ArrowUpRight className="h-3 w-3" aria-hidden /></a></li>
          <li>ETHGlobal Mumbai 2026</li>
        </ul>
      </div>
    </footer>
  );
}
