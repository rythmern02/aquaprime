"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "@wagmi/core";
import { ArrowUpRight, Wallet } from "lucide-react";
import { chain, CHAIN_ID } from "@/config";
import { useReads } from "@/app/providers";
import { useDemoWallet } from "@/hooks/useDemoWallet";
import { short } from "@/lib/format";
import { Mark } from "@/components/landing/ui";

function PrivacyPill() {
  const { mode, anonStatus, setMode } = useReads();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const s = mode === "anon"
    ? anonStatus === "ready" ? { t: "Anon-RPC", dot: "bg-ok" }
      : anonStatus === "failed" ? { t: "Anon-RPC down", dot: "bg-signal" }
      : { t: "Joining mixnet", dot: "bg-warn animate-blink" }
    : mode === "direct-local" ? { t: "Local RPC", dot: "bg-fg-4" }
    : { t: "Direct RPC", dot: "bg-warn" };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="focus-ring flex h-8 items-center gap-2 rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 hover:text-fg">
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden /> {s.t}
      </button>
      {open && (
        <div role="dialog" aria-label="Read privacy" className="panel absolute right-0 top-10 z-50 w-72 p-4 text-xs leading-relaxed text-fg-2 shadow-lift">
          {mode === "direct-local"
            ? "You're on a local chain. Anonymity networks can't reach localhost, so reads go direct. On Sepolia every read goes through EF Anon-RPC (Nox mixnet)."
            : "Balances, health factors and liquidation quotes are fetched through a hash-pinned EF Anon-RPC worker in a sandboxed iframe, so your RPC provider can't link liquidation interest to you."}
          {mode === "anon" && anonStatus === "failed" && <button className="btn-ghost mt-3 w-full" onClick={() => setMode("direct-optout")}>Use direct RPC (less private)</button>}
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
      <button className="btn-ghost !min-h-[34px] !px-3 font-mono text-xs" onClick={demo.disable} title="Leave demo mode">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> {demo.label} · {short(demo.address)}
      </button>
    );
  }
  if (isConnected) return <button className="btn-ghost !min-h-[34px] !px-3 font-mono text-xs" onClick={() => disconnect()}><Wallet className="h-3.5 w-3.5" aria-hidden />{short(address)}</button>;
  return (
    <button className="btn-primary !min-h-[34px] !px-3" disabled={isPending} onClick={() => connect({ connector: injected() })}>
      <Wallet className="h-3.5 w-3.5" aria-hidden /> Connect wallet
    </button>
  );
}

export function SiteNav() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = path === "/" ? [["#how", "Mechanism"], ["#simulator", "Simulator"], ["#live", "Live"], ["#stack", "Stack"]] : [["/", "Overview"]];
  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-200 ${scrolled ? "border-rule bg-bg/85 backdrop-blur-md" : "border-transparent"}`}>
      <nav aria-label="Main" className="wrap flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-sm">
            <Mark />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">AquaPrime</span>
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="focus-ring rounded-sm text-sm text-fg-3 transition-colors hover:text-fg">{label}</a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden lg:block"><PrivacyPill /></span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.06em] text-fg-4 sm:block">{CHAIN_ID === 31337 ? "Hardhat 31337" : chain.name}</span>
          {path === "/"
            ? <Link href="/app" className="btn-primary !min-h-[34px] !px-3">Open app <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>
            : <WalletButton />}
        </div>
      </nav>
    </header>
  );
}
