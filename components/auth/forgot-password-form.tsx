"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftIcon, MailIcon } from "lucide-react";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthHeader } from "@/components/auth/auth-header";
import { AuthField } from "@/components/auth/auth-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { requestPasswordOtpAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import { emailSchema, fieldValidator } from "@/lib/validations/auth";

const validateEmail = fieldValidator(emailSchema);

export function ForgotPasswordForm({ expired }: { expired?: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    requestPasswordOtpAction,
    initialAuthActionState
  );

  // A dispatched code always advances to the verification step. The action
  // returns the same success shape whether or not the account exists, so this
  // transition leaks nothing.
  React.useEffect(() => {
    if (state.status === "success" && state.email) {
      router.push(`/verify-otp?email=${encodeURIComponent(state.email)}`);
    }
  }, [state.status, state.email, state.nonce, router]);

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Account recovery"
        title="Reset your password"
        description="Enter the work email tied to your GuardAI account and we will send a 6-digit verification code."
      />

      {expired && !state.message && (
        <AuthAlert
          tone="warning"
          message="That recovery session expired. Request a fresh code to continue."
        />
      )}
      <AuthAlert
        tone={state.status === "success" ? "success" : "error"}
        message={state.status === "idle" ? null : state.message}
      />

      <motion.form
        action={formAction}
        noValidate
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4"
      >
        <AuthField
          name="email"
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="analyst@acme.com"
          icon={MailIcon}
          validate={validateEmail}
          serverErrors={state.fieldErrors.email}
          required
          autoFocus
        />

        <SubmitButton pendingLabel="Sending code…">
          Send verification code
        </SubmitButton>
      </motion.form>

      <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          For your protection, codes are limited to{" "}
          <span className="font-medium text-foreground">
            3 requests per 15 minutes
          </span>{" "}
          per account and per IP address.
        </p>
      </div>

      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
