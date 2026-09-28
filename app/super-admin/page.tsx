import type { Metadata } from "next";
import Link from "next/link";
import {
  BuildingIcon,
  CpuIcon,
  CreditCardIcon,
  ScanLineIcon,
  ScrollTextIcon,
  ShieldOffIcon,
  SparklesIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SystemHealthChart } from "@/components/admin/system-health-chart";
import { Reveal } from "@/components/motion/reveal";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  getPlatformMetrics,
  getPlatformUsageSeries,
} from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Global Analytics" };

export default async function SuperAdminPage() {
  const [metrics, usage] = await Promise.all([
    getPlatformMetrics(),
    getPlatformUsageSeries(14),
  ]);

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
        <StatCard
          index={6}
          label="Active subscriptions"
          value={metrics.activeSubscriptions}
          hint="Paying or in trial"
          icon={CreditCardIcon}
          tone="primary"
        />
        <StatCard
          index={7}
          label="Scans today"
          value={metrics.scansToday}
          hint="Across every tenant"
          icon={ScanLineIcon}
        />
        <StatCard
          index={8}
          label="Tokens today"
          value={metrics.tokensToday}
          hint="Embedding + analysis"
          icon={CpuIcon}
        />
      </div>

      <Reveal index={1}>
        <SystemHealthChart points={usage} />
      </Reveal>

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

    </div>
  );
}
