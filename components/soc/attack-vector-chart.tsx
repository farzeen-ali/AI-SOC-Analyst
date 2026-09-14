"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CrosshairIcon } from "lucide-react";

import { severityFromScore } from "@/components/threat/severity-badge";
import type { AttackVector } from "@/lib/soc/queries";
import { cn } from "@/lib/utils";

const LEVEL_BAR: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
  info: "bg-muted-foreground",
};

const LEVEL_TEXT: Record<string, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-muted-foreground",
};

/**
 * Attack vectors ranked by volume, coloured by their worst severity.
 *
 * Bars grow on first view and respond to hover/focus. Each row is a real
 * button so the distribution is reachable by keyboard, not just by pointer —
 * selecting one filters the threat list via `onSelect`.
 */
export function AttackVectorChart({
  vectors,
  onSelect,
  selected,
  className,
}: {
  vectors: AttackVector[];
  onSelect?: (threatType: string | null) => void;
  selected?: string | null;
  className?: string;
}) {
  const max = React.useMemo(
    () => Math.max(1, ...vectors.map((vector) => vector.total)),
    [vectors]
  );

  if (vectors.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 py-8 text-center",
          className
        )}
      >
        <CrosshairIcon className="size-5 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          No attack vectors yet — ingest logs to populate this.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {vectors.map((vector, index) => {
        const level = severityFromScore(vector.maxSeverity);
        const ratio = vector.total / max;
        const isSelected = selected === vector.threatType;

        return (
          <li key={vector.threatType}>
            <button
              type="button"
              onClick={() =>
                onSelect?.(isSelected ? null : vector.threatType)
              }
              aria-pressed={isSelected}
              className={cn(
                "group/vector w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                isSelected ? "bg-muted/70" : "hover:bg-muted/40"
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs font-medium">
                  {vector.threatType}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span
                    className={cn(
                      "font-mono text-[0.6rem] tracking-wider uppercase",
                      LEVEL_TEXT[level]
                    )}
                  >
                    {level}
                  </span>
                  <span className="font-heading text-sm font-semibold tabular-nums">
                    {vector.total}
                  </span>
                </span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: ratio }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{
                    duration: 0.7,
                    delay: Math.min(index * 0.06, 0.4),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ originX: 0 }}
                  className={cn(
                    "h-full w-full rounded-full transition-opacity",
                    LEVEL_BAR[level],
                    isSelected
                      ? "opacity-100"
                      : "opacity-80 group-hover/vector:opacity-100"
                  )}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact severity distribution, used beside the gauge. */
export function SeverityDistribution({
  bySeverity,
  className,
}: {
  bySeverity: { critical: number; high: number; medium: number; low: number };
  className?: string;
}) {
  const entries = [
    { key: "critical", label: "Critical", value: bySeverity.critical },
    { key: "high", label: "High", value: bySeverity.high },
    { key: "medium", label: "Medium", value: bySeverity.medium },
    { key: "low", label: "Low", value: bySeverity.low },
  ] as const;

  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Stacked proportion bar */}
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          entries.map((entry, index) =>
            entry.value === 0 ? null : (
              <motion.div
                key={entry.key}
                initial={{ width: 0 }}
                whileInView={{ width: `${(entry.value / total) * 100}%` }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.07,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={LEVEL_BAR[entry.key]}
              />
            )
          )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="flex items-center justify-between gap-2"
          >
            <dt className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  LEVEL_BAR[entry.key]
                )}
              />
              {entry.label}
            </dt>
            <dd className="font-mono text-[0.7rem] font-medium tabular-nums">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
