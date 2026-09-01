"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, XIcon } from "lucide-react";

import { evaluatePassword } from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const BAR_TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-info",
  "bg-success",
] as const;

const LABEL_TONES = [
  "text-destructive",
  "text-destructive",
  "text-warning",
  "text-info",
  "text-success",
] as const;

interface PasswordStrengthProps {
  password: string;
  /** Show the per-rule checklist as well as the meter. */
  showRequirements?: boolean;
  className?: string;
}

/**
 * Real-time strength meter driven by `evaluatePassword`, which scores against
 * the exact rules `passwordSchema` enforces — the bar can never read "Excellent"
 * for a value the server will reject.
 */
export function PasswordStrength({
  password,
  showRequirements = true,
  className,
}: PasswordStrengthProps) {
  const { score, label, requirements } = evaluatePassword(password);
  const hasInput = password.length > 0;

  return (
    <AnimatePresence initial={false}>
      {hasInput && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className={cn("space-y-2 overflow-hidden pt-1", className)}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex flex-1 gap-1"
              role="meter"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={4}
              aria-label={`Password strength: ${label}`}
            >
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: index < score ? 1 : 0 }}
                    transition={{ duration: 0.28, delay: index * 0.04 }}
                    style={{ originX: 0 }}
                    className={cn("h-full w-full rounded-full", BAR_TONES[score])}
                  />
                </div>
              ))}
            </div>
            <span
              className={cn(
                "w-20 text-right text-xs font-medium tabular-nums",
                LABEL_TONES[score]
              )}
            >
              {label}
            </span>
          </div>

          {showRequirements && (
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {requirements.map((requirement) => (
                <li
                  key={requirement.id}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    requirement.met
                      ? "text-success"
                      : "text-muted-foreground"
                  )}
                >
                  {requirement.met ? (
                    <CheckIcon className="size-3 shrink-0" />
                  ) : (
                    <XIcon className="size-3 shrink-0 opacity-50" />
                  )}
                  {requirement.label}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
