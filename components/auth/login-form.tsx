"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { MailIcon } from "lucide-react";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthDivider, AuthHeader } from "@/components/auth/auth-header";
import { AuthField } from "@/components/auth/auth-field";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import { emailSchema, fieldValidator } from "@/lib/validations/auth";

const validateEmail = fieldValidator(emailSchema);

interface LoginFormProps {
  redirectTo?: string;
  /** Read-only notice derived from the query string (signed out, reset, ...). */
  notice?: { tone: "success" | "info" | "warning"; message: string } | null;
}

export function LoginForm({ redirectTo, notice }: LoginFormProps) {
  const [state, formAction] = useActionState(
    loginAction,
    initialAuthActionState
  );

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Secure sign-in"
        title="Welcome back to GuardAI"
        description="Sign in to reach your workspace, threat dashboard, and response playbooks."
      />

      {notice && !state.message && (
        <AuthAlert tone={notice.tone} message={notice.message} />
      )}
      <AuthAlert tone="error" message={state.status === "error" ? state.message : null} />

      <motion.form
        action={formAction}
        noValidate
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4"
      >
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />

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
        />

        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          serverErrors={state.fieldErrors.password}
          required
        />

        <div className="flex items-center justify-between gap-4 pt-0.5">
          <Label
            htmlFor="rememberMe"
            className="cursor-pointer gap-2 text-[0.8125rem] font-normal text-muted-foreground"
          >
            <Checkbox id="rememberMe" name="rememberMe" />
            Remember me
          </Label>

          <Link
            href="/forgot-password"
            className="text-[0.8125rem] font-medium text-primary underline-offset-4 transition-colors hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <SubmitButton pendingLabel="Verifying credentials…">
          Sign in
        </SubmitButton>
      </motion.form>

      <AuthDivider />

      <GoogleButton label="Sign in with Google" next={redirectTo} />

      <p className="text-center text-sm text-muted-foreground">
        New to GuardAI?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
        >
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
