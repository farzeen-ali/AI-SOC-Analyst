"use client";

import * as React from "react";
import { useActionState } from "react";
import { ShieldCheckIcon } from "lucide-react";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthHeader } from "@/components/auth/auth-header";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { resetPasswordAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function ResetPasswordForm({ email }: { email?: string }) {
  const [state, formAction] = useActionState(
    resetPasswordAction,
    initialAuthActionState
  );
  const [password, setPassword] = React.useState("");

  const validateConfirm = React.useCallback(
    (value: string) => (value === password ? null : "Passwords do not match."),
    [password]
  );

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Step 3 of 3"
        title="Set a new password"
        description={
          email ? (
            <>
              Choose a new password for{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            "Choose a new password. Every other signed-in session will be revoked."
          )
        }
      />

      <AuthAlert
        tone="error"
        message={state.status === "error" ? state.message : null}
      />

      <form
        action={formAction}
        noValidate
        className="animate-rise space-y-4"
      >
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          withStrengthMeter
          onValueChange={setPassword}
          serverErrors={state.fieldErrors.password}
          required
          autoFocus
        />

        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          validate={validateConfirm}
          serverErrors={state.fieldErrors.confirmPassword}
          required
        />

        <SubmitButton pendingLabel="Updating password…">
          Update password
        </SubmitButton>
      </form>

      <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
        <ShieldCheckIcon className="mt-px size-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Updating your password signs you out of every device and revokes all
          active refresh tokens. You will sign in again with the new password.
        </p>
      </div>
    </div>
  );
}
