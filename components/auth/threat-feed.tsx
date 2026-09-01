"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "resolved";

interface FeedEvent {
  id: number;
  severity: Severity;
  rule: string;
  detail: string;
  source: string;
}

/** Illustrative detections — this panel is decoration, not live telemetry. */
const EVENTS: FeedEvent[] = [
  {
    id: 1,
    severity: "critical",
    rule: "T1110.003 · Password Spraying",
    detail: "412 failed logins across 38 accounts",
    source: "identity-provider",
  },
  {
    id: 2,
    severity: "high",
    rule: "T1048 · Exfiltration Over C2",
    detail: "2.4 GB egress to unrecognised ASN",
    source: "edge-firewall",
  },
  {
    id: 3,
    severity: "resolved",
    rule: "Playbook · Isolate Endpoint",
    detail: "Host WKS-0472 quarantined automatically",
    source: "guardai-response",
  },
  {
    id: 4,
    severity: "medium",
    rule: "T1078 · Valid Accounts",
    detail: "Impossible travel: Lisbon → Seoul in 22m",
    source: "auth-logs",
  },
  {
    id: 5,
    severity: "high",
    rule: "T1059.001 · PowerShell",
    detail: "Encoded command spawned by office suite",
    source: "edr-agent",
  },
  {
    id: 6,
    severity: "resolved",
    rule: "Playbook · Revoke Sessions",
    detail: "17 tokens invalidated for compromised user",
    source: "guardai-response",
  },
];

const SEVERITY_STYLES: Record<Severity, { dot: string; chip: string }> = {
  critical: {
    dot: "bg-destructive",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  high: {
    dot: "bg-warning",
    chip: "border-warning/30 bg-warning/10 text-warning",
  },
  medium: {
    dot: "bg-info",
    chip: "border-info/30 bg-info/10 text-info",
  },
  resolved: {
    dot: "bg-success",
    chip: "border-success/30 bg-success/10 text-success",
  },
};

const VISIBLE = 3;

/**
 * Rotating detection ticker for the auth split-screen.
 *
 * Advances on a timer, pausing while the tab is hidden so a backgrounded login
 * page is not doing layout work. Marked `aria-hidden` — it carries no
 * information a user needs to sign in.
 */
export function ThreatFeed({ className }: { className?: string }) {
  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      setCursor((current) => (current + 1) % EVENTS.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, []);

  const visible = Array.from(
    { length: VISIBLE },
    (_, offset) => EVENTS[(cursor + offset) % EVENTS.length]
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[0.65rem] tracking-[0.16em] text-white/50 uppercase">
          Live detections
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          <span className="font-mono text-[0.65rem] text-white/50">
            streaming
          </span>
        </span>
      </div>

      <div className="relative h-[10.5rem] overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((event, index) => {
            const styles = SEVERITY_STYLES[event.severity];
            return (
              <motion.div
                // Keyed by event, not by slot: two of the three cards persist
                // between ticks and slide up, while only one enters and one
                // exits. Keying by slot would re-mount all three at once.
                key={event.id}
                layout
                initial={{ opacity: 0, y: 26, scale: 0.97 }}
                animate={{
                  opacity: 1 - index * 0.28,
                  y: index * 56,
                  scale: 1 - index * 0.02,
                }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 top-0"
              >
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      styles.dot
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[0.7rem] text-white/85">
                      {event.rule}
                    </p>
                    <p className="truncate text-[0.7rem] text-white/50">
                      {event.detail}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide uppercase",
                      styles.chip
                    )}
                  >
                    {event.severity}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Fade the stack out at the bottom so cards do not clip abruptly. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0b1220] to-transparent" />
      </div>
    </div>
  );
}
