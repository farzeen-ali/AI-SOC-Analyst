"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { BuildingIcon, MailIcon, UserIcon } from "lucide-react";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthDivider, AuthHeader } from "@/components/auth/auth-header";
import { AuthField } from "@/components/auth/auth-field";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { signUpAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import {
  emailSchema,
  fieldValidator,
  fullNameSchema,
  workspaceNameSchema,
} from "@/lib/validations/auth";

const validateName = fieldValidator(fullNameSchema);
const validateEmail = fieldValidator(emailSchema);
const validateWorkspace = fieldValidator(workspaceNameSchema);

export function SignUpForm() {
  const [state, formAction] = useActionState(
    signUpAction,
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
        eyebrow="Free workspace"
        title="Deploy your AI SOC analyst"
        description="Create a workspace, invite your analysts, and start triaging logs in minutes. You become its Tenant Admin."
      />

      <AuthAlert
        tone={state.status === "success" ? "success" : "error"}
        message={state.status === "idle" ? null : state.message}
      />

      <form
        action={formAction}
        noValidate
        className="animate-rise space-y-4"
      >
        <AuthField
          name="fullName"
          label="Full name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          icon={UserIcon}
          validate={validateName}
          serverErrors={state.fieldErrors.fullName}
          required
        />

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

        <AuthField
          name="workspaceName"
          label="Workspace name"
          autoComplete="organization"
          placeholder="Acme Security Operations"
          icon={BuildingIcon}
          hint="Your tenant"
          validate={validateWorkspace}
          serverErrors={state.fieldErrors.workspaceName}
          required
        />

        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          withStrengthMeter
          onValueChange={setPassword}
          serverErrors={state.fieldErrors.password}
          required
        />

        <PasswordField
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          validate={validateConfirm}
          serverErrors={state.fieldErrors.confirmPassword}
          required
        />

        <SubmitButton pendingLabel="Provisioning workspace…">
          Create workspace
        </SubmitButton>

        <p className="text-center text-[0.7rem] leading-relaxed text-muted-foreground">
          By creating a workspace you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <AuthDivider />

      <GoogleButton label="Sign up with Google" />

      <p className="text-center text-sm text-muted-foreground">
        Already have a workspace?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
