import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/security/sanitize";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your GuardAI workspace.",
};

type Notice = { tone: "success" | "info" | "warning"; message: string };

/** Maps the query flags the auth flows set into a single banner. */
function resolveNotice(params: Record<string, string | string[] | undefined>) {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // Email confirmation lands here on purpose — see app/auth/confirm/route.ts.
  if (first("confirmed")) {
    return {
      tone: "success",
      message:
        "Email confirmed. Sign in below to reach your workspace.",
    } satisfies Notice;
  }

  if (first("signedOut")) {
    return {
      tone: "success",
      message: "You have been signed out. Your session was ended everywhere.",
    } satisfies Notice;
  }

  if (first("reset")) {
    return {
      tone: "success",
      message:
        "Password updated. Sign in with your new password to continue.",
    } satisfies Notice;
  }

  const reason = first("reason");
  if (reason === "session-expired") {
    return {
      tone: "warning",
      message: "Your session expired. Please sign in again.",
    } satisfies Notice;
  }
  if (reason === "link-expired") {
    return {
      tone: "warning",
      message:
        "That confirmation link has expired. Sign in to have a new one sent, or sign up again.",
    } satisfies Notice;
  }
  if (reason === "link-invalid") {
    return {
      tone: "warning",
      message:
        "That link could not be read. It may already have been used — try signing in.",
    } satisfies Notice;
  }
  if (reason === "suspended") {
    return {
      tone: "warning",
      message:
        "This account is suspended. Contact your workspace administrator.",
    } satisfies Notice;
  }

  if (first("redirectTo")) {
    return {
      tone: "info",
      message: "Sign in to continue to that page.",
    } satisfies Notice;
  }

  return null;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const redirectTo = safeRedirectPath(searchParams.redirectTo, "");

  return (
    <LoginForm
      redirectTo={redirectTo || undefined}
      notice={resolveNotice(searchParams)}
    />
  );
}
