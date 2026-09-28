"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ActivityIcon, CpuIcon, ScanLineIcon } from "lucide-react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import type { UsagePoint } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

type Series = "scans" | "tokens" | "aiCalls";

const SERIES: Record<
  Series,
  { label: string; icon: typeof ScanLineIcon; stroke: string; fill: string }
> = {
  scans: {
    label: "Log scans",
    icon: ScanLineIcon,
    stroke: "var(--color-primary)",
    fill: "var(--color-primary)",
  },
  tokens: {
    label: "Model tokens",
    icon: CpuIcon,
    stroke: "var(--color-brand-2)",
    fill: "var(--color-brand-2)",
  },
  aiCalls: {
    label: "API calls",
    icon: ActivityIcon,
    stroke: "var(--color-warning)",
    fill: "var(--color-warning)",
  },
};

const WIDTH = 720;
const HEIGHT = 200;
const PADDING = { top: 16, right: 8, bottom: 22, left: 8 };

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/**
 * Platform usage over the trailing window.
 *
 * Hand-drawn SVG rather than a charting dependency: three series over about a
 * fortnight is a path and a polygon, and the alternative is shipping a
 * library to every Super Admin page load for one figure.
 *
 * The y-axis is scaled per series, so switching tabs re-frames rather than
 * flattening tokens against scans — the counts differ by orders of magnitude
 * and a shared axis would make one of them a flat line on the floor.
 */
export function SystemHealthChart({
  points,
  className,
}: {
  points: UsagePoint[];
  className?: string;
}) {
  const [series, setSeries] = React.useState<Series>("scans");
  const reducedMotion = usePrefersReducedMotion();

  const values = points.map((point) => point[series]);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...values);

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const coordinates = points.map((point, index) => {
    const x =
      PADDING.left +
      (points.length === 1
        ? innerWidth / 2
        : (index / (points.length - 1)) * innerWidth);
    const y = PADDING.top + innerHeight * (1 - point[series] / max);
    return { x, y, point };
  });

  const line = coordinates
    .map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const area =
    coordinates.length > 0
      ? `${line} L${coordinates[coordinates.length - 1].x.toFixed(1)},${
          PADDING.top + innerHeight
        } L${coordinates[0].x.toFixed(1)},${PADDING.top + innerHeight} Z`
      : "";

  const config = SERIES[series];

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card/70 p-8 text-center backdrop-blur-xl",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">
          No usage recorded yet. Metrics appear once tenants start scanning
          logs.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold tracking-tight">
          System health
        </h2>

        <div
          role="tablist"
          aria-label="Usage series"
          className="flex gap-1 rounded-xl border border-border/60 bg-muted/40 p-0.5"
        >
          {(Object.keys(SERIES) as Series[]).map((key) => {
            const item = SERIES[key];
            const Icon = item.icon;
            const active = key === series;

            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setSeries(key)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="health-tab"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg border border-border/70 bg-card shadow-sm"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <Icon className="relative size-3" />
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <Stat label={`${config.label} total`} value={compact(total)} />
        <Stat label="Peak day" value={compact(peak)} />
        <Stat
          label="Daily average"
          value={compact(Math.round(total / points.length))}
        />
      </div>

      <div className="px-2 pb-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-52 w-full"
          role="img"
          aria-label={`${config.label} over the last ${points.length} days. Total ${total}.`}
        >
          <defs>
            <linearGradient id={`health-fill-${series}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.fill} stopOpacity="0.30" />
              <stop offset="100%" stopColor={config.fill} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Baselines at 0, 50% and 100% of the current scale. */}
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PADDING.top + innerHeight * fraction}
              y2={PADDING.top + innerHeight * fraction}
              className="stroke-border/40"
              strokeDasharray={fraction === 1 ? undefined : "3 5"}
            />
          ))}

          <motion.path
            key={`${series}-area`}
            d={area}
            fill={`url(#health-fill-${series})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.5 }}
          />

          <motion.path
            key={`${series}-line`}
            d={line}
            fill="none"
            stroke={config.stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reducedMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: reducedMotion ? 0 : 0.9,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {coordinates.map((c) => (
            <g key={c.point.day}>
              <circle
                cx={c.x}
                cy={c.y}
                r={3}
                fill="var(--color-card)"
                stroke={config.stroke}
                strokeWidth={2}
              />
              {/* Native tooltip keeps the hit target free of JS state. */}
              <title>{`${c.point.day}: ${c.point[series].toLocaleString()} ${config.label.toLowerCase()}`}</title>
              <rect
                x={c.x - 12}
                y={PADDING.top}
                width={24}
                height={innerHeight}
                fill="transparent"
              />
            </g>
          ))}

          {/* First and last day labels only — a 14-tick axis is unreadable. */}
          <text
            x={PADDING.left}
            y={HEIGHT - 6}
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {points[0]?.day.slice(5)}
          </text>
          <text
            x={WIDTH - PADDING.right}
            y={HEIGHT - 6}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {points[points.length - 1]?.day.slice(5)}
          </text>
        </svg>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-2">
      <p className="font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
