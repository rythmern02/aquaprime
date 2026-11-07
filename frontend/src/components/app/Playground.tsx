"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { RpContext } from "@worldcoin/idkit";
import { Activity as ActivityIcon, ArrowRight, Check, Code2, Droplets, Fingerprint, HandCoins, Loader2, ShieldAlert, Sparkles, TrendingDown, Wallet, X, Zap } from "lucide-react";
import type { Address } from "viem";
import { CHAIN_ID, deployment, WORLD } from "@/config";
import { useMaker, useMarket, usePosition } from "@/hooks/useProtocol";
import { useLog } from "@/hooks/useTx";
import { useAquaActions } from "@/hooks/useAquaActions";
import { DEMO_ROLES, useDemoWallet, type DemoRole } from "@/hooks/useDemoWallet";
import { legacyLiquidation, simulate } from "@/lib/riskmath";
import { bps, eth, short, usd } from "@/lib/format";
import { WalletButton } from "@/components/SiteNav";
import { Activity, PositionCard } from "./Vitals";
import { BytecodePanel } from "@/components/BytecodePanel";
import { WorldIdPanel } from "./WorldIdPanel";
import { Toaster } from "@/components/Toaster";

const ease = [0.2, 0.8, 0.2, 1] as const;
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
      <span className="mb-2 block text-sm text-fg-2">{label}</span>
      <span className="relative block">
        <input id={id} inputMode="decimal" autoComplete="off" className="input pr-16 text-lg" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-fg-4">{suffix}</span>
      </span>
    </label>
  );
}

