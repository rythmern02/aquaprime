"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "@wagmi/core";
import { ShieldCheck, ShieldAlert, Loader2, Wallet } from "lucide-react";
import { chain, CHAIN_ID } from "@/config";
import { useReads } from "@/app/providers";
import { useDemoWallet } from "@/hooks/useDemoWallet";
import { short } from "@/lib/format";

function PrivacyPill() {
  const { mode, anonStatus, setMode } = useReads();
  const [open, setOpen] = useState(false);
  const state = mode === "anon"
    ? anonStatus === "ready" ? { t: "Private reads · Anon-RPC", c: "text-bloom border-bloom/30 bg-bloom/[0.06]", I: ShieldCheck }
      : anonStatus === "failed" ? { t: "Anon-RPC unreachable", c: "text-ember border-ember/30 bg-ember/[0.06]", I: ShieldAlert }
      : { t: "Joining mixnet…", c: "text-amber border-amber/30 bg-amber/[0.06]", I: Loader2 }
    : mode === "direct-local" ? { t: "Local node · direct", c: "text-ink-300 border-white/10 bg-white/[0.03]", I: ShieldAlert }
    : { t: "Private reads OFF", c: "text-amber border-amber/30 bg-amber/[0.06]", I: ShieldAlert };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`focus-ring chip min-h-[36px] ${state.c}`}>
        <state.I className={`h-3.5 w-3.5 ${state.I === Loader2 ? "animate-spin" : ""}`} aria-hidden /> {state.t}
      </button>
      {open && (
        <div role="dialog" className="glass absolute right-0 top-11 z-50 w-72 rounded-2xl p-4 text-xs leading-relaxed text-ink-300">
          {mode === "direct-local"
            ? "You're on a local chain. Anonymity networks can't reach localhost, so reads go direct. On Sepolia every read is routed through EF Anon-RPC (Nox mixnet)."
            : "Every balance, health-factor and liquidation quote is fetched through a hash-pinned EF Anon-RPC worker in a sandboxed iframe — your RPC provider can't link liquidation interest to you."}
          {mode === "anon" && anonStatus === "failed" && (
            <button className="btn-ghost mt-3 w-full" onClick={() => setMode("direct-optout")}>Use direct RPC (less private)</button>
          )}
          {mode === "direct-optout" && <button className="btn-ghost mt-3 w-full" onClick={() => setMode("anon")}>Turn private reads on</button>}
        </div>
      )}
    </div>
  );
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const demo = useDemoWallet();
  if (demo.active) {
    return (
      <button className="btn-ghost !min-h-[40px] !px-4" onClick={demo.disable} title="Click to leave demo mode">
        <span className="h-2 w-2 rounded-full bg-bloom shadow-[0_0_10px] shadow-bloom" aria-hidden /> {demo.label} · {short(demo.address)}
      </button>
    );
  }
  if (isConnected) return <button className="btn-ghost !min-h-[40px] !px-4" onClick={() => disconnect()}><Wallet className="h-4 w-4" aria-hidden />{short(address)}</button>;
  return (
    <button className="btn-primary !min-h-[40px] !px-4" disabled={isPending} onClick={() => connect({ connector: injected() })}>
      <Wallet className="h-4 w-4" aria-hidden /> Connect
    </button>
  );
}

export function SiteNav() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = path === "/" ? [["#how", "How it works"], ["#simulator", "Simulator"], ["#live", "Live"], ["#trust", "Trust"]] : [["/", "Home"]];
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <nav aria-label="Main" className={`glass flex w-full max-w-6xl items-center justify-between gap-3 rounded-full py-2 pl-3 pr-2 transition-all duration-500 ease-liquid ${scrolled ? "bg-abyss/70" : "bg-transparent"}`}>
        <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-full pr-2">
          <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-tide via-pulse to-bloom">
            <span className="h-3.5 w-3.5 rounded-full bg-abyss" />
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">AquaPrime</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="focus-ring rounded-full px-3 py-2 text-sm text-ink-300 transition hover:text-ink-50">{label}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden lg:block"><PrivacyPill /></span>
          <span className="chip hidden border-white/10 text-ink-400 sm:inline-flex">{CHAIN_ID === 31337 ? "Local" : chain.name}</span>
          {path === "/" ? <Link href="/app" className="btn-primary !min-h-[40px] !px-4">Launch app</Link> : <WalletButton />}
        </div>
      </nav>
    </header>
  );
}
