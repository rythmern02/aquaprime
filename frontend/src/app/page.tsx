"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Navbar } from "@/components/Navbar";
import { MakerPanel } from "@/components/MakerPanel";
import { BytecodePanel } from "@/components/BytecodePanel";
import { BorrowerPanel, ConsoleLog } from "@/components/BorrowerPanel";
import { usePosition } from "@/hooks/useProtocol";
import { useLog } from "@/hooks/useTx";

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
          <ConsoleLog lines={lines} />
        </div>
      </main>
      <footer className="mx-auto max-w-[1500px] px-6 pb-8 text-[11px] text-slate-600">
        MIT · No trackers, no analytics · Reads via EF Anon-RPC · Built on 1inch Aqua + SwapVM · World ID
      </footer>
    </>
  );
}
