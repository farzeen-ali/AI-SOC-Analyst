import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/auth/audit";
import { homePathForRole } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/security/sanitize";

/**
 * Single landing point for every out-of-band auth return:
 *  - `?code=` — OAuth (Google) and PKCE email links
 *  - `?token_hash=&type=` — email confirmation / magic links
 *
 * On success the session cookies are written and the visitor is routed by
 * role. On failure they land on `/auth-error` with a readable reason rather
 * than a raw Supabase message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "");

  // Provider-side failure (user denied consent, expired link, ...).
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/auth-error?reason=${encodeURIComponent(providerError.slice(0, 200))}`
    );
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/auth-error?reason=missing-code`);
  }

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        type: type ?? "email",
        token_hash: tokenHash as string,
      });

  if (error) {
    console.error("[auth] callback exchange failed", error.message);
    return NextResponse.redirect(
      `${origin}/auth-error?reason=${encodeURIComponent(error.code ?? "exchange-failed")}`
    );
  }

  // A password recovery link must land on the reset screen, not the dashboard.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claims?.is_suspended === true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?reason=suspended`);
  }

  await recordAudit({
    action: code ? "auth.oauth_login" : "auth.login",
    actorId: typeof claims?.sub === "string" ? claims.sub : null,
    workspaceId:
      typeof claims?.workspace_id === "string" ? claims.workspace_id : null,
    metadata: { via: code ? "oauth_or_pkce" : (type ?? "email") },
  });

  const destination =
    next ||
    homePathForRole(
      claims?.global_role === "super_admin" ? "super_admin" : "user"
    );

  return NextResponse.redirect(`${origin}${destination}`);
}
