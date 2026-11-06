"use client";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, deployment } from "@/config";
import { useReads } from "@/app/providers";
import { short } from "@/lib/format";

function PrivacyBadge() {
  const { mode, anonStatus, anonError, setMode } = useReads();
  if (mode === "anon") {
    const tone = anonStatus === "ready" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
      : anonStatus === "failed" ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
      : "border-amber-500/50 bg-amber-500/10 text-amber-300";
    const label = anonStatus === "ready" ? "Private Read Mode: ON (Anon-RPC)"
      : anonStatus === "failed" ? "Anon-RPC unavailable — reads paused" : "Private Read Mode: connecting…";
    return (
      <div className="flex items-center gap-2">
        <span className={`chip ${tone}`} title={anonError}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> {label}
        </span>
        {anonStatus === "failed" && (
          <button className="text-[11px] text-slate-400 underline" onClick={() => setMode("direct-optout")}>
            use direct RPC (less private)
          </button>
        )}
      </div>
    );
  }
  if (mode === "direct-local")
    return (
      <span className="chip border-slate-500/50 bg-slate-500/10 text-slate-300"
        title="A localhost RPC cannot be reached through an anonymity network; deploy to Sepolia to route reads via Anon-RPC.">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Private Read Mode: local node (direct)
      </span>
    );
  return (
    <button className="chip border-amber-500/50 bg-amber-500/10 text-amber-300" onClick={() => setMode("anon")}>
      Private Read Mode: OFF — turn on
    </button>
  );
}

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-aqua-400 to-prime-500 font-black text-ink-950">A</div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-white">AquaPrime</div>
            <div className="text-[11px] text-slate-500">Zero-custody prime credit · surgical liquidations</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrivacyBadge />
          <span className="chip border-ink-600 text-slate-400">
            {chain.name} · oracle: {deployment.oracleMode === "chainlink" ? "Chainlink" : "operator (stress test)"}
          </span>
          {isConnected ? (
            <button className="btn-ghost" onClick={() => disconnect()}>{short(address)}</button>
          ) : (
            <button className="btn-primary" disabled={isPending} onClick={() => connect({ connector: injected() })}>
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
