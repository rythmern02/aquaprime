import "server-only";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, importJWK, type JWTPayload, type JWK } from "jose";
import { requireEnv, HttpError } from "./env";
import { transact, type ApprovalAttempt } from "./store";

/**
 * World ID Agent Pass — human checkpoint for the keeper agent (OIDC step-up, auth.world.org).
 *
 *   pause agent → authorization-code + PKCE(S256) request with max_age=0 and an essential `acr`
 *   claim → user authenticates in World → callback: state + iss check, single-use code redemption,
 *   ID-token validation (RS256/JWKS, iss, aud, exp, nonce, auth_time freshness, acr allow-list,
 *   (iss, sub) operator binding) → approval recorded bound to the exact action with a short TTL →
 *   /api/keeper/execute consumes it atomically right before broadcasting.
 */

const ISSUER = () => (process.env.WORLD_AUTH_ISSUER || "https://auth.world.org").replace(/\/$/, "");
const CLOCK_SKEW_S = 5;

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discoveryCache: { at: number; doc: Discovery } | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function discovery(): Promise<Discovery> {
  if (discoveryCache && Date.now() - discoveryCache.at < 3_600_000) return discoveryCache.doc;
  const res = await fetch(`${ISSUER()}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) throw new HttpError(502, `OIDC discovery failed (${res.status})`, "discovery_failed");
  const doc = (await res.json()) as Discovery;
  if (doc.issuer !== ISSUER()) throw new HttpError(502, "OIDC issuer mismatch in discovery", "issuer_mismatch");
  discoveryCache = { at: Date.now(), doc };
  jwks = createRemoteJWKSet(new URL(doc.jwks_uri), { cooldownDuration: 30_000, cacheMaxAge: 600_000 });
  return doc;
}

const b64url = (b: Buffer) => b.toString("base64url");
const DEFAULT_ACR = [
  "https://world.org/oidc/acr/orb",
  "https://world.org/oidc/acr/orb-face",
  "https://world.org/oidc/acr/selfie",
  "https://world.org/oidc/acr/selfie-face",
];
/** Fail-closed: unset → verified-human classes only. Set to "*" to deliberately accept any World account. */
const acceptedAcr = () => {
  const raw = process.env.WORLD_AUTH_ACR_VALUES?.trim();
  if (raw === "*") return [];
  if (!raw) return DEFAULT_ACR;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};
export const approvalTtlMs = () => Number(process.env.AGENT_APPROVAL_TTL || 120) * 1000;

export async function startApproval(action: ApprovalAttempt["action"]) {
  const d = await discovery();
  const clientId = requireEnv("WORLD_AUTH_CLIENT_ID");
  const redirectUri = requireEnv("WORLD_AUTH_REDIRECT_URI");

  const id = crypto.randomUUID();
  const state = b64url(crypto.randomBytes(32));
  const nonce = b64url(crypto.randomBytes(32));
  const codeVerifier = b64url(crypto.randomBytes(48));
  const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());

  await transact((s) => {
    s.attempts[id] = { id, status: "pending", createdAt: Date.now(), state, nonce, codeVerifier, action };
  });

  const acr = acceptedAcr();
  const claims = { id_token: { acr: acr.length ? { essential: true, values: acr } : null } };
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    max_age: "0",              // fresh authentication for THIS transaction
    prompt: "login",
    claims: JSON.stringify(claims),
  }).toString();
  return { attemptId: id, authorizeUrl: url.toString() };
}

async function clientAuth(tokenEndpoint: string): Promise<Record<string, string>> {
  const clientId = requireEnv("WORLD_AUTH_CLIENT_ID");
  if (process.env.WORLD_AUTH_PRIVATE_KEY_JWK) {
    const jwk = JSON.parse(process.env.WORLD_AUTH_PRIVATE_KEY_JWK) as JWK;
    const key = await importJWK(jwk, "RS256");
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(clientId)
      .setSubject(clientId)
      .setAudience(tokenEndpoint)
      .setJti(crypto.randomUUID())          // fresh JTI per request
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(key);
    return {
      client_id: clientId,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    };
  }
  return { client_id: clientId, client_secret: requireEnv("WORLD_AUTH_CLIENT_SECRET") };
}

/** Handles the redirect from World. Returns the attempt id and final status. */
export async function completeApproval(params: URLSearchParams) {
  const state = params.get("state");
  if (!state) throw new HttpError(400, "Missing state", "bad_callback");

  const attempt = await transact((s) => Object.values(s.attempts).find((a) => a.state === state));
  if (!attempt) throw new HttpError(400, "Unknown or expired state", "bad_state");
  if (attempt.status !== "pending") throw new HttpError(409, "Attempt already resolved", "replayed");

  const deny = async (reason: string) => {
    await transact((s) => {
      const a = s.attempts[attempt.id];
      if (a && a.status === "pending") { a.status = "denied"; a.denial = reason; }
    });
    return { attemptId: attempt.id, status: "denied" as const, reason };
  };

  // User cancelled / denied / unmet requirements at World: record it BEFORE anything can execute.
  const err = params.get("error");
  if (err) return deny(`${err}${params.get("error_description") ? `: ${params.get("error_description")}` : ""}`);

  const d = await discovery();
  const iss = params.get("iss");
  if (iss && iss !== d.issuer) return deny("issuer_mismatch");
  const code = params.get("code");
  if (!code) return deny("missing_code");

  // single-use code redemption
  const tokenRes = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("WORLD_AUTH_REDIRECT_URI"),
      code_verifier: attempt.codeVerifier,
      ...(await clientAuth(d.token_endpoint)),
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) return deny(`token_exchange_failed_${tokenRes.status}`);
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return deny("missing_id_token");

  let claims: JWTPayload & { nonce?: string; acr?: string; amr?: string[]; auth_time?: number };
  try {
    const { payload } = await jwtVerify(id_token, jwks!, {
      issuer: d.issuer,
      audience: requireEnv("WORLD_AUTH_CLIENT_ID"),
      algorithms: ["RS256"],
      clockTolerance: CLOCK_SKEW_S,
    });
    claims = payload as typeof claims;
  } catch (e) {
    return deny(`id_token_invalid: ${(e as Error).message}`);
  }

  if (claims.nonce !== attempt.nonce) return deny("nonce_mismatch");
  const nowS = Math.floor(Date.now() / 1000);
  const authTime = Number(claims.auth_time);
  if (!Number.isFinite(authTime)) return deny("missing_auth_time");
  // max_age=0: authentication must belong to this attempt, not a reused session
  if (authTime < Math.floor(attempt.createdAt / 1000) - CLOCK_SKEW_S) return deny("stale_authentication");
  if (authTime > nowS + CLOCK_SKEW_S) return deny("auth_time_in_future");
  const acr = acceptedAcr();
  if (acr.length && (!claims.acr || !acr.includes(claims.acr))) return deny(`acr_not_accepted: ${claims.acr ?? "none"}`);
  if (!claims.sub || !claims.iss) return deny("missing_subject");

  return transact((s) => {
    const a = s.attempts[attempt.id];
    if (!a || a.status !== "pending") return { attemptId: attempt.id, status: "denied" as const, reason: "replayed" };
    // (iss, sub) binding: the first approval enrolls the keeper operator; later ones must match.
    const pinned = process.env.KEEPER_OPERATOR_SUB;
    const bound = s.operatorBinding;
    if (pinned && pinned !== claims.sub) { a.status = "denied"; a.denial = "operator_mismatch"; return { attemptId: a.id, status: "denied" as const, reason: a.denial }; }
    if (bound && (bound.iss !== claims.iss || bound.sub !== claims.sub)) {
      a.status = "denied"; a.denial = "operator_mismatch";
      return { attemptId: a.id, status: "denied" as const, reason: a.denial };
    }
    if (!bound) s.operatorBinding = { iss: claims.iss!, sub: claims.sub!, boundAt: Date.now() };
    a.status = "approved";
    a.approvedAt = Date.now();
    a.expiresAt = Date.now() + approvalTtlMs();
    a.identity = { iss: claims.iss!, sub: claims.sub!, acr: claims.acr, amr: claims.amr, authTime };
    return { attemptId: a.id, status: "approved" as const };
  });
}

/**
 * Atomically checks + consumes an approval for exactly this action. Throws 403 on any failure, so
 * the protected action never runs on pending / denied / expired / reused / mismatched approvals.
 */
export async function consumeApproval(attemptId: string, action: ApprovalAttempt["action"]) {
  // Decide inside the transaction, throw outside it — so state changes (expiry → denied) are persisted.
  const out = await transact((s): { ok: true; a: ApprovalAttempt } | { ok: false; err: HttpError } => {
    const deny = (msg: string, code: string) => ({ ok: false as const, err: new HttpError(403, `Human authorization denied: ${msg}`, code) });
    const a = s.attempts[attemptId];
    if (!a) return deny("unknown approval", "unknown_approval");
    if (a.status === "pending") return deny("approval was never completed (cancelled or abandoned)", "not_completed");
    if (a.status === "denied") return deny(String(a.denial), "denied");
    if (a.status === "used") return deny("approval already used", "replayed");
    if (!a.expiresAt || Date.now() > a.expiresAt) {
      a.status = "denied"; a.denial = "expired";
      return deny("approval expired", "expired");
    }
    const same = a.action.kind === action.kind && a.action.chainId === action.chainId &&
      a.action.borrower.toLowerCase() === action.borrower.toLowerCase() &&
      a.action.registry.toLowerCase() === action.registry.toLowerCase() &&
      a.action.executor.toLowerCase() === action.executor.toLowerCase();
    if (!same) return deny("approval is bound to a different action", "action_mismatch");
    a.status = "used";
    return { ok: true, a };
  });
  if (!out.ok) throw out.err;
  return out.a;
}

export async function recordResult(attemptId: string, txHashes: string[]) {
  await transact((s) => { if (s.attempts[attemptId]) s.attempts[attemptId].result = { txHashes }; });
}

export async function attemptStatus(attemptId: string) {
  return transact((s) => {
    const a = s.attempts[attemptId];
    if (!a) return undefined;
    const { codeVerifier: _c, nonce: _n, state: _s, ...pub } = a;
    return pub;
  });
}
