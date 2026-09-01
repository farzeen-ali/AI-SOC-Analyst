import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/dashboard/reveal";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  index?: number;
  tone?: "default" | "primary" | "success" | "warning";
}

const TONES = {
  default: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  index = 0,
  tone = "default",
}: StatCardProps) {
  return (
    <Reveal index={index}>
      <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Corner glow that warms on hover. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
              {label}
            </p>
            <p className="mt-2 truncate font-heading text-2xl font-semibold tracking-tight">
              {value}
            </p>
            {hint && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {hint}
              </p>
            )}
          </div>

          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
            <Icon className={cn("size-4", TONES[tone])} />
          </span>
        </div>
      </div>
    </Reveal>
  );
}
