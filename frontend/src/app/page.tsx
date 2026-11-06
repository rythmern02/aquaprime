"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Navbar } from "@/components/Navbar";
import { MakerPanel } from "@/components/MakerPanel";
import { BytecodePanel } from "@/components/BytecodePanel";
import { BorrowerPanel, ConsoleLog } from "@/components/BorrowerPanel";
import { usePosition } from "@/hooks/useProtocol";
import { useLog } from "@/hooks/useTx";
import { useQuery } from "@tanstack/react-query";
import { short } from "@/lib/format";

function Proposals({ onPick }: { onPick: (a: Address) => void }) {
  const { data } = useQuery({
    queryKey: ["proposals"],
    queryFn: () => fetch("/api/keeper/proposals").then((r) => r.json()) as Promise<{ proposals: { borrower: Address; reason: string; createdAt: number }[] }>,
  });
  const list = data?.proposals ?? [];
  return (
    <section className="panel">
      <div className="panel-title mb-3">Keeper agent · paused for human approval</div>
      {list.length === 0 && <p className="text-xs text-slate-600">No pending proposals. Run <code>npm run keeper</code>.</p>}
      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <li key={p.borrower} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <div><div className="font-mono text-amber-200">{short(p.borrower, 6)}</div><div className="text-slate-400">{p.reason}</div></div>
            <button className="btn-ghost !py-1 text-xs" onClick={() => onPick(p.borrower)}>Review</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const [borrower, setBorrower] = useState<Address>();
  const { lines, push } = useLog();
  const pos = usePosition(borrower);

  return (
    <>
      <Navbar />
      <main className="mx-auto grid max-w-[1500px] gap-5 px-6 py-6 lg:grid-cols-3">
        <MakerPanel log={push} />
        <BytecodePanel borrower={borrower} auctionActive={pos.data?.pos.auctionActive} />
        <div className="flex flex-col gap-5">
          <BorrowerPanel borrower={borrower} setBorrower={setBorrower} log={push} />
          <Proposals onPick={setBorrower} />
          <ConsoleLog lines={lines} />
        </div>
      </main>
      <footer className="mx-auto max-w-[1500px] px-6 pb-8 text-[11px] text-slate-600">
        MIT · No trackers, no analytics · Reads via EF Anon-RPC · Built on 1inch Aqua + SwapVM · World ID
      </footer>
    </>
  );
}
