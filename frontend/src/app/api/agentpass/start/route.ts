import { isAddress, type Address } from "viem";
import { CHAIN_ID, deployment } from "@/config";
import { startApproval } from "@/server/agentpass";
import { errorResponse, HttpError } from "@/server/env";
import { planLiquidation } from "@/server/keeper";

import { rateLimit } from "@/server/ratelimit";
import { assertLease, demoBorrower, demoEnabled } from "@/server/demo";

export const dynamic = "force-dynamic";

/** Keeper pauses and requests a fresh human approval (World ID Agent Pass) for one liquidation. */
export async function POST(req: Request) {
  try {
    await rateLimit(req, "agentpass-start", 20, 60000);
    const { borrower } = (await req.json()) as { borrower?: string };
    if (!borrower || !isAddress(borrower)) throw new HttpError(400, "Invalid borrower", "bad_request");
    if (demoEnabled() && borrower.toLowerCase() === demoBorrower().toLowerCase()) await assertLease(req.headers.get("x-demo-lease"));
    const plan = await planLiquidation(borrower as Address);
    const res = await startApproval({
      kind: "liquidate",
      borrower,
      registry: deployment.contracts.registry,
      executor: deployment.contracts.executor,
      chainId: CHAIN_ID,
    });
    return Response.json({
      ...res,
      action: {
        borrower,
        healthFactor: plan.healthFactor.toString(),
        debtToCover: plan.debtToCover.toString(),
        collateralOut: plan.collateralOut.toString(),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
