import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env, hasSupabase, isProduction } from "@/lib/env";
import type { Database, GuardAIClaims } from "@/lib/types/database";

export interface ProxySession {
  /** Response carrying any refreshed auth cookies. Must be the one returned. */
  response: NextResponse;
  claims: GuardAIClaims | null;
}

/**
 * Refreshes the Supabase session for the incoming request and returns the
 * verified JWT claims.
 *
 * `getClaims()` verifies the token signature locally against the cached JWKS,
 * so this stays cheap enough to run on every request — unlike `getUser()`,
 * which round-trips to the Auth server.
 */
export async function updateSession(
  request: NextRequest
): Promise<ProxySession> {
  let response = NextResponse.next({ request });

  if (!hasSupabase) {
    // Fail closed in production: an auth proxy that cannot verify anything
    // must not quietly wave every request through.
    if (isProduction) {
      throw new Error(
        "Supabase environment is not configured. The route guard cannot verify sessions."
      );
    }
    // In development, serve the public routes so a fresh clone still boots.
    // Protected routes still fail at the DAL, with a message naming the var.
    return { response, claims: null };
  }

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Never let a CDN cache a response that rotates session cookies.
          for (const [key, headerValue] of Object.entries(headers ?? {})) {
            response.headers.set(key, headerValue);
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { response, claims: null };
  }

  const raw = data.claims;

  return {
    response,
    claims: {
      sub: raw.sub,
      email: typeof raw.email === "string" ? raw.email : undefined,
      /*
       * Left `undefined` when the claim is absent rather than defaulted to
       * "user". Absent means the Custom Access Token Hook is not installed,
       * which is not the same statement as "this person is unprivileged" —
       * collapsing the two locks genuine Super Admins out of the console,
       * because the route guard cannot then tell a real denial from a
       * missing claim. Callers decide what to do with `undefined`.
       */
      global_role:
        raw.global_role === "super_admin"
          ? "super_admin"
          : raw.global_role === "user"
            ? "user"
            : undefined,
      workspace_id:
        typeof raw.workspace_id === "string" ? raw.workspace_id : null,
      workspace_role:
        raw.workspace_role === "tenant_admin" || raw.workspace_role === "member"
          ? raw.workspace_role
          : null,
      is_suspended: raw.is_suspended === true,
      aal: typeof raw.aal === "string" ? raw.aal : "aal1",
      has_mfa: raw.has_mfa === true,
    },
  };
}
