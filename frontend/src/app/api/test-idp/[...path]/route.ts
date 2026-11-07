import { authorize, discoveryDoc, jwks, token } from "@/server/testIdp";
import { HttpError } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

const fail = (e: unknown) => e instanceof HttpError
  ? Response.json({ error: e.code, message: e.message }, { status: e.status })
  : (console.error(e), Response.json({ error: "server_error" }, { status: 500 }));

/** Hosted TEST IdP (not World) — see src/server/testIdp.ts. */
export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  try {
    const p = params.path.join("/");
    if (p === ".well-known/openid-configuration") return Response.json(discoveryDoc(), { headers: { "cache-control": "no-store" } });
    if (p === "jwks") return Response.json(await jwks(), { headers: { "cache-control": "no-store" } });
    if (p === "authorize") { await rateLimit(req, "test-idp", 30, 60_000); return await authorize(new URL(req.url)); }
    return Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  try {
    if (params.path.join("/") === "token") return await token(req);
    return Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
