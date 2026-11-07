import { deployment } from "@/config";
import { priceFeedAbi } from "@/abi/generated";
import { errorResponse, HttpError } from "@/server/env";
import { serverPublicClient, walletFromEnv } from "@/server/chain";

import { rateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Market-stress control for OperatorPriceFeed deployments (local fork / stress test).
 * Disabled unless ENABLE_OPERATOR_ORACLE=true AND the deployment uses the operator feed —
 * a Chainlink-backed deployment can never be moved from here.
 */
export async function POST(req: Request) {
  try {
    await rateLimit(req, "oracle", 20, 60000);
    if (process.env.ENABLE_OPERATOR_ORACLE !== "true" || deployment.oracleMode !== "operator")
      throw new HttpError(403, "Operator oracle disabled for this deployment (Chainlink-backed)", "disabled");
    const { price } = (await req.json()) as { price?: number };
    if (typeof price !== "number" || !(price > 10 && price < 1_000_000)) throw new HttpError(400, "price out of range", "bad_request");
    const wallet = walletFromEnv("ORACLE_OPERATOR_PRIVATE_KEY");
    const pc = serverPublicClient();
    const { request } = await pc.simulateContract({
      account: wallet.account, address: deployment.contracts.priceFeed, abi: priceFeedAbi,
      functionName: "setAnswer", args: [BigInt(Math.round(price * 1e8))],
    });
    const hash = await wallet.writeContract(request);
    await pc.waitForTransactionReceipt({ hash });
    return Response.json({ ok: true, txHash: hash });
  } catch (e) {
    return errorResponse(e);
  }
}
