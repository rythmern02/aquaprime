import "server-only";
import { HttpError } from "./env";

/**
 * Fixed-window, per-client limiter for endpoints that cost the keeper gas or talk to World.
 * In-memory: correct for the single-node deployment this app ships with (Docker volume store);
 * put a shared store (Redis) behind it before running multiple instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request) {
  // Trust the first X-Forwarded-For hop only when behind our own reverse proxy (TRUST_PROXY=true).
  const fwd = process.env.TRUST_PROXY === "true" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return fwd || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(req: Request, scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else if (++b.count > limit) {
    throw new HttpError(429, `Too many requests — retry in ${Math.ceil((b.resetAt - now) / 1000)}s`, "rate_limited");
  }
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}
