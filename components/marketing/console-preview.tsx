"use client";

import * as React from "react";
import { motion, useInView } from "framer-motion";
import { CheckIcon, SparklesIcon } from "lucide-react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

const INCIDENTS = [
  {
    id: "INC-4471",
    severity: "Critical",
    title: "Credential stuffing against SSO",
    meta: "412 attempts · 38 accounts",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  {
    id: "INC-4470",
    severity: "High",
    title: "Anomalous egress to unknown ASN",
    meta: "2.4 GB · edge-firewall",
    tone: "border-warning/30 bg-warning/10 text-warning",
  },
  {
    id: "INC-4469",
    severity: "Medium",
    title: "Impossible travel on admin account",
    meta: "Lisbon → Seoul · 22m",
    tone: "border-info/30 bg-info/10 text-info",
  },
  {
    id: "INC-4468",
    severity: "Resolved",
    title: "Endpoint isolated by playbook",
    meta: "WKS-0472 · auto-remediated",
    tone: "border-success/30 bg-success/10 text-success",
  },
];

const ANALYSIS =
  "Correlated 412 failed SSO attempts from 6 ASNs against 38 accounts in 90s. Pattern matches T1110.003 password spraying. Two accounts show successful auth post-spray — recommend immediate session revocation and forced reset.";

const STEPS = [
  "Revoke active sessions for 2 affected accounts",
  "Force password reset with MFA re-enrolment",
  "Block source ASNs at the edge for 24h",
];

/**
 * Owns the per-character typing state.
 *
 * Kept separate from `ConsolePreview` on purpose: this re-renders every 18ms
 * while typing, and if the incident cards shared that render they would keep
 * restarting their entrance animation.
 */
function AnalysisPanel({ active }: { active: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [typed, setTyped] = React.useState(0);

  React.useEffect(() => {
    if (!active || reducedMotion) return;

    const interval = window.setInterval(() => {
      setTyped((current) => {
        if (current >= ANALYSIS.length) {
          window.clearInterval(interval);
          return current;
        }
        return current + 2;
      });
    }, 18);

    return () => window.clearInterval(interval);
  }, [active, reducedMotion]);

  // With reduced motion the text is simply present — derived, not animated.
  const visible = reducedMotion ? ANALYSIS.length : typed;
  const done = visible >= ANALYSIS.length;

  return (
    <div className="space-y-3 p-3">
      <p className="flex items-center gap-1.5 px-1 font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
        <SparklesIcon className="size-3 text-primary" />
        AI analysis
      </p>

      <div className="min-h-[6.5rem] rounded-xl border border-border/50 bg-background/50 p-2.5">
        <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
          {ANALYSIS.slice(0, visible)}
          {!done && (
            <span className="ml-px inline-block h-3 w-1 animate-pulse bg-primary align-middle" />
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="px-1 font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
          Recommended playbook
        </p>
        {STEPS.map((step, index) => (
          <motion.div
            key={step}
            initial={STEP_HIDDEN}
            animate={done ? STEP_SHOWN : STEP_HIDDEN}
            transition={{ delay: index * 0.12, duration: 0.35 }}
            className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/5 px-2.5 py-1.5"
          >
            <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
            <span className="text-[0.7rem] leading-relaxed text-muted-foreground">
              {step}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* Stable target objects — a fresh object literal on every render makes
   Framer Motion treat the animation as changed and restart it. */
const CARD_HIDDEN = { opacity: 0, x: -12 };
const CARD_SHOWN = { opacity: 1, x: 0 };
const STEP_HIDDEN = { opacity: 0, y: 6 };
const STEP_SHOWN = { opacity: 1, y: 0 };

/**
 * Animated product mock for the hero.
 *
 * The analysis text types out once the panel scrolls into view, then stops —
 * no looping animation competing with the page copy for attention.
 */
export function ConsolePreview({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Ambient glow behind the panel. */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-1/20 via-brand-2/15 to-brand-3/20 blur-3xl"
      />

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur-xl">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-warning/60" />
            <span className="size-2.5 rounded-full bg-success/60" />
          </span>
          <span className="ml-2 font-mono text-[0.65rem] text-muted-foreground">
            guardai · acme-security-ops
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            <span className="font-mono text-[0.6rem] text-muted-foreground">
              live
            </span>
          </span>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
          {/* Incident queue */}
          <div className="space-y-2 border-b border-border/60 p-3 md:border-r md:border-b-0">
            <p className="px-1 font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
              Incident queue
            </p>

            {INCIDENTS.map((incident, index) => (
              <motion.div
                key={incident.id}
                initial={CARD_HIDDEN}
                animate={inView ? CARD_SHOWN : CARD_HIDDEN}
                transition={{ delay: 0.1 + index * 0.09, duration: 0.4 }}
                className={cn(
                  "rounded-xl border border-border/50 bg-background/50 p-2.5",
                  index === 0 && "border-primary/30 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">
                    {incident.id}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded border px-1.5 py-px font-mono text-[0.55rem] tracking-wide uppercase",
                      incident.tone
                    )}
                  >
                    {incident.severity}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-medium">
                  {incident.title}
                </p>
                <p className="truncate font-mono text-[0.6rem] text-muted-foreground">
                  {incident.meta}
                </p>
              </motion.div>
            ))}
          </div>

          {/* AI analysis */}
          <AnalysisPanel active={inView} />
        </div>

        {/* Footer metrics */}
        <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 bg-muted/30">
          {[
            { label: "MTTD", value: "38s" },
            { label: "MTTR", value: "4m 12s" },
            { label: "Auto-resolved", value: "71%" },
          ].map((metric) => (
            <div key={metric.label} className="px-3 py-2.5 text-center">
              <p className="font-heading text-sm font-semibold">
                {metric.value}
              </p>
              <p className="font-mono text-[0.55rem] tracking-[0.14em] text-muted-foreground uppercase">
                {metric.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
