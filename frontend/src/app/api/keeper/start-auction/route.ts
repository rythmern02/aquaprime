import { isAddress, type Address } from "viem";
import { errorResponse, HttpError } from "@/server/env";
import { startAuction } from "@/server/keeper";

import { rateLimit } from "@/server/ratelimit";
import { assertLease, demoBorrower, demoEnabled } from "@/server/demo";

export const dynamic = "force-dynamic";

/** Permissionless housekeeping (anyone can call registry.startAuction when HF < 1). */
export async function POST(req: Request) {
  try {
    await rateLimit(req, "start-auction", 10, 60000);
    const { borrower } = (await req.json()) as { borrower?: string };
    if (!borrower || !isAddress(borrower)) throw new HttpError(400, "Invalid borrower", "bad_request");
    if (demoEnabled() && borrower.toLowerCase() === demoBorrower().toLowerCase()) await assertLease(req.headers.get("x-demo-lease"));
    const txHash = await startAuction(borrower as Address);
    return Response.json({ ok: true, txHash });
  } catch (e) {
    return errorResponse(e);
  }
}