function StartGate() {
  const demo = useDemoWallet();
  const roles: [DemoRole, string, string][] = [
    ["borrower", "Borrower", "Fresh wallet with 20 WETH. Runs the whole story."],
    ["anon", "Underwater-ready", "Anonymous position already open at HF 1.11."],
    ["maker", "Maker", "The LP wallet behind three strategies. Try aqua.dock."],
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="label mb-6">Playground / start</div>
      <h1 className="h-display text-[clamp(2.4rem,5vw,3.6rem)] leading-[1]">Pick a wallet.</h1>
      <p className="mt-4 max-w-lg text-fg-3">Everything here is real and on-chain: deposits, Aqua pulls, the 0xf0 auction and the keeper fill.</p>
      {demo.available && (
        <ul className="mt-10 border-t border-rule">
          {roles.map(([r, t, d], i) => (
            <li key={r} className="border-b border-rule">
              <button onClick={() => demo.enable(r)} className="focus-ring group grid w-full grid-cols-[40px_1fr_auto] items-center gap-4 py-5 text-left transition-colors hover:bg-panel">
                <span className="num pl-1 text-xs text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block font-medium text-fg">{t} demo wallet</span>
                  <span className="mt-0.5 block text-sm text-fg-3">{d}</span>
                </span>
                <ArrowRight className="mr-2 h-4 w-4 text-fg-4 transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-fg-3">
        {demo.available && <span>Or use your own:</span>}
        <WalletButton />
      </div>
      {demo.available && <p className="mt-6 max-w-md text-xs text-fg-4">Demo wallets use Hardhat&apos;s public test keys and only work on this local chain.</p>}
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
    stress: !!p && (p.healthFactor < E18 || p.auctionActive) || lines.some((l) => l.msg.startsWith("Surgical fill executed")),
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
  const [before, setBefore] = useState<{ coll: number; hf: number; debt: number; price: number }>();
  const [idkitOpen, setIdkitOpen] = useState(false);

  useEffect(() => { if (market.data?.price) setPrice(Number(market.data.price) / 1e6); }, [market.data?.price]);
  const onWorldFail = useCallback((code: string) => { setIdkitOpen(false); push("warn", `World ID not completed (${code}) — your tier is unchanged`); }, [push]);

  const preview = useMemo(() => {
    if (!p) return undefined;
    return simulate({ collateral: Number(p.collateral) / 1e18, debt: Number(p.debt) / 1e6, price, human: p.human });
  }, [p, price]);

  const now = market.data?.now ?? 0n;
  const graceLeft = p?.auctionActive && p.auctionStart > now ? Number(p.auctionStart - now) : 0;
  const isMaker = !!me && !!maker.data && me.toLowerCase() === maker.data.maker.toLowerCase();

  if (!me) return <div className="wrap pb-24 pt-32"><StartGate /></div>;

  const go = (s: StepId) => setStep(s);
  const busy = !!a.busy;
  const stage = (() => {
    switch (step) {
      case "lend": return (
        <>
          <p className="text-fg-2">One wallet backs three live strategies. Nothing moves until someone actually borrows.</p>
          <div className="grid gap-3">
            {maker.data?.strategies.map((s) => (
              <div key={s.key} className="border border-rule flex items-center justify-between gap-4 rounded-md p-4">
                <div>
                  <div className="flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${s.live ? "bg-ok" : "bg-fg-4"}`} />{s.name}</div>
                  <div className="text-xs text-fg-3">{s.desc}</div>
                </div>
                <div className="text-right">
                  <div className="num">{usd(BigInt(s.usdc), 0)}</div>
                  {isMaker && s.live && <button className="btn-ghost mt-1 !min-h-[32px] !px-3 text-xs" disabled={busy} onClick={() => a.dock(s.appAddr, s.hash, s.tokens as Address[], s.name)}>Dock</button>}
                </div>
              </div>
            ))}
          </div>
          <details className="rounded-md border border-rule bg-bg p-4">
            <summary className="focus-ring cursor-pointer rounded text-sm text-fg-2">Ship your own credit line (aqua.ship)</summary>
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
          <p className="text-fg-2">Deposit WETH, borrow USDC. The USDC comes <em className="not-italic text-fg">directly from the lender&apos;s wallet</em> — the protocol never holds it.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="coll" label="Deposit collateral" suffix="WETH" value={coll} onChange={setColl} />
            <Field id="borrow" label="Borrow" suffix="USDC" value={borrowAmt} onChange={setBorrowAmt} />
          </div>
          <div className="text-xs text-fg-4">Wallet: {eth(position.data?.wethBal, 2)} · max at {p?.human ? "115%" : "150%"} ≈ {usd(p?.maxBorrowable, 0)} after existing debt</div>
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
          <p className="text-fg-2">Prove you&apos;re a unique human with World ID. You get <span className="text-ok">115% collateral</span> instead of 150% and a 3-minute grace window before anyone can liquidate you.</p>
          <div className="rounded-md border border-rule bg-bg p-4 text-xs leading-relaxed text-fg-3">
            <span className="text-fg">Why Proof of Human?</span> The trust event is under-collateralised credit. Without uniqueness, one person could spin up 50 wallets to farm the cheap tier. Proof of Human stops that — without anyone learning who you are. Your proof is bound to this wallet and the nullifier is bound to it on-chain.
          </div>
          {p?.human ? (
            <div className="tag w-fit border-ok/40 bg-ok/10 text-ok"><Check className="h-3 w-3" aria-hidden /> Verified human — Prime tier active</div>
          ) : rp && idkitOpen ? (
            <WorldIdPanel rp={rp} appId={WORLD.appId} action={WORLD.action} environment={WORLD.environment} signal={me.toLowerCase()}
              onProof={async (r) => { await a.verifyProof(r); setIdkitOpen(false); go("stress"); }}
              onCancel={() => { setIdkitOpen(false); push("info", "World ID cancelled — your tier is unchanged"); }}
              onFail={onWorldFail} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={busy || !WORLD.appId} onClick={async () => { const r = await a.rpContext(); if (r) { setRp(r); setIdkitOpen(true); } }}>
                <Fingerprint className="h-4 w-4" aria-hidden /> Verify with World ID
              </button>
              <button className="btn-ghost" onClick={() => go("stress")}>Skip — stay anonymous</button>
            </div>
          )}
        </>
      );
      case "stress": return (
        <>
          <p className="text-fg-2">Move the ETH price. The preview uses the contract&apos;s exact math — push it on-chain when you&apos;re ready.</p>
          {deployment.oracleMode === "operator" ? (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between"><label htmlFor="px" className="text-sm text-fg-2">ETH price</label><span className="num text-2xl">${price.toLocaleString()}</span></div>
                <input id="px" type="range" min={1200} max={3200} step={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="focus-ring h-2 w-full cursor-pointer accent-fg" />
              </div>
              {preview && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md border border-rule bg-bg p-3"><div className="label">HF</div><div className={`num text-xl ${preview.hf < 1 ? "text-signal" : "text-fg"}`}>{preview.hf === Infinity ? "∞" : preview.hf.toFixed(3)}</div></div>
                  <div className="rounded-md border border-rule bg-bg p-3"><div className="label">liq. price</div><div className="num text-xl">${preview.liqPrice.toFixed(0)}</div></div>
                  <div className="rounded-md border border-rule bg-bg p-3"><div className="label">0xf0 sells</div><div className="num text-xl">{(preview.surgical.collateralOut + preview.surgical.fee).toFixed(3)}</div></div>
                </div>
              )}
              {preview && (
                preview.hf >= 1 ? (
                  <div className="rounded-md border border-rule bg-panel/60 p-3 text-xs text-fg-3 flex items-center gap-2">
                    <span className="text-ok font-bold">●</span>
                    <span>Position is healthy (HF {preview.hf === Infinity ? "∞" : preview.hf.toFixed(3)}). Drag ETH below <strong className="text-signal">${preview.liqPrice.toFixed(0)}</strong> to trigger insolvency &amp; enable the rescue step.</span>
                  </div>
                ) : (
                  <div className="rounded-md border border-signal/40 bg-signal/10 p-3 text-xs text-signal flex items-center gap-2">
                    <span className="font-bold">⚠️</span>
                    <span><strong>Position Underwater!</strong> (HF {preview.hf.toFixed(3)} &lt; 1.0). Pushing on-chain will open the 0xf0 auction and activate the rescue flow.</span>
                  </div>
                )
              )}
              <button className={`${preview && preview.hf < 1 ? "btn-signal" : "btn-primary"} self-start`} disabled={busy} onClick={async () => {
                const ok = await a.setOracle(price);
                if (ok) {
                  if (preview && preview.hf < 1) {
                    go("rescue");
                  } else {
                    push("info", `Oracle updated to $${price.toLocaleString()}. Drag below $${preview?.liqPrice.toFixed(0)} to crash ETH into liquidation.`);
                  }
                }
              }}>
                <TrendingDown className="h-4 w-4" aria-hidden /> {preview && preview.hf < 1 ? `Crash ETH to $${price.toLocaleString()} & Go to Rescue →` : `Push $${price.toLocaleString()} on-chain`}
              </button>
            </>
          ) : (
            <p className="text-sm text-fg-3">This deployment reads Chainlink ETH/USD — liquidations happen when the real market moves. Run <code className="font-mono">npm run demo:local</code> to crash it yourself.</p>
          )}
        </>
      );
      case "rescue": return (
        <>
          <p className="text-fg-2">A keeper agent ships the 0xf0 auction, then <span className="text-fg">pauses</span> for a fresh human approval before it spends anything.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Repay", usd(q?.debtToCover)], ["Sells", eth(q?.collateralOut, 3)], ["Discount", q ? bps(q.discountBps) : "—"], ["Grace", graceLeft ? `${graceLeft}s` : "0s"]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-rule bg-bg p-3 text-center"><div className="label">{k}</div><div className="num mt-1">{v}</div></div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {!p?.auctionActive && <button className="btn-ghost" disabled={busy || !p || p.healthFactor >= E18} onClick={() => a.startAuction(me)}>1 · Ship 0xf0 auction</button>}
            {graceLeft > 0 && CHAIN_ID === 31337 && <button className="btn-ghost" disabled={busy} onClick={() => a.skipGrace()}>Skip 3-min grace (local)</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-ghost !min-h-[56px]" disabled={busy || !p?.auctionActive} title={p?.auctionActive ? undefined : "Ship the 0xf0 auction first"} onClick={() => a.deniedPath(me)}><X className="h-4 w-4" aria-hidden /> Test denied path</button>
            <button className="btn-primary !min-h-[56px]" disabled={busy || !p?.auctionActive || graceLeft > 0}
              onClick={() => { if (p) setBefore({ coll: Number(p.collateral) / 1e18, hf: Number(p.healthFactor) / 1e18, debt: Number(p.debt) / 1e6, price: Number(market.data?.price ?? 0n) / 1e6 }); a.approveAndExecute(me, idp.data?.label ?? "IdP"); }}>
              <Zap className="h-4 w-4" aria-hidden /> Approve & rescue
            </button>
          </div>
          {done.rescue && before && p && (() => {
            const after = Number(p.collateral) / 1e18, sold = before.coll - after;
            const legacy = legacyLiquidation(before.coll, before.debt, before.price, before.hf).collateralOut;
            return (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-ok/30 bg-ok/[0.06] p-5">
                <div className="label mb-3 text-ok">rescued</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><div className="num text-2xl">{before.hf.toFixed(3)} → <span className="text-ok">{(Number(p.healthFactor) / 1e18).toFixed(3)}</span></div><div className="text-[11px] text-fg-3">health</div></div>
                  <div><div className="num text-2xl">{sold.toFixed(3)}</div><div className="text-[11px] text-fg-3">WETH sold ({((sold / before.coll) * 100).toFixed(1)}%)</div></div>
                  <div><div className="num text-2xl text-ok">{after.toFixed(3)}</div><div className="text-[11px] text-fg-3">WETH you keep</div></div>
                </div>
                <p className="mt-3 text-xs text-fg-3">A legacy close-factor liquidation would have sold ≈{legacy.toFixed(2)} WETH at a fixed 5% bonus — you kept {(legacy - sold).toFixed(2)} WETH more.</p>
              </motion.div>
            );
          })()}
          {idp.data && (
            <span className={`tag w-fit ${idp.data.isWorld ? "border-ok/40 text-ok" : "border-warn/40 bg-warn/10 text-warn"}`}>
              {!idp.data.isWorld && <ShieldAlert className="h-3 w-3" aria-hidden />} approvals via {idp.data.label}
            </span>
          )}
        </>
      );
    }
  })();

  const current = STEPS.find((s) => s.id === step)!;

  return (
    <div className="wrap grid gap-6 pb-16 pt-24 lg:grid-cols-[200px_1fr_300px]">
      {/* wallet state banners span the full width above the three columns */}
      {a.wrongChain && (
        <div role="alert" className="card flex flex-wrap items-center justify-between gap-4 border-warn/40 p-4 lg:col-span-3">
          <p className="text-sm text-fg-2">
            <span className="font-medium text-fg">Your wallet is on another network</span> (chain {a.walletChainId}). AquaPrime here runs on{" "}
            <span className="font-mono text-fg">{CHAIN_ID === 31337 ? "Hardhat local · 31337" : `Sepolia · ${CHAIN_ID}`}</span>.
          </p>
          <button className="btn-ocean" disabled={a.switching} onClick={() => a.switchToApp()}>
            {a.switching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Switch network
          </button>
        </div>
      )}
      {!demo.active && CHAIN_ID === 31337 && !a.wrongChain && position.data && position.data.wethBal === 0n && !p?.debt && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-4 lg:col-span-3">
          <p className="text-sm text-fg-2">
            <span className="font-medium text-fg">This wallet has no test funds on the local chain.</span> Use a demo wallet, or import one of Hardhat&apos;s public test accounts into your wallet.
          </p>
          <button className="btn-ghost" onClick={() => demo.enable("borrower")}>Use the borrower demo wallet</button>
        </div>
      )}
      {/* stepper */}
      <nav aria-label="Lifecycle" className="lg:sticky lg:top-28 lg:self-start">
        <div className="label mb-3 hidden lg:block">Lifecycle</div>
        <ol className="flex overflow-x-auto border-rule lg:flex-col lg:border-t">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            return (
              <li key={s.id} className="shrink-0 lg:border-b lg:border-rule">
                <button onClick={() => go(s.id)} aria-current={active ? "step" : undefined}
                  className={`focus-ring relative flex w-full items-center gap-3 px-3 py-3 text-left transition-colors lg:px-2 ${active ? "text-fg" : "text-fg-3 hover:text-fg"}`}>
                  {active && <motion.span layoutId="step-bar" className="absolute bottom-0 left-0 h-[2px] w-full bg-ocean lg:inset-y-0 lg:h-auto lg:w-[3px]" />}
                  <span className={`num w-5 text-xs ${done[s.id] ? "text-ok" : "text-fg-4"}`}>{done[s.id] ? <Check className="h-3.5 w-3.5" aria-hidden /> : String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="hidden text-[11px] text-fg-4 lg:block">{s.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button onClick={() => setVmOpen(true)} className="btn-ghost mt-4 hidden w-full lg:flex"><Code2 className="h-4 w-4" aria-hidden /> Inspect the VM</button>
      </nav>

      {/* stage */}
      <section aria-labelledby="stage-title" className="panel relative min-h-[520px] overflow-hidden p-6 sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35, ease }}
            className="relative flex max-w-xl flex-col gap-6">
            <div>
              <div className="label mb-4"><span className="text-fg">{String(STEPS.indexOf(current) + 1).padStart(2, "0")}</span> <span className="text-fg-4">/ 05</span> — {current.blurb}</div>
              <h1 id="stage-title" className="h-display text-[2.6rem] leading-none">{current.label}</h1>
            </div>
            {stage}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* vitals */}
      <aside className="flex flex-col gap-5" aria-label="Your position">
        {position.isError ? <div className="panel p-6 text-sm text-signal">Couldn&apos;t read your position. Is the chain running?</div> : <PositionCard pos={p} price={market.data?.price} />}
        {demo.active && <div className="text-center text-[11px] text-fg-4">{DEMO_ROLES[demo.role!].label} · {short(demo.address)}</div>}
        <Activity lines={lines} />
      </aside>

      {/* VM drawer */}
      <AnimatePresence>
        {vmOpen && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-fg/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setVmOpen(false)} onKeyDown={(e) => e.key === "Escape" && setVmOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-label="SwapVM inspector" className="h-full w-full max-w-xl overflow-auto border-l border-rule bg-bg p-4"
              initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }} transition={{ duration: 0.35, ease }} onClick={(e) => e.stopPropagation()}>
              <button className="btn-ghost mb-3" onClick={() => setVmOpen(false)} autoFocus><X className="h-4 w-4" aria-hidden /> Close</button>
              <BytecodePanel borrower={me} auctionActive={p?.auctionActive} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setVmOpen(true)} className="btn-ghost fixed bottom-5 right-5 z-30 lg:hidden"><ActivityIcon className="h-4 w-4" aria-hidden /> VM</button>
      <Toaster lines={lines} />
    </div>
  );
}
