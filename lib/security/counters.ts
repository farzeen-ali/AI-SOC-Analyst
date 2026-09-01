import "server-only";

import { getRedis } from "@/lib/redis";

/**
 * Expiring counters used by the brute-force lockout and OTP resend guards.
 *
 * Backed by Upstash Redis when configured. Without it, an in-process Map keeps
 * local development working — that fallback resets on reload and is not shared
 * between instances, which is why `getRedis()` throws in production.
 */

interface MemoryEntry {
  value: number;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

function readMemory(key: string): MemoryEntry | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry;
}

/** Increments `key`, setting a TTL on first write. Returns count and TTL. */
export async function incrementWithTtl(
  key: string,
  ttlSeconds: number
): Promise<{ count: number; ttl: number }> {
  const redis = getRedis();

  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSeconds);
      return { count, ttl: ttlSeconds };
    }
    const ttl = await redis.ttl(key);
    // -1 means the key somehow lost its TTL; re-arm it rather than leak state.
    if (ttl < 0) {
      await redis.expire(key, ttlSeconds);
      return { count, ttl: ttlSeconds };
    }
    return { count, ttl };
  }

  const existing = readMemory(key);
  if (!existing) {
    memory.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
    return { count: 1, ttl: ttlSeconds };
  }
  existing.value += 1;
  return {
    count: existing.value,
    ttl: Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / 1000)),
  };
}

/** Reads the current count and remaining TTL without mutating anything. */
export async function peek(
  key: string
): Promise<{ count: number; ttl: number }> {
  const redis = getRedis();

  if (redis) {
    const [count, ttl] = await Promise.all([
      redis.get<number>(key),
      redis.ttl(key),
    ]);
    return { count: count ?? 0, ttl: ttl > 0 ? ttl : 0 };
  }

  const existing = readMemory(key);
  if (!existing) return { count: 0, ttl: 0 };
  return {
    count: existing.value,
    ttl: Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / 1000)),
  };
}

/** Sets a marker key that expires after `ttlSeconds`. */
export async function setFlag(key: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(key, 1, { ex: ttlSeconds });
    return;
  }
  memory.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Remaining TTL for a flag in seconds, or 0 when absent/expired. */
export async function flagTtl(key: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }
  const existing = readMemory(key);
  if (!existing) return 0;
  return Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / 1000));
}

export async function clearKeys(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    if (keys.length > 0) await redis.del(...keys);
    return;
  }
  for (const key of keys) memory.delete(key);
}
