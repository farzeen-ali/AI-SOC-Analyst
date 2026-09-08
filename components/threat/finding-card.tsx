"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  ShieldQuestionIcon,
  TargetIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { SpotlightCard } from "@/components/motion/spotlight-card";
import {
  SeverityBadge,
  SeverityMeter,
  severityFromScore,
} from "@/components/threat/severity-badge";
import { Button } from "@/components/ui/button";
import { setFindingStatusAction } from "@/lib/ingest/actions";
import type { FindingStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export interface FindingView {
  id: string;
  title: string;
  threatType: string;
  severityScore: number;
  confidence: number;
  explanation: string;
  remediation: string[];
  indicators: string[];
  mitreTechniques: string[];
  status: FindingStatus;
  filename: string | null;
  createdAt: string;
}

const STATUS_ACTIONS: Array<{ value: FindingStatus; label: string }> = [
  { value: "acknowledged", label: "Acknowledge" },
  { value: "resolved", label: "Resolve" },
  { value: "dismissed", label: "Dismiss" },
];

/**
 * One AI-generated finding.
 *
 * Every string here originates from an LLM reading attacker-controlled logs,
 * so it is rendered strictly as text — React escapes it, and nothing is passed
 * to `dangerouslySetInnerHTML` or executed.
 */
export function FindingCard({
  finding,
  index = 0,
}: {
  finding: FindingView;
  index?: number;
}) {
  const [expanded, setExpanded] = React.useState(index === 0);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState(finding.status);

  const level = severityFromScore(finding.severityScore);
  const isTriaged = status !== "open";

  function updateStatus(next: FindingStatus) {
    startTransition(async () => {
      const payload = new FormData();
      payload.set("findingId", finding.id);
      payload.set("status", next);
      const result = await setFindingStatusAction(undefined, payload);
      if (result.ok) {
        setStatus(next);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <SpotlightCard
      className={cn("p-0", isTriaged && "opacity-75")}
    >
      {/* Severity rail */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          level === "critical" && "bg-critical",
          level === "high" && "bg-high",
          level === "medium" && "bg-medium",
          level === "low" && "bg-low",
          level === "info" && "bg-muted-foreground"
        )}
      />

      <div className="space-y-3 p-4 pl-5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge
                level={level}
                pulse={level === "critical" && status === "open"}
              />
              <span className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase">
                {finding.threatType}
              </span>
              {isTriaged && (
                <span className="rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-success uppercase">
                  {status}
                </span>
              )}
            </div>

            <h3 className="mt-2 font-heading text-[0.95rem] leading-snug font-semibold">
              {finding.title}
            </h3>

            {finding.filename && (
              <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[0.65rem] text-muted-foreground">
                <FileTextIcon className="size-3 shrink-0" />
                {finding.filename}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse finding" : "Expand finding"}
            onClick={() => setExpanded((current) => !current)}
            className="shrink-0"
          >
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform duration-300",
                expanded && "rotate-180"
              )}
            />
          </Button>
        </div>

        <SeverityMeter score={finding.severityScore} />

        {/*
          CSS grid collapse rather than an animated height: the open state is
          declarative, so the finding's analysis and remediation are present
          and readable even if the transition never runs (reduced motion, a
          throttled tab, or no JS at all). An animated `height: auto` would
          leave the card empty in those cases.
        */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 pt-1">
            <section>
              <SectionLabel icon={ShieldQuestionIcon} label="Analysis" />
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {finding.explanation}
              </p>
            </section>

            {finding.remediation.length > 0 && (
              <section>
                <SectionLabel icon={WrenchIcon} label="Remediation" />
                <ol className="mt-1.5 space-y-1.5">
                  {finding.remediation.map((step, stepIndex) => (
                    <li
                      key={step}
                      className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-sm"
                    >
                      <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded bg-primary/15 font-mono text-[0.6rem] font-semibold text-primary">
                        {stepIndex + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(finding.indicators.length > 0 ||
              finding.mitreTechniques.length > 0) && (
              <section>
                <SectionLabel icon={TargetIcon} label="Indicators" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {finding.mitreTechniques.map((technique) => (
                    <span
                      key={technique}
                      className="rounded-md border border-brand-2/35 bg-brand-2/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-brand-2"
                    >
                      {technique}
                    </span>
                  ))}
                  {finding.indicators.map((indicator) => (
                    <span
                      key={indicator}
                      className="max-w-full truncate rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
                    >
                      {indicator}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="mr-auto font-mono text-[0.65rem] text-muted-foreground">
                confidence {Math.round(finding.confidence * 100)}%
              </span>

              {STATUS_ACTIONS.map((action) => (
                <Button
                  key={action.value}
                  variant={status === action.value ? "secondary" : "outline"}
                  size="sm"
                  disabled={pending || status === action.value}
                  onClick={() => updateStatus(action.value)}
                  className="h-7 rounded-lg text-xs"
                >
                  {pending ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : status === action.value ? (
                    <CheckIcon className="size-3" />
                  ) : null}
                  {action.label}
                </Button>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof TargetIcon;
  label: string;
}) {
  return (
    <p className="flex items-center gap-1.5 font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
      <Icon className="size-3" />
      {label}
    </p>
  );
}
