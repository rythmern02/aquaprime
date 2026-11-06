"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { IDKitRequestWidget, proofOfHuman, type RpContext } from "@worldcoin/idkit";
import { Activity as ActivityIcon, ArrowRight, Check, Code2, Droplets, Fingerprint, HandCoins, Loader2, ShieldAlert, Sparkles, TrendingDown, Wallet, X, Zap } from "lucide-react";
import type { Address } from "viem";
import { CHAIN_ID, deployment, WORLD } from "@/config";
import { useMaker, useMarket, usePosition } from "@/hooks/useProtocol";
import { useLog } from "@/hooks/useTx";
import { useAquaActions } from "@/hooks/useAquaActions";
import { DEMO_ROLES, useDemoWallet, type DemoRole } from "@/hooks/useDemoWallet";
import { simulate } from "@/lib/riskmath";
import { bps, eth, short, usd } from "@/lib/format";
import { WalletButton } from "@/components/SiteNav";
import { Activity, PositionCard } from "./Vitals";
import { BytecodePanel } from "@/components/BytecodePanel";

const LiquidityOrb = dynamic(() => import("@/components/fx/LiquidityOrb"), { ssr: false });
const ease = [0.22, 1, 0.36, 1] as const;
const E18 = 10n ** 18n;

type StepId = "lend" | "borrow" | "verify" | "stress" | "rescue";
const STEPS: { id: StepId; label: string; icon: typeof Droplets; blurb: string }[] = [
  { id: "lend", label: "Lend", icon: Droplets, blurb: "Zero-custody liquidity" },
  { id: "borrow", label: "Borrow", icon: HandCoins, blurb: "Aqua-pulled credit" },
  { id: "verify", label: "Prove human", icon: Fingerprint, blurb: "World ID tier" },
  { id: "stress", label: "Crash ETH", icon: TrendingDown, blurb: "Market stress" },
  { id: "rescue", label: "Rescue", icon: Zap, blurb: "0xf0 + Agent Pass" },
];

function Field({ label, suffix, value, onChange, id }: { label: string; suffix: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm text-ink-300">{label}</span>
      <span className="relative block">
        <input id={id} inputMode="decimal" autoComplete="off" className="input pr-16 text-lg" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-ink-500">{suffix}</span>
      </span>
    </label>
  );
}

