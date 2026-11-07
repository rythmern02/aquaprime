import { keepPreviousData } from "@tanstack/react-query";
import type { ReadMode } from "./clients";

/**
 * Query policy per read mode. Mixnet reads take ~2–10 s each and an exit node can time out, so in Anon-RPC mode we
 * poll less often, retry with backoff instead of failing a whole query on one slow read, and keep the last values on
 * screen while a refresh is in flight.
 */
export const readPolicy = (mode: ReadMode, directMs = 6000) => ({
  refetchInterval: mode === "anon" ? Math.max(directMs, 15_000) : directMs,
  retry: mode === "anon" ? 4 : 1,
  retryDelay: (n: number) => Math.min(1000 * 2 ** n, 8000),
  placeholderData: mode === "anon" ? keepPreviousData : undefined,
});
