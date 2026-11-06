/**
 * Browser port of CreditPositionRegistry's risk math (health factor + 0xf0 surgical slice), in plain
 * floating point for the interactive simulator. The contract (bps fixed-point) is the source of truth;
 * test/riskmath.test.ts checks this port against it.
 */
export interface RiskParams {
  anonRatioBps: number;
  humanRatioBps: number;
  targetHfBps: number;
  startDiscountBps: number;
  maxDiscountBps: number;
  liquidationFeeBps: number;
}

export const DEFAULT_PARAMS: RiskParams = {
  anonRatioBps: 15_000,
  humanRatioBps: 11_500,
  targetHfBps: 10_200,
  startDiscountBps: 150,
  maxDiscountBps: 600,
  liquidationFeeBps: 50,
};

export const ratioOf = (human: boolean, p = DEFAULT_PARAMS) => (human ? p.humanRatioBps : p.anonRatioBps) / 1e4;

export function healthFactor(collateral: number, price: number, debt: number, ratio: number) {
  if (debt <= 0) return Infinity;
  return (collateral * price) / (debt * ratio);
}

/** Exact slice that restores HF to target at discount d (mirror of `_surgicalSlice`). */
export function surgicalSlice(collateral: number, debt: number, price: number, ratio: number, discountBps: number, p = DEFAULT_PARAMS) {
  if (debt <= 0 || collateral <= 0) return { debtToCover: 0, collateralOut: 0, fee: 0 };
  const T = p.targetHfBps / 1e4, d = discountBps / 1e4, f = p.liquidationFeeBps / 1e4;
  const V = collateral * price;
  let x = 0;
  if (T * ratio * debt > V) x = ((T * ratio * debt - V) * (1 - d)) / (T * ratio * (1 - d) - (1 + f));
  x = Math.min(x, debt);
  let out = x / (price * (1 - d));
  const maxOut = collateral / (1 + f);
  if (out > maxOut) { out = maxOut; x = out * price * (1 - d); }
  return { debtToCover: x, collateralOut: out, fee: out * f };
}

/** Aave v3-style baseline: 50% close factor (100% below HF 0.95) at a fixed 5% bonus. */
export function legacyLiquidation(collateral: number, debt: number, price: number, hf: number) {
  if (hf >= 1) return { debtToCover: 0, collateralOut: 0 };
  const closeFactor = hf < 0.95 ? 1 : 0.5;
  const x = debt * closeFactor;
  const out = Math.min(collateral, (x * 1.05) / price);
  return { debtToCover: Math.min(x, (out * price) / 1.05), collateralOut: out };
}

export interface Scenario {
  collateral: number; debt: number; price: number; human: boolean; discountBps?: number;
}

export function simulate(s: Scenario, p = DEFAULT_PARAMS) {
  const ratio = ratioOf(s.human, p);
  const hf = healthFactor(s.collateral, s.price, s.debt, ratio);
  const surgical = hf < 1 ? surgicalSlice(s.collateral, s.debt, s.price, ratio, s.discountBps ?? p.startDiscountBps, p) : { debtToCover: 0, collateralOut: 0, fee: 0 };
  const legacy = legacyLiquidation(s.collateral, s.debt, s.price, hf);
  const collAfter = s.collateral - surgical.collateralOut - surgical.fee;
  const debtAfter = s.debt - surgical.debtToCover;
  const hfAfter = healthFactor(collAfter, s.price, debtAfter, ratio);
  const liqPrice = (s.debt * ratio) / s.collateral; // price at which HF hits 1.0
  return { ratio, hf, surgical, legacy, hfAfter, liqPrice, savedCollateral: Math.max(0, legacy.collateralOut - surgical.collateralOut - surgical.fee) };
}
