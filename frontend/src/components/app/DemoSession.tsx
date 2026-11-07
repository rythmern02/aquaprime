"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, ExternalLink, Loader2, Waves } from "lucide-react";
import type { Address } from "viem";
import { txUrl } from "@/config";
import { short } from "@/lib/format";

/**
 * Hosted judge demo (Sepolia demo market): a 10-minute session on a server-held position, no wallet needed.
 * The lease lives in sessionStorage and rides along on every API call as `x-demo-lease`.
 */
export interface Lease { id: string; until: number; borrower: Address }
const KEY = "aquaprime.demoLease";

export function readLease(): Lease | undefined {
  try {
    const l = JSON.parse(sessionStorage.getItem(KEY) || "null") as Lease | null;
    return l && l.until > Date.now() ? l : undefined;
  } catch { return undefined; }
}

export function useDemoLease() {
  const [lease, setLeaseState] = useState<Lease | undefined>();
  useEffect(() => { setLeaseState(readLease()); }, []);
  useEffect(() => {
    if (!lease) return;
    const t = setTimeout(() => setLeaseState(undefined), Math.max(0, lease.until - Date.now()));
    return () => clearTimeout(t);
  }, [lease]);
  const setLease = useCallback((l?: Lease) => {
    try { if (l) sessionStorage.setItem(KEY, JSON.stringify(l)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    setLeaseState(l);
  }, []);
  return [lease, setLease] as const;
}

type Status = { enabled: boolean; busy?: boolean; until?: number; borrower?: Address; remainingToday?: number };

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/demo/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}

/** The start card: acquires the lease, then reconciles the demo position one transaction at a time. */
export function DemoStart({ onReady }: { onReady: (l: Lease) => void }) {
  const [status, setStatus] = useState<Status>();
  const [steps, setSteps] = useState<{ label: string; tx?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { fetch("/api/demo/session").then((r) => r.json()).then(setStatus).catch(() => setStatus({ enabled: false })); }, []);
  if (!status?.enabled) return null;

  const start = async () => {
    setRunning(true); setError(undefined); setSteps([]);
    try {
      const lease = await post<Lease>({ action: "start" });
      for (let i = 0; i < 14; i++) {
        const r = await post<{ ready: boolean; label: string; txHash?: string }>({ action: "step", leaseId: lease.id });
        setSteps((s) => [...s, { label: r.label, tx: r.txHash }]);
        if (r.ready) { onReady(lease); return; }
      }
      throw new Error("The demo position didn't settle — please try again");
    } catch (e) { setError((e as Error).message); } finally { setRunning(false); }
  };

  const busyFor = status.busy && status.until ? Math.ceil((status.until - Date.now()) / 1000) : 0;
  return (
    <div className="card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-5 p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ocean/10 text-ocean"><Waves className="h-5 w-5" aria-hidden /></span>
          <div>
            <div className="font-medium text-fg">Rescue a live position on Sepolia — no wallet needed</div>
            <p className="mt-1 max-w-md text-sm text-fg-3">We reset a real position to health 1.11 at today&apos;s Chainlink price. You crash ETH, ship the 0xf0 auction and approve the rescue — every step is a Sepolia transaction.</p>
          </div>
        </div>
        <button className="btn-ocean" onClick={start} disabled={running || !!busyFor}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {running ? "Preparing…" : busyFor ? `Busy · ${busyFor}s` : "Start a live rescue"}
        </button>
      </div>
      {(steps.length > 0 || error) && (
        <ol className="border-t border-rule bg-raised/50 px-6 py-4 text-sm" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 py-1 text-fg-2">
              <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> {s.label}
              {s.tx && txUrl(s.tx) && <a className="link ml-1 inline-flex items-center gap-1 font-mono text-xs" href={txUrl(s.tx)} target="_blank" rel="noreferrer">{short(s.tx, 4)} <ExternalLink className="h-3 w-3" aria-hidden /></a>}
            </li>
          ))}
          {running && <li className="flex items-center gap-2 py-1 text-fg-3"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Waiting for the next Sepolia block…</li>}
          {error && <li className="py-1 text-signal">{error}</li>}
        </ol>
      )}
      <div className="border-t border-rule px-6 py-3 font-mono text-[11px] text-fg-4">
        Labelled demo market · operator price feed · real 1inch Aqua, WETH and Circle USDC{status.remainingToday !== undefined ? ` · ${status.remainingToday} sessions left today` : ""}
      </div>
    </div>
  );
}

/** Timer + end button shown while a judge holds the session. */
export function DemoSessionBar({ lease, onEnd }: { lease: Lease; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.floor((lease.until - now) / 1000));
  const end = async () => { try { await post({ action: "end", leaseId: lease.id }); } catch { /* lease expires anyway */ } onEnd(); };
  return (
    <div className="card flex items-center justify-between gap-3 p-4 text-sm">
      <div>
        <div className="font-medium text-fg">Live demo session</div>
        <div className="num text-xs text-fg-3">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left · borrower {short(lease.borrower)}</div>
      </div>
      <button className="btn-ghost !min-h-[34px] !px-3 text-xs" onClick={end}>End</button>
    </div>
  );
}
