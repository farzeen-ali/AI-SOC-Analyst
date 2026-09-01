import "server-only";

import {
  clearKeys,
  flagTtl,
  incrementWithTtl,
  setFlag,
} from "@/lib/security/counters";
import { hashIdentifier } from "@/lib/security/request";

/** Failed attempts tolerated before the account is locked. */
export const MAX_LOGIN_ATTEMPTS = 5;
/** Lock duration in seconds (15 minutes). */
export const LOCKOUT_SECONDS = 15 * 60;
/** How long a failed-attempt streak is remembered. */
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

const attemptsKey = (email: string) =>
  `guardai:login:attempts:${hashIdentifier(email)}`;
const lockKey = (email: string) => `guardai:login:lock:${hashIdentifier(email)}`;

export interface LockoutState {
  locked: boolean;
  /** Seconds remaining on the lock, 0 when unlocked. */
  retryAfter: number;
  attemptsRemaining: number;
}

/** Checks whether an account is currently locked, without recording anything. */
export async function getLockoutState(email: string): Promise<LockoutState> {
  const ttl = await flagTtl(lockKey(email));
  if (ttl > 0) {
    return { locked: true, retryAfter: ttl, attemptsRemaining: 0 };
  }
  return {
    locked: false,
    retryAfter: 0,
    attemptsRemaining: MAX_LOGIN_ATTEMPTS,
  };
}

/**
 * Records a failed sign-in and locks the account once the threshold is hit.
 *
 * Keyed by email rather than IP so an attacker cannot dodge the lock by
 * rotating addresses. IP-level throttling is handled separately by the
 * `login` rate limit.
 */
export async function recordFailedAttempt(
  email: string
): Promise<LockoutState> {
  const { count } = await incrementWithTtl(
    attemptsKey(email),
    ATTEMPT_WINDOW_SECONDS
  );

  if (count >= MAX_LOGIN_ATTEMPTS) {
    await setFlag(lockKey(email), LOCKOUT_SECONDS);
    await clearKeys(attemptsKey(email));
    return {
      locked: true,
      retryAfter: LOCKOUT_SECONDS,
      attemptsRemaining: 0,
    };
  }

  return {
    locked: false,
    retryAfter: 0,
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - count),
  };
}

/** Clears the streak after a successful sign-in. */
export async function clearFailedAttempts(email: string): Promise<void> {
  await clearKeys(attemptsKey(email), lockKey(email));
}
