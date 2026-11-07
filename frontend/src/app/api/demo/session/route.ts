import { errorResponse, HttpError } from "@/server/env";
import { endSession, startSession, status, stepSession } from "@/server/demo";
import { rateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // one on-chain transaction per call, well inside the serverless limit

/** Hosted judge demo — see src/server/demo.ts. */
export async function GET() {
  try { return Response.json(await status(), { headers: { "cache-control": "no-store" } }); } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request) {
  try {
    await rateLimit(req, "demo", 40, 60_000);
    const { action, leaseId } = (await req.json()) as { action?: string; leaseId?: string };
    if (action === "start") return Response.json(await startSession(req));
    if (!leaseId) throw new HttpError(400, "leaseId required", "bad_request");
    if (action === "step") return Response.json(await stepSession(leaseId));
    if (action === "end") { await endSession(leaseId); return Response.json({ ok: true }); }
    throw new HttpError(400, "unknown action", "bad_request");
  } catch (e) { return errorResponse(e); }
}
