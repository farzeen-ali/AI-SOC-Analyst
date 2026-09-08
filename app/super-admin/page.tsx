import type { Metadata } from "next";
import Link from "next/link";
import {
  BuildingIcon,
  ScrollTextIcon,
  ShieldOffIcon,
  SparklesIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PhasePlaceholder } from "@/components/dashboard/phase-placeholder";
import { Reveal } from "@/components/motion/reveal";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { getPlatformMetrics } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Global Analytics" };

export default async function SuperAdminPage() {
  const metrics = await getPlatformMetrics();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Platform console"
        title="Global Analytics"
        description="Cross-tenant metrics for the whole GuardAI deployment. Subscription tier limits do not apply to Super Admin accounts."
        action={
          <Button
            variant="outline"
            className="h-9 rounded-xl"
            nativeButton={false}
            render={<Link href="/super-admin/audit" />}
          >
            <ScrollTextIcon className="size-4" />
            Audit trail
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          index={0}
          label="Total tenants"
          value={metrics.totalTenants}
          hint={`${metrics.proTenants} on Pro`}
          icon={BuildingIcon}
          tone="primary"
        />
        <StatCard
          index={1}
          label="Total users"
          value={metrics.totalUsers}
          hint="Across every workspace"
          icon={UsersIcon}
        />
        <StatCard
          index={2}
          label="Audit events"
          value={metrics.auditEvents}
          hint="Authentication and admin actions"
          icon={ScrollTextIcon}
        />
        <StatCard
          index={3}
          label="Suspended tenants"
          value={metrics.suspendedTenants}
          icon={ShieldOffIcon}
          tone={metrics.suspendedTenants > 0 ? "warning" : "default"}
        />
        <StatCard
          index={4}
          label="Suspended users"
          value={metrics.suspendedUsers}
          icon={UserXIcon}
          tone={metrics.suspendedUsers > 0 ? "warning" : "default"}
        />
        <StatCard
          index={5}
          label="Pro conversion"
          value={
            metrics.totalTenants > 0
              ? `${Math.round((metrics.proTenants / metrics.totalTenants) * 100)}%`
              : "—"
          }
          hint="Tenants on a paid plan"
          icon={SparklesIcon}
          tone="success"
        />
      </div>

      <Reveal index={6}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { href: "/super-admin/tenants", label: "Manage tenants", icon: BuildingIcon },
            { href: "/super-admin/users", label: "Manage users", icon: UsersIcon },
            { href: "/super-admin/audit", label: "Read audit logs", icon: ScrollTextIcon },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 backdrop-blur-xl transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40 transition-colors group-hover:border-primary/25 group-hover:bg-primary/10">
                <Icon className="size-4 text-primary" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </Reveal>

      <PhasePlaceholder
        icon={SparklesIcon}
        phase="Phase 2"
        title="AI token & log-volume telemetry"
        description="Tenant, user, and audit metrics are live. Token consumption and scanned-log counters arrive with the ingestion and RAG pipeline."
        bullets={[
          "System API usage and AI token consumption per tenant",
          "Total scanned logs and ingestion throughput",
          "Per-tenant cost attribution and quota alerts",
        ]}
      />
    </div>
  );
}
