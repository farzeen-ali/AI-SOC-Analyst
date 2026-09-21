"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/auth/audit";
import { getSessionContext, homePathForRole } from "@/lib/auth/dal";
import {
  actionError,
  actionSuccess,
  fromZodError,
  type AuthActionState,
} from "@/lib/auth/action-state";
import {
  clearFailedAttempts,
  getLockoutState,
  MAX_LOGIN_ATTEMPTS,
  recordFailedAttempt,
} from "@/lib/security/lockout";
import {
  checkDualRateLimit,
  formatRetryAfter,
} from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  getClientIp,
  hashIdentifier,
} from "@/lib/security/request";
import {
  sanitizeDigits,
  sanitizeEmail,
  sanitizeText,
  safeRedirectPath,
} from "@/lib/security/sanitize";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyOtpSchema,
} from "@/lib/validations/auth";

/**
 * Auth Server Actions.
 *
 * Every action re-validates on the server with the same Zod schemas the client
 * uses, checks its own rate limit, and never trusts a value that arrived in the
 * form body. Failure messages are deliberately uniform where they would
 * otherwise reveal whether an account exists.
 */

const GENERIC_FAILURE =
  "Something went wrong on our end. Please try again in a moment.";

/** Marks the Supabase auth cookies as browser-session cookies. */
async function downgradeToSessionCookies() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;
    cookieStore.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // No maxAge/expires: the cookie dies when the browser closes.
    });
  }
}

