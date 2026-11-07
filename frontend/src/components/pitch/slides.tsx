"use client";
import type { ReactNode } from "react";
import { BadgeCheck, Bot, Eye, Fingerprint, Github, Layers, Lock, Scissors, ShieldCheck, Wallet, Waves as WavesIcon } from "lucide-react";
import { Mark } from "@/components/landing/ui";
import { Waves } from "@/components/fx/Waves";
import { useNetwork } from "@/hooks/useNetwork";
import { CHAIN_ID, deployment } from "@/config";
import { short } from "@/lib/format";

/* ───────────── shared frame ───────────── */

function Frame({ n, kicker, title, children, tone = "light" }: { n: number; kicker: string; title: ReactNode; children: ReactNode; tone?: "light" | "sky" }) {
  return (
    <div className={`relative flex h-full flex-col px-[88px] pb-[64px] pt-[64px] ${tone === "sky" ? "sky" : "bg-white"}`}>
      <div className="rise flex items-center justify-between">
        <div className="label !text-[13px]"><span className="text-fg">{String(n).padStart(2, "0")}</span> <span className="mx-1 text-fg-4">/</span> {kicker}</div>
        <div className="flex items-center gap-2 text-[15px] font-semibold text-fg"><Mark className="h-5 w-5" /> AquaPrime</div>
      </div>
      <h2 className="rise h-display mt-8 max-w-[1250px] text-[60px] leading-[1.02]" style={{ animationDelay: ".05s" }}>{title}</h2>
      <div className="rise mt-10 min-h-0 flex-1" style={{ animationDelay: ".12s" }}>{children}</div>
      <div className="absolute bottom-6 left-[88px] right-[88px] flex justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-fg-4">
        <span>AquaPrime · Web3Spell Labs</span><span>ETHGlobal Mumbai 2026</span>
      </div>
    </div>
  );
}

const Source = ({ children }: { children: ReactNode }) => <div className="mt-3 font-mono text-[12px] text-fg-4">{children}</div>;

/* ───────────── 01 · cover ───────────── */

