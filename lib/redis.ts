import "server-only";

import { Redis } from "@upstash/redis";

import { hasUpstash, isProduction } from "@/lib/env";

let client: Redis | null = null;

/**
 * Upstash Redis client, or `null` when Upstash is not configured.
 *
 * Callers must handle `null` by degrading to the in-memory counter store in
 * `lib/security/counters.ts`. That fallback is single-process only and exists
 * so local development works without an Upstash account.
 */
export function getRedis(): Redis | null {
  if (!hasUpstash) {
    if (isProduction) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are required in production: " +
          "rate limiting and brute-force lockout depend on shared Redis state."
      );
    }
    return null;
  }
  client ??= Redis.fromEnv();
  return client;
}
