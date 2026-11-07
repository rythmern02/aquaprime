import "server-only";
import crypto from "crypto";
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT, type JWK, type KeyLike } from "jose";
import { HttpError } from "./env";
import { transact } from "./store";

/**
 * Hosted TEST identity provider — clearly NOT World.
 *
 * World's Developer Portal hasn't allow-listed this app for Agent Pass yet, so the keeper's human checkpoint is
 * exercised against this stand-in. It speaks the same OIDC surface the backend validates for auth.world.org
 * (discovery, JWKS, authorization code + PKCE S256, RS256 ID token with nonce / auth_time / acr), and puts a real
 * human click — Approve or Deny — in front of every approval. Swap WORLD_AUTH_* to auth.world.org and nothing
 * else changes.
 *
 * Env: TEST_IDP_ENABLED=true, WORLD_AUTH_ISSUER=<origin>/api/test-idp, WORLD_AUTH_CLIENT_ID / _SECRET,
 * WORLD_AUTH_REDIRECT_URI, and TEST_IDP_PRIVATE_JWK (a private RS256 JWK; required on serverless so every
 * instance signs with the same key — `node scripts/gen-test-idp-key.mjs` prints one).
 */

export const testIdpEnabled = () => process.env.TEST_IDP_ENABLED === "true";
export const issuer = () => (process.env.WORLD_AUTH_ISSUER || "").replace(/\/$/, "");
const ACR = "https://world.org/oidc/acr/orb-face";
const OPERATOR_SUB = "test-operator-human";
const CODE_TTL_S = 90;

let keys: Promise<{ priv: KeyLike | Uint8Array; pub: JWK }> | undefined;
function signingKeys() {
  keys ??= (async () => {
    const raw = process.env.TEST_IDP_PRIVATE_JWK;
    if (raw) {
      const jwk = JSON.parse(raw) as JWK;
      const { d, p, q, dp, dq, qi, ...pub } = jwk; void d; void p; void q; void dp; void dq; void qi;
      return { priv: await importJWK(jwk, "RS256"), pub: { ...pub, alg: "RS256", use: "sig", kid: jwk.kid || "test-idp-1" } };
    }
    if (process.env.VERCEL) throw new HttpError(500, "TEST_IDP_PRIVATE_JWK must be set on serverless deployments", "test_idp_key_missing");
    const kp = await generateKeyPair("RS256");
    return { priv: kp.privateKey, pub: { ...(await exportJWK(kp.publicKey)), alg: "RS256", use: "sig", kid: "test-idp-ephemeral" } };
  })();
  return keys;
}

function assertEnabled() {
  if (!testIdpEnabled()) throw new HttpError(404, "Not found", "not_found");
  if (!issuer()) throw new HttpError(500, "WORLD_AUTH_ISSUER must point at this test IdP", "misconfigured");
}

export function discoveryDoc() {
  assertEnabled();
  const iss = issuer();
  return { issuer: iss, authorization_endpoint: `${iss}/authorize`, token_endpoint: `${iss}/token`, jwks_uri: `${iss}/jwks`,
    response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["RS256"] };
}

