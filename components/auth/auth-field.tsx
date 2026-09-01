"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircleIcon, CheckIcon, type LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AuthFieldProps
  extends Omit<React.ComponentProps<"input">, "children"> {
  name: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  /** Field errors returned by the Server Action. */
  serverErrors?: string[];
  /** Client-side check, run on change once the field has been blurred. */
  validate?: (value: string) => string | null;
  /** Renders below the input (password strength meter, requirement list). */
  children?: React.ReactNode;
  /** Trailing control slot — visibility toggles, etc. */
  adornment?: React.ReactNode;
  containerClassName?: string;
}

/**
 * Labelled input with symmetric client/server validation feedback.
 *
 * Client errors come from the same Zod schemas the Server Action re-runs, so a
 * value can never clear one side and fail the other. Errors only surface after
 * the first blur, which keeps a half-typed email from flashing red.
 */
export function AuthField({
  name,
  label,
  icon: Icon,
  hint,
  serverErrors,
  validate,
  children,
  adornment,
  className,
  containerClassName,
  onBlur,
  onChange,
  ...inputProps
}: AuthFieldProps) {
  const [touched, setTouched] = React.useState(false);
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [value, setValue] = React.useState(
    String(inputProps.defaultValue ?? "")
  );

  const serverError = serverErrors?.[0] ?? null;
  const error = (touched && clientError) || serverError;
  const isValid = touched && !clientError && value.length > 0 && !serverError;

  const runValidation = React.useCallback(
    (next: string) => {
      if (!validate) return;
      setClientError(next.length === 0 ? null : validate(next));
    },
    [validate]
  );

  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className={cn("space-y-2", containerClassName)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={name} className="text-[0.8125rem] font-medium">
          {label}
        </Label>
        {hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>

      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 transition-colors",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          />
        )}

        <Input
          id={name}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn(
            "h-11 rounded-xl bg-background/60 text-sm transition-all duration-200",
            "focus-visible:ring-[3px] focus-visible:ring-primary/25",
            Icon && "pl-10",
            (adornment || isValid) && "pr-10",
            error &&
              "border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/25",
            className
          )}
          onBlur={(event) => {
            setTouched(true);
            runValidation(event.target.value);
            onBlur?.(event);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            if (touched) runValidation(event.target.value);
            onChange?.(event);
          }}
          {...inputProps}
        />

        <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
          {adornment}
          {!adornment && isValid && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-success"
            >
              <CheckIcon className="size-4" />
            </motion.span>
          )}
        </div>
      </div>

      {children}

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.16 }}
            className="flex items-start gap-1.5 text-xs text-destructive"
          >
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
