import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import { getRedis } from "@/lib/redis";
import { incrementWithTtl } from "@/lib/security/counters";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/**
 * Named rate limit windows. Every auth entry point maps to one of these, and
 * each is applied twice — once keyed by IP, once by workspace or identity —
 * so a single tenant cannot exhaust the budget for everyone behind a NAT.
 */
export const RATE_LIMITS = {
  signup: { tokens: 5, window: "10 m", seconds: 600 },
  login: { tokens: 10, window: "5 m", seconds: 300 },
  otpRequest: { tokens: 3, window: "15 m", seconds: 900 },
  otpVerify: { tokens: 10, window: "15 m", seconds: 900 },
  passwordReset: { tokens: 5, window: "15 m", seconds: 900 },
  mutation: { tokens: 30, window: "1 m", seconds: 60 },
  uploadPrepare: { tokens: 20, window: "10 m", seconds: 600 },
  uploadCommit: { tokens: 20, window: "10 m", seconds: 600 },
  // LLM calls cost real money, so this is tighter than the CRUD limits.
  aiInvestigate: { tokens: 12, window: "5 m", seconds: 300 },
  eventStream: { tokens: 60, window: "5 m", seconds: 300 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

const limiters = new Map<RateLimitName, Ratelimit>();

function getLimiter(name: RateLimitName): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  let limiter = limiters.get(name);
  if (!limiter) {
    const config = RATE_LIMITS[name];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.tokens, config.window),
      prefix: `guardai:rl:${name}`,
      analytics: false,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

/**
 * Consumes one token from `name` for `identifier`.
 *
 * Falls back to the in-memory fixed-window counter when Upstash is absent, so
 * the guard still holds in single-process local development.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[name];
  const limiter = getLimiter(name);

  if (limiter) {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return {
      success,
      limit,
      remaining,
      retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  }

  const key = `guardai:rl:${name}:${identifier}`;
  const { count, ttl } = await incrementWithTtl(key, config.seconds);
  return {
    success: count <= config.tokens,
    limit: config.tokens,
    remaining: Math.max(0, config.tokens - count),
    retryAfter: ttl,
  };
}

/**
 * Applies a limit on both the caller's IP and a logical identity (email,
 * workspace id). Returns the first failure so the caller can surface one
 * message. Identity is hashed by the caller when it is user-supplied.
 */
export async function checkDualRateLimit(
  name: RateLimitName,
  ip: string,
  identity: string
): Promise<RateLimitResult> {
  const [byIp, byIdentity] = await Promise.all([
    checkRateLimit(name, `ip:${ip}`),
    checkRateLimit(name, `id:${identity}`),
  ]);
  return byIp.success ? byIdentity : byIp;
}

/** Human-readable "try again in ..." fragment. */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 0) return "a moment";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
