"use client";

import * as React from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangleIcon,
  ArrowUpIcon,
  InfoIcon,
  Loader2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  SquareIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  INVESTIGATION_PRESETS,
  URGENCY_LABEL,
  investigationSchema,
} from "@/lib/ai/investigation";
import {
  SeverityBadge,
  severityFromScore,
} from "@/components/threat/severity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const ALERT_STYLES = {
  critical: {
    icon: ShieldAlertIcon,
    className: "border-critical/35 bg-critical/10 text-critical",
  },
  warning: {
    icon: AlertTriangleIcon,
    className: "border-warning/35 bg-warning/10 text-warning",
  },
  info: {
    icon: InfoIcon,
    className: "border-info/35 bg-info/10 text-info",
  },
} as const;

const URGENCY_STYLES: Record<string, string> = {
  immediate: "sev-critical",
  today: "sev-high",
  this_week: "sev-low",
};

/**
 * Streaming RAG investigation.
 *
 * `useObject` validates against the same Zod schema the route streams, and
 * hands back a deep-partial object that fills in as tokens arrive — so the
 * severity badge renders the moment the verdict lands, while the remediation
 * cards are still being generated. Every field is optional mid-stream, so
 * each section guards before rendering.
 *
 * All rendered strings come from an LLM reading attacker-controlled logs.
 * They are rendered strictly as text; nothing reaches `dangerouslySetInnerHTML`.
 */
export function AiInvestigator({ className }: { className?: string }) {
  const [question, setQuestion] = React.useState("");

  const { object, submit, isLoading, stop, error, clear } = useObject({
    api: "/api/ai/investigate",
    schema: investigationSchema,
    onError: (streamError) => {
      toast.error("Investigation failed", {
        description: streamError.message.slice(0, 160),
      });
    },
  });

  function run(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 4 || isLoading) return;
    clear();
    submit({ question: trimmed });
  }

  const verdict = object?.verdict;
  const hasResult = Boolean(object) || isLoading;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <SparklesIcon className="size-3.5 text-primary" />
        <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
          Ask GuardAI
        </span>
        {isLoading && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[0.6rem] text-primary">
            <Loader2Icon className="size-3 animate-spin" />
            analysing
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!hasResult && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask a question about your ingested logs. GuardAI searches your
              vector index and streams back a grounded assessment.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {INVESTIGATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setQuestion(preset);
                    run(preset);
                  }}
                  className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error.message || "The investigation could not be completed."}
          </div>
        )}

        <div className="space-y-4">
          {/* ---- Verdict: first thing the model emits ---- */}
          <AnimatePresence>
            {verdict?.severityScore !== undefined && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="rounded-xl border border-border/60 bg-card/60 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge
                    level={severityFromScore(verdict.severityScore)}
                    score={verdict.severityScore}
                    pulse={verdict.severityScore >= 9}
                  />
                  {verdict.threatType && (
                    <span className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase">
                      {verdict.threatType}
                    </span>
                  )}
                  {verdict.confidence !== undefined && (
                    <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
                      {Math.round(verdict.confidence * 100)}% confidence
                    </span>
                  )}
                </div>

                {verdict.headline && (
                  <p className="mt-2 font-heading text-sm leading-snug font-semibold">
                    {verdict.headline}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ---- Warning alerts ---- */}
          <AnimatePresence initial={false}>
            {object?.alerts?.map((alert, index) => {
              if (!alert?.message) return null;
              const style = ALERT_STYLES[alert.level ?? "info"];
              const Icon = style.icon;

              return (
                <motion.div
                  key={`${index}-${alert.message.slice(0, 24)}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                    style.className
                  )}
                >
                  <Icon className="mt-px size-4 shrink-0" />
                  <p className="text-xs leading-relaxed">{alert.message}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* ---- Analysis prose, streaming in ---- */}
          {object?.analysis && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-border/50 bg-background/40 px-3 py-2.5"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                {object.analysis}
                {isLoading && (
                  <span className="ml-0.5 inline-block h-3.5 w-1 animate-blink bg-primary align-middle" />
                )}
              </p>
            </motion.div>
          )}

          {/* ---- Actionable remediation cards ---- */}
          <AnimatePresence initial={false}>
            {object?.remediationCards?.map((card, index) => {
              if (!card?.title) return null;

              return (
                <motion.div
                  key={`${index}-${card.title.slice(0, 24)}`}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="rounded-xl border border-border/60 bg-card/60 p-3"
                >
                  <div className="flex items-start gap-2">
                    <WrenchIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold">{card.title}</h4>
                        {card.urgency && (
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wider uppercase",
                              URGENCY_STYLES[card.urgency]
                            )}
                          >
                            {URGENCY_LABEL[card.urgency]}
                          </span>
                        )}
                      </div>

                      {card.rationale && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {card.rationale}
                        </p>
                      )}

                      {card.steps && card.steps.length > 0 && (
                        <ol className="mt-2 space-y-1">
                          {card.steps.map((step, stepIndex) =>
                            step ? (
                              <li
                                key={stepIndex}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded bg-primary/15 font-mono text-[0.55rem] font-semibold text-primary">
                                  {stepIndex + 1}
                                </span>
                                <span className="text-muted-foreground">
                                  {step}
                                </span>
                              </li>
                            ) : null
                          )}
                        </ol>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* ---- Indicators ---- */}
          {object?.indicators && object.indicators.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {object.indicators.map((indicator, index) =>
                indicator ? (
                  <motion.span
                    key={`${index}-${indicator.slice(0, 16)}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="max-w-full truncate rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
                  >
                    {indicator}
                  </motion.span>
                ) : null
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Composer ---- */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(question);
        }}
        className="flex items-center gap-2 border-t border-border/60 p-3"
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your logs…"
          maxLength={400}
          aria-label="Ask GuardAI about your logs"
          className="h-9 rounded-xl bg-background/60"
        />

        {isLoading ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Stop generating"
            onClick={stop}
            className="size-9 shrink-0 rounded-xl"
          >
            <SquareIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Run investigation"
            disabled={question.trim().length < 4}
            className="size-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-1 to-brand-2 text-primary-foreground"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
