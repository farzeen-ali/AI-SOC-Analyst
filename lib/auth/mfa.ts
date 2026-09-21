import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * MFA state, read server-side.
 *
 * Supabase mints an `aal` claim (aal1 / aal2) into every access token, and the
 * `custom_access_token_hook` adds `has_mfa`. Together those answer the two
 * questions route gating needs — "is a second factor configured?" and "has it
 * been satisfied on this session?" — without a database round trip.
 *
 * `listFactors()` still hits the Auth server, so it is only used on the
 * screens that actually manage factors, never in the request path.
 */

export interface MfaFactor {
  id: string;
  friendlyName: string;
  factorType: string;
  createdAt: string;
}

export interface MfaState {
  /** At least one verified factor exists on the account. */
  enrolled: boolean;
  /** The current session has satisfied the second factor. */
  satisfied: boolean;
  /** Enrolled but not yet satisfied on this session — needs step-up. */
  stepUpRequired: boolean;
  factors: MfaFactor[];
}

export const getMfaState = cache(async (): Promise<MfaState> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  const enrolledFromClaim = claims?.has_mfa === true;
  const satisfied = claims?.aal === "aal2";

  const { data: factorData } = await supabase.auth.mfa.listFactors();

  const factors: MfaFactor[] = (factorData?.all ?? [])
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({
      id: factor.id,
      friendlyName:
        factor.friendly_name ??
        (factor.factor_type === "totp" ? "Authenticator app" : "Security key"),
      factorType: factor.factor_type,
      createdAt: factor.created_at,
    }));

  // The claim can lag by one token refresh right after enrolment, so trust
  // whichever source says a factor exists.
  const enrolled = enrolledFromClaim || factors.length > 0;

  return {
    enrolled,
    satisfied,
    stepUpRequired: enrolled && !satisfied,
    factors,
  };
});
