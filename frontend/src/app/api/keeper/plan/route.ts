import { isAddress, type Address } from "viem";
import { errorResponse, HttpError } from "@/server/env";
import { planLiquidation } from "@/server/keeper";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const borrower = new URL(req.url).searchParams.get("borrower");
    if (!borrower || !isAddress(borrower)) throw new HttpError(400, "Invalid borrower", "bad_request");
    const p = await planLiquidation(borrower as Address);
    return Response.json(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])));
  } catch (e) {
    return errorResponse(e);
  }
}
