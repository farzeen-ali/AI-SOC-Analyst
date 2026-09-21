import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * GuardAI route guard.
 *
 * Runs before every page render: refreshes the Supabase session, then performs
 * *optimistic* role routing from the verified JWT claims. It is the first line
 * of defence, not the only one — `lib/auth/dal.ts` re-checks against the
 * database inside each protected route, and RLS enforces tenant isolation at
 * the data layer regardless of what happens here.
 */

/** Signed-out visitors may see these. */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/security",
  "/privacy",
  "/terms",
  "/auth-error",
];

/** Auth screens: reachable only while signed out. */
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-otp",
  "/check-email",
];

/** Authenticated, but deliberately reachable at aal1. */
const STEP_UP_ROUTE = "/mfa";

/** Requires any authenticated session. */
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/super-admin"];

/** Requires `global_role = super_admin`. */
const SUPER_ADMIN_PREFIXES = ["/super-admin"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Stops the browser (and any intermediary) from serving a cached authenticated
 * page after sign-out — the "press Back and see the dashboard" problem.
 */
function withNoStore(response: NextResponse): NextResponse {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Supabase's own callback/verify handlers must run untouched.
  if (pathname.startsWith("/auth/")) {
    const { response } = await updateSession(request);
    return withNoStore(response);
  }

  const { response, claims } = await updateSession(request);
  const isSignedIn = Boolean(claims?.sub);

  const isAuthRoute = matches(pathname, AUTH_ROUTES);
  const isProtected = startsWithAny(pathname, PROTECTED_PREFIXES);
  const isSuperAdminRoute = startsWithAny(pathname, SUPER_ADMIN_PREFIXES);
  const isPublic = matches(pathname, PUBLIC_ROUTES);

  // A suspended account keeps a valid token until it expires; cut it off here.
  if (isSignedIn && claims?.is_suspended && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?reason=suspended";
    return withNoStore(NextResponse.redirect(url));
  }

  // /reset-password needs the short-lived recovery session, so it is neither
  // a public route nor one that bounces authenticated users away.
  if (pathname === "/reset-password") {
    if (!isSignedIn) {
      const url = request.nextUrl.clone();
      url.pathname = "/forgot-password";
      url.search = "?reason=expired";
      return withNoStore(NextResponse.redirect(url));
    }
    return withNoStore(response);
  }

  /*
   * Second-factor gate.
   *
   * `has_mfa` says a verified factor exists; `aal` says whether this session
   * has satisfied it. Both are signed claims, so the check costs nothing and
   * cannot be spoofed by the client. Anyone enrolled but still at aal1 is held
   * at /mfa until they step up — this runs before the protected-route check so
   * it also covers /super-admin.
   */
  if (isSignedIn && claims?.has_mfa && claims.aal !== "aal2") {
    // An API caller cannot follow an HTML redirect usefully — answer in the
    // shape it asked for so the client sees a real error instead of parsing
    // a redirect body as JSON.
    if (pathname.startsWith("/api/")) {
      return withNoStore(
        NextResponse.json(
          { error: "Second factor required.", code: "mfa_required" },
          { status: 401 }
        )
      );
    }

    if (pathname !== STEP_UP_ROUTE && (isProtected || isPublic === false)) {
      const url = request.nextUrl.clone();
      url.pathname = STEP_UP_ROUTE;
      url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
      return withNoStore(NextResponse.redirect(url));
    }
    return withNoStore(response);
  }

  // Already at aal2, or no factor enrolled: nothing to do on the step-up page.
  if (pathname === STEP_UP_ROUTE) {
    if (!isSignedIn) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return withNoStore(NextResponse.redirect(url));
    }
    return withNoStore(response);
  }

  if (isProtected && !isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
    return withNoStore(NextResponse.redirect(url));
  }

  if (isSuperAdminRoute && claims?.global_role !== "super_admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "?denied=super-admin";
    return withNoStore(NextResponse.redirect(url));
  }

  if (isAuthRoute && isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname =
      claims?.global_role === "super_admin" ? "/super-admin" : "/dashboard";
    url.search = "";
    return withNoStore(NextResponse.redirect(url));
  }

  return isProtected || !isPublic ? withNoStore(response) : response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Auth guards should
     * see as much of the surface as possible, but must not block CSS or images.
     *
     * `api/jobs` is excluded deliberately: those are queue callbacks with no
     * session cookie, authenticated by Upstash signature inside the route.
     * Running the session refresh on them would be pure overhead.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/jobs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)",
  ],
};