/** Removes every Supabase auth cookie from the response. */
async function clearAuthCookies() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.delete(cookie.name);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Sign up
 * ------------------------------------------------------------------ */

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await assertSameOrigin();

  const parsed = signUpSchema.safeParse({
    fullName: sanitizeText(formData.get("fullName"), 80),
    email: sanitizeEmail(formData.get("email")),
    workspaceName: sanitizeText(formData.get("workspaceName"), 60),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const { fullName, email, workspaceName, password } = parsed.data;
  const ip = await getClientIp();

  const limit = await checkDualRateLimit("signup", ip, hashIdentifier(email));
  if (!limit.success) {
    await recordAudit({
      action: "auth.rate_limited",
      metadata: { flow: "signup" },
    });
    return actionError(
      `Too many sign-up attempts. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      { retryAfter: limit.retryAfter }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Consumed by the on_auth_user_created trigger, which provisions the
      // workspace and the tenant_admin membership.
      data: { full_name: fullName, workspace_name: workspaceName },
      // Stateless confirmation: no PKCE verifier, so the link works even
      // when the email is opened on a different device.
      emailRedirectTo: `${env.siteUrl}/auth/confirm?type=signup`,
    },
  });

  if (error) {
    // Supabase returns this when the address is already registered and
    // confirmations are on; surfacing it verbatim would enumerate accounts.
    if (error.code === "user_already_exists" || error.status === 422) {
      return actionSuccess(
        "Check your inbox — if that address is new to GuardAI, a confirmation link is on its way.",
        { email }
      );
    }
    console.error("[auth] signUp failed", error.message);
    return actionError(error.message || GENERIC_FAILURE);
  }

  await recordAudit({
    action: "auth.signup",
    actorId: data.user?.id ?? null,
    metadata: { workspace_name: workspaceName },
  });

  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

/* ------------------------------------------------------------------ *
 *  Login
 * ------------------------------------------------------------------ */

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await assertSameOrigin();

  const parsed = loginSchema.safeParse({
    email: sanitizeEmail(formData.get("email")),
    password: String(formData.get("password") ?? ""),
    rememberMe: formData.get("rememberMe") === "on",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const { email, password, rememberMe } = parsed.data;
  const redirectTo = safeRedirectPath(formData.get("redirectTo"), "");
  const ip = await getClientIp();

  // 1. Account lock takes precedence — checked before any credential work.
  const lock = await getLockoutState(email);
  if (lock.locked) {
    return actionError(
      `Too many failed attempts. This account is locked for ${formatRetryAfter(lock.retryAfter)}.`,
      { retryAfter: lock.retryAfter }
    );
  }

  // 2. Coarse throttle on the IP and the address.
  const limit = await checkDualRateLimit("login", ip, hashIdentifier(email));
  if (!limit.success) {
    await recordAudit({
      action: "auth.rate_limited",
      metadata: { flow: "login" },
    });
    return actionError(
      `Too many requests. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      { retryAfter: limit.retryAfter }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    const state = await recordFailedAttempt(email);

    await recordAudit({
      action: state.locked ? "auth.locked_out" : "auth.login_failed",
      metadata: { email_hash: hashIdentifier(email) },
    });

    if (state.locked) {
      return actionError(
        `That was ${MAX_LOGIN_ATTEMPTS} failed attempts. This account is locked for ${formatRetryAfter(state.retryAfter)}.`,
        { retryAfter: state.retryAfter }
      );
    }

    return actionError(
      `Incorrect email or password. ${state.attemptsRemaining} attempt${
        state.attemptsRemaining === 1 ? "" : "s"
      } remaining before the account is locked.`
    );
  }

  await clearFailedAttempts(email);

  if (!rememberMe) await downgradeToSessionCookies();

  // Read the freshly minted claims to decide where this role lands.
  const { data: claimsData } = await supabase.auth.getClaims();
  const globalRole =
    claimsData?.claims?.global_role === "super_admin" ? "super_admin" : "user";
  const isSuspended = claimsData?.claims?.is_suspended === true;

  if (isSuspended) {
    await supabase.auth.signOut();
    await clearAuthCookies();
    return actionError(
      "This account has been suspended. Contact your workspace administrator."
    );
  }

  await recordAudit({
    action: "auth.login",
    actorId: data.user.id,
    workspaceId:
      typeof claimsData?.claims?.workspace_id === "string"
        ? claimsData.claims.workspace_id
        : null,
    metadata: { remember_me: rememberMe },
  });

  revalidatePath("/", "layout");
  redirect(redirectTo || homePathForRole(globalRole));
}

/* ------------------------------------------------------------------ *
 *  Logout
 * ------------------------------------------------------------------ */

/**
 * Terminates the session everywhere.
 *
 * `scope: "global"` revokes the refresh token server-side so the JWT cannot be
 * traded for a new one. The cookie sweep, cache revalidation, and redirect
 * then make the browser's cached `/dashboard` render unreachable.
 */
export async function logoutAction(): Promise<void> {
  const session = await getSessionContext();
  const supabase = await createClient();

  await supabase.auth.signOut({ scope: "global" });
  await clearAuthCookies();

  if (session) {
    await recordAudit({
      action: "auth.logout",
      actorId: session.userId,
      workspaceId: session.claims.workspace_id ?? null,
    });
  }

  revalidatePath("/", "layout");
  redirect("/login?signedOut=1");
}

/* ------------------------------------------------------------------ *
 *  Forgot password — request a 6-digit OTP
 * ------------------------------------------------------------------ */

export async function requestPasswordOtpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await assertSameOrigin();

  const parsed = forgotPasswordSchema.safeParse({
    email: sanitizeEmail(formData.get("email")),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const { email } = parsed.data;
  const ip = await getClientIp();

  // Max 3 codes per 15 minutes, per address and per IP.
  const limit = await checkDualRateLimit(
    "otpRequest",
    ip,
    hashIdentifier(email)
  );
  if (!limit.success) {
    await recordAudit({
      action: "auth.rate_limited",
      metadata: { flow: "otp_request" },
    });
    return actionError(
      `You have requested too many codes. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      { retryAfter: limit.retryAfter, email }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  // Never branch the response on whether the account exists.
  if (error) console.error("[auth] resetPasswordForEmail", error.message);

  await recordAudit({
    action: "auth.otp_requested",
    metadata: { email_hash: hashIdentifier(email) },
  });

  return actionSuccess(
    "If that address belongs to a GuardAI account, a 6-digit code is on its way.",
    { email }
  );
}

/* ------------------------------------------------------------------ *
 *  Verify the OTP
 * ------------------------------------------------------------------ */

export async function verifyOtpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await assertSameOrigin();

  const parsed = verifyOtpSchema.safeParse({
    email: sanitizeEmail(formData.get("email")),
    token: sanitizeDigits(formData.get("token")),
  });

  if (!parsed.success) return fromZodError(parsed.error, "Enter a valid code.");

  const { email, token } = parsed.data;
  const ip = await getClientIp();

  const limit = await checkDualRateLimit(
    "otpVerify",
    ip,
    hashIdentifier(email)
  );
  if (!limit.success) {
    return actionError(
      `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      { retryAfter: limit.retryAfter, email }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });

  if (error || !data.user) {
    return actionError(
      "That code is incorrect or has expired. Request a new one to continue.",
      { email }
    );
  }

  await recordAudit({
    action: "auth.otp_verified",
    actorId: data.user.id,
  });

  redirect("/reset-password");
}

/* ------------------------------------------------------------------ *
 *  Set a new password
 * ------------------------------------------------------------------ */

export async function resetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await assertSameOrigin();

  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  // Only reachable with the recovery session minted by verifyOtpAction.
  const session = await getSessionContext();
  if (!session) {
    return actionError(
      "Your reset link has expired. Start the reset again to get a fresh code."
    );
  }

  const ip = await getClientIp();
  const limit = await checkDualRateLimit("passwordReset", ip, session.userId);
  if (!limit.success) {
    return actionError(
      `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      { retryAfter: limit.retryAfter }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return actionError(
      error.message ||
        "We could not update that password. Choose a different one."
    );
  }

  await recordAudit({
    action: "auth.password_reset",
    actorId: session.userId,
    workspaceId: session.claims.workspace_id ?? null,
  });

  if (session.claims.email) await clearFailedAttempts(session.claims.email);

  // `global` revokes every refresh token on the account, so any session that
  // was open elsewhere when the password changed dies with this one.
  await supabase.auth.signOut({ scope: "global" });
  await clearAuthCookies();

  revalidatePath("/", "layout");
  redirect("/login?reset=1");
}
