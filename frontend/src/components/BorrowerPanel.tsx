"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, parseEther, parseUnits, type Address, type Hex } from "viem";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { deployment, txUrl, WORLD } from "@/config";
import { registryAbi, tokenAbi } from "@/abi/generated";
import { useMarket, usePosition } from "@/hooks/useProtocol";
import { revertReason, useTx, type LogLine } from "@/hooks/useTx";
import { bps, eth, hf, short, usd } from "@/lib/format";

const c = deployment.contracts;
const E18 = 10n ** 18n;
type Log = (l: LogLine["level"], m: string, tx?: string) => void;

async function api<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

function HealthBar({ value }: { value?: bigint }) {
  const v = value === undefined ? 0 : value > 10n ** 30n ? 3 : Number(value) / 1e18;
  const pct = Math.min(v / 2, 1) * 100;
  const tone = v < 1 ? "bg-rose-500" : v < 1.1 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BorrowerPanel({ borrower, setBorrower, log }: { borrower?: Address; setBorrower: (a?: Address) => void; log: Log }) {
  const { send, pending, account } = useTx();
  const market = useMarket();
  const pos = usePosition(borrower);
  const p = pos.data?.pos;
  const q = pos.data?.quote;
  const own = !!account && !!borrower && account.toLowerCase() === borrower.toLowerCase();

  const [watch, setWatch] = useState("");
  const [depositAmt, setDepositAmt] = useState("10");
  const [borrowAmt, setBorrowAmt] = useState("17000");
  const [repayAmt, setRepayAmt] = useState("1000");
  const [price, setPrice] = useState<number>(2500);
  const [idkitOpen, setIdkitOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext>();
  const [busy, setBusy] = useState<string | null>(null);
  const idp = useQuery({
    queryKey: ["agentpass-config"],
    queryFn: () => fetch("/api/agentpass/config").then((r) => r.json()) as Promise<{ issuer: string; isWorld: boolean; label: string; configured: boolean }>,
    refetchInterval: false,
  });

  useEffect(() => { if (account && !borrower) setBorrower(account); }, [account, borrower, setBorrower]);
  useEffect(() => { if (market.data?.price) setPrice(Number(market.data.price) / 1e6); }, [market.data?.price]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { log("err", `${label}: ${revertReason(e)}`); } finally { setBusy(null); }
  };

  // ── Borrower actions ──
  const deposit = () => run("deposit", async () => {
    const amt = parseEther(depositAmt);
    if ((pos.data?.wethAllow ?? 0n) < amt)
      log("info", "approve WETH → registry", await send("approve", { address: c.weth, abi: tokenAbi as never, functionName: "approve", args: [c.registry, amt] }));
    log("ok", `Deposited ${depositAmt} WETH collateral`, await send("deposit", { address: c.registry, abi: registryAbi as never, functionName: "depositCollateral", args: [amt] }));
  });
  const borrow = () => run("borrow", async () => {
    const line = p?.creditLine && p.creditLine !== `0x${"0".repeat(64)}` ? p.creditLine : deployment.strategies?.creditLine?.hash;
    if (!line) throw new Error("No credit line available");
    const h = await send("borrow", { address: c.registry, abi: registryAbi as never, functionName: "borrow", args: [parseUnits(borrowAmt, 6), line] });
    log("ok", `Borrowed ${borrowAmt} USDC — aqua.pull() straight from the LP wallet`, h);
  });
  const repay = () => run("repay", async () => {
    const amt = parseUnits(repayAmt, 6);
    if ((pos.data?.usdcAllow ?? 0n) < amt)
      log("info", "approve USDC → registry", await send("approve", { address: c.usdc, abi: tokenAbi as never, functionName: "approve", args: [c.registry, amt] }));
    log("ok", `Repaid ${repayAmt} USDC — aqua.push() back into the LP credit line`, await send("repay", { address: c.registry, abi: registryAbi as never, functionName: "repay", args: [borrower!, amt] }));
  });

  // ── Step 1: World IDKit ──
  const openIdkit = () => run("World ID", async () => {
    if (!WORLD.appId) throw new Error("NEXT_PUBLIC_WORLD_APP_ID not configured");
    const r = await api<RpContext>("/api/world/rp-context", {});
    if (!r.ok) throw new Error(r.data.error || "RP signature unavailable");
    setRpContext(r.data);
    setIdkitOpen(true);
  });
  const handleVerify = async (result: IDKitResult) => {
    const r = await api<{ nullifier: string; deadline: string; signature: Hex }>("/api/world/verify", { wallet: account, result });
    if (!r.ok) { log("err", `Backend rejected proof: ${r.data.error}`); throw new Error(r.data.error); }
    const h = await send("verifyHuman", {
      address: c.registry, abi: registryAbi as never, functionName: "verifyHuman",
      args: [BigInt(r.data.nullifier), BigInt(r.data.deadline), r.data.signature],
    });
    log("ok", "Human Prime tier unlocked on-chain: 115% collateral + 3-minute grace window", h);
  };

  // ── Step 2: market ──
  const setOracle = () => run("oracle", async () => {
    const r = await api<{ txHash: string }>("/api/oracle", { price });
    if (!r.ok) throw new Error(r.data.error);
    log("warn", `ETH/USD oracle → $${price.toLocaleString()}`, r.data.txHash);
  });

  // ── Step 3: keeper + Agent Pass ──
  const startAuction = () => run("startAuction", async () => {
    const r = await api<{ txHash: string }>("/api/keeper/start-auction", { borrower });
    if (!r.ok) throw new Error(r.data.error);
    log("ok", "Keeper shipped the 0xf0-guarded SwapVM Dutch auction into Aqua (permissionless)", r.data.txHash);
  });
  const skipGrace = () => run("time", async () => {
    const r = await api("/api/dev/time-travel", { seconds: 181 });
    if (!r.ok) throw new Error(r.data.error);
    log("info", "Local chain advanced 181 s (grace window elapsed)");
    await pos.refetch();
  });

  const execute = async (attemptId: string) => {
    const r = await api<{ txHash: string; approvedBy?: { sub?: string; acr?: string } }>("/api/keeper/execute", { attemptId, borrower });
    if (r.ok) {
      log("ok", `SwapVM fill executed — aqua.pull(USDC from LP) + aqua.push(WETH to LP). Approved via ${idp.data?.label ?? "IdP"} · sub ${short(r.data.approvedBy?.sub, 6)} (${r.data.approvedBy?.acr ?? "acr n/a"})`, r.data.txHash);
    } else {
      log("err", `HTTP ${r.status} — Action Blocked: ${r.data.error}`);
    }
    await pos.refetch();
  };

  const approveAndExecute = () => run("Agent Pass", async () => {
    const r = await api<{ attemptId: string; authorizeUrl: string }>("/api/agentpass/start", { borrower });
    if (!r.ok) throw new Error(r.data.error);
    log("info", "Keeper paused. Requesting fresh human approval via World ID Agent Pass…");
    const popup = window.open(r.data.authorizeUrl, "agentpass", "width=480,height=760");
    const outcome = await new Promise<{ status: string; reason?: string }>((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin || ev.data?.type !== "aquaprime-agentpass" || ev.data?.attemptId !== r.data.attemptId) return;
        cleanup(); resolve(ev.data);
      };
      const timer = setInterval(() => { if (!popup || popup.closed) { cleanup(); resolve({ status: "closed" }); } }, 800);
      const cleanup = () => { window.removeEventListener("message", onMsg); clearInterval(timer); };
      window.addEventListener("message", onMsg);
    });
    if (outcome.status === "approved") log("ok", "Agent Pass approval validated by backend (fresh auth, nonce, acr, operator binding)");
    else log("warn", `Agent Pass not approved (${outcome.reason || outcome.status}) — asking backend anyway to prove it refuses`);
    await execute(r.data.attemptId);
  });

  const deniedPath = () => run("denied path", async () => {
    const r = await api<{ attemptId: string }>("/api/agentpass/start", { borrower });
    if (!r.ok) throw new Error(r.data.error);
    log("info", `Approval ${short(r.data.attemptId, 4)} created, then cancelled/abandoned before the human completed it`);
    await execute(r.data.attemptId);
  });

  const now = market.data?.now ?? 0n;
  const graceLeft = p?.auctionActive && p.auctionStart > now ? Number(p.auctionStart - now) : 0;
  const underwater = p && p.healthFactor < E18;

  return (
    <section className="panel flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="panel-title">03 · Borrower · World ID · Keeper</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Sybil-resistant credit, human-approved rescue</h2>
        </div>
        <span className={`chip ${p?.human ? "border-prime-500/60 text-prime-400" : "border-ink-600 text-slate-400"}`}>
          {p?.human ? "Verified Human · 115%" : "Anonymous · 150%"}
        </span>
      </div>

      <div className="flex gap-2">
        <input className="input" placeholder="watch borrower 0x…" value={watch} onChange={(e) => setWatch(e.target.value)} />
        <button className="btn-ghost" onClick={() => isAddress(watch) && setBorrower(watch as Address)}>Watch</button>
        {account && <button className="btn-ghost" onClick={() => setBorrower(account)}>Me</button>}
      </div>

      {p && (
        <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-slate-400">Health factor · {short(borrower)}</div>
              <div className={`font-mono text-3xl font-bold ${underwater ? "text-rose-400" : "text-emerald-300"}`}>{hf(p.healthFactor)}</div>
            </div>
            <dl className="text-right">
              <div className="kv"><dt>Collateral</dt><dd>{eth(p.collateral, 3)}</dd></div>
              <div className="kv"><dt>Debt</dt><dd>{usd(p.debt)}</dd></div>
              <div className="kv"><dt>Borrowable</dt><dd>{usd(p.maxBorrowable, 0)}</dd></div>
            </dl>
          </div>
          <div className="mt-3"><HealthBar value={p.healthFactor} /></div>
          {own && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col gap-1"><input className="input" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
                <button className="btn-ghost" disabled={!!busy || !!pending} onClick={deposit}>Deposit WETH</button>
                <span className="text-[10px] text-slate-500">wallet {eth(pos.data?.wethBal, 2)}</span></div>
              <div className="flex flex-col gap-1"><input className="input" value={borrowAmt} onChange={(e) => setBorrowAmt(e.target.value)} />
                <button className="btn-ghost" disabled={!!busy || !!pending || p.auctionActive} onClick={borrow}>Borrow USDC</button></div>
              <div className="flex flex-col gap-1"><input className="input" value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)} />
                <button className="btn-ghost" disabled={!!busy || !!pending} onClick={repay}>Repay</button>
                <span className="text-[10px] text-slate-500">wallet {usd(pos.data?.usdcBal, 0)}</span></div>
            </div>
          )}
        </div>
      )}

      {/* Step 1 — IDKit */}
      <div className="rounded-xl border border-ink-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-white">Step 1 · Proof of Human (World IDKit)</div>
          <button className="btn-prime" disabled={!own || !!busy || p?.human} onClick={openIdkit}>
            {p?.human ? "Verified ✓" : "Verify with World IDKit"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Trust event: under-collateralised credit (115% vs 150%) and a 3-minute liquidation grace window. Proof of Human is the
          minimum sufficient credential — it stops one borrower from spinning up 50 Sybil wallets to farm the low-collateral tier,
          without collecting any government identity. The proof is bound to your wallet (signal), verified server-side with World,
          and the nullifier is bound on-chain to exactly one wallet.
        </p>
        {rpContext && account && (
          <IDKitRequestWidget
            open={idkitOpen}
            onOpenChange={setIdkitOpen}
            app_id={WORLD.appId}
            action={WORLD.action}
            rp_context={rpContext}
            allow_legacy_proofs={true}
            environment={WORLD.environment}
            preset={proofOfHuman({ signal: account.toLowerCase() })}
            handleVerify={handleVerify}
            onSuccess={() => log("ok", "World ID proof accepted")}
            onError={(code) => log("warn", `World ID not completed (${code}) — tier unchanged, no credit upgrade issued`)}
          />
        )}
      </div>

      {/* Step 2 — market */}
      <div className="rounded-xl border border-ink-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-white">Step 2 · Market stress</div>
          <span className="font-mono text-sm text-slate-300">oracle {usd(market.data?.price, 0)}</span>
        </div>
        {deployment.oracleMode === "operator" ? (
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={1200} max={3200} step={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="flex-1 accent-aqua-500" />
            <span className="w-20 text-right font-mono text-sm">${price.toLocaleString()}</span>
            <button className="btn-danger" disabled={!!busy} onClick={setOracle}>Push price</button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">Chainlink ETH/USD — prices move with the real market.</p>
        )}
      </div>

      {/* Step 3 — keeper */}
      <div className="rounded-xl border border-ink-700 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-white">Step 3 · Keeper agent + World ID Agent Pass</div>
          {idp.data && (
            <span title={idp.data.issuer}
              className={`chip ${idp.data.isWorld ? "border-emerald-500/50 text-emerald-300" : "border-amber-500/60 bg-amber-500/10 text-amber-300"}`}>
              {idp.data.label}{idp.data.configured ? "" : " · not configured"}
            </span>
          )}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 text-xs">
          <div className="kv"><dt>Auction</dt><dd>{p?.auctionActive ? "live (0xf0)" : "—"}</dd></div>
          <div className="kv"><dt>Grace left</dt><dd>{graceLeft ? `${graceLeft}s` : "0s"}</dd></div>
          <div className="kv"><dt>Surgical repay</dt><dd>{usd(q?.debtToCover)}</dd></div>
          <div className="kv"><dt>Collateral slice</dt><dd>{eth(q?.collateralOut, 3)}</dd></div>
          <div className="kv"><dt>Dutch discount</dt><dd>{q ? bps(q.discountBps) : "—"}</dd></div>
          <div className="kv"><dt>vs. full wipe</dt><dd>{p && q && p.collateral > 0n ? `${(Number(q.collateralOut * 10000n / p.collateral) / 100).toFixed(1)}% seized` : "—"}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!underwater || p?.auctionActive || !!busy} onClick={startAuction}>Ship auction (startAuction)</button>
          {graceLeft > 0 && process.env.NEXT_PUBLIC_CHAIN_ID === "31337" && (
            <button className="btn-ghost" disabled={!!busy} onClick={skipGrace}>Skip grace (local)</button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-danger !py-3" disabled={!borrower || !!busy} onClick={deniedPath}>
            Test Denied / Cancelled Path
          </button>
          <button className="btn-primary !py-3" disabled={!borrower || !p?.auctionActive || graceLeft > 0 || !!busy} onClick={approveAndExecute}>
            Approve Keeper via Agent Pass &amp; Execute SwapVM Fill
          </button>
        </div>
        {busy && <p className="mt-2 text-xs text-aqua-300">{busy}…</p>}
      </div>
    </section>
  );
}

export function ConsoleLog({ lines }: { lines: LogLine[] }) {
  const tone = { info: "text-slate-300", ok: "text-emerald-300", err: "text-rose-300", warn: "text-amber-300" };
  return (
    <section className="panel">
      <div className="panel-title mb-3">Keeper console</div>
      <ol className="flex max-h-72 flex-col gap-1 overflow-auto font-mono text-[12px]">
        {lines.length === 0 && <li className="text-slate-600">Waiting for actions…</li>}
        {lines.map((l, i) => (
          <li key={i} className={tone[l.level]}>
            <span className="text-slate-600">{new Date(l.t).toLocaleTimeString()} </span>{l.msg}
            {l.tx && (txUrl(l.tx)
              ? <a className="ml-2 text-aqua-400 underline" href={txUrl(l.tx)} target="_blank" rel="noreferrer">{short(l.tx, 6)}</a>
              : <span className="ml-2 text-slate-500">tx {short(l.tx, 6)}</span>)}
          </li>
        ))}
      </ol>
    </section>
  );
}
