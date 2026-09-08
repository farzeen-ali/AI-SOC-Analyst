import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BuildingIcon,
  CheckIcon,
  CreditCardIcon,
  LockIcon,
  ShieldCheckIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/motion/reveal";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { requireAuth, toUserDTO } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { roleLabel, roleSummary } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

/** Live protections, surfaced so the posture is auditable at a glance. */
const SECURITY_BASELINE = [
  "PostgreSQL Row Level Security on every table",
  "Custom JWT claims carrying workspace_id and role",
  "Brute-force lockout after 5 failed attempts (15 min)",
  "Per-IP and per-identity rate limiting via Upstash Redis",
  "Zod schema validation on both client and server",
  "HTTP-only, SameSite session cookies",
  "PII masked before logs are embedded or sent to an LLM",
  "Vector search scoped to workspace_id by RLS",
];

const DENIAL_MESSAGES: Record<string, string> = {
  "tenant-admin":
    "That screen is limited to Tenant Admins. Ask your workspace owner for access.",
  "super-admin": "The platform console is limited to Super Admin accounts.",
};

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const [context, searchParams] = await Promise.all([
    requireAuth(),
    props.searchParams,
  ]);
  const user = toUserDTO(context);

  const denied = Array.isArray(searchParams.denied)
    ? searchParams.denied[0]
    : searchParams.denied;

  // Scoped by RLS to this workspace — no explicit tenant filter needed, but we
  // pass one anyway so the query is correct even if a policy is later relaxed.
  const supabase = await createClient();
  const { count: memberCount } = context.workspace
    ? await supabase
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", context.workspace.id)
    : { count: 0 };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
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

      <PageHeader
        eyebrow={`Signed in as ${roleLabel(user)}`}
        title={`Welcome back, ${user.fullName.split(" ")[0]}`}
        description={roleSummary(user)}
        action={
          user.isTenantAdmin ? (
            <Button
              className="h-9 rounded-xl"
              nativeButton={false}
              render={<Link href="/dashboard/team" />}
            >
              <UsersIcon className="size-4" />
              Manage team
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Workspace"
          value={user.workspaceName ?? "—"}
          hint={context.workspace ? `/${context.workspace.slug}` : "Unassigned"}
          icon={BuildingIcon}
          tone="primary"
        />
        <StatCard
          index={1}
          label="Your role"
          value={roleLabel(user)}
          hint={user.isSuperAdmin ? "Plan limits waived" : "Scoped to this tenant"}
          icon={ShieldCheckIcon}
          tone="success"
        />
        <StatCard
          index={2}
          label="Team members"
          value={memberCount ?? 0}
          hint={
            context.workspace
              ? `${context.workspace.seats} seat${context.workspace.seats === 1 ? "" : "s"} allocated`
              : undefined
          }
          icon={UsersIcon}
        />
        <StatCard
          index={3}
          label="Plan"
          value={(user.workspacePlan ?? "free").toUpperCase()}
          hint={context.workspace?.subscription_status ?? undefined}
          icon={CreditCardIcon}
          tone={user.workspacePlan === "pro" ? "success" : "warning"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* -------- Security baseline -------- */}
        <Reveal index={4} className="lg:col-span-3">
          <section className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-20 size-56 rounded-full bg-primary/10 blur-3xl"
            />

            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                  <ShieldCheckIcon className="size-4 text-primary" />
                </span>
                <div>
                  <h2 className="font-heading text-base font-semibold">
                    Security baseline
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Controls active on every request in this workspace
                  </p>
                </div>
              </div>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {SECURITY_BASELINE.map((control) => (
                  <li
                    key={control}
                    className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs leading-relaxed"
                  >
                    <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
                    <span className="text-muted-foreground">{control}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </Reveal>

        {/* -------- Permission matrix -------- */}
        <Reveal index={5} className="lg:col-span-2">
          <section className="h-full rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-xl">
            <h2 className="font-heading text-base font-semibold">
              What your role unlocks
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Enforced by RLS policies and route guards, not just the UI.
            </p>

            <ul className="mt-4 space-y-2">
              <PermissionRow
                label="Log upload & threat dashboard"
                granted
                icon={ShieldCheckIcon}
              />
              <PermissionRow
                label="Profile, password & MFA"
                granted
                icon={UserCogIcon}
              />
              <PermissionRow
                label="Team invitations & roles"
                granted={user.isTenantAdmin}
                icon={UsersIcon}
              />
              <PermissionRow
                label="Billing & subscription"
                granted={user.isTenantAdmin}
                icon={CreditCardIcon}
              />
              <PermissionRow
                label="All tenants & platform metrics"
                granted={user.isSuperAdmin}
                icon={BuildingIcon}
              />
            </ul>
          </section>
        </Reveal>
      </div>

      {/* -------- Next phase -------- */}
      <Reveal index={6}>
        <section className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-card/70 to-primary/5 p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-base font-semibold">
              Ingest your first log file
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Drop a JSON, CSV, syslog, or plain log file and GuardAI parses it,
              masks the PII, embeds it into pgvector, and posts ranked findings
              with remediation already drafted.
            </p>
          </div>
          <Button
            className="h-9 shrink-0 rounded-xl"
            nativeButton={false}
            render={<Link href="/dashboard/logs" />}
          >
            Ingest logs
            <ArrowRightIcon className="size-4" />
          </Button>
        </section>
      </Reveal>
    </div>
  );
}

function PermissionRow({
  label,
  granted,
  icon: Icon,
}: {
  label: string;
  granted: boolean;
  icon: typeof ShieldCheckIcon;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs",
        granted
          ? "border-success/25 bg-success/5 text-foreground"
          : "border-border/50 bg-muted/20 text-muted-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          granted ? "text-success" : "text-muted-foreground/60"
        )}
      />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          "font-mono text-[0.55rem] tracking-wide uppercase",
          granted ? "text-success" : "text-muted-foreground/60"
        )}
      >
        {granted ? "Allowed" : "Denied"}
      </span>
    </li>
  );
}
