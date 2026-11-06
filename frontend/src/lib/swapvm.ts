import { getAddress, hexToBytes, type Hex } from "viem";

/** Byte-level dissector for SwapVM orders running on AquaPrimeRouter. */
export interface Instruction {
  offset: number;
  opcode: number;
  name: string;
  bank: "control" | "curve" | "fee" | "aquaprime" | "access";
  custom: boolean;
  argsHex: Hex;
  rawHex: Hex;
  decoded: Record<string, string>;
}

const NAMES: Record<number, { name: string; bank: Instruction["bank"] }> = {
  0x0a: { name: "Controls._jump", bank: "control" },
  0x0b: { name: "Controls._jumpIfTokenIn", bank: "control" },
  0x0c: { name: "Controls._jumpIfTokenOut", bank: "control" },
  0x0d: { name: "Controls._deadline", bank: "control" },
  0x0e: { name: "Controls._onlyTakerTokenBalanceNonZero", bank: "control" },
  0x0f: { name: "Controls._onlyTakerTokenBalanceGte", bank: "control" },
  0x10: { name: "Controls._onlyTakerTokenSupplyShareGte", bank: "control" },
  0x11: { name: "XYCSwap._xycSwapXD", bank: "curve" },
  0x12: { name: "XYCConcentrate._xycConcentrateGrowLiquidity2D", bank: "curve" },
  0x13: { name: "Decay._decayXD", bank: "curve" },
  0x14: { name: "Controls._salt", bank: "control" },
  0x15: { name: "Fee._flatFeeAmountInXD", bank: "fee" },
  0x19: { name: "LimitSwap._limitSwap1D", bank: "curve" },
  0x1b: { name: "Fee._protocolFeeAmountInXD", bank: "fee" },
  0x1c: { name: "Fee._aquaProtocolFeeAmountInXD", bank: "fee" },
  0x2f: { name: "Whitelist._whitelistSingleTaker", bank: "access" },
  0xf0: { name: "SolvencyDutchGuard", bank: "aquaprime" },
  0xf1: { name: "OracleBackstopBid", bank: "aquaprime" },
};

const hex = (b: Uint8Array) => ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
const addr = (b: Uint8Array) => getAddress(hex(b));
const uint = (b: Uint8Array) => BigInt(b.length ? hex(b) : "0x0");

function decodeArgs(op: number, a: Uint8Array): Record<string, string> {
  switch (op) {
    case 0xf0: return { registry: addr(a.slice(0, 20)), borrower: addr(a.slice(20, 40)) };
    case 0xf1: return {
      feed: addr(a.slice(0, 20)), baseToken: addr(a.slice(20, 40)),
      discountBps: uint(a.slice(40, 42)).toString(), maxStaleness: `${uint(a.slice(42, 46))}s`,
    };
    case 0x19: return { makerDirectionLt: String(a[0] !== 0) };
    case 0x2f: return { allowedTaker80: hex(a) };
    case 0x14: return { salt: uint(a).toString() };
    case 0x15: return { feeBps: `${Number(uint(a)) / 1e7}%` };
    case 0x0d: return { deadline: uint(a).toString() };
    default: return a.length ? { args: hex(a) } : {};
  }
}

/** Order.data = tokenA(20) | tokenB(20) | hook slices … | program; index3 (traits bits 208..223) marks program start. */
export function splitOrder(traits: bigint | Hex, data: Hex) {
  const t = BigInt(traits);
  const idx = (n: number) => Number((t >> BigInt(160 + 16 * n)) & 0xffffn);
  const bytes = hexToBytes(data);
  const programStart = idx(3);
  return {
    tokenA: addr(bytes.slice(0, 20)),
    tokenB: addr(bytes.slice(20, 40)),
    hooksHex: hex(bytes.slice(40, programStart)),
    program: bytes.slice(programStart),
  };
}

export function disassemble(program: Uint8Array): Instruction[] {
  const out: Instruction[] = [];
  let pc = 0;
  while (pc + 2 <= program.length) {
    const op = program[pc];
    const len = program[pc + 1];
    const args = program.slice(pc + 2, pc + 2 + len);
    const meta = NAMES[op] ?? { name: `unknown_0x${op.toString(16)}`, bank: "control" as const };
    out.push({
      offset: pc,
      opcode: op,
      name: meta.name,
      bank: meta.bank,
      custom: op >= 0xf0,
      argsHex: hex(args),
      rawHex: hex(program.slice(pc, pc + 2 + len)),
      decoded: decodeArgs(op, args),
    });
    pc += 2 + len;
  }
  return out;
}

/** TakerTraits packer (mirror of swap-vm TakerTraitsLib.build for the fields the UI needs). */
export function buildTakerTraits(o: { isExactIn: boolean; isAToB: boolean; useTransferFromAndAquaPush?: boolean }): Hex {
  let flags = 0;
  if (o.isExactIn) flags |= 0x0001;
  if (o.useTransferFromAndAquaPush) flags |= 0x0040;
  if (o.isAToB) flags |= 0x0080;
  return ("0x" + "00".repeat(20) + flags.toString(16).padStart(4, "0")) as Hex;
}
