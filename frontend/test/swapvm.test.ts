import { describe, expect, it } from "vitest";
import { buildTakerTraits, disassemble, splitOrder } from "@/lib/swapvm";
import local from "@/config/deployments/31337.json";
import { bps, eth, hf, short, usd } from "@/lib/format";

const d = local as unknown as { strategies: { backstop: { order: { traits: `0x${string}`; data: `0x${string}` } }; amm: { order: { traits: `0x${string}`; data: `0x${string}` } } } };

describe("SwapVM order dissector", () => {
  it("decodes the seeded 0xf1 backstop program exactly", () => {
    const { program, tokenA, tokenB } = splitOrder(d.strategies.backstop.order.traits, d.strategies.backstop.order.data);
    expect(BigInt(tokenA) < BigInt(tokenB)).toBe(true);
    const ins = disassemble(program);
    expect(ins.map((i) => i.opcode)).toEqual([0x2f, 0xf1, 0x19, 0x14]);
    expect(ins[1]).toMatchObject({ name: "OracleBackstopBid", custom: true, bank: "aquaprime" });
    expect(ins[1].decoded.discountBps).toBe("100");
    expect(ins[1].decoded.maxStaleness).toBe("3600s");
  });

  it("decodes stock AquaAMM bytecode with AquaOpcodes indices", () => {
    const { program } = splitOrder(d.strategies.amm.order.traits, d.strategies.amm.order.data);
    const names = disassemble(program).map((i) => i.name);
    expect(names).toContain("XYCSwap._xycSwapXD");
    expect(names).toContain("Fee._flatFeeAmountInXD");
    expect(names.some((n) => n.startsWith("unknown"))).toBe(false);
  });

  it("decodes a 0xf0 guard instruction", () => {
    const registry = "11".repeat(20), borrower = "22".repeat(20);
    const bytes = Uint8Array.from(Buffer.from(`f028${registry}${borrower}190100`, "hex"));
    const [g, l] = disassemble(bytes);
    expect(g.name).toBe("SolvencyDutchGuard");
    expect(g.decoded.registry.toLowerCase()).toBe(`0x${registry}`);
    expect(g.decoded.borrower.toLowerCase()).toBe(`0x${borrower}`);
    expect(l.decoded.makerDirectionLt).toBe("false");
  });

  it("packs taker traits flags like TakerTraitsLib", () => {
    const t = buildTakerTraits({ isExactIn: true, isAToB: true, useTransferFromAndAquaPush: true });
    expect(t.length).toBe(2 + 44);
    expect(t.endsWith("00c1")).toBe(true); // 0x0001 | 0x0040 | 0x0080
    expect(buildTakerTraits({ isExactIn: false, isAToB: false }).endsWith("0000")).toBe(true);
  });
});

describe("formatting", () => {
  it("formats token amounts and health factors", () => {
    expect(usd(1_234_560_000n)).toBe("$1,234.56");
    expect(eth(1_500_000_000_000_000_000n, 2)).toBe("1.50 WETH");
    expect(hf(1_020_000_000_000_000_000n)).toBe("1.020");
    expect(hf(2n ** 255n)).toBe("∞");
    expect(short("0x0123456789abcdef0123456789abcdef01234567")).toBe("0x0123…4567");
    expect(bps(150)).toBe("1.50%");
  });
});
