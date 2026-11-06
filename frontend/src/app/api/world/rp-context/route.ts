import { signRequest } from "@worldcoin/idkit-core/signing";
import { WORLD } from "@/config";
import { errorResponse, requireEnv } from "@/server/env";

export const dynamic = "force-dynamic";

/** RP signature for an IDKit 4.x request. The signing key never leaves the server. */
export async function POST() {
  try {
    const rpId = requireEnv("WORLD_RP_ID");
    const { sig, nonce, createdAt, expiresAt } = signRequest({
      signingKeyHex: requireEnv("WORLD_RP_SIGNING_KEY"),
      action: WORLD.action,
      ttl: 300,
    });
    return Response.json({ rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig });
  } catch (e) {
    return errorResponse(e);
  }
}
