import type { Metadata } from "next";
import { KeyRoundIcon, SlidersHorizontalIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PhasePlaceholder } from "@/components/dashboard/phase-placeholder";
import { Reveal } from "@/components/dashboard/reveal";
import { requireTenantAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Workspace Settings" };

/** Tenant Admin only — Members never reach this route. */
export default async function WorkspaceSettingsPage() {
  const context = await requireTenantAdmin();
  const workspace = context.workspace;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Workspace name", value: workspace?.name ?? "—" },
    { label: "Slug", value: workspace?.slug ?? "—" },
    { label: "Workspace ID", value: workspace?.id ?? "—" },
    { label: "Plan", value: (workspace?.plan ?? "free").toUpperCase() },
    {
      label: "Created",
      value: workspace
        ? new Date(workspace.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "—",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Workspace Settings"
        description="Tenant identity and configuration. Every value here is scoped to your workspace by Row Level Security."
      />

      <Reveal>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <SlidersHorizontalIcon className="size-4 text-primary" />
            <h2 className="font-heading text-sm font-semibold">
              Tenant identity
            </h2>
          </div>

          <dl className="divide-y divide-border/60">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="truncate font-mono text-xs text-foreground sm:max-w-[60%] sm:text-right">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>

      <PhasePlaceholder
        icon={KeyRoundIcon}
        phase="Phase 2"
        title="SOC configuration & API keys"
        description="Renaming, custom detection rules, and scoped API keys build on the tenant record that is already provisioned here."
        bullets={[
          "Workspace rename with slug re-generation",
          "Custom SOC detection rule sets per tenant",
          "Scoped API keys for log shipping, revocable per key",
          "Retention and data residency controls",
        ]}
      />
    </div>
  );
}
