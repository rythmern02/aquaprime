import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Tiny durable JSON store for Agent Pass approval attempts and the operator identity binding.
 * All mutations go through `transact`, which serialises writers in-process and writes atomically
 * (tmp file + rename). Suitable for a single keeper node; swap for Postgres/Redis when scaling out.
 */
export interface ApprovalAttempt {
  id: string;
  status: "pending" | "approved" | "denied" | "used";
  createdAt: number;           // ms
  approvedAt?: number;         // ms
  expiresAt?: number;          // ms
  state: string;
  nonce: string;
  codeVerifier: string;
  action: { kind: "liquidate"; borrower: string; registry: string; executor: string; chainId: number };
  identity?: { iss: string; sub: string; acr?: string; amr?: string[]; authTime: number };
  denial?: string;
  result?: { txHashes: string[] };
}

interface StoreShape {
  attempts: Record<string, ApprovalAttempt>;
  operatorBinding?: { iss: string; sub: string; boundAt: number };
  proposals: Record<string, { borrower: string; createdAt: number; reason: string }>;
}

const FILE = path.join(process.cwd(), ".data", "store.json");
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<StoreShape> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return { attempts: {}, proposals: {} };
  }
}

async function save(s: StoreShape) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE);
}

export function transact<T>(fn: (s: StoreShape) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = await load();
    // prune attempts older than 1 day
    const cutoff = Date.now() - 86_400_000;
    for (const [k, a] of Object.entries(s.attempts)) if (a.createdAt < cutoff) delete s.attempts[k];
    const out = await fn(s);
    await save(s);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const read = () => transact((s) => s);
