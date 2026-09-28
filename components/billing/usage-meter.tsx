"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { InfinityIcon, ZapIcon } from "lucide-react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  used: number;
  /** Null renders the unlimited state rather than a full ring. */
  limit: number | null;
  resetSeconds: number;
  className?: string;
}

const SIZE = 168;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatReset(seconds: number): string {
  if (seconds <= 0) return "now";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Daily scan allowance, as a radial gauge.
 *
 * The arc is drawn with `stroke-dasharray` and animated by Framer Motion on a
 * single SVG attribute, so the whole thing is one composited property rather
 * than a per-frame React render. The ring shifts from brand red through amber
 * to destructive as the allowance is consumed, which makes "nearly out"
 * legible before the number is read.
 */
export function UsageMeter({
  used,
  limit,
  resetSeconds,
  className,
}: UsageMeterProps) {
  const reducedMotion = usePrefersReducedMotion();

  const unlimited = limit === null;
  const ratio = unlimited ? 0 : Math.min(1, limit === 0 ? 1 : used / limit);
  const remaining = unlimited ? null : Math.max(0, limit - used);

  // Three bands rather than a continuous hue ramp: a discrete change reads as
  // a state change, which is what "you are running out" is.
  const tone =
    unlimited || ratio < 0.6
      ? "var(--color-primary)"
      : ratio < 0.9
        ? "var(--color-warning)"
        : "var(--color-destructive)";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
        role="img"
        aria-label={
          unlimited
            ? "Unlimited daily scans"
            : `${used} of ${limit} daily scans used`
        }
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          <defs>
            <linearGradient id="usage-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-1)" />
              <stop offset="55%" stopColor={tone} />
              <stop offset="100%" stopColor="var(--color-brand-2)" />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-border/45"
          />

          {/* Consumed arc */}
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            stroke={unlimited ? "url(#usage-ring)" : tone}
            strokeDasharray={CIRCUMFERENCE}
            initial={{
              strokeDashoffset: reducedMotion
                ? CIRCUMFERENCE * (1 - (unlimited ? 1 : ratio))
                : CIRCUMFERENCE,
            }}
            animate={{
              strokeDashoffset: CIRCUMFERENCE * (1 - (unlimited ? 1 : ratio)),
            }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }
            }
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {unlimited ? (
            <>
              <InfinityIcon className="size-8 text-primary" />
              <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                Unlimited
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-3xl font-semibold tabular-nums">
                {remaining}
              </span>
              <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                left of {limit}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ZapIcon className="size-3 text-primary" />
        {unlimited ? (
          <>
            <span className="font-medium text-foreground">{used}</span> scan
            {used === 1 ? "" : "s"} today
          </>
        ) : (
          <>Resets in {formatReset(resetSeconds)}</>
        )}
      </p>
    </div>
  );
}
