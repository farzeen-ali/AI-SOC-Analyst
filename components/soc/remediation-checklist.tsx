"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, CircleDashedIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { severityFromScore } from "@/components/threat/severity-badge";
import { setRemediationStepStatusAction } from "@/lib/soc/actions";
import type { RemediationStepView } from "@/lib/soc/queries";
import type { RemediationStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const STATES: Array<{
  value: RemediationStatus;
  label: string;
  icon: typeof CheckIcon;
  className: string;
}> = [
  {
    value: "pending",
    label: "Pending",
    icon: CircleDashedIcon,
    className: "sev-info",
  },
  {
    value: "in_progress",
    label: "In Progress",
    icon: LoaderIcon,
    className: "sev-medium",
  },
  {
    value: "resolved",
    label: "Resolved",
    icon: CheckIcon,
    className: "sev-resolved",
  },
];

const RAIL: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
  info: "bg-muted-foreground",
};

/**
 * Interactive remediation checklist.
 *
 * Status is applied optimistically so a click feels instant, then reconciled
 * against the server result — a rejected write (rate limit, lost session)
 * rolls the row back rather than leaving the UI lying about state.
 *
 * Open to every workspace role: analysts are the ones doing the remediation.
 */
export function RemediationChecklist({
  steps,
  className,
}: {
  steps: RemediationStepView[];
  className?: string;
}) {
  /**
   * Optimistic overrides keyed by step id, rather than a copy of `steps`.
   *
   * Holding a mirrored array would need an effect to re-sync whenever the
   * server revalidates; deriving instead means fresh server data wins
   * automatically and an override only survives while its write is in flight.
   */
  const [overrides, setOverrides] = React.useState<
    Record<string, RemediationStatus>
  >({});
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());

  const local = React.useMemo(
    () =>
      steps.map((step) =>
        overrides[step.id] ? { ...step, status: overrides[step.id] } : step
      ),
    [steps, overrides]
  );

  const setStatus = React.useCallback(
    (step: RemediationStepView, next: RemediationStatus) => {
      if (step.status === next) return;

      setOverrides((current) => ({ ...current, [step.id]: next }));
      setPendingIds((current) => new Set(current).add(step.id));

      void (async () => {
        const payload = new FormData();
        payload.set("stepId", step.id);
        payload.set("status", next);

        const result = await setRemediationStepStatusAction(
          undefined,
          payload
        );

        setPendingIds((current) => {
          const updated = new Set(current);
          updated.delete(step.id);
          return updated;
        });

        // Drop the override either way: on success the revalidated server
        // data already carries the new status, and on failure the row should
        // snap back to what the server still believes.
        setOverrides((current) => {
          const updated = { ...current };
          delete updated[step.id];
          return updated;
        });

        if (!result.ok) toast.error(result.message);
      })();
    },
    []
  );

  const remaining = local.filter((step) => step.status !== "resolved").length;

  if (local.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 py-10 text-center",
          className
        )}
      >
        <CheckIcon className="size-5 text-success" />
        <p className="text-sm text-muted-foreground">
          No remediation steps outstanding.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
          Remediation
        </span>
        <span className="font-mono text-[0.6rem] text-muted-foreground">
          {remaining} open / {local.length}
        </span>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
        <AnimatePresence initial={false}>
          {local.map((step) => {
            const level = severityFromScore(step.severityScore);
            const isPending = pendingIds.has(step.id);
            const isResolved = step.status === "resolved";

            return (
              <motion.li
                key={step.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "relative px-4 py-3 transition-colors",
                  isResolved ? "opacity-60" : "hover:bg-muted/25"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-2 left-0 w-[2px] rounded-full",
                    RAIL[level]
                  )}
                />

                <p
                  className={cn(
                    "text-sm leading-snug transition-all",
                    isResolved && "text-muted-foreground line-through"
                  )}
                >
                  {step.description}
                </p>
                <p className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground">
                  {step.findingTitle}
                </p>

                <div
                  role="radiogroup"
                  aria-label={`Status for: ${step.description}`}
                  className="mt-2 flex flex-wrap items-center gap-1"
                >
                  {STATES.map((state) => {
                    const active = step.status === state.value;
                    const Icon = state.icon;

                    return (
                      <button
                        key={state.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={isPending}
                        onClick={() => setStatus(step, state.value)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wider uppercase transition-all",
                          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          active
                            ? state.className
                            : "border-border/60 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/50"
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-2.5",
                            isPending && active && "animate-spin"
                          )}
                        />
                        {state.label}
                      </button>
                    );
                  })}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
