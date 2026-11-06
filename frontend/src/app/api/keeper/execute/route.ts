import { isAddress, type Address } from "viem";
import { CHAIN_ID, deployment } from "@/config";
import { consumeApproval, recordResult } from "@/server/agentpass";
import { errorResponse, HttpError } from "@/server/env";
import { assertExecutable, executeLiquidation } from "@/server/keeper";

import { rateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Protected action: broadcast the surgical liquidation.
 * Order of checks: input → on-chain pre-flight (does NOT burn the approval) → atomic approval
 * consumption (403 on pending / denied / expired / reused / mismatched) → broadcast.
 */
export async function POST(req: Request) {
  try {
    rateLimit(req, "keeper-execute", 20, 60000);
    const { attemptId, borrower } = (await req.json()) as { attemptId?: string; borrower?: string };
    if (!attemptId) throw new HttpError(403, "Human authorization denied: no Agent Pass approval presented", "missing_approval");
    if (!borrower || !isAddress(borrower)) throw new HttpError(400, "Invalid borrower", "bad_request");

    const action = {
      kind: "liquidate" as const,
      borrower,
      registry: deployment.contracts.registry,
      executor: deployment.contracts.executor,
      chainId: CHAIN_ID,
    };

    await assertExecutable(borrower as Address);
    const approval = await consumeApproval(attemptId, action);
    const txHash = await executeLiquidation(borrower as Address);
    await recordResult(attemptId, [txHash]);
    return Response.json({ ok: true, txHash, approvedBy: { iss: approval.identity?.iss, sub: approval.identity?.sub, acr: approval.identity?.acr } });
  } catch (e) {
    return errorResponse(e);
  }
}
