import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

/**
 * Exercises the serverless store backend against a minimal Upstash-REST-compatible server (GET / SET / the CAS
 * EVAL), with a random delay per command so concurrent transactions genuinely interleave.
 */
let server: http.Server;
const kv = new Map<string, string>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      setTimeout(() => {
        if (req.headers.authorization !== "Bearer test-token") { res.writeHead(401); return res.end(JSON.stringify({ error: "unauthorized" })); }
        const [cmd, ...a] = JSON.parse(body) as string[];
        let result: unknown = null;
        if (cmd === "GET") result = kv.get(a[0]) ?? null;
        else if (cmd === "SET") { kv.set(a[0], a[1]); result = "OK"; }
        else if (cmd === "EVAL") { const [, , key, expected, next] = a; if ((kv.get(key) ?? "") === expected) { kv.set(key, next); result = 1; } else result = 0; }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ result }));
      }, Math.random() * 8);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});
afterAll(() => { server.close(); delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });

describe("Redis-backed store (serverless)", () => {
  it("never loses a concurrent update", async () => {
    const { transact, usingRedis } = await import("@/server/store");
    expect(usingRedis()).toBe(true);
    await Promise.all(Array.from({ length: 25 }, () => transact((s) => { s.proposals.n = { borrower: "x", createdAt: Date.now(), reason: String(Number(s.proposals.n?.reason ?? 0) + 1) }; })));
    const final = await transact((s) => s.proposals.n.reason);
    expect(final).toBe("25");
  });

  it("lets exactly one of many concurrent consumers use a single-use approval", async () => {
    const { transact } = await import("@/server/store");
    await transact((s) => {
      s.attempts.a1 = { id: "a1", status: "approved", createdAt: Date.now(), state: "s", nonce: "n", codeVerifier: "v",
        action: { kind: "liquidate", borrower: "0xb", registry: "0xr", executor: "0xe", chainId: 1 } };
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => transact((s) => {
      if (s.attempts.a1.status !== "approved") return false;
      s.attempts.a1.status = "used";
      return true;
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
