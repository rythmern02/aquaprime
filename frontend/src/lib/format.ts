import { formatUnits } from "viem";

export const fmt = (v: bigint | undefined, decimals: number, dp = 2) => {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const usd = (v?: bigint, dp = 2) => (v === undefined ? "—" : `$${fmt(v, 6, dp)}`);
export const eth = (v?: bigint, dp = 4) => (v === undefined ? "—" : `${fmt(v, 18, dp)} WETH`);
export const hf = (v?: bigint) => {
  if (v === undefined) return "—";
  if (v > 10n ** 30n) return "∞";
  return (Number(v / 10n ** 14n) / 1e4).toFixed(3);
};
export const short = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "—");
export const bps = (v: bigint | number) => `${(Number(v) / 100).toFixed(2)}%`;
