import type { Metadata } from "next";
import { ShieldAlertIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PhasePlaceholder } from "@/components/dashboard/phase-placeholder";
import { requireAuth } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Threat Dashboard" };

/** Open to every workspace role — Members included, per the RBAC matrix. */
export default async function ThreatsPage() {
  await requireAuth();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Detection"
        title="Threat Dashboard"
        description="Ranked incidents correlated from your ingested logs, with MITRE ATT&CK mapping and AI-drafted remediation."
      />

      <PhasePlaceholder
        icon={ShieldAlertIcon}
        phase="Phase 2"
        title="Detection engine not yet connected"
        description="Your workspace, roles, and isolation boundaries are in place. Threat analysis switches on once the ingestion pipeline lands."
        bullets={[
          "Real-time stream analysis over ingested security logs",
          "Retrieval-augmented context from your threat intelligence corpus",
          "Severity ranking with MITRE ATT&CK technique mapping",
          "One-click remediation playbooks scoped to your workspace",
        ]}
      />
    </div>
  );
}
