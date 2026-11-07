import "server-only";
import { HttpError } from "./env";
import { transact, usingRedis } from "./store";

/**
 * Fixed-window, per-client limiter for endpoints that cost the keeper gas or talk to World.
 * With Redis configured (serverless) the buckets are shared by every instance; otherwise they live in memory.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request) {
  // Vercel sets x-real-ip / x-forwarded-for itself; elsewhere trust X-Forwarded-For only behind our own proxy.
  const onVercel = !!process.env.VERCEL;
  const fwd = onVercel || process.env.TRUST_PROXY === "true" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return fwd || req.headers.get("x-real-ip") || "local";
}

const tooMany = (resetAt: number) =>
  new HttpError(429, `Too many requests — retry in ${Math.ceil((resetAt - Date.now()) / 1000)}s`, "rate_limited");

export async function rateLimit(req: Request, scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  if (usingRedis()) {
    const over = await transact((s) => {
      const rl = (s.rl ??= {});
      const b = rl[key];
      if (!b || now > b.resetAt) { rl[key] = { count: 1, resetAt: now + windowMs }; return undefined; }
      return ++b.count > limit ? b.resetAt : undefined;
    });
    if (over) throw tooMany(over);
    return;
  }
  const b = buckets.get(key);
  if (!b || now > b.resetAt) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else if (++b.count > limit) throw tooMany(b.resetAt);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}
