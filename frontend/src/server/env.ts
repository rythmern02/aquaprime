import "server-only";

/** Reads a required server env var; throws a clear configuration error when missing. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`Missing server configuration: ${name}`);
  return v;
}

export class ConfigError extends Error {
  status = 503;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ConfigError) return Response.json({ error: e.message, code: "not_configured" }, { status: 503 });
  console.error(e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export const serverRpcUrl = () => process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
