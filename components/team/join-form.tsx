"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingIcon, MailIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";

import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthHeader } from "@/components/auth/auth-header";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { acceptInvitationAction } from "@/lib/team/actions";
import { fieldValidator, fullNameSchema } from "@/lib/validations/auth";

const validateName = fieldValidator(fullNameSchema);

/**
 * Member registration behind an invitation link.
 *
 * The email is displayed but not editable and is never submitted: the server
 * reads it from the invitation row keyed by the token. Letting the form carry
 * an address would turn a link for one person into a link for anyone.
 */
export function JoinForm({
  token,
  email,
  workspaceName,
}: {
  token: string;
  email: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("token", token);

    startTransition(async () => {
      const result = await acceptInvitationAction(undefined, formData);

      if (result.ok) {
        toast.success("Welcome to GuardAI", { description: result.message });
        router.replace("/login?joined=1");
        return;
      }

      setError(result.message);
    });
  }

  return (
    <div className="space-y-7">
      <AuthHeader
        eyebrow="Analyst invitation"
        title={`Join ${workspaceName}`}
        description="Create your account to reach this workspace's threat dashboard. You will join as a SOC Analyst."
      />

      <AuthAlert tone="error" message={error} />

      <form action={handleSubmit} noValidate className="animate-rise space-y-4">
        {/* Read-only: the address is fixed by the invitation, not the form. */}
        <AuthField
          name="inviteEmail"
          label="Invited address"
          type="email"
          value={email}
          readOnly
          disabled
          icon={MailIcon}
          hint="Fixed by the invitation"
        />

        <AuthField
          name="fullName"
          label="Full name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          icon={UserIcon}
          validate={validateName}
          required
        />

        <PasswordField
          name="password"
          label="Create a password"
          autoComplete="new-password"
          placeholder="Choose a strong password"
          withStrengthMeter
          required
        />

        <SubmitButton pendingLabel="Creating your account…" disabled={pending}>
          Join workspace
        </SubmitButton>

        <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <BuildingIcon className="size-3" />
          You will be added to {workspaceName} with the SOC Analyst role.
        </p>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
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
