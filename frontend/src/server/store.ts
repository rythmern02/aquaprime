import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Durable state for Agent Pass approval attempts, the operator identity binding, keeper proposals, the hosted
 * demo's session lease/quotas and the test IdP's one-time codes.
 *
 * Every mutation goes through `transact(fn)`: load the whole document, let `fn` mutate it, write it back.
 *  - Local / single node: a JSON file, writers serialised in-process, atomic tmp-file + rename.
 *  - Serverless (Vercel): Redis over Upstash's REST API (KV_REST_API_* or UPSTASH_REDIS_REST_*). The write is a
 *    Lua compare-and-set against the exact document that was read, retried on conflict — so two instances can
 *    never both consume the same single-use approval.
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

export interface StoreShape {
  attempts: Record<string, ApprovalAttempt>;
  operatorBinding?: { iss: string; sub: string; boundAt: number };
  proposals: Record<string, { borrower: string; createdAt: number; reason: string }>;
  /** hosted demo: one live session at a time + daily quotas */
  demo?: { lease?: { id: string; until: number; borrower: string }; day?: string; total?: number; perClient?: Record<string, number> };
  /** test IdP: authorization codes already redeemed (single use), keyed by code id → expiry ms */
  idpUsed?: Record<string, number>;
  /** fixed-window rate-limit buckets */
  rl?: Record<string, { count: number; resetAt: number }>;
}

const empty = (): StoreShape => ({ attempts: {}, proposals: {} });

function prune(s: StoreShape) {
  const now = Date.now();
  const cutoff = now - 86_400_000; // attempts older than a day
  for (const [k, a] of Object.entries(s.attempts)) if (a.createdAt < cutoff) delete s.attempts[k];
  for (const [k, exp] of Object.entries(s.idpUsed ?? {})) if (exp < now) delete s.idpUsed![k];
  for (const [k, b] of Object.entries(s.rl ?? {})) if (b.resetAt < now) delete s.rl![k];
}

/* ───────────── Redis (Upstash REST) backend ───────────── */

const REDIS_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = () => `aquaprime:store:${process.env.NEXT_PUBLIC_CHAIN_ID || "local"}:${process.env.NEXT_PUBLIC_MARKET || "main"}`;
export const usingRedis = () => !!(REDIS_URL() && REDIS_TOKEN());

async function redis<T>(cmd: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL()!, {
    method: "POST", cache: "no-store",
    headers: { authorization: `Bearer ${REDIS_TOKEN()}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || j.error) throw new Error(`Redis: ${j.error ?? res.status}`);
  return j.result as T;
}

// SET only if the stored document is still exactly what we read ("" = key absent).
const CAS = `local cur = redis.call('GET', KEYS[1]) or ''
if cur == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end
return 0`;

async function transactRedis<T>(fn: (s: StoreShape) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = (await redis<string | null>(["GET", KEY()])) ?? "";
    const s: StoreShape = raw ? JSON.parse(raw) : empty();
    prune(s);
    const out = await fn(s);
    const next = JSON.stringify(s);
    if (next === raw) return out;
    if ((await redis<number>(["EVAL", CAS, 1, KEY(), raw, next])) === 1) return out;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("Store busy — please retry");
}

/* ───────────── file backend ───────────── */

const FILE = path.join(process.cwd(), ".data", "store.json");
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<StoreShape> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return empty(); }
}

async function save(s: StoreShape) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE);
}

function transactFile<T>(fn: (s: StoreShape) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = await load();
    prune(s);
    const out = await fn(s);
    await save(s);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function transact<T>(fn: (s: StoreShape) => T | Promise<T>): Promise<T> {
  return usingRedis() ? transactRedis(fn) : transactFile(fn);
}

export const read = () => transact((s) => s);