export async function jwks() {
  assertEnabled();
  return { keys: [(await signingKeys()).pub] };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** GET /authorize — shows the human decision page; with `decision=approve|deny` it redirects back with a code. */
export async function authorize(url: URL): Promise<Response> {
  assertEnabled();
  const p = url.searchParams;
  const redirectUri = p.get("redirect_uri") || "";
  // never an open redirect: only this app's own callback
  if (redirectUri !== process.env.WORLD_AUTH_REDIRECT_URI) throw new HttpError(400, "redirect_uri not registered", "bad_redirect");
  if (p.get("client_id") !== process.env.WORLD_AUTH_CLIENT_ID) throw new HttpError(400, "unknown client_id", "bad_client");
  if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge"))
    throw new HttpError(400, "authorization code + PKCE S256 required", "bad_request");

  const decision = p.get("decision");
  if (decision === "approve" || decision === "deny") {
    const back = new URL(redirectUri);
    back.searchParams.set("state", p.get("state") || "");
    back.searchParams.set("iss", issuer());
    if (decision === "deny") {
      back.searchParams.set("error", "access_denied");
      back.searchParams.set("error_description", "The operator declined");
    } else {
      const { priv } = await signingKeys();
      const now = Math.floor(Date.now() / 1000);
      // the code is a short-lived signed grant; redemption is single-use via the store
      const code = await new SignJWT({ typ: "code", nonce: p.get("nonce"), cc: p.get("code_challenge"), cid: p.get("client_id"), ru: redirectUri, at: now })
        .setProtectedHeader({ alg: "RS256" }).setIssuer(issuer()).setAudience(`${issuer()}/token`).setJti(crypto.randomUUID())
        .setIssuedAt().setExpirationTime(now + CODE_TTL_S).sign(priv);
      back.searchParams.set("code", code);
    }
    return Response.redirect(back.toString(), 302);
  }

  const base = new URL(url.toString());
  const link = (d: string) => { const u = new URL(base); u.searchParams.set("decision", d); return esc(u.pathname + u.search); };
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test identity provider — not World</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(#B4E0FC,#F4F9FE);font:15px/1.55 system-ui,-apple-system,sans-serif;color:#06223D">
<main style="max-width:420px;margin:24px;background:#fff;border-radius:20px;padding:28px;box-shadow:0 18px 40px -12px rgba(6,34,61,.25)">
<p style="margin:0 0 14px;display:inline-block;padding:4px 10px;border-radius:999px;background:#FFF4E5;color:#8A5300;font:600 11px/1.4 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase">Test identity provider · not World ID</p>
<h1 style="margin:0 0 8px;font-size:22px;letter-spacing:-.02em">Approve this liquidation?</h1>
<p style="margin:0 0 18px;color:#4F6B85">AquaPrime's keeper agent has paused. It will only spend its key on this borrower's collateral if a human approves <b>right now</b>. Approvals are single-use and expire in 120&nbsp;seconds.</p>
<p style="margin:0 0 22px;font-size:13px;color:#4F6B85">This page stands in for World ID Agent Pass while World allow-lists the app. The server validates it exactly like auth.world.org: PKCE, nonce, <code>max_age=0</code>, <code>auth_time</code>, <code>acr</code> and operator binding.</p>
<div style="display:flex;gap:10px">
<a href="${link("approve")}" style="flex:1;text-align:center;padding:12px;border-radius:999px;background:#06223D;color:#fff;text-decoration:none;font-weight:600">Approve as operator</a>
<a href="${link("deny")}" style="flex:1;text-align:center;padding:12px;border-radius:999px;border:1px solid #BFD5E9;color:#06223D;text-decoration:none;font-weight:600">Deny</a>
</div></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

/** POST /token — redeems a code once, checks PKCE + client secret, returns a signed ID token. */
export async function token(req: Request): Promise<Response> {
  assertEnabled();
  const p = new URLSearchParams(await req.text());
  const err = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (p.get("grant_type") !== "authorization_code") return err("unsupported_grant_type");
  if (p.get("client_id") !== process.env.WORLD_AUTH_CLIENT_ID || p.get("client_secret") !== process.env.WORLD_AUTH_CLIENT_SECRET) return err("invalid_client", 401);
  const { priv, pub } = await signingKeys();
  let c: { nonce?: string; cc?: string; cid?: string; ru?: string; at?: number; jti?: string; exp?: number };
  try {
    const pubKey = await importJWK(pub, "RS256");
    c = (await jwtVerify(p.get("code") || "", pubKey, { issuer: issuer(), audience: `${issuer()}/token`, algorithms: ["RS256"] })).payload as typeof c;
  } catch { return err("invalid_grant"); }
  if (c.cid !== p.get("client_id") || c.ru !== p.get("redirect_uri")) return err("invalid_grant");
  const verifier = crypto.createHash("sha256").update(p.get("code_verifier") || "").digest("base64url");
  if (verifier !== c.cc) return err("invalid_grant");
  const fresh = await transact((s) => {
    const used = (s.idpUsed ??= {});
    if (used[c.jti!]) return false;
    used[c.jti!] = (c.exp ?? 0) * 1000;
    return true;
  });
  if (!fresh) return err("invalid_grant");
  const id_token = await new SignJWT({ nonce: c.nonce, acr: ACR, amr: ["face"], auth_time: c.at })
    .setProtectedHeader({ alg: "RS256", kid: pub.kid }).setIssuer(issuer()).setAudience(process.env.WORLD_AUTH_CLIENT_ID!)
    .setSubject(OPERATOR_SUB).setIssuedAt().setExpirationTime("5m").sign(priv);
  return Response.json({ access_token: crypto.randomBytes(16).toString("hex"), token_type: "Bearer", id_token }, { headers: { "cache-control": "no-store" } });
}
