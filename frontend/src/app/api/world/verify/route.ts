import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, WORLD, deployment } from "@/config";
import { registryAbi } from "@/abi/generated";
import { errorResponse, HttpError, requireEnv } from "@/server/env";
import { serverPublicClient } from "@/server/chain";

import { rateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

// One Developer Portal for all environments: the proof's `environment` field selects staging/sandbox/production.
// Override only if World points you at a separate portal host.
const VERIFY_BASE = process.env.WORLD_VERIFY_BASE || "https://developer.world.org";

type ResponseItem = { identifier: string; signal_hash?: string; nullifier?: string };

/**
 * Proof of Human → on-chain Human Prime tier.
 *  1. the proof must commit to the caller's wallet (signal = wallet), so it cannot be replayed
 *  2. the proof is verified with the World Developer Portal (never trusted from the client)
 *  3. we sign an EIP-712 HumanAttestation(wallet, nullifier, deadline) the registry verifies;
 *     the registry permanently binds nullifier → wallet (one human = one Prime wallet)
 */
export async function POST(req: Request) {
  try {
    rateLimit(req, "world-verify", 10, 60000);
    const { wallet, result } = (await req.json()) as {
      wallet?: string;
      result?: { protocol_version?: string; action?: string; environment?: string; responses?: ResponseItem[] };
    };
    if (!wallet || !isAddress(wallet)) throw new HttpError(400, "Invalid wallet", "bad_request");
    if (!result || !Array.isArray(result.responses) || result.responses.length === 0)
      throw new HttpError(400, "Missing IDKit result", "bad_request");
    if (result.action !== WORLD.action) throw new HttpError(400, "Unexpected action", "bad_action");
    if (result.environment !== WORLD.environment) throw new HttpError(400, "Unexpected World ID environment", "bad_environment");

    const walletAddr = getAddress(wallet);
    const expectedSignal = hashSignal(walletAddr.toLowerCase()).toLowerCase();
    for (const r of result.responses) {
      if (!r.signal_hash || BigInt(r.signal_hash) !== BigInt(expectedSignal))
        throw new HttpError(400, "Proof is not bound to this wallet", "signal_mismatch");
    }
    if (!result.responses.some((r) => r.identifier === "proof_of_human" || r.identifier === "orb"))
      throw new HttpError(400, "Proof of Human credential required", "wrong_credential");

    const rpId = requireEnv("WORLD_RP_ID");
    const res = await fetch(`${VERIFY_BASE}/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean; environment?: string; nullifier?: string; code?: string; detail?: string;
      results?: { success: boolean; nullifier?: string }[];
    };
    if (!res.ok || body.success !== true)
      throw new HttpError(400, `World ID verification failed: ${body.detail || body.code || res.status}`, body.code || "verification_failed");
    if (body.environment && body.environment !== WORLD.environment)
      throw new HttpError(400, "Verification environment mismatch", "bad_environment");

    const rawNullifier = body.nullifier || body.results?.find((r) => r.success && r.nullifier)?.nullifier
      || result.responses[0].nullifier;
    if (!rawNullifier) throw new HttpError(502, "Verifier returned no nullifier", "no_nullifier");
    const nullifier = BigInt(rawNullifier); // accepts 0x-hex (v3) and decimal (v4)

    // Sybil gate (also enforced on-chain): this human may already back another wallet.
    const bound = await serverPublicClient().readContract({
      address: deployment.contracts.registry, abi: registryAbi, functionName: "walletOfNullifier", args: [nullifier],
    });
    if (bound !== "0x0000000000000000000000000000000000000000" && bound.toLowerCase() !== walletAddr.toLowerCase())
      throw new HttpError(409, "This World ID is already bound to another AquaPrime wallet", "nullifier_bound");

    const attester = privateKeyToAccount(requireEnv("ATTESTER_PRIVATE_KEY") as Hex);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const signature = await attester.signTypedData({
      domain: { name: "AquaPrime", version: "1", chainId: CHAIN_ID, verifyingContract: deployment.contracts.registry },
      types: { HumanAttestation: [
        { name: "wallet", type: "address" }, { name: "nullifier", type: "uint256" }, { name: "deadline", type: "uint256" },
      ] },
      primaryType: "HumanAttestation",
      message: { wallet: walletAddr, nullifier, deadline },
    });
    return Response.json({ nullifier: nullifier.toString(), deadline: deadline.toString(), signature });
  } catch (e) {
    return errorResponse(e);
  }
}
