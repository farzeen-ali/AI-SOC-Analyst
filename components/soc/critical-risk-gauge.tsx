"use client";

import * as React from "react";
import { animate, useInView } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { severityFromScore } from "@/components/threat/severity-badge";
import { cn } from "@/lib/utils";

interface CriticalRiskGaugeProps {
  /** Highest open severity, 0–10. */
  score: number;
  openFindings: number;
  className?: string;
}

const SIZE = 180;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
/** 240° sweep, leaving a 120° gap at the bottom. */
const SWEEP = 240;
const ARC_LENGTH = (SWEEP / 360) * 2 * Math.PI * RADIUS;
const FULL_CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const LEVEL_COLOR: Record<string, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--muted-foreground)",
};

const LEVEL_COPY: Record<string, string> = {
  critical: "Critical exposure",
  high: "Elevated risk",
  medium: "Moderate risk",
  low: "Low risk",
  info: "Nominal",
};

/**
 * Radial risk gauge driven by the highest *open* finding severity.
 *
 * The arc sweeps on first view and the numeral counts with it. Both are
 * written straight to the DOM rather than through React state — a 1.1s
 * animation would otherwise cost ~70 renders of the parent dashboard.
 */
export function CriticalRiskGauge({
  score,
  openFindings,
  className,
}: CriticalRiskGaugeProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const arcRef = React.useRef<SVGCircleElement>(null);
  const valueRef = React.useRef<HTMLParagraphElement>(null);

  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reducedMotion = usePrefersReducedMotion();

  const clamped = Math.min(Math.max(score, 0), 10);
  const level = clamped === 0 ? "info" : severityFromScore(clamped);
  const color = LEVEL_COLOR[level];

  React.useEffect(() => {
    const arc = arcRef.current;
    const value = valueRef.current;
    if (!arc || !value || !inView) return;

    const target = clamped / 10;

    const paint = (ratio: number) => {
      arc.style.strokeDashoffset = String(ARC_LENGTH * (1 - ratio));
      value.textContent = (ratio * 10).toFixed(1);
    };

    if (reducedMotion) {
      paint(target);
      return;
    }

    const controls = animate(0, target, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: paint,
    });

    return () => controls.stop();
  }, [inView, clamped, reducedMotion]);

  return (
    <div
      ref={ref}
      className={cn("flex flex-col items-center justify-center", className)}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          // The numeric readout below carries the same information.
          aria-hidden="true"
          className="-rotate-[210deg]"
        >
          <defs>
            <linearGradient id="gauge-track" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand-1)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--brand-2)" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="url(#gauge-track)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${FULL_CIRCUMFERENCE}`}
          />

          {/* Value arc */}
          <circle
            ref={arcRef}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${FULL_CIRCUMFERENCE}`}
            strokeDashoffset={ARC_LENGTH}
            style={{
              filter: `drop-shadow(0 0 10px ${color})`,
              transition: "stroke 0.4s ease",
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p
            ref={valueRef}
            className="font-heading text-4xl leading-none font-semibold tabular-nums"
            style={{ color }}
          >
            {clamped.toFixed(1)}
          </p>
          <p className="mt-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
            of 10
          </p>
        </div>
      </div>

      <div className="mt-1 text-center">
        <p
          className="font-heading text-sm font-semibold"
          style={{ color }}
          role="status"
        >
          {LEVEL_COPY[level]}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {openFindings === 0
            ? "No open findings"
            : `${openFindings} open finding${openFindings === 1 ? "" : "s"}`}
        </p>
      </div>
    </div>
  );
}
