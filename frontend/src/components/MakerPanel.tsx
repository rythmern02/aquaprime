"use client";
import { useState } from "react";
import { encodeAbiParameters, keccak256, parseUnits, type Address, type Hex } from "viem";
import { deployment } from "@/config";
import { aquaAbi, registryAbi, tokenAbi } from "@/abi/generated";
import { useMaker } from "@/hooks/useProtocol";
import { revertReason, useTx } from "@/hooks/useTx";
import { eth, short, usd } from "@/lib/format";
import { useReads } from "@/app/providers";

const c = deployment.contracts;

function SlacGauge({ slac }: { slac: number }) {
  const pct = Math.min(slac / 4, 1);
  const r = 70, len = Math.PI * r;
  return (
    <svg viewBox="0 0 180 110" className="w-full max-w-[240px]">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stopColor="#3fd6ea" /><stop offset="1" stopColor="#a77bff" />
        </linearGradient>
      </defs>
      <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="#1e2a3d" strokeWidth="14" strokeLinecap="round" />
      <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="url(#g)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${len * pct} ${len}`} style={{ filter: "drop-shadow(0 0 8px rgba(63,214,234,.6))", transition: "stroke-dasharray .6s" }} />
      <text x="90" y="82" textAnchor="middle" className="fill-white font-mono" fontSize="26" fontWeight="700">{slac.toFixed(2)}x</text>
      <text x="90" y="102" textAnchor="middle" className="fill-slate-400" fontSize="9" letterSpacing="2">SLAC</text>
    </svg>
  );
}

export function MakerPanel({ log }: { log: (l: "info" | "ok" | "err", m: string, tx?: string) => void }) {
  const { data, isLoading, error } = useMaker();
  const { send, pending, account } = useTx();
  const { client } = useReads();
  const [amount, setAmount] = useState("25000");
  const [apr, setApr] = useState("8");

  const isMaker = !!account && !!data && account.toLowerCase() === data.maker.toLowerCase();
  const slac = data && data.walletUsdc > 0n ? Number(data.virtualUsdc) / Number(data.walletUsdc) : 0;

  async function dock(appAddr: Address, hash: Hex, tokens: Address[], name: string) {
    try {
      const h = await send(`dock ${name}`, { address: c.aqua, abi: aquaAbi as never, functionName: "dock", args: [appAddr, hash, tokens] });
      log("ok", `aqua.dock(${name}) — virtual liquidity retired, 0 tokens moved`, h);
    } catch (e) { log("err", `dock failed: ${revertReason(e)}`); }
  }

  async function shipCreditLine() {
    if (!account) return log("err", "Connect a wallet to ship a credit line");
    try {
      const amt = parseUnits(amount, 6);
      const aprBps = Math.round(Number(apr) * 100);
      const salt = BigInt(Math.floor(Date.now() / 1000));
      const strategy = encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint32" }, { type: "uint64" }],
        [account, c.usdc, aprBps, salt],
      );
      const current = await client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "allowance", args: [account, c.aqua] });
      const h1 = await send("approve USDC → Aqua", { address: c.usdc, abi: tokenAbi as never, functionName: "approve", args: [c.aqua, current + amt] });
      log("info", "Aqua allowance raised by the shipped amount (funds stay in your wallet)", h1);
      const h2 = await send("aqua.ship", { address: c.aqua, abi: aquaAbi as never, functionName: "ship", args: [c.registry, strategy, [c.usdc], [amt]] });
      log("ok", `aqua.ship credit line ${short(keccak256(strategy))} — ${amount} USDC virtual, 0 transferred`, h2);
      const h3 = await send("registerCreditLine", { address: c.registry, abi: registryAbi as never, functionName: "registerCreditLine", args: [aprBps, salt] });
      log("ok", "Credit line registered with AquaPrime", h3);
    } catch (e) { log("err", `ship failed: ${revertReason(e)}`); }
  }

  return (
    <section className="panel flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="panel-title">01 · Maker · Shared Liquidity</div>
          <h2 className="mt-1 text-lg font-semibold text-white">One wallet, three live strategies</h2>
        </div>
        <span className="chip border-aqua-500/40 text-aqua-300">Custody: user wallet</span>
      </div>

      {error && <p className="text-sm text-rose-400">Read failed: {(error as Error).message}</p>}
      {!deployment.strategies && <p className="text-sm text-amber-300">No strategies seeded. Run <code>npm run seed:localhost</code>.</p>}

      {data && (
        <>
          <div className="grid grid-cols-[auto_1fr] items-center gap-4">
            <SlacGauge slac={slac} />
            <dl>
              <div className="kv"><dt>Maker</dt><dd>{short(data.maker)}</dd></div>
              <div className="kv"><dt>Wallet USDC (real)</dt><dd>{usd(data.walletUsdc, 0)}</dd></div>
              <div className="kv"><dt>Wallet WETH (real)</dt><dd>{eth(data.walletWeth, 2)}</dd></div>
              <div className="kv"><dt>Active quoting power</dt><dd className="!text-aqua-300">{usd(data.virtualUsdc, 0)}</dd></div>
              <div className="kv"><dt>Tokens locked in pools</dt><dd className="!text-emerald-300">$0</dd></div>
            </dl>
          </div>
          <p className="font-mono text-[11px] text-slate-500">
            SLAC = Σ virtual strategy allocations ÷ wallet balance = {usd(data.virtualUsdc, 0)} ÷ {usd(data.walletUsdc, 0)}
          </p>

          <ul className="flex flex-col gap-2">
            {data.strategies.map((s) => (
              <li key={s.key} className="rounded-xl border border-ink-700 bg-ink-850/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className={`h-2 w-2 rounded-full ${s.live ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" : "bg-slate-600"}`} />
                      {s.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{s.desc}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500">app {s.app} · {short(s.hash, 6)}</div>
                  </div>
                  <div className="text-right font-mono text-sm">
                    <div className="text-slate-100">{usd(BigInt(s.usdc), 0)}</div>
                    {BigInt(s.weth) > 0n && <div className="text-xs text-slate-400">{eth(BigInt(s.weth), 3)}</div>}
                    {isMaker && s.live && (
                      <button className="btn-ghost mt-1 !px-2 !py-1 text-xs" disabled={!!pending}
                        onClick={() => dock(s.appAddr, s.hash, s.tokens as Address[], s.name)}>
                        Dock (aqua.dock)
                      </button>
                    )}
                    {!s.live && <div className="text-[11px] text-slate-500">docked</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-dashed border-ink-600 p-3">
            <div className="mb-2 text-xs font-medium text-slate-300">Ship a credit line from <span className="text-aqua-300">your</span> wallet (aqua.ship)</div>
            <div className="grid grid-cols-[1fr_90px_auto] gap-2">
              <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="USDC amount" />
              <input className="input" value={apr} onChange={(e) => setApr(e.target.value)} aria-label="APR %" />
              <button className="btn-primary" disabled={!!pending || !account} onClick={shipCreditLine}>Ship</button>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">USDC amount · APR % — nothing leaves your wallet until a borrower draws.</div>
          </div>
        </>
      )}
      {isLoading && <p className="text-sm text-slate-500">Loading maker state…</p>}
    </section>
  );
}
