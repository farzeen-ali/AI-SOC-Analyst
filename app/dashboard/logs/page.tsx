import type { Metadata } from "next";
import {
  DatabaseIcon,
  FileStackIcon,
  ScanTextIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { FileList } from "@/components/ingest/file-list";
import { UploadDropzone } from "@/components/ingest/upload-dropzone";
import { Reveal } from "@/components/motion/reveal";
import { requireAuth } from "@/lib/auth/dal";
import { uploadLimitFor } from "@/lib/ingest/constants";
import { getIngestStats, listLogFiles } from "@/lib/ingest/queries";

export const metadata: Metadata = { title: "Log Ingestion" };

/** Open to every workspace role — Members ingest logs too. */
export default async function LogsPage() {
  const context = await requireAuth();
  const [files, stats] = await Promise.all([listLogFiles(), getIngestStats()]);

  const plan = context.workspace?.plan ?? "free";
  const maxBytes = uploadLimitFor(plan, context.isSuperAdmin);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Ingestion"
        title="Log Ingestion"
        description="Upload security logs and GuardAI parses, masks, embeds, and analyses them in the background. Nothing blocks while you work."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Files ingested"
          value={stats.filesTotal}
          hint={
            stats.filesProcessing > 0
              ? `${stats.filesProcessing} in flight`
              : "All settled"
          }
          icon={FileStackIcon}
          tone="primary"
        />
        <StatCard
          index={1}
          label="Events indexed"
          value={stats.eventsIndexed.toLocaleString()}
          icon={ScanTextIcon}
        />
        <StatCard
          index={2}
          label="Vector chunks"
          value={stats.chunksIndexed.toLocaleString()}
          hint="1536-dim, pgvector"
          icon={DatabaseIcon}
        />
        <StatCard
          index={3}
          label="PII masked"
          value={stats.maskedValues.toLocaleString()}
          hint="Before embedding"
          icon={ShieldCheckIcon}
          tone="success"
        />
      </div>

      <Reveal index={4}>
        <UploadDropzone maxBytes={maxBytes} planLabel={plan.toUpperCase()} />
      </Reveal>

      <Reveal index={5} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">
            Ingestion queue
          </h2>
          <span className="font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </div>

        <FileList files={files} canDelete={context.isTenantAdmin} />
      </Reveal>
    </div>
  );
}
