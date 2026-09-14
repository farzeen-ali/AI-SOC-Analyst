import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  CrosshairIcon,
  FlameIcon,
  LockIcon,
  ShieldAlertIcon,
  UploadCloudIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Reveal } from "@/components/motion/reveal";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { AiInvestigator } from "@/components/soc/ai-investigator";
import {
  AttackVectorChart,
  SeverityDistribution,
} from "@/components/soc/attack-vector-chart";
import { CriticalRiskGauge } from "@/components/soc/critical-risk-gauge";
import { LiveLogStream } from "@/components/soc/live-log-stream";
import { RemediationChecklist } from "@/components/soc/remediation-checklist";
import {
  PlatformManagementBanner,
  UpgradePanel,
} from "@/components/soc/role-panels";
import { InviteModal } from "@/components/team/invite-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAuth, toUserDTO } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  getRecentSocEvents,
  getSocAnalytics,
  listRemediationSteps,
} from "@/lib/soc/queries";
import { roleLabel, roleSummary } from "@/lib/roles";

export const metadata: Metadata = { title: "SOC Intelligence Center" };

const DENIAL_MESSAGES: Record<string, string> = {
  "tenant-admin":
    "That screen is limited to Tenant Admins. Ask your workspace owner for access.",
  "super-admin": "The platform console is limited to Super Admin accounts.",
};

/**
 * SOC Intelligence Center.
 *
 * Composed of independently-suspended panels so the shell and the fast
 * analytics paint immediately while the slower live stream and remediation
 * queries stream in behind their own skeletons — no layout shift, no blank
 * screen.
 *
 * Role-based rendering happens here on the server: a Member's response simply
 * does not contain the billing, upgrade, or team markup.
 */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const [context, searchParams] = await Promise.all([
    requireAuth(),
    props.searchParams,
  ]);
  const user = toUserDTO(context);

  const denied = Array.isArray(searchParams.denied)
    ? searchParams.denied[0]
    : searchParams.denied;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {denied && DENIAL_MESSAGES[denied] && (
        <Reveal>
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning"
          >
            <LockIcon className="mt-px size-4 shrink-0" />
            <p>{DENIAL_MESSAGES[denied]}</p>
          </div>
        </Reveal>
      )}

      {/* Super Admin only. */}
      <PlatformManagementBanner user={user} />

      <PageHeader
        eyebrow={`Signed in as ${roleLabel(user)}`}
        title="SOC Intelligence Center"
        description={roleSummary(user)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Tenant Admin only — Members get neither control. */}
            {user.isTenantAdmin && (
              <Suspense fallback={<Skeleton className="h-9 w-32 rounded-xl" />}>
                <InviteControl workspaceId={context.workspace?.id ?? null} />
              </Suspense>
            )}
            <Button
              className="h-9 rounded-xl"
              nativeButton={false}
              render={<Link href="/dashboard/logs" />}
            >
              <UploadCloudIcon className="size-4" />
              Ingest logs
            </Button>
          </div>
        }
      />

      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsSection workspaceId={context.workspace?.id ?? null} />
      </Suspense>

      {/* Tenant Admin only. */}
      <UpgradePanel user={user} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="min-h-[26rem]">
          <SpotlightCard className="flex h-full flex-col p-0" inert>
            <Suspense fallback={<PanelSkeleton label="Live stream" />}>
              <LiveStreamSection />
            </Suspense>
          </SpotlightCard>
        </Reveal>

        <Reveal index={1} className="min-h-[26rem]">
          <SpotlightCard className="flex h-full flex-col p-0" inert>
            <AiInvestigator />
          </SpotlightCard>
        </Reveal>
      </div>

      <Reveal index={2}>
        <SpotlightCard className="flex max-h-[30rem] flex-col p-0" inert>
          <Suspense fallback={<PanelSkeleton label="Remediation" />}>
            <RemediationSection />
          </Suspense>
        </SpotlightCard>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Streamed sections
 * ------------------------------------------------------------------ */

async function AnalyticsSection({ workspaceId }: { workspaceId: string | null }) {
  const analytics = await getSocAnalytics(workspaceId);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Threats detected"
          value={analytics.totalFindings}
          hint={`${analytics.openFindings} still open`}
          icon={ShieldAlertIcon}
          tone="primary"
        />
        <StatCard
          index={1}
          label="Critical"
          value={analytics.criticalFindings}
          hint="Severity 9–10"
          icon={FlameIcon}
          tone={analytics.criticalFindings > 0 ? "warning" : "success"}
        />
        <StatCard
          index={2}
          label="Mean severity"
          value={analytics.meanSeverity || 0}
          hint="Across all findings"
          icon={ActivityIcon}
        />
        <StatCard
          index={3}
          label="Steps resolved"
          value={analytics.steps.resolved}
          hint={`${analytics.steps.pending + analytics.steps.in_progress} outstanding`}
          icon={CrosshairIcon}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal index={4} className="lg:col-span-2">
          <SpotlightCard className="h-full p-4">
            <p className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              Critical risk
            </p>
            <CriticalRiskGauge
              score={analytics.maxOpenSeverity}
              openFindings={analytics.openFindings}
              className="mt-2"
            />
            <SeverityDistribution
              bySeverity={analytics.bySeverity}
              className="mt-4"
            />
          </SpotlightCard>
        </Reveal>

        <Reveal index={5} className="lg:col-span-3">
          <SpotlightCard className="h-full p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                Attack vectors
              </p>
              <Link
                href="/dashboard/threats"
                className="font-mono text-[0.6rem] text-primary underline-offset-4 hover:underline"
              >
                View all
              </Link>
            </div>
            <AttackVectorChart vectors={analytics.vectors} className="mt-3" />
          </SpotlightCard>
        </Reveal>
      </div>
    </div>
  );
}

async function LiveStreamSection() {
  const events = await getRecentSocEvents(40);
  return <LiveLogStream initialEvents={events} />;
}

async function RemediationSection() {
  const steps = await listRemediationSteps(40);
  return <RemediationChecklist steps={steps} />;
}

/** Seat usage for the invite dialog. Scoped by RLS to this workspace. */
async function InviteControl({ workspaceId }: { workspaceId: string | null }) {
  if (!workspaceId) return null;

  const context = await requireAuth();
  const supabase = await createClient();
  const { count } = await supabase
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  return (
    <InviteModal
      seatsUsed={count ?? 0}
      seats={context.workspace?.seats ?? 0}
    />
  );
}

/* ------------------------------------------------------------------ *
 *  Skeletons — sized to their real content so nothing shifts
 * ------------------------------------------------------------------ */

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[6.5rem] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[22rem] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[22rem] rounded-2xl lg:col-span-3" />
      </div>
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            className="h-10 rounded-lg"
            style={{ opacity: 1 - index * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
}
