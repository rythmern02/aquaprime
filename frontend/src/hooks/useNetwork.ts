"use client";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { deployment } from "@/config";
import { aquaAbi, registryAbi, tokenAbi } from "@/abi/generated";
import { useReads } from "@/app/providers";

const c = deployment.contracts;

export interface FeedItem { kind: "borrow" | "repay" | "human" | "auction" | "liquidation" | "credit"; who: Address; amount?: bigint; extra?: bigint; block: bigint; tx: string }

const EVENTS = {
  borrow: parseAbiItem("event Borrowed(address indexed borrower, bytes32 indexed creditLine, uint256 amount)"),
  repay: parseAbiItem("event Repaid(address indexed borrower, address indexed payer, uint256 principal, uint256 interest, uint256 protocolCut)"),
  human: parseAbiItem("event HumanVerified(address indexed wallet, uint256 indexed nullifier)"),
  auction: parseAbiItem("event AuctionStarted(address indexed borrower, bytes32 indexed orderHash, uint64 nonce, uint64 auctionStart, uint256 healthFactor)"),
  liquidation: parseAbiItem("event SurgicalLiquidation(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized, uint256 protocolFee, uint256 healthFactorAfter)"),
  credit: parseAbiItem("event CreditLineRegistered(bytes32 indexed strategyHash, address indexed lender, uint32 aprBps, uint64 salt)"),
};

/** Protocol-wide vitals + recent activity, all read through the (Anon-RPC) read client. */
export function useNetwork() {
  const { client, mode } = useReads();
  return useQuery({
    queryKey: ["network", mode],
    refetchInterval: 8000,
    queryFn: async () => {
      const s = deployment.strategies;
      const [price, interestRev, liqRev, block] = await Promise.all([
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "price" }).catch(() => 0n),
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "totalProtocolInterestRevenue" }),
        client.readContract({ address: c.registry, abi: registryAbi, functionName: "totalProtocolLiquidationRevenue" }),
        client.getBlockNumber(),
      ]);
      let walletUsdc = 0n, virtualUsdc = 0n;
      if (s?.creditLine && s.backstop && s.amm) {
        const raw = (app: Address, hash: `0x${string}`) =>
          client.readContract({ address: c.aqua, abi: aquaAbi, functionName: "rawBalances", args: [s.maker, app, hash, c.usdc] });
        const [w, a, b, m] = await Promise.all([
          client.readContract({ address: c.usdc, abi: tokenAbi, functionName: "balanceOf", args: [s.maker] }),
          raw(c.registry, s.creditLine.hash), raw(c.router, s.backstop.hash), raw(c.router, s.amm.hash),
        ]);
        walletUsdc = w;
        for (const r of [a, b, m]) if (r[1] !== 0 && r[1] !== 0xff) virtualUsdc += BigInt(r[0]);
      }
      const fromBlock = BigInt(deployment.deployBlock ?? 0);
      const span = 45_000n;
      const lo = block > fromBlock + span ? block - span : fromBlock;
      const logs = await Promise.all(Object.entries(EVENTS).map(([kind, event]) =>
        client.getLogs({ address: c.registry, event, fromBlock: lo, toBlock: block }).then((ls) => ls.map((l) => ({ kind, l })))
          .catch(() => [] as { kind: string; l: never }[])));
      const feed: FeedItem[] = logs.flat().map(({ kind, l }) => {
        const a = (l as { args: Record<string, unknown> }).args;
        const who = (a.borrower ?? a.wallet ?? a.lender) as Address;
        const amount = (a.amount ?? a.principal ?? a.debtRepaid ?? a.healthFactor) as bigint | undefined;
        const extra = (a.collateralSeized ?? a.healthFactorAfter) as bigint | undefined;
        return { kind: kind as FeedItem["kind"], who, amount, extra, block: (l as { blockNumber: bigint }).blockNumber, tx: (l as { transactionHash: string }).transactionHash };
      }).sort((x, y) => Number(y.block - x.block)).slice(0, 12);
      const borrowers = new Set(feed.filter((f) => f.kind === "borrow").map((f) => f.who)).size;
      return {
        price, walletUsdc, virtualUsdc, slac: walletUsdc > 0n ? Number(virtualUsdc) / Number(walletUsdc) : 0,
        revenue: { interest: interestRev, liquidationWeth: liqRev }, block, feed, borrowers,
      };
    },
  });
}