function StartGate() {
  const demo = useDemoWallet();
  const roles: [DemoRole, string, string][] = [
    ["borrower", "Borrower", "Fresh wallet with 20 WETH — run the whole story"],
    ["anon", "Underwater-ready", "Anonymous position already open at HF 1.11"],
    ["maker", "Maker", "The LP wallet backing 3 strategies — try aqua.dock"],
  ];
  return (
    <div className="card mx-auto flex max-w-2xl flex-col items-center gap-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-tide/10 text-tide"><Wallet className="h-6 w-6" aria-hidden /></div>
      <div>
        <h1 className="h-display text-3xl">Pick a wallet to start</h1>
        <p className="mt-2 text-ink-400">Everything here is real on-chain — deposits, Aqua pulls, the 0xf0 auction and the keeper fill.</p>
      </div>
      {demo.available && (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {roles.map(([r, t, d]) => (
            <button key={r} onClick={() => demo.enable(r)} className="focus-ring glass flex flex-col items-start gap-1 rounded-2xl p-5 text-left transition hover:border-tide/40">
              <span className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-bloom" aria-hidden />{t} demo wallet</span>
              <span className="text-xs text-ink-400">{d}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-ink-500">
        {demo.available && <span>or</span>}
        <WalletButton />
      </div>
      {demo.available && <p className="max-w-md text-[11px] text-ink-500">Demo wallets use Hardhat&apos;s public test keys and only work on this local chain.</p>}
    </div>
  );
}

export function Playground() {
  const demo = useDemoWallet();
  const { lines, push } = useLog();
  const a = useAquaActions(push);
  const me = a.account as Address | undefined;
  const market = useMarket();
  const maker = useMaker();
  const position = usePosition(me);
  const p = position.data?.pos;
  const q = position.data?.quote;
  const idp = useQuery({
    queryKey: ["agentpass-config"], refetchInterval: false,
    queryFn: () => fetch("/api/agentpass/config").then((r) => r.json()) as Promise<{ isWorld: boolean; label: string; configured: boolean }>,
  });

  const done: Record<StepId, boolean> = {
    lend: !!maker.data,
    borrow: !!p && p.debt > 0n,
    verify: !!p?.human,
    stress: !!p && (p.healthFactor < E18 || p.auctionActive),
    rescue: lines.some((l) => l.msg.startsWith("Surgical fill executed")),
  };
  const [step, setStep] = useState<StepId>("lend");
  const [vmOpen, setVmOpen] = useState(false);

  // inputs
  const [coll, setColl] = useState("10");
  const [borrowAmt, setBorrowAmt] = useState("15000");
  const [repayAmt, setRepayAmt] = useState("1000");
  const [lendAmt, setLendAmt] = useState("25000");
  const [apr, setApr] = useState("8");
  const [price, setPrice] = useState(2500);
  const [rp, setRp] = useState<RpContext>();
  const [idkitOpen, setIdkitOpen] = useState(false);

  useEffect(() => { if (market.data?.price) setPrice(Number(market.data.price) / 1e6); }, [market.data?.price]);

  const preview = useMemo(() => {
    if (!p) return undefined;
    return simulate({ collateral: Number(p.collateral) / 1e18, debt: Number(p.debt) / 1e6, price, human: p.human });
  }, [p, price]);

  const now = market.data?.now ?? 0n;
  const graceLeft = p?.auctionActive && p.auctionStart > now ? Number(p.auctionStart - now) : 0;
  const isMaker = !!me && !!maker.data && me.toLowerCase() === maker.data.maker.toLowerCase();

  if (!me) return <div className="px-4 pt-32"><StartGate /></div>;

  const go = (s: StepId) => setStep(s);
  const busy = !!a.busy;
  const stage = (() => {
    switch (step) {
      case "lend": return (
        <>
          <p className="text-ink-300">One wallet backs three live strategies. Nothing moves until someone actually borrows.</p>
          <div className="grid gap-3">
            {maker.data?.strategies.map((s) => (
              <div key={s.key} className="glass flex items-center justify-between gap-4 rounded-2xl p-4">
                <div>
                  <div className="flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${s.live ? "bg-bloom shadow-[0_0_8px] shadow-bloom" : "bg-ink-600"}`} />{s.name}</div>
                  <div className="text-xs text-ink-400">{s.desc}</div>
                </div>
                <div className="text-right">
                  <div className="num">{usd(BigInt(s.usdc), 0)}</div>
                  {isMaker && s.live && <button className="btn-ghost mt-1 !min-h-[32px] !px-3 text-xs" disabled={busy} onClick={() => a.dock(s.appAddr, s.hash, s.tokens as Address[], s.name)}>Dock</button>}
                </div>
              </div>
            ))}
          </div>
          <details className="glass rounded-2xl p-4">
            <summary className="focus-ring cursor-pointer rounded text-sm text-ink-300">Ship your own credit line (aqua.ship)</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
              <Field id="lend" label="USDC" suffix="USDC" value={lendAmt} onChange={setLendAmt} />
              <Field id="apr" label="APR" suffix="%" value={apr} onChange={setApr} />
              <button className="btn-primary" disabled={busy} onClick={() => a.shipCreditLine(lendAmt, apr)}>Ship</button>
            </div>
          </details>
          <button className="btn-primary self-start" onClick={() => go("borrow")}>Next: borrow <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </>
      );
      case "borrow": return (
        <>
          <p className="text-ink-300">Deposit WETH, borrow USDC. The USDC comes <em className="not-italic text-ink-50">directly from the lender&apos;s wallet</em> — the protocol never holds it.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="coll" label="Deposit collateral" suffix="WETH" value={coll} onChange={setColl} />
            <Field id="borrow" label="Borrow" suffix="USDC" value={borrowAmt} onChange={setBorrowAmt} />
          </div>
          <div className="text-xs text-ink-500">Wallet: {eth(position.data?.wethBal, 2)} · max at {p?.human ? "115%" : "150%"} ≈ {usd(p?.maxBorrowable, 0)} after existing debt</div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={busy} onClick={async () => { if (await a.depositAndBorrow(coll, borrowAmt)) go(p?.human ? "stress" : "verify"); }}>
              {a.busy === "Deposit & borrow" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <HandCoins className="h-4 w-4" aria-hidden />} Deposit & borrow
            </button>
            {p && p.debt > 0n && (
              <span className="flex items-center gap-2">
                <input aria-label="Repay amount" className="input !w-28 !py-2" value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)} />
                <button className="btn-ghost" disabled={busy} onClick={() => a.repay(me, repayAmt)}>Repay</button>
              </span>
            )}
          </div>
        </>
      );
      case "verify": return (
        <>
          <p className="text-ink-300">Prove you&apos;re a unique human with World ID. You get <span className="text-bloom">115% collateral</span> instead of 150% and a 3-minute grace window before anyone can liquidate you.</p>
          <div className="glass rounded-2xl p-4 text-xs leading-relaxed text-ink-400">
            <span className="text-ink-200">Why Proof of Human?</span> The trust event is under-collateralised credit. Without uniqueness, one person could spin up 50 wallets to farm the cheap tier. Proof of Human stops that — without anyone learning who you are. Your proof is bound to this wallet and the nullifier is bound to it on-chain.
          </div>
          {p?.human ? (
            <div className="chip w-fit border-bloom/40 bg-bloom/10 text-bloom"><Check className="h-3 w-3" aria-hidden /> Verified human — Prime tier active</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button className="btn-prime" disabled={busy || !WORLD.appId} onClick={async () => { const r = await a.rpContext(); if (r) { setRp(r); setIdkitOpen(true); } }}>
                <Fingerprint className="h-4 w-4" aria-hidden /> Verify with World ID
              </button>
              <button className="btn-ghost" onClick={() => go("stress")}>Skip — stay anonymous</button>
            </div>
          )}
          {WORLD.environment !== "production" && !p?.human && (
            <p className="text-xs text-ink-500">Staging: scan with <a className="text-tide underline" href="https://simulator.worldcoin.org" target="_blank" rel="noreferrer">simulator.worldcoin.org</a> → Scan → Paste code.</p>
          )}
          {rp && (
            <IDKitRequestWidget open={idkitOpen} onOpenChange={setIdkitOpen} app_id={WORLD.appId} action={WORLD.action} rp_context={rp}
              allow_legacy_proofs={true} environment={WORLD.environment} preset={proofOfHuman({ signal: me.toLowerCase() })}
              handleVerify={a.verifyProof} onSuccess={() => go("stress")}
              onError={(code) => push("warn", `World ID not completed (${code}) — your tier is unchanged`)} />
          )}
        </>
      );
      case "stress": return (
        <>
          <p className="text-ink-300">Move the ETH price. The preview uses the contract&apos;s exact math — push it on-chain when you&apos;re ready.</p>
          {deployment.oracleMode === "operator" ? (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between"><label htmlFor="px" className="text-sm text-ink-300">ETH price</label><span className="num text-2xl">${price.toLocaleString()}</span></div>
                <input id="px" type="range" min={1200} max={3200} step={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="focus-ring h-2 w-full cursor-pointer accent-tide" />
              </div>
              {preview && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="glass rounded-2xl p-3"><div className="eyebrow">HF</div><div className={`num text-xl ${preview.hf < 1 ? "text-ember" : "text-tide"}`}>{preview.hf === Infinity ? "∞" : preview.hf.toFixed(3)}</div></div>
                  <div className="glass rounded-2xl p-3"><div className="eyebrow">liq. price</div><div className="num text-xl">${preview.liqPrice.toFixed(0)}</div></div>
                  <div className="glass rounded-2xl p-3"><div className="eyebrow">0xf0 sells</div><div className="num text-xl">{(preview.surgical.collateralOut + preview.surgical.fee).toFixed(3)}</div></div>
                </div>
              )}
              <button className="btn-danger self-start" disabled={busy} onClick={async () => { if (await a.setOracle(price)) { if (preview && preview.hf < 1) go("rescue"); } }}>
                <TrendingDown className="h-4 w-4" aria-hidden /> Push ${price.toLocaleString()} on-chain
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-400">This deployment reads Chainlink ETH/USD — liquidations happen when the real market moves. Run <code className="font-mono">npm run demo:local</code> to crash it yourself.</p>
          )}
        </>
      );
      case "rescue": return (
        <>
          <p className="text-ink-300">A keeper agent ships the 0xf0 auction, then <span className="text-ink-50">pauses</span> for a fresh human approval before it spends anything.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Repay", usd(q?.debtToCover)], ["Sells", eth(q?.collateralOut, 3)], ["Discount", q ? bps(q.discountBps) : "—"], ["Grace", graceLeft ? `${graceLeft}s` : "0s"]].map(([k, v]) => (
              <div key={k} className="glass rounded-2xl p-3 text-center"><div className="eyebrow">{k}</div><div className="num mt-1">{v}</div></div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {!p?.auctionActive && <button className="btn-ghost" disabled={busy || !p || p.healthFactor >= E18} onClick={() => a.startAuction(me)}>1 · Ship 0xf0 auction</button>}
            {graceLeft > 0 && CHAIN_ID === 31337 && <button className="btn-ghost" disabled={busy} onClick={() => a.skipGrace()}>Skip 3-min grace (local)</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-danger !min-h-[56px]" disabled={busy} onClick={() => a.deniedPath(me)}><X className="h-4 w-4" aria-hidden /> Test denied path</button>
            <button className="btn-primary !min-h-[56px]" disabled={busy || !p?.auctionActive || graceLeft > 0} onClick={() => a.approveAndExecute(me, idp.data?.label ?? "IdP")}>
              <Zap className="h-4 w-4" aria-hidden /> Approve & rescue
            </button>
          </div>
          {idp.data && (
            <span className={`chip w-fit ${idp.data.isWorld ? "border-bloom/40 text-bloom" : "border-amber/40 bg-amber/10 text-amber"}`}>
              {!idp.data.isWorld && <ShieldAlert className="h-3 w-3" aria-hidden />} approvals via {idp.data.label}
            </span>
          )}
        </>
      );
    }
  })();

  const current = STEPS.find((s) => s.id === step)!;
  const stress = p ? Math.min(Math.max((1.15 - Number(p.healthFactor > 10n ** 30n ? 10n ** 19n : p.healthFactor) / 1e18) / 0.35, 0), 1) : 0;

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-16 pt-28 lg:grid-cols-[220px_1fr_320px]">
      {/* stepper */}
      <nav aria-label="Lifecycle" className="lg:sticky lg:top-28 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            return (
              <li key={s.id} className="shrink-0">
                <button onClick={() => go(s.id)} aria-current={active ? "step" : undefined}
                  className={`focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? "glass !border-tide/40" : "hover:bg-white/[0.03]"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${done[s.id] ? "bg-bloom/15 text-bloom" : active ? "bg-tide/15 text-tide" : "bg-white/[0.04] text-ink-400"}`}>
                    {done[s.id] ? <Check className="h-4 w-4" aria-hidden /> : <s.icon className="h-4 w-4" aria-hidden />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{i + 1}. {s.label}</span>
                    <span className="hidden text-[11px] text-ink-500 lg:block">{s.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button onClick={() => setVmOpen(true)} className="btn-ghost mt-4 hidden w-full lg:flex"><Code2 className="h-4 w-4" aria-hidden /> Inspect the VM</button>
      </nav>

      {/* stage */}
      <section aria-labelledby="stage-title" className="card relative min-h-[520px] overflow-hidden !p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 opacity-30">
          <LiquidityOrb stress={stress} className="h-full w-full" />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35, ease }}
            className="relative flex max-w-xl flex-col gap-6">
            <div>
              <div className="eyebrow mb-3">Step {STEPS.indexOf(current) + 1} of 5 · {current.blurb}</div>
              <h1 id="stage-title" className="h-display text-4xl">{current.label}</h1>
            </div>
            {stage}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* vitals */}
      <aside className="flex flex-col gap-5" aria-label="Your position">
        {position.isError ? <div className="card text-sm text-ember">Couldn&apos;t read your position. Is the chain running?</div> : <PositionCard pos={p} price={market.data?.price} />}
        {demo.active && <div className="text-center text-[11px] text-ink-500">{DEMO_ROLES[demo.role!].label} · {short(demo.address)}</div>}
        <Activity lines={lines} />
      </aside>

      {/* VM drawer */}
      <AnimatePresence>
        {vmOpen && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setVmOpen(false)} onKeyDown={(e) => e.key === "Escape" && setVmOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-label="SwapVM inspector" className="h-full w-full max-w-xl overflow-auto bg-deep p-4"
              initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }} transition={{ duration: 0.35, ease }} onClick={(e) => e.stopPropagation()}>
              <button className="btn-ghost mb-3" onClick={() => setVmOpen(false)} autoFocus><X className="h-4 w-4" aria-hidden /> Close</button>
              <BytecodePanel borrower={me} auctionActive={p?.auctionActive} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setVmOpen(true)} className="btn-ghost fixed bottom-5 right-5 z-30 lg:hidden"><ActivityIcon className="h-4 w-4" aria-hidden /> VM</button>
    </div>
  );
}
