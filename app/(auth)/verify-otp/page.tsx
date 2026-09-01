import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VerifyOtpForm } from "@/components/auth/verify-otp-form";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { EMAIL_REGEX } from "@/lib/validations/auth";

export const metadata: Metadata = {
  title: "Verify code",
  description: "Enter the 6-digit code sent to your email.",
};

export default async function VerifyOtpPage(props: PageProps<"/verify-otp">) {
  const searchParams = await props.searchParams;
  const email = sanitizeEmail(searchParams.email);

  // Reached directly, or with a tampered query string.
  if (!EMAIL_REGEX.test(email)) redirect("/forgot-password");

  return <VerifyOtpForm email={email} />;
}
