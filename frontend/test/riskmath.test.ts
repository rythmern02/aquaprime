import { describe, expect, it } from "vitest";
import { healthFactor, legacyLiquidation, simulate, surgicalSlice, ratioOf } from "@/lib/riskmath";

describe("riskmath (browser port of the registry math)", () => {
  it("health factor = collateral value / (debt × ratio)", () => {
    expect(healthFactor(10, 2500, 15000, 1.5)).toBeCloseTo(1.1111, 4);
    expect(healthFactor(10, 2150, 15000, 1.5)).toBeCloseTo(0.9556, 4);
    expect(healthFactor(10, 2000, 0, 1.5)).toBe(Infinity);
  });

  it("matches the on-chain liquidationQuote observed on the local chain (anon, 10 WETH, $15k, ETH $2,150)", () => {
    // registry.liquidationQuote → debtToCover 2,844.836285 USDC, collateralOut 1.343329611616101995 WETH @ 1.50% discount
    const s = surgicalSlice(10, 15000, 2150, ratioOf(false), 150);
    expect(s.debtToCover).toBeCloseTo(2844.836, 1);
    expect(s.collateralOut).toBeCloseTo(1.34333, 4);
  });

  it("restores HF to exactly the 1.02 target", () => {
    for (const [coll, debt, price, human] of [[10, 17000, 1900, true], [10, 16000, 2300, false], [25, 30000, 1700, false]] as const) {
      const r = simulate({ collateral: coll, debt, price, human });
      expect(r.hf).toBeLessThan(1);
      expect(r.hfAfter).toBeCloseTo(1.02, 3);
    }
  });

  it("sells far less collateral than a legacy close-factor liquidation", () => {
    const r = simulate({ collateral: 10, debt: 15000, price: 2150, human: false });
    expect(r.surgical.collateralOut).toBeLessThan(r.legacy.collateralOut / 2);
    expect(r.savedCollateral).toBeGreaterThan(2);
  });

  it("does nothing to a healthy position", () => {
    const r = simulate({ collateral: 10, debt: 10000, price: 2500, human: false });
    expect(r.surgical.debtToCover).toBe(0);
    expect(legacyLiquidation(10, 10000, 2500, r.hf).collateralOut).toBe(0);
  });

  it("caps at all collateral (net of fee) when insolvent", () => {
    const s = surgicalSlice(10, 16000, 900, ratioOf(false), 150);
    expect(s.collateralOut + s.fee).toBeCloseTo(10, 6);
    expect(s.debtToCover).toBeLessThan(16000);
  });

  it("human tier liquidates at a lower price than anonymous", () => {
    const anon = simulate({ collateral: 10, debt: 15000, price: 2500, human: false });
    const human = simulate({ collateral: 10, debt: 15000, price: 2500, human: true });
    expect(human.liqPrice).toBeLessThan(anon.liqPrice);
    expect(human.liqPrice).toBeCloseTo(1725, 0);
  });
});
