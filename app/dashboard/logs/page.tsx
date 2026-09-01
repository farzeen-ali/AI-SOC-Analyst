import type { Metadata } from "next";
import { FileTerminalIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PhasePlaceholder } from "@/components/dashboard/phase-placeholder";
import { requireAuth } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Log Ingestion" };

export default async function LogsPage() {
  await requireAuth();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Ingestion"
        title="Log Ingestion"
        description="Upload security logs or stream them from your SIEM. Every file is validated, scoped to your workspace, and never shared across tenants."
      />

      <PhasePlaceholder
        icon={FileTerminalIcon}
        phase="Phase 2"
        title="Ingestion pipeline in build"
        description="Upload endpoints will inherit the Phase 1 baseline: schema validation, per-workspace rate limits, and RLS-scoped storage."
        bullets={[
          "Drag-and-drop upload with log file integrity checks",
          "Streaming connectors for Splunk, Elastic, and CloudWatch",
          "Per-workspace ingestion quotas enforced through Upstash Redis",
          "Parsed events written under Row Level Security policies",
        ]}
      />
    </div>
  );
}
