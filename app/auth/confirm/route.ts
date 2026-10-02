import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/auth/audit";

export const runtime = "nodejs";

const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
];

/**
 * Stateless email-link confirmation.
 *
 * Verifies a `token_hash`, which — unlike the PKCE `?code=` flow — carries no
 * browser-bound verifier. That is the whole point: people routinely open the
 * confirmation email on their phone after signing up on a laptop, and a
 * verifier stored in the *other* browser is exactly what produced the
 * "Unable to sign in" dead end.
 *
 * Point the Supabase email template at this route:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 *
 * Until that template change is made in the Supabase dashboard, the default
 * `{{ .ConfirmationURL }}` link is still active, which routes through
 * Supabase's own verify endpoint and comes back here as a PKCE `?code=`
 * instead of `token_hash`. Handle that case too rather than dead-ending on
 * "link-invalid" — by the time Supabase issued that code it has already
 * verified the address.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const rawType = searchParams.get("type");
  const type = VALID_TYPES.includes(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : "email";

  if (!tokenHash && !code) {
    return NextResponse.redirect(`${origin}/login?reason=link-invalid`);
  }

  const supabase = await createClient();
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    console.error("[auth] confirm failed", error.code, error.message);

    // A failed code exchange typically means the link was opened in a
    // different browser to the one that signed up — the address is already
    // confirmed, they just need to sign in fresh. Only a failed token_hash
    // verification is a genuine invalid/expired link.
    if (code && !tokenHash) {
      return NextResponse.redirect(
        `${origin}/login?confirmed=1&reason=fresh-signin`
      );
    }

    const reason =
      error.code === "otp_expired" || /expired/i.test(error.message)
        ? "link-expired"
        : "link-invalid";

    return NextResponse.redirect(`${origin}/login?reason=${reason}`);
  }

  await recordAudit({
    action: "auth.email_confirmed",
    actorId: data.user?.id ?? null,
    metadata: { type },
  });

  // Recovery and invite need a password set before anything else.
  if (type === "recovery" || type === "invite") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // Signup confirmation: end the just-created session and hand them a clean
  // sign-in, which is what people expect after "confirm your email".
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login?confirmed=1`);
}
