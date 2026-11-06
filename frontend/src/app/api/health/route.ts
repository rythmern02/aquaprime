import { formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, deployment } from "@/config";
import { executorAbi, priceFeedAbi, registryAbi } from "@/abi/generated";
import { serverPublicClient } from "@/server/chain";

export const dynamic = "force-dynamic";

const has = (k: string) => !!process.env[k];

/**
 * Readiness probe. Reports chain reachability, oracle freshness, keeper gas + operator rights,
 * attester match and which integrations are configured. Never returns secret values.
 * 200 when every on-chain dependency the protected action needs is healthy, 503 otherwise.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const pc = serverPublicClient();
  const c = deployment.contracts;
  try {
    const [chainId, round, params, attester] = await Promise.all([
      pc.getChainId(),
      pc.readContract({ address: c.priceFeed, abi: priceFeedAbi, functionName: "latestRoundData" }),
      pc.readContract({ address: c.registry, abi: registryAbi, functionName: "params" }),
      pc.readContract({ address: c.registry, abi: registryAbi, functionName: "humanAttester" }),
    ]);
    checks.chain = { ok: chainId === CHAIN_ID, detail: `chainId ${chainId}` };
    const age = Math.floor(Date.now() / 1000) - Number(round[3]);
    const maxAge = Number(params[9]); // RiskParams.maxPriceStaleness
    checks.oracle = { ok: age <= maxAge, detail: `age ${age}s / max ${maxAge}s` };
    if (has("ATTESTER_PRIVATE_KEY")) {
      const a = privateKeyToAccount(process.env.ATTESTER_PRIVATE_KEY as `0x${string}`).address;
      checks.attester = { ok: a.toLowerCase() === (attester as string).toLowerCase(), detail: a.toLowerCase() === (attester as string).toLowerCase() ? "matches registry" : "does not match registry.humanAttester" };
    } else checks.attester = { ok: false, detail: "ATTESTER_PRIVATE_KEY not set" };
    if (has("KEEPER_PRIVATE_KEY")) {
      const k: Address = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as `0x${string}`).address;
      const [bal, op] = await Promise.all([
        pc.getBalance({ address: k }),
        pc.readContract({ address: c.executor, abi: executorAbi, functionName: "operators", args: [k] }),
      ]);
      checks.keeper = { ok: op && bal > 5n * 10n ** 15n, detail: `${formatEther(bal)} ETH, operator=${op}` };
    } else checks.keeper = { ok: false, detail: "KEEPER_PRIVATE_KEY not set" };
  } catch (e) {
    checks.chain = { ok: false, detail: (e as Error).message.split("\n")[0] };
  }
  checks.strategiesSeeded = { ok: !!deployment.strategies?.backstop, detail: deployment.strategies ? "yes" : "run seed script" };
  const integrations = {
    worldIdKit: has("NEXT_PUBLIC_WORLD_APP_ID") && has("WORLD_RP_ID") && has("WORLD_RP_SIGNING_KEY"),
    agentPass: has("WORLD_AUTH_CLIENT_ID") && (has("WORLD_AUTH_CLIENT_SECRET") || has("WORLD_AUTH_PRIVATE_KEY_JWK")),
    anonRpc: has("NEXT_PUBLIC_ANON_SPECIFIER_ADDRESS"),
    keeperAgentToken: has("KEEPER_API_TOKEN"),
  };
  const ok = Object.values(checks).every((x) => x.ok);
  return Response.json({ ok, chainId: CHAIN_ID, checks, integrations }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
