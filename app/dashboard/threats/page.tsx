import type { Metadata } from "next";
import Link from "next/link";
import {
  ActivityIcon,
  FlameIcon,
  InboxIcon,
  ShieldAlertIcon,
  UploadCloudIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Reveal } from "@/components/motion/reveal";
import { FindingCard, type FindingView } from "@/components/threat/finding-card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/dal";
import { getIngestStats, listFindings } from "@/lib/ingest/queries";
import type { Json } from "@/lib/types/database";

export const metadata: Metadata = { title: "Threat Dashboard" };

/** Narrows a jsonb column to a string array without trusting its contents. */
function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, 16);
}

export default async function ThreatsPage() {
  await requireAuth();
  const [findings, stats] = await Promise.all([
    listFindings(),
    getIngestStats(),
  ]);

  const views: FindingView[] = findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    threatType: finding.threat_type,
    severityScore: finding.severity_score,
    confidence: Number(finding.confidence),
    explanation: finding.explanation,
    remediation: toStringArray(finding.remediation),
    indicators: toStringArray(finding.indicators),
    mitreTechniques: toStringArray(finding.mitre_techniques),
    status: finding.status,
    filename: finding.log_files?.filename ?? null,
    createdAt: finding.created_at,
  }));

  const open = views.filter((view) => view.status === "open");
  const triaged = views.filter((view) => view.status !== "open");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Detection"
        title="Threat Dashboard"
        description="Findings produced by retrieval-augmented analysis of your ingested logs, ranked by severity with remediation already drafted."
        action={
          <Button
            className="h-9 rounded-xl"
            nativeButton={false}
            render={<Link href="/dashboard/logs" />}
          >
            <UploadCloudIcon className="size-4" />
            Ingest logs
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Open findings"
          value={stats.openFindings}
          hint={`${triaged.length} triaged`}
          icon={InboxIcon}
          tone={stats.openFindings > 0 ? "warning" : "success"}
        />
        <StatCard
          index={1}
          label="Critical"
          value={stats.criticalFindings}
          hint="Severity 9–10"
          icon={FlameIcon}
          tone={stats.criticalFindings > 0 ? "warning" : "default"}
        />
        <StatCard
          index={2}
          label="Mean severity"
          value={stats.meanSeverity || "—"}
          hint="Across all findings"
          icon={ActivityIcon}
        />
        <StatCard
          index={3}
          label="Vector chunks"
          value={stats.chunksIndexed.toLocaleString()}
          hint="Searched per analysis"
          icon={ShieldAlertIcon}
          tone="primary"
        />
      </div>

      {views.length === 0 ? (
        <Reveal index={4}>
          <div className="rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-success/25 bg-success/10">
              <ShieldAlertIcon className="size-6 text-success" />
            </span>
            <h2 className="font-heading text-lg font-semibold">
              No findings yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Ingest a log file and GuardAI will sweep it with vector search,
              analyse what it retrieves, and post any findings here.
            </p>
            <Button
              variant="outline"
              className="mt-5 h-10 rounded-xl"
              nativeButton={false}
              render={<Link href="/dashboard/logs" />}
            >
              <UploadCloudIcon className="size-4" />
              Upload your first log
            </Button>
          </div>
        </Reveal>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-heading text-base font-semibold">
                Open · {open.length}
              </h2>
              <div className="space-y-3">
                {open.map((view, index) => (
                  <Reveal key={view.id} index={index}>
                    <FindingCard finding={view} index={index} />
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {triaged.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-heading text-base font-semibold text-muted-foreground">
                Triaged · {triaged.length}
              </h2>
              <div className="space-y-3">
                {triaged.map((view, index) => (
                  <Reveal key={view.id} index={index}>
                    <FindingCard finding={view} index={index + 1} />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
