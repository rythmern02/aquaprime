// SPDX-License-Identifier: MIT
/**
 * End-to-end test of the Agent Pass human checkpoint against the RUNNING Next.js backend.
 *
 * A local OIDC test IdP (discovery, authorize, token, JWKS; RS256) stands in for auth.world.org so the
 * backend's real validation code runs unmodified: PKCE, state, iss, single-use code, RS256 signature,
 * aud, exp, nonce, auth_time freshness, acr allow-list and (iss, sub) operator binding.
 *
 *   1. node scripts/e2e-agentpass.mjs idp            # starts the IdP on :4455
 *   2. start Next with WORLD_AUTH_ISSUER=http://127.0.0.1:4455 WORLD_AUTH_CLIENT_ID=test-client
 *      WORLD_AUTH_CLIENT_SECRET=test-secret
 *   3. node scripts/e2e-agentpass.mjs run <borrower>  # drives approve / cancel / stale / acr / replay
 */
import http from "node:http";
import crypto from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "../frontend/node_modules/jose/dist/node/esm/index.js";

const PORT = 4455;
const ISS = `http://127.0.0.1:${PORT}`;
const APP = process.env.APP_URL || "http://localhost:3000";

async function idp() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-1", alg: "RS256", use: "sig" };
  const codes = new Map();
  let mode = "approve";
  http.createServer(async (req, res) => {
    const url = new URL(req.url, ISS);
    const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/.well-known/openid-configuration")
      return json({ issuer: ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` });
    if (url.pathname === "/jwks") return json({ keys: [jwk] });
    if (url.pathname === "/mode") { mode = url.searchParams.get("m"); return json({ mode }); }
    if (url.pathname === "/authorize") {
      const p = url.searchParams;
      const back = new URL(p.get("redirect_uri"));
      back.searchParams.set("state", p.get("state"));
      back.searchParams.set("iss", ISS);
      if (mode === "cancel") { back.searchParams.set("error", "access_denied"); back.searchParams.set("error_description", "user cancelled"); }
      else {
        const code = crypto.randomBytes(16).toString("hex");
        codes.set(code, { nonce: p.get("nonce"), challenge: p.get("code_challenge"), clientId: p.get("client_id"), mode,
          claims: JSON.parse(p.get("claims") || "{}") });
        back.searchParams.set("code", code);
      }
      res.writeHead(302, { location: back.toString() }); return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      let body = ""; for await (const ch of req) body += ch;
      const p = new URLSearchParams(body);
      const c = codes.get(p.get("code"));
      codes.delete(p.get("code"));                                  // single use
      if (!c) return json({ error: "invalid_grant" }, 400);
      const verifier = crypto.createHash("sha256").update(p.get("code_verifier")).digest("base64url");
      if (verifier !== c.challenge) return json({ error: "invalid_grant", error_description: "pkce" }, 400);
      if (p.get("client_secret") !== "test-secret") return json({ error: "invalid_client" }, 401);
      const now = Math.floor(Date.now() / 1000);
      const acr = c.mode === "wrong-acr" ? "https://world.org/oidc/acr/device" : "https://world.org/oidc/acr/orb-face";
      const authTime = c.mode === "stale" ? now - 3600 : now;
      const sub = c.mode === "other-operator" ? "other-human" : "operator-human-1";
      const id_token = await new SignJWT({ nonce: c.nonce, acr, amr: ["face"], auth_time: authTime })
        .setProtectedHeader({ alg: "RS256", kid: "test-1" }).setIssuer(ISS).setAudience(c.clientId)
        .setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return json({ access_token: "x", token_type: "Bearer", id_token });
    }
    res.writeHead(404); res.end();
  }).listen(PORT, () => console.log(`test IdP on ${ISS}`));
}

async function run(borrower) {
  const post = (path, body) => fetch(APP + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  const setMode = (m) => fetch(`${ISS}/mode?m=${m}`);
  const approve = async () => {
    const s = await post("/api/agentpass/start", { borrower });
    if (s.status !== 200) throw new Error(JSON.stringify(s));
    let r = await fetch(s.body.authorizeUrl, { redirect: "manual" });           // IdP → 302 to callback
    r = await fetch(r.headers.get("location"), { redirect: "manual" });         // backend callback
    const html = await r.text();
    const status = /"status":"(\w+)"/.exec(html)?.[1];
    return { attemptId: s.body.attemptId, status };
  };
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "✔" : "✘"} ${name} — ${detail}`); };

  for (const [mode, expect] of [["cancel", "not_completed|denied"], ["stale", "denied"], ["wrong-acr", "denied"]]) {
    await setMode(mode);
    const a = await approve();
    const e = await post("/api/keeper/execute", { attemptId: a.attemptId, borrower });
    check(`${mode} path blocked`, e.status === 403 && new RegExp(expect).test(e.body.code), `callback=${a.status} → HTTP ${e.status} ${e.body.error}`);
  }

  const pending = await post("/api/agentpass/start", { borrower });
  const ep = await post("/api/keeper/execute", { attemptId: pending.body.attemptId, borrower });
  check("abandoned approval blocked", ep.status === 403 && ep.body.code === "not_completed", `HTTP ${ep.status} ${ep.body.error}`);

  await setMode("approve");
  const ok = await approve();
  const mismatch = await post("/api/keeper/execute", { attemptId: ok.attemptId, borrower: "0x000000000000000000000000000000000000dEaD" });
  check("approval bound to its action", mismatch.status === 403 || mismatch.status === 409, `HTTP ${mismatch.status} ${mismatch.body.error}`);
  const ex = await post("/api/keeper/execute", { attemptId: ok.attemptId, borrower });
  check("approved path executes SwapVM fill", ex.status === 200 && !!ex.body.txHash, `callback=${ok.status} → HTTP ${ex.status} tx=${ex.body.txHash} sub=${ex.body.approvedBy?.sub}`);
  const replay = await post("/api/keeper/execute", { attemptId: ok.attemptId, borrower });
  check("replay blocked", replay.status === 403 || replay.status === 409, `HTTP ${replay.status} ${replay.body.error}`);

  await setMode("other-operator");
  const other = await approve();
  check("different World ID cannot approve (operator binding)", other.status === "denied", `callback=${other.status}`);

  if (results.some((r) => !r)) process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "idp") idp();
else if (cmd === "run") run(arg).catch((e) => { console.error(e); process.exit(1); });
else console.log("usage: idp | run <borrower>");
