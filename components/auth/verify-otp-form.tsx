"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState, useTransition } from "react";
import { ArrowLeftIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthHeader } from "@/components/auth/auth-header";
import { OtpInput } from "@/components/auth/otp-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { requestPasswordOtpAction, verifyOtpAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyOtpForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(
    verifyOtpAction,
    initialAuthActionState
  );
  const [resending, startResend] = useTransition();

  const formRef = React.useRef<HTMLFormElement>(null);
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SECONDS);
  const [resendCount, setResendCount] = React.useState(0);

  // Countdown for the resend button.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Remount key for the code boxes: a rejected attempt or a resend clears them.
  // Derived during render rather than synced through an effect.
  const otpKey = `${resendCount}-${
    state.status === "error" ? (state.nonce ?? 0) : 0
  }`;

  const handleComplete = React.useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  function handleResend() {
    if (cooldown > 0 || resending) return;

    startResend(async () => {
      const payload = new FormData();
      payload.set("email", email);
      const result = await requestPasswordOtpAction(
        initialAuthActionState,
        payload
      );

      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResendCount((count) => count + 1);

      if (result.status === "success") {
        toast.success("Code resent", { description: result.message });
      } else {
        toast.error("Could not resend the code", {
          description: result.message,
        });
        // A rate-limited resend must not look like a fresh 60s window.
        if (result.retryAfter) setCooldown(result.retryAfter);
      }
    });
  }

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Step 2 of 3"
        title="Enter your verification code"
        description={
          <>
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>. It
            expires in 10 minutes.
          </>
        }
      />

      <AuthAlert
        tone="error"
        message={state.status === "error" ? state.message : null}
      />

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="animate-rise space-y-6"
      >
        <input type="hidden" name="email" value={email} />

        <OtpInput
          key={otpKey}
          onComplete={handleComplete}
          disabled={resending}
        />

        {state.fieldErrors.token?.[0] && (
          <p role="alert" className="text-center text-xs text-destructive">
            {state.fieldErrors.token[0]}
          </p>
        )}

        <SubmitButton pendingLabel="Verifying code…">Verify code</SubmitButton>
      </form>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className={cn(
              "inline-flex items-center gap-1.5 font-medium underline-offset-4 transition-colors",
              cooldown > 0 || resending
                ? "cursor-not-allowed text-muted-foreground"
                : "text-primary hover:underline"
            )}
          >
            {resending && <Loader2Icon className="size-3.5 animate-spin" />}
            {cooldown > 0 ? (
              <>
                Resend in{" "}
                <span className="font-mono tabular-nums">
                  {String(Math.floor(cooldown / 60)).padStart(2, "0")}:
                  {String(cooldown % 60).padStart(2, "0")}
                </span>
              </>
            ) : (
              "Resend code"
            )}
          </button>
        </p>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MailCheckIcon className="size-3.5" />
          Check your spam folder if it has not arrived.
        </p>
      </div>

      <Link
        href="/forgot-password"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Use a different email
      </Link>
    </div>
  );
}
