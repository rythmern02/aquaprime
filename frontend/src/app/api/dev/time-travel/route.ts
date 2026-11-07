import { CHAIN_ID } from "@/config";
import { errorResponse, HttpError, serverRpcUrl } from "@/server/env";

export const dynamic = "force-dynamic";

/** Local hardhat only: skip the 3-minute human grace window during a live demo. */
export async function POST(req: Request) {
  try {
    if (process.env.ENABLE_DEV_TIME_TRAVEL !== "true" || CHAIN_ID !== 31337)
      throw new HttpError(403, "Time travel is only available on the local hardhat network", "disabled");
    const { seconds } = (await req.json()) as { seconds?: number };
    if (typeof seconds !== "number" || seconds <= 0 || seconds > 3600) throw new HttpError(400, "seconds out of range", "bad_request");
    const rpc = (method: string, params: unknown[]) =>
      fetch(serverRpcUrl(), {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }).then((r) => r.json());
    await rpc("evm_increaseTime", [seconds]);
    await rpc("evm_mine", []);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
