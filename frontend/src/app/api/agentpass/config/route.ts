export const dynamic = "force-dynamic";

/** Public, non-secret view of which identity provider approves keeper actions. */
export async function GET() {
  const issuer = (process.env.WORLD_AUTH_ISSUER || "https://auth.world.org").replace(/\/$/, "");
  const isWorld = /^https:\/\/(sandbox\.)?auth\.world\.org$/.test(issuer);
  return Response.json({
    issuer,
    isWorld,
    label: isWorld ? (issuer.includes("sandbox") ? "World ID Agent Pass (sandbox)" : "World ID Agent Pass") : /\/api\/test-idp$/.test(issuer) ? "Hosted test IdP — NOT World" : "Local test IdP — NOT World",
    configured: !!process.env.WORLD_AUTH_CLIENT_ID && !!(process.env.WORLD_AUTH_CLIENT_SECRET || process.env.WORLD_AUTH_PRIVATE_KEY_JWK),
  });
}
