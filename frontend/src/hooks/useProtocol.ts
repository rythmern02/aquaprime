"use client";
import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex, zeroAddress } from "viem";
import { deployment, type Order } from "@/config";
import { aquaAbi, registryAbi, routerAbi, tokenAbi, priceFeedAbi } from "@/abi/generated";
import { useReads } from "@/app/providers";
import { buildTakerTraits } from "@/lib/swapvm";

const c = deployment.contracts;
const DOCKED = 0xff;

export function useMarket() {
  const { client, mode } = useReads();
  return useQuery({
    queryKey: ["market", mode],
    queryFn: async () => {
      const [price, round, block] = await Promise.all([
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "price" }).catch(() => 0n),
        client.readContract({ address: c.priceFeed, abi: priceFeedAbi, functionName: "latestRoundData" }),
        client.getBlock(),
      ]);
      const params = await client.readContract({ address: c.registry, abi: registryAbi, functionName: "params" });
      return { price, updatedAt: round[3], now: block.timestamp, params };
    },
  });
}

export function useMaker() {
  const { client, mode } = useReads();
  const s = deployment.strategies;
  return useQuery({
    queryKey: ["maker", mode],
    enabled: !!s,
    queryFn: async () => {
      const maker = s!.maker;
      const raw = (app: Address, hash: Hex, token: Address) =>
        client.readContract({ address: c.aqua, abi: aquaAbi, functionName: "rawBalances", args: [maker, app, hash, token] });
      const [walletUsdc, walletWeth, credit, backstopUsdc, backstopWeth, ammUsdc, ammWeth, creditCount] = await Promise.all([
        client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "balanceOf", args: [maker] }),
        client.readContract({ address: c.weth, abi: tokenAbi, functionName: "balanceOf", args: [maker] }),
        raw(c.registry, s!.creditLine!.hash, c.usdc),
        raw(c.router, s!.backstop!.hash, c.usdc),
        raw(c.router, s!.backstop!.hash, c.weth),
        raw(c.router, s!.amm!.hash, c.usdc),
        raw(c.router, s!.amm!.hash, c.weth),
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "creditLineCount" }),
      ]);
      const live = (r: readonly [bigint, number]) => r[1] !== 0 && r[1] !== DOCKED;
      const strategies = [
        { key: "credit", name: "Prime Credit Line", app: "CreditPositionRegistry", appAddr: c.registry, hash: s!.creditLine!.hash,
          tokens: [c.usdc], usdc: credit[0], weth: 0n, live: live(credit), desc: `Aqua-pulled loans @ ${s!.creditLine!.aprBps / 100}% APR` },
        { key: "backstop", name: "Liquidation Backstop (0xf1)", app: "AquaPrimeRouter", appAddr: c.router, hash: s!.backstop!.hash,
          tokens: [c.weth, c.usdc], usdc: backstopUsdc[0], weth: backstopWeth[0], live: live(backstopUsdc), desc: `Bids WETH at oracle −${s!.backstop!.discountBps / 100}% for 0xf0 auctions` },
        { key: "amm", name: "XYC AMM (AquaAMM)", app: "AquaPrimeRouter", appAddr: c.router, hash: s!.amm!.hash,
          tokens: s!.amm!.tokens, usdc: ammUsdc[0], weth: ammWeth[0], live: live(ammUsdc), desc: "Stock AquaAMM bytecode, 0.3% fee" },
      ];
      const virtualUsdc = strategies.filter((x) => x.live).reduce((a, x) => a + BigInt(x.usdc), 0n);
      return { maker, walletUsdc, walletWeth, strategies, virtualUsdc, creditCount };
    },
  });
}

export function usePosition(borrower?: Address) {
  const { client, mode } = useReads();
  return useQuery({
    queryKey: ["position", borrower, mode],
    enabled: !!borrower,
    queryFn: async () => {
      const b = borrower!;
      const [pos, quote, wethBal, usdcBal, wethAllow, usdcAllow, nullifier] = await Promise.all([
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "position", args: [b] }),
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "liquidationQuote", args: [b] }),
        client.readContract({ address: c.weth, abi: tokenAbi, functionName: "balanceOf", args: [b] }),
        client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "balanceOf", args: [b] }),
        client.readContract({ address: c.weth, abi: tokenAbi, functionName: "allowance", args: [b, c.registry] }),
        client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "allowance", args: [b, c.registry] }),
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "humanNullifierOf", args: [b] }),
      ]);
      return { pos, quote, wethBal, usdcBal, wethAllow, usdcAllow, nullifier };
    },
  });
}

/** Live SwapVM registers for the borrower's auction: before 0xf0 (Aqua) vs after 0xf0 + curve (router.quote). */
export function useAuctionRegisters(borrower?: Address, active?: boolean) {
  const { client, mode } = useReads();
  return useQuery({
    queryKey: ["registers", borrower, active, mode],
    enabled: !!borrower && !!active,
    queryFn: async () => {
      const b = borrower!;
      const order: Order = await client.readContract({ address: c.registry, abi: registryAbi, functionName: "auctionOrder", args: [b] });
      const hash = await client.readContract({ address: c.router, abi: routerAbi, functionName: "hash", args: [order] });
      const [aquaIn, aquaOut] = await Promise.all([
        client.readContract({ address: c.aqua, abi: aquaAbi, functionName: "rawBalances", args: [c.registry, c.router, hash, c.usdc] }),
        client.readContract({ address: c.aqua, abi: aquaAbi, functionName: "rawBalances", args: [c.registry, c.router, hash, c.weth] }),
      ]);
      const q = await client.readContract({ address: c.registry, abi: registryAbi, functionName: "liquidationQuote", args: [b] });
      let quoted: { amountIn: bigint; amountOut: bigint } | undefined;
      let quoteError: string | undefined;
      if (q.debtToCover > 0n) {
        try {
          const { result } = await client.simulateContract({
            address: c.router, abi: routerAbi, functionName: "quote", account: zeroAddress,
            args: [order, q.debtToCover, buildTakerTraits({ isExactIn: true, isAToB: BigInt(c.usdc) < BigInt(c.weth) })],
          });
          quoted = { amountIn: result[0], amountOut: result[1] };
        } catch (e) {
          const m = (e as Error).message;
          quoteError = /HumanGracePeriodActive/.test(m) ? "HumanGracePeriodActive — 0xf0 reverts the quote"
            : /PositionHealthy/.test(m) ? "PositionHealthy — 0xf0 reverts the quote"
            : /NoActiveAuction/.test(m) ? "NoActiveAuction" : m.split("\n")[0];
        }
      }
      return { order, hash, before: { balanceIn: aquaIn[0], balanceOut: aquaOut[0], amountIn: q.debtToCover }, quote: q, quoted, quoteError };
    },
  });
}
