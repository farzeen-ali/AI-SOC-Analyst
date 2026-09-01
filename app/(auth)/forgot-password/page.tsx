import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a verification code to reset your GuardAI password.",
};

export default async function ForgotPasswordPage(
  props: PageProps<"/forgot-password">
) {
  const searchParams = await props.searchParams;
  return <ForgotPasswordForm expired={searchParams.reason === "expired"} />;
}
