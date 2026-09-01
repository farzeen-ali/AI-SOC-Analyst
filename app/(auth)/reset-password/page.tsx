import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSessionContext } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "New password",
  description: "Choose a new password for your GuardAI account.",
};

/**
 * Reachable only with the short-lived recovery session minted by
 * `verifyOtpAction` (or a recovery link handled by `/auth/callback`).
 */
export default async function ResetPasswordPage() {
  const session = await getSessionContext();
  if (!session) redirect("/forgot-password?reason=expired");

  return <ResetPasswordForm email={session.claims.email} />;
}
