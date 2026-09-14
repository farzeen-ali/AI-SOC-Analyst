import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Best-effort client IP.
 *
 * Trusts `x-forwarded-for` because the app is expected to sit behind a proxy
 * that overwrites it. Falls back to a constant so the rate limiter still has a
 * bucket to work with rather than silently letting requests through.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();

  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    headerList.get("x-real-ip") ??
    headerList.get("cf-connecting-ip") ??
    "unknown"
  );
}

export async function getUserAgent(): Promise<string> {
  const headerList = await headers();
  return headerList.get("user-agent")?.slice(0, 512) ?? "unknown";
}

/**
 * Stable, non-reversible key for user-supplied identifiers.
 *
 * Keeps raw email addresses out of Redis while still giving the lockout and
 * OTP guards a per-account bucket.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Defence-in-depth origin check for Server Actions.
 *
 * Next already rejects cross-origin action invocations, and the Supabase
 * session cookies are `SameSite=Lax` + `HttpOnly`. This adds an explicit third
 * layer so a misconfigured `allowedOrigins` cannot silently open a CSRF hole.
 */
export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const host = headerList.get("host");

  // Same-origin form posts without JS may omit Origin entirely.
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Rejected request: malformed Origin header.");
  }

  if (!host || originHost !== host) {
    throw new Error("Rejected request: cross-origin submission blocked.");
  }
}

/**
 * Route Handler flavour of the origin check.
 *
 * `assertSameOrigin()` throws, which Server Actions surface correctly but a
 * Route Handler turns into an unhandled 500 — a confusing status for what is
 * a deliberate security rejection. This returns the refusal instead, so the
 * caller can answer 403 and stop.
 *
 * Returns `null` when the request is same-origin and should proceed.
 */
export async function guardSameOrigin(): Promise<Response | null> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const host = headerList.get("host");

  // Same-origin navigations and server-to-server calls may omit Origin.
  if (!origin) return null;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return Response.json(
      { error: "Malformed Origin header." },
      { status: 403 }
    );
  }

  if (!host || originHost !== host) {
    return Response.json(
      { error: "Cross-origin request blocked." },
      { status: 403 }
    );
  }

  return null;
}