function Cover() {
  return (
    <div className="sky relative h-full">
      <div className="absolute inset-x-0 bottom-0 h-[300px]"><Waves tone="deep" className="h-full" /></div>
      <div className="relative flex h-full flex-col px-[88px] pt-[72px]">
        <div className="rise flex items-center gap-3 text-[22px] font-semibold text-fg"><Mark className="h-7 w-7" /> AquaPrime</div>
        <h1 className="rise h-display mt-[88px] text-[132px] leading-[0.9]" style={{ animationDelay: ".08s" }}>
          Your capital<br /><span className="serif text-ocean-deep">never</span> leaves.
        </h1>
        <p className="rise mt-10 max-w-[900px] text-[28px] leading-snug text-fg-2" style={{ animationDelay: ".16s" }}>
          Zero-custody prime credit with surgical liquidations — built on 1inch Aqua &amp; SwapVM, World ID and EF Anon-RPC.
        </p>
        <div className="rise mt-auto flex items-end justify-between pb-[56px] text-white" style={{ animationDelay: ".24s" }}>
          <div className="text-[20px] font-medium drop-shadow">Rythme Nagrani · Web3Spell Labs</div>
          <div className="font-mono text-[13px] uppercase tracking-[0.1em] text-white/85">ETHGlobal Mumbai 2026</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 02 · problem ───────────── */

function Problem() {
  const items = [
    ["$50.2B", "sits locked in DeFi lending pools, earning only when someone borrows. That same dollar can't also make markets or back liquidations.", "DefiLlama · 523 lending protocols · 7 Nov 2026"],
    ["50–100%", "of a position can be sold in a single liquidation under an Aave-style close factor — plus a 5–10% bonus paid to the liquidator.", "Aave v3 parameters: 50% close factor, 100% below HF 0.95"],
    ["150%", "collateral for everyone. A protocol can't tell one person from fifty wallets, so nobody can be offered cheaper credit without KYC.", "Typical over-collateralised lending"],
  ];
  return (
    <Frame n={2} kicker="Problem" title={<>DeFi credit locks capital away — <span className="text-fg-3">and over-punishes borrowers when it breaks.</span></>}>
      <div className="grid h-full grid-cols-3 gap-8">
        {items.map(([big, text, src]) => (
          <div key={big} className="flex flex-col rounded-xl border border-rule bg-bg p-9">
            <div className="num text-[76px] leading-none text-fg">{big}</div>
            <p className="mt-8 text-[21px] leading-relaxed text-fg-2">{text}</p>
            <div className="mt-auto"><Source>{src}</Source></div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ───────────── 03 · solution ───────────── */

function Solution() {
  const rows = [
    [Wallet, "Lend without depositing", "USDC stays in the lender's wallet and backs a credit line, a liquidation backstop and an AMM at the same time through 1inch Aqua. It moves only at the moment someone borrows.", "3× capital efficiency · $0 locked"],
    [Scissors, "Liquidate with a scalpel", "Custom SwapVM opcode 0xf0 computes the exact collateral slice that restores health to 1.02 — and the VM refuses to sell a wei more.", "13–30% sold, not 50–100%"],
    [Fingerprint, "Price the human", "World ID Proof of Human unlocks 115% collateral and a 3-minute grace window. One human, one Prime wallet, bound on-chain — no KYC.", "115% vs 150% collateral"],
  ] as const;
  return (
    <Frame n={3} kicker="Solution" title={<>AquaPrime: prime credit that <span className="serif text-ocean">never</span> takes custody.</>}>
      <div className="flex h-full flex-col divide-y divide-rule border-y border-rule">
        {rows.map(([Icon, t, d, tag], k) => (
          <div key={t} className="grid flex-1 grid-cols-[80px_360px_1fr_360px] items-center gap-8">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-raised text-ocean"><Icon className="h-8 w-8" aria-hidden /></div>
            <div><div className="num text-[14px] text-fg-4">0{k + 1}</div><div className="mt-1 text-[32px] font-medium tracking-[-0.02em] text-fg">{t}</div></div>
            <p className="text-[20px] leading-relaxed text-fg-2">{d}</p>
            <div className="justify-self-end whitespace-nowrap rounded-full border border-ocean/30 bg-ocean/5 px-5 py-2.5 font-mono text-[15px] text-ocean">{tag}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ───────────── 04 · architecture ───────────── */

function Box({ x, y, w, h, title, sub, children, tone = "white" }: { x: number; y: number; w: number; h: number; title: string; sub?: string; children?: ReactNode; tone?: "white" | "ocean" | "deep" }) {
  const cls = tone === "ocean" ? "border-ocean/40 bg-ocean/[0.06]" : tone === "deep" ? "border-ocean-deep bg-ocean-deep text-white" : "border-rule-2 bg-white";
  return (
    <div className={`absolute rounded-xl border p-5 shadow-float ${cls}`} style={{ left: x, top: y, width: w, height: h }}>
      <div className={`text-[20px] font-medium ${tone === "deep" ? "text-white" : "text-fg"}`}>{title}</div>
      {sub && <div className={`mt-1 text-[14px] ${tone === "deep" ? "text-white/75" : "text-fg-3"}`}>{sub}</div>}
      {children}
    </div>
  );
}
const Chip = ({ children, hot }: { children: ReactNode; hot?: boolean }) => (
  <span className={`rounded-full border px-3 py-1 font-mono text-[13px] ${hot ? "border-ocean/50 bg-ocean/10 text-ocean" : "border-rule-2 bg-white text-fg-2"}`}>{children}</span>
);

function Architecture() {
  const arrows: [number, number, number, number, string][] = [
    [330, 75, 470, 75, "approve once"],
    [330, 330, 470, 330, "aqua.pull"],
    [830, 60, 960, 60, "ship"],
    [830, 220, 960, 220, "ship orders"],
    [960, 385, 830, 385, "aqua.push"],
  ];
  return (
    <Frame n={4} kicker="How it works" title={<>One wallet. Three live strategies. <span className="text-fg-3">Zero custody.</span></>}>
      <div className="relative h-[560px] w-[1424px]">
        <svg className="absolute inset-0" width="1424" height="560" aria-hidden>
          <defs><marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#0B7FE8" /></marker></defs>
          {arrows.map(([x1, y1, x2, y2, l]) => (
            <g key={l}>
              <line x1={x1} y1={y1} x2={x2 - 6} y2={y2} stroke="#0B7FE8" strokeWidth="2" strokeDasharray="5 5" markerEnd="url(#ah)" />
              <text x={(x1 + x2) / 2} y={y1 - 10} textAnchor="middle" fontSize="13" fill="#4F6B85" fontFamily="var(--font-mono)">{l}</text>
            </g>
          ))}
        </svg>
        <Box x={0} y={20} w={330} h={110} title="Lender wallet" sub="USDC never leaves it" />
        <Box x={0} y={275} w={330} h={110} title="Borrower wallet" sub="WETH collateral · World ID" />
        <Box x={470} y={0} w={360} h={420} title="1inch Aqua" sub="canonical contract · virtual balances" tone="ocean">
          <div className="mt-6 grid grid-cols-2 gap-2">{["ship", "dock", "pull", "push"].map((m) => <Chip key={m}>aqua.{m}</Chip>)}</div>
          <p className="mt-6 text-[15px] leading-relaxed text-fg-2">Each strategy holds a <em>virtual</em> balance against the same wallet. Tokens move only when a fill happens.</p>
        </Box>
        <Box x={960} y={0} w={464} h={120} title="CreditPositionRegistry" sub="credit lines · collateral · health · tiers"><div className="mt-2 flex gap-2"><Chip>borrow</Chip><Chip>repay</Chip><Chip>verifyHuman</Chip></div></Box>
        <Box x={960} y={150} w={464} h={160} title="AquaPrimeRouter · SwapVM" sub="redeployed engine + our opcodes"><div className="mt-3 flex flex-wrap gap-2"><Chip hot>0xf0 SolvencyDutchGuard</Chip><Chip hot>0xf1 OracleBackstopBid</Chip><Chip>AquaAMM</Chip></div></Box>
        <Box x={960} y={340} w={464} h={90} title="LiquidationExecutor" sub="fill slice → sell to 0xf1 backstop → repay, one tx" />
        <Box x={0} y={460} w={440} h={100} title="Keeper agent  ⟶  Agent Pass" sub="no hot-key spend without a fresh human approval" tone="deep" />
        <Box x={492} y={460} w={440} h={100} title="World ID  ⟶  attester" sub="Proof of Human → EIP-712 → nullifier bound on-chain" tone="deep" />
        <Box x={984} y={460} w={440} h={100} title="EF Anon-RPC" sub="every browser read through the Nox mixnet" tone="deep" />
      </div>
    </Frame>
  );
}

/* ───────────── 05 · engine ───────────── */

function Engine() {
  const steps = [
    ["aqua", "Aqua load", "all collateral on the table"],
    ["0xf0", "SolvencyDutchGuard", "revert if healthy or in grace · cap registers to the slice"],
    ["0x19", "LimitSwap", "stock curve at the Dutch price"],
    ["end", "Post-curve check", "amountOut > cap ⇒ SurgicalCapExceeded"],
  ];
  return (
    <Frame n={5} kicker="The engine" title={<>The rule lives <span className="serif text-ocean">in the bytecode.</span></>}>
      <div className="grid h-full grid-cols-[1.1fr_1fr] gap-12">
        <div className="flex flex-col">
          <div className="label">Surgical slice — collateral the auction may sell</div>
          <div className="mt-5 rounded-xl border border-rule bg-bg px-8 py-9 font-mono text-[34px] leading-tight text-fg">
            x = <span className="text-ocean">(T·R·D − V)(1 − d)</span><br /><span className="pl-[52px]">───────────────</span><br /><span className="pl-[52px] text-fg-2">T·R(1 − d) − (1 + f)</span>
          </div>
          <dl className="mt-8 grid grid-cols-1 gap-y-3 text-[19px]">
            {[["T · target health", "1.02"], ["d · Dutch discount", "1.5% → 6% in 600 s"], ["f · protocol fee", "0.5%"], ["Human grace window", "180 s"]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-rule pb-2"><dt className="text-fg-3">{k}</dt><dd className="num text-fg">{v}</dd></div>
            ))}
          </dl>
        </div>
        <ol className="flex flex-col gap-3">
          {steps.map(([op, name, d]) => (
            <li key={name} className={`flex items-center gap-6 rounded-xl border px-6 py-5 ${op === "0xf0" ? "border-ocean/50 bg-ocean/[0.06]" : "border-rule"}`}>
              <span className={`num w-16 text-[20px] ${op === "0xf0" ? "text-ocean" : "text-fg-3"}`}>{op}</span>
              <span><span className="block text-[22px] font-medium text-fg">{name}</span><span className="text-[16px] text-fg-3">{d}</span></span>
            </li>
          ))}
          <p className="mt-auto text-[18px] leading-relaxed text-fg-2">Not a keeper&apos;s goodwill and not an off-chain bot: <span className="text-fg">every fill</span> runs through the guard, so over-liquidation is impossible by construction.</p>
        </ol>
      </div>
    </Frame>
  );
}

/* ───────────── 06 · proof ───────────── */

function LiveChip() {
  const { data, isError } = useNetwork();
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ok/40 bg-ok/10 px-4 py-1.5 font-mono text-[14px] text-ok">
      <span className="h-2 w-2 animate-blink rounded-full bg-ok" />
      {isError ? "chain unreachable" : data ? `${CHAIN_ID === 31337 ? "local chain" : "Sepolia"} · block #${data.block.toString()} · ${data.slac.toFixed(2)}× SLAC` : "reading chain…"}
    </span>
  );
}

function Proof() {
  const results = [
    ["0.956 → 1.020", "health restored in one transaction"],
    ["2.0 of 10 WETH", "sold — vs ≈ 4.6 under a close-factor liquidation"],
    ["$339 · $91 · $72", "earned by maker · treasury · keeper on $34k of loans, 30 days, one crash"],
    ["0 tokens", "held by protocol contracts at the end"],
  ];
  const c = deployment.contracts;
  return (
    <Frame n={6} kicker="Proof" title={<>It runs. <span className="text-fg-3">On-chain, tested, verified.</span></>}>
      <div className="grid h-full grid-cols-[1.15fr_1fr] gap-12">
        <div>
          <div className="label mb-4">Full-lifecycle integration test</div>
          <div className="grid grid-cols-2 gap-4">
            {results.map(([big, d]) => (
              <div key={big} className="flex min-h-[200px] flex-col justify-between rounded-xl border border-rule bg-bg p-7">
                <div className="num whitespace-nowrap text-[34px] leading-none text-fg">{big}</div>
                <div className="mt-4 text-[17px] leading-snug text-fg-3">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-8"><LiveChip /></div>
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <div className="label mb-3">Test suite</div>
            {[["43", "contract tests, incl. a 40-position property test of the surgical math"], ["19", "frontend unit tests: risk-math parity with chain, SwapVM dissector, approvals"], ["9", "step real-browser E2E: borrow → crash → denied 403 → approved rescue"]].map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-5 border-b border-rule py-3"><span className="num w-14 text-[32px] text-ocean">{k}</span><span className="text-[17px] text-fg-2">{v}</span></div>
            ))}
          </div>
          <div>
            <div className="label mb-3">Live on Sepolia · Sourcify exact match</div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[14px]">
              {[["Registry", c.registry], ["Router", c.router], ["Executor", c.executor]].map(([k, a]) => (
                <div key={k} className="rounded-lg border border-rule px-3 py-2"><div className="text-fg-4">{k}</div><div className="text-fg">{short(a, 4)}</div></div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[12px] text-fg-4">Canonical 1inch Aqua · Circle USDC · Chainlink ETH/USD</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────── 07 · trust ───────────── */

function Trust() {
  return (
    <Frame n={7} kicker="Trust layer" title={<>Humans in the loop. <span className="text-fg-3">Privacy by default.</span></>}>
      <div className="grid h-full grid-cols-2 content-start gap-6">
        <div className="rounded-xl border border-rule p-8">
          <div className="flex items-center gap-3 text-[24px] font-medium text-fg"><Fingerprint className="h-7 w-7 text-ocean" aria-hidden /> World ID</div>
          <ul className="mt-6 space-y-5 text-[18px] leading-relaxed text-fg-2">
            <li><span className="text-fg">Proof of Human (IDKit 4).</span> Verified server-side with the Developer Portal; an EIP-712 attestation binds the nullifier to one wallet on-chain.</li>
            <li><span className="text-fg">Agent Pass step-up.</span> The keeper can&apos;t spend its hot key on someone&apos;s collateral without a fresh human approval: max_age=0, nonce, acr allow-list, single-use, 120 s, one borrower.</li>
            <li><span className="text-fg">Fails safe.</span> Cancelled, expired, replayed or wrong human ⇒ HTTP 403, the transaction is never built.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-rule p-8">
          <div className="flex items-center gap-3 text-[24px] font-medium text-fg"><Eye className="h-7 w-7 text-ocean" aria-hidden /> EF Anon-RPC</div>
          <ul className="mt-6 space-y-5 text-[18px] leading-relaxed text-fg-2">
            <li><span className="text-fg">Every browser read through the Nox mixnet.</span> Balances, health factors and liquidation quotes can&apos;t be linked to the user&apos;s IP — so interest in a liquidation can&apos;t be front-run.</li>
            <li><span className="text-fg">Sandboxed, hash-pinned worker</span> in a null-origin iframe.</li>
            <li><span className="text-fg">Fail-closed</span>, never silently direct — with multi-RPC fallback so a rate-limited endpoint can&apos;t take reads down.</li>
          </ul>
        </div>
        <div className="col-span-2 grid grid-cols-4 gap-4">
          {[["Censorship-resistant", "repay, liquidate and close are permissionless"], ["Open source", "MIT, one-command build, Sourcify-verified"], ["Private", "Anon-RPC reads, no trackers, self-hosted fonts"], ["Secure", "keys stay in wallets · stale oracle halts liquidations"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-raised px-5 py-4"><div className="text-[17px] font-medium text-fg">{k}</div><div className="mt-1 text-[14px] leading-snug text-fg-3">{v}</div></div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ───────────── 08 · business ───────────── */

function Business() {
  return (
    <Frame n={8} kicker="Business" title={<>Revenue from the work, <span className="text-fg-3">not from locking capital.</span></>}>
      <div className="grid h-full grid-cols-3 gap-8">
        <div className="flex flex-col rounded-xl border border-rule p-8">
          <div className="label">Revenue streams</div>
          {[["10%", "reserve factor on borrower interest"], ["0.5%", "protocol fee on seized collateral"], ["0", "capital the protocol has to hold"]].map(([k, v]) => (
            <div key={v} className="mt-6"><div className="num text-[52px] leading-none text-ocean">{k}</div><div className="mt-2 text-[17px] text-fg-2">{v}</div></div>
          ))}
        </div>
        <div className="flex flex-col rounded-xl border border-rule p-8">
          <div className="label">Unit economics (tested)</div>
          <p className="mt-5 text-[17px] leading-relaxed text-fg-3">$34k of loans, 30 days, one ETH crash, full lifecycle on-chain:</p>
          {[["Maker (LP)", "+$339"], ["Treasury", "+$91"], ["Keeper", "+$72"], ["Borrower kept", "8.0 / 10 WETH"]].map(([k, v]) => (
            <div key={k} className="mt-3 flex justify-between border-b border-rule pb-2 text-[19px]"><span className="text-fg-2">{k}</span><span className="num text-fg">{v}</span></div>
          ))}
          <div className="mt-auto rounded-lg bg-bg p-4 text-[15px] leading-relaxed text-fg-3">
            <span className="text-fg">Illustrative:</span> $500M of loans at 8% APR ⇒ $4.0M/yr reserve revenue, before liquidation fees.
          </div>
        </div>
        <div className="flex flex-col rounded-xl border border-rule p-8">
          <div className="label">Market &amp; go-to-market</div>
          <div className="num mt-5 text-[52px] leading-none text-fg">$50.2B</div>
          <div className="mt-2 text-[16px] text-fg-3">DeFi lending TVL · DefiLlama, Nov 2026</div>
          <ol className="mt-6 space-y-4 text-[17px] leading-relaxed text-fg-2">
            <li><span className="text-fg">1 · LPs &amp; market makers</span> — same capital, three jobs.</li>
            <li><span className="text-fg">2 · Verified humans</span> — cheaper credit, no KYC.</li>
            <li><span className="text-fg">3 · Keepers</span> — permissionless, World-bound operators.</li>
          </ol>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────── 09 · roadmap ───────────── */

function Roadmap() {
  const cols: [string, string, string[], boolean?][] = [
    ["Shipped", "Nov 2026", ["Aqua credit lines + 3× SLAC", "Opcodes 0xf0 & 0xf1 on SwapVM", "World ID Prime tier", "Agent Pass approval pipeline", "Anon-RPC reads · Sepolia deploy"], true],
    ["Next 30 days", "", ["Agent Pass on World production", "Health Guardian: the borrower's own agent self-rescues", "Sepolia demo market for live crash demos"]],
    ["Next quarter", "", ["Security audit", "Mainnet beta with capped credit lines", "First LP & market-maker partners"]],
    ["Then", "", ["Human credit score: one nullifier, one history", "Sybil-resistant keeper network", "SLAC auto-allocator · flash-refinance from legacy lenders"]],
  ];
  return (
    <Frame n={9} kicker="Roadmap" title={<>From hackathon to <span className="serif text-ocean">open water.</span></>}>
      <div className="relative grid h-full grid-cols-4 gap-6">
        <div className="absolute left-0 right-0 top-[18px] h-[2px] bg-rule" aria-hidden />
        {cols.map(([t, d, items, done]) => (
          <div key={t} className="relative">
            <span className={`relative z-10 block h-[38px] w-[38px] rounded-full border-4 border-white ${done ? "bg-ok" : "bg-ocean"} shadow-float`} />
            <div className="mt-8 text-[32px] font-medium tracking-[-0.02em] text-fg">{t}</div>
            {d && <div className="font-mono text-[13px] text-fg-4">{d}</div>}
            <ul className="mt-7 space-y-5">
              {items.map((x) => <li key={x} className="flex gap-3 text-[21px] leading-snug text-fg-2"><span className={`mt-2.5 h-2 w-2 shrink-0 rounded-full ${done ? "bg-ok" : "bg-ocean"}`} />{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ───────────── 10 · team & ask ───────────── */

function Team() {
  return (
    <div className="sky relative h-full">
      <div className="absolute inset-x-0 bottom-0 h-[180px]"><Waves tone="deep" className="h-full" /></div>
      <div className="relative flex h-full flex-col px-[88px] pt-[64px]">
        <div className="rise flex items-center justify-between">
          <div className="label !text-[13px]"><span className="text-fg">10</span> <span className="mx-1 text-fg-4">/</span> Team &amp; ask</div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-fg"><Mark className="h-5 w-5" /> AquaPrime</div>
        </div>
        <div className="mt-12 grid grid-cols-[1fr_1.05fr] gap-14">
          <div className="rise card flex items-center gap-10 p-10" style={{ animationDelay: ".08s" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/rythme-nagrani.jpg" alt="Rythme Nagrani" className="h-[210px] w-[210px] shrink-0 rounded-full object-cover ring-4 ring-white shadow-lift" />
            <div>
              <div className="h-display text-[48px] leading-none">Rythme Nagrani</div>
              <div className="mt-3 text-[22px] text-ocean-deep">Co-Founder, Web3Spell Labs</div>
              <p className="mt-5 text-[17px] leading-relaxed text-fg-2">Designed and shipped AquaPrime: the Aqua credit engine, the SwapVM opcodes, the keeper agent, the World ID and Anon-RPC integrations, and this app.</p>
              <a href="https://github.com/rythmern02/treaz" className="mt-5 inline-flex items-center gap-2 font-mono text-[15px] text-fg-2 underline decoration-rule-2 underline-offset-4"><Github className="h-4 w-4" aria-hidden /> github.com/rythmern02/treaz</a>
            </div>
          </div>
          <div className="rise flex flex-col gap-5" style={{ animationDelay: ".16s" }}>
            <h2 className="h-display text-[56px] leading-[1]">Capital that works <span className="serif text-ocean-deep">everywhere</span>, owned by no pool.</h2>
            <div className="grid grid-cols-2 gap-4">
              {[[Layers, "Prize tracks", "1inch Aqua · World ID & Agent Pass · EF Anon-RPC"], [BadgeCheck, "Looking for", "LP & market-maker design partners · audit partner"], [Bot, "Unblock", "World Agent Pass production allow-list"], [ShieldCheck, "Try it", "Open the playground at /app — two minutes, one click"]].map(([Icon, k, v]) => {
                const I = Icon as typeof Layers;
                return (
                  <div key={k as string} className="card p-5">
                    <div className="flex items-center gap-2 text-[16px] font-medium text-fg"><I className="h-4 w-4 text-ocean" aria-hidden /> {k as string}</div>
                    <div className="mt-2 text-[15px] leading-snug text-fg-3">{v as string}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between pb-[44px] text-white">
          <span className="flex items-center gap-2 text-[17px] font-medium drop-shadow"><WavesIcon className="h-5 w-5" aria-hidden /> Your capital never leaves.</span>
          <span className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.1em] text-white/85"><Lock className="h-4 w-4" aria-hidden /> MIT · no trackers</span>
        </div>
      </div>
    </div>
  );
}

export const SLIDES: { title: string; Body: () => JSX.Element }[] = [
  { title: "AquaPrime", Body: Cover },
  { title: "Problem", Body: Problem },
  { title: "Solution", Body: Solution },
  { title: "How it works", Body: Architecture },
  { title: "The engine", Body: Engine },
  { title: "Proof", Body: Proof },
  { title: "Trust layer", Body: Trust },
  { title: "Business", Body: Business },
  { title: "Roadmap", Body: Roadmap },
  { title: "Team & ask", Body: Team },
];
