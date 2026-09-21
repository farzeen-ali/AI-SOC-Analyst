import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { getMfaState } from "@/lib/auth/mfa";
import { getSessionContext } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/security/sanitize";

export const metadata: Metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false },
};

/**
 * Second-factor step-up screen.
 *
 * Reachable only with an aal1 session that has a verified factor. Anyone
 * already at aal2, or with no factor enrolled, is sent on rather than shown a
 * prompt they cannot satisfy.
 */
export default async function MfaPage(props: PageProps<"/mfa">) {
  const session = await getSessionContext();
  if (!session) redirect("/login?reason=session-expired");

  const searchParams = await props.searchParams;
  const redirectTo = safeRedirectPath(searchParams.redirectTo, "/dashboard");

  const mfa = await getMfaState();

  if (!mfa.enrolled || mfa.satisfied) {
    redirect(redirectTo);
  }

  return <MfaChallenge factors={mfa.factors} redirectTo={redirectTo} />;
}
