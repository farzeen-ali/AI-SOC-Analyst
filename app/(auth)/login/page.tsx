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
