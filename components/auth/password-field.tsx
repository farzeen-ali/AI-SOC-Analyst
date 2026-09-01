"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";

import { AuthField, type AuthFieldProps } from "@/components/auth/auth-field";
import { PasswordStrength } from "@/components/auth/password-strength";

interface PasswordFieldProps extends Omit<AuthFieldProps, "type" | "icon"> {
  /** Render the strength meter and rule checklist beneath the input. */
  withStrengthMeter?: boolean;
  /** Notifies the parent so a confirm field can compare values. */
  onValueChange?: (value: string) => void;
}

/**
 * Password input with a visibility toggle and an optional live strength meter.
 * The value is tracked locally only — it is never lifted into a URL or state
 * that could be serialised.
 */
export function PasswordField({
  withStrengthMeter = false,
  onValueChange,
  onChange,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <AuthField
      {...props}
      type={visible ? "text" : "password"}
      icon={LockIcon}
      onChange={(event) => {
        setValue(event.target.value);
        onValueChange?.(event.target.value);
        onChange?.(event);
      }}
      adornment={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {visible ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      }
    >
      {withStrengthMeter && <PasswordStrength password={value} />}
    </AuthField>
  );
}
