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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = VALID_TYPES.includes(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : "email";

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?reason=link-invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("[auth] confirm failed", error.code, error.message);

    // Expired or already-used links are the common case and are not scary:
    // send them to sign-in with a message they can act on.
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
