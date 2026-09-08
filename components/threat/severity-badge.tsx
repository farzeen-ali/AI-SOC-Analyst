import { cn } from "@/lib/utils";

export type SeverityLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "resolved";

/** Maps the LLM's 1–10 severity score onto the visual ramp. */
export function severityFromScore(score: number): SeverityLevel {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score >= 1) return "low";
  return "info";
}

const CLASSES: Record<SeverityLevel, string> = {
  critical: "sev-critical",
  high: "sev-high",
  medium: "sev-medium",
  low: "sev-low",
  info: "sev-info",
  resolved: "sev-resolved",
};

interface SeverityBadgeProps {
  level: SeverityLevel;
  /** Optional 1–10 score rendered alongside the label. */
  score?: number;
  className?: string;
  /** Adds a slow pulse — reserved for unacknowledged critical findings. */
  pulse?: boolean;
}

export function SeverityBadge({
  level,
  score,
  className,
  pulse = false,
}: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[0.6rem] font-medium tracking-wider uppercase",
        CLASSES[level],
        className
      )}
    >
      <span className="relative flex size-1.5">
        {pulse && (
          <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-current" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {level}
      {typeof score === "number" && (
        <span className="tabular-nums opacity-70">{score}/10</span>
      )}
    </span>
  );
}

/** Horizontal 1–10 meter, used on finding detail rows. */
export function SeverityMeter({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const level = severityFromScore(score);
  const filled = Math.round(Math.min(Math.max(score, 0), 10));

  return (
    <div
      // The `sev-*` class sets `color`, so the filled bars can simply paint
      // with `bg-current` and stay in step with the ramp.
      className={cn("flex items-center gap-2", CLASSES[level], className)}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-label={`Severity ${score} of 10`}
      style={{ background: "transparent", borderColor: "transparent" }}
    >
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-3 w-1 rounded-[1px] transition-colors",
              index < filled ? "bg-current" : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="font-mono text-xs font-semibold tabular-nums">
        {score}/10
      </span>
    </div>
  );
}
