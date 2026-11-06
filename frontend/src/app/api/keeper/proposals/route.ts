import crypto from "crypto";
import { isAddress } from "viem";
import { errorResponse, HttpError, requireEnv } from "@/server/env";
import { transact } from "@/server/store";

export const dynamic = "force-dynamic";

/** The autonomous keeper loop (agent/keeper.ts) files proposals here; the console shows them. */
export async function POST(req: Request) {
  try {
    const token = requireEnv("KEEPER_API_TOKEN");
    const given = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const ok = given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) throw new HttpError(401, "Unauthorized", "unauthorized");
    const { borrower, reason } = (await req.json()) as { borrower?: string; reason?: string };
    if (!borrower || !isAddress(borrower)) throw new HttpError(400, "Invalid borrower", "bad_request");
    await transact((s) => {
      s.proposals[borrower.toLowerCase()] = { borrower, createdAt: Date.now(), reason: String(reason || "").slice(0, 200) };
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET() {
  try {
    const proposals = await transact((s) => {
      const cutoff = Date.now() - 3_600_000;
      for (const [k, p] of Object.entries(s.proposals)) if (p.createdAt < cutoff) delete s.proposals[k];
      return Object.values(s.proposals);
    });
    return Response.json({ proposals });
  } catch (e) {
    return errorResponse(e);
  }
}
