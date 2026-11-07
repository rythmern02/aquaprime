import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/** Approval state machine behind the protected keeper action (no network: attempts are seeded directly). */
const action = { kind: "liquidate" as const, borrower: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", registry: "0xR", executor: "0xE", chainId: 31337 };
let ap: typeof import("@/server/agentpass");
let store: typeof import("@/server/store");

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "aquaprime-ap-")));
  process.env.AGENT_APPROVAL_TTL = "120";
  store = await import("@/server/store");
  ap = await import("@/server/agentpass");
});

async function seed(id: string, patch: Partial<import("@/server/store").ApprovalAttempt>) {
  await store.transact((s) => {
    s.attempts[id] = { id, status: "pending", createdAt: Date.now(), state: `st-${id}`, nonce: "n", codeVerifier: "v", action, ...patch };
  });
}

describe("Agent Pass approvals", () => {
  beforeEach(() => vi.useRealTimers());

  it("rejects unknown / pending / denied approvals with 403", async () => {
    await expect(ap.consumeApproval("nope", action)).rejects.toMatchObject({ status: 403, code: "unknown_approval" });
    await seed("p1", {});
    await expect(ap.consumeApproval("p1", action)).rejects.toMatchObject({ status: 403, code: "not_completed" });
    await seed("d1", { status: "denied", denial: "access_denied" });
    await expect(ap.consumeApproval("d1", action)).rejects.toMatchObject({ status: 403, code: "denied" });
  });

  it("consumes an approved, fresh, matching approval exactly once", async () => {
    await seed("ok", { status: "approved", approvedAt: Date.now(), expiresAt: Date.now() + 60_000 });
    const a = await ap.consumeApproval("ok", action);
    expect(a.status).toBe("used");
    await expect(ap.consumeApproval("ok", action)).rejects.toMatchObject({ status: 403, code: "replayed" });
  });

  it("rejects an expired approval and marks it denied", async () => {
    await seed("old", { status: "approved", approvedAt: Date.now() - 200_000, expiresAt: Date.now() - 1 });
    await expect(ap.consumeApproval("old", action)).rejects.toMatchObject({ status: 403, code: "expired" });
    expect((await ap.attemptStatus("old"))?.status).toBe("denied");
  });

  it("rejects an approval bound to a different borrower or chain", async () => {
    await seed("other", { status: "approved", expiresAt: Date.now() + 60_000 });
    await expect(ap.consumeApproval("other", { ...action, borrower: "0x000000000000000000000000000000000000dEaD" }))
      .rejects.toMatchObject({ status: 403, code: "action_mismatch" });
    await expect(ap.consumeApproval("other", { ...action, chainId: 1 })).rejects.toMatchObject({ code: "action_mismatch" });
  });

  it("callback with error=access_denied records a denial before anything can execute", async () => {
    await seed("c1", { state: "cancel-state" });
    // discovery is never reached on the error path
    const r = await ap.completeApproval(new URLSearchParams({ state: "cancel-state", error: "access_denied", error_description: "user cancelled" }));
    expect(r).toMatchObject({ attemptId: "c1", status: "denied" });
    await expect(ap.consumeApproval("c1", action)).rejects.toMatchObject({ code: "denied" });
  });

  it("status endpoint never exposes PKCE verifier, nonce or state", async () => {
    await seed("s1", {});
    const pub = await ap.attemptStatus("s1");
    expect(pub).not.toHaveProperty("codeVerifier");
    expect(pub).not.toHaveProperty("nonce");
    expect(pub).not.toHaveProperty("state");
  });
});

describe("rate limiter", () => {
  it("allows `limit` calls per window per client, then 429s", async () => {
    const { rateLimit } = await import("@/server/ratelimit");
    const req = new Request("http://x/", { headers: { "x-real-ip": "1.2.3.4" } });
    for (let i = 0; i < 3; i++) await rateLimit(req, "t", 3, 60_000);
    await expect(rateLimit(req, "t", 3, 60_000)).rejects.toThrowError(/Too many requests/);
    // another client is unaffected
    await expect(rateLimit(new Request("http://x/", { headers: { "x-real-ip": "5.6.7.8" } }), "t", 3, 60_000)).resolves.toBeUndefined();
  });
});
