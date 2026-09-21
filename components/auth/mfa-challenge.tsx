"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FingerprintIcon,
  Loader2Icon,
  LogOutIcon,
  SmartphoneIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthHeader } from "@/components/auth/auth-header";
import { OtpInput } from "@/components/auth/otp-input";
import { LogoutForm } from "@/components/dashboard/logout-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { MfaFactor } from "@/lib/auth/mfa";
import { safeRedirectPath } from "@/lib/security/sanitize";
import { cn } from "@/lib/utils";

/**
 * Second-factor step-up.
 *
 * The session already exists at aal1; this raises it to aal2 by satisfying an
 * enrolled factor. Until that succeeds the proxy keeps every protected route
 * out of reach, so there is no way past this screen other than passing the
 * challenge or signing out.
 *
 * Two factor types are handled. WebAuthn waits for the button rather than
 * prompting on mount: browsers gate `navigator.credentials.get()` on a user
 * gesture, and a silent refusal is reported back as a cancellation, which reads
 * as a failure the user never caused. TOTP waits for a typed code.
 */
export function MfaChallenge({
  factors,
  redirectTo,
}: {
  factors: MfaFactor[];
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const destination = safeRedirectPath(redirectTo, "/dashboard");

  // WebAuthn is preferred when enrolled: it is phishing-resistant and needs no
  // typing. Otherwise fall back to whatever the account has.
  const [selectedId, setSelectedId] = React.useState<string | undefined>(
    () => (factors.find((f) => f.factorType === "webauthn") ?? factors[0])?.id
  );

  const factor = factors.find((f) => f.id === selectedId) ?? factors[0];
  const isTotp = factor?.factorType === "totp";

  const succeed = React.useCallback(() => {
    toast.success("Identity confirmed");
    // A full refresh so the proxy re-reads the now-aal2 token.
    router.replace(destination);
    router.refresh();
  }, [router, destination]);

  const verifyWebauthn = React.useCallback(async () => {
    if (!factor || busy) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: challengeError } =
        await supabase.auth.mfa.webauthn.authenticate({ factorId: factor.id });

      if (challengeError) {
        const message = challengeError.message ?? "Verification failed.";
        setError(
          /NotAllowed|abort|cancel/i.test(message)
            ? "Verification was cancelled. Try again when you are ready."
            : message
        );
        return;
      }

      succeed();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Verification failed."
      );
    } finally {
      setBusy(false);
    }
  }, [factor, busy, succeed]);

  const verifyTotp = React.useCallback(
    async (code: string) => {
      if (!factor || busy) return;

      setBusy(true);
      setError(null);

      try {
        const supabase = createClient();
        const { error: verifyError } =
          await supabase.auth.mfa.challengeAndVerify({
            factorId: factor.id,
            code,
          });

        if (verifyError) {
          setAttempt((count) => count + 1);
          setError(
            /invalid|incorrect/i.test(verifyError.message)
              ? "That code was not accepted. Codes rotate every 30 seconds — enter the current one."
              : verifyError.message
          );
          return;
        }

        succeed();
      } catch (caught) {
        setAttempt((count) => count + 1);
        setError(
          caught instanceof Error ? caught.message : "Verification failed."
        );
      } finally {
        setBusy(false);
      }
    },
    [factor, busy, succeed]
  );

  const alternatives = factors.filter((f) => f.id !== factor?.id);

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Two-factor required"
        title="Confirm it's you"
        description={
          isTotp
            ? "Your workspace requires a second factor. Enter the current 6-digit code from your authenticator app."
            : "Your workspace requires a second factor. Approve the prompt with Windows Hello, Touch ID, your device PIN, or your security key."
        }
      />

      <AuthAlert tone="error" message={error} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-5 rounded-2xl border border-border/60 bg-card/50 px-6 py-8"
      >
        <span className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          {busy && (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-pulse-ring rounded-2xl border border-primary/40"
            />
          )}
          {isTotp ? (
            <SmartphoneIcon className="size-7 text-primary" />
          ) : (
            <FingerprintIcon className="size-7 text-primary" />
          )}
        </span>

        <p className="text-center text-sm text-muted-foreground">
          {!factor
            ? "No enrolled factor found."
            : busy
              ? isTotp
                ? "Checking your code…"
                : "Waiting for your device…"
              : `Using ${factor.friendlyName}`}
        </p>

        {isTotp ? (
          <div className="w-full">
            <OtpInput
              key={attempt}
              name="mfa-code"
              onComplete={verifyTotp}
              disabled={busy}
            />
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={busy || !factor}
            onClick={verifyWebauthn}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-brand-1 via-primary to-brand-2 text-primary-foreground"
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FingerprintIcon className="size-4" />
            )}
            {busy ? "Verifying…" : "Verify with this device"}
          </Button>
        )}

        {alternatives.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-4">
            <span className="text-xs text-muted-foreground">
              Can&apos;t use that?
            </span>
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setSelectedId(alternative.id);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors",
                  "hover:border-primary/40 hover:text-primary disabled:opacity-60"
                )}
              >
                {alternative.factorType === "totp" ? (
                  <SmartphoneIcon className="size-3" />
                ) : (
                  <FingerprintIcon className="size-3" />
                )}
                {alternative.friendlyName}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <LogOutIcon className="size-3.5" />
        Not you?
        <LogoutForm variant="sidebar" label="Sign out" className="w-auto px-1" />
      </div>
    </div>
  );
}
