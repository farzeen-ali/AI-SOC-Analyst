import type { LucideIcon } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  index?: number;
  tone?: "default" | "primary" | "success" | "warning";
}

const ICON_TONES = {
  default: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
} as const;

const GLOW_TONES = {
  default: "bg-foreground/[0.06]",
  primary: "bg-primary/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  index = 0,
  tone = "default",
}: StatCardProps) {
  // Numeric stats count up; pre-formatted strings (plan names, dates) do not.
  const numeric = typeof value === "number" ? value : null;

  return (
    <Reveal index={index}>
      <SpotlightCard className="h-full p-4">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-16 -right-16 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover/spotlight:opacity-100",
            GLOW_TONES[tone]
          )}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
              {label}
            </p>

            <p className="mt-2 truncate font-heading text-[1.65rem] leading-none font-semibold tracking-tight tabular-nums">
              {numeric !== null ? <CountUp value={numeric} /> : value}
            </p>

            {hint && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {hint}
              </p>
            )}
          </div>

          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 transition-colors duration-300 group-hover/spotlight:border-primary/30 group-hover/spotlight:bg-primary/10">
            <Icon className={cn("size-4", ICON_TONES[tone])} />
          </span>
        </div>
      </SpotlightCard>
    </Reveal>
  );
}
