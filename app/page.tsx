import Link from "next/link";
import {
  ArrowRightIcon,
  BrainCircuitIcon,
  DatabaseZapIcon,
  GaugeCircleIcon,
  KeyRoundIcon,
  LayersIcon,
  LockKeyholeIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { ConsolePreview } from "@/components/marketing/console-preview";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

const METRICS = [
  { value: "38s", label: "Median time to detect" },
  { value: "4m", label: "Median time to respond" },
  { value: "71%", label: "Alerts auto-resolved" },
  { value: "0", label: "Cross-tenant data paths" },
];

const CAPABILITIES = [
  {
    icon: ScanSearchIcon,
    title: "Streaming log triage",
    body: "Every ingested event is parsed, enriched, and scored against your detection rules as it arrives — not on a nightly batch.",
  },
  {
    icon: BrainCircuitIcon,
    title: "Retrieval-grounded analysis",
    body: "RAG over your threat-intel corpus means each verdict cites the technique, the indicators, and the history it was drawn from.",
  },
  {
    icon: WorkflowIcon,
    title: "Drafted remediation",
    body: "Incidents arrive with a ranked playbook: revoke these sessions, block that ASN, reset those credentials.",
  },
  {
    icon: LayersIcon,
    title: "Three-tier RBAC",
    body: "Super Admin, Tenant Admin, and SOC Analyst — enforced in the database, the route guards, and the UI alike.",
  },
  {
    icon: DatabaseZapIcon,
    title: "Row Level Security",
    body: "Custom JWT claims scope every query to one workspace. Workspace A cannot read Workspace B under any condition.",
  },
  {
    icon: GaugeCircleIcon,
    title: "Abuse-resistant by default",
    body: "Per-IP and per-workspace rate limits, brute-force lockout, and OTP throttling backed by Upstash Redis.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Connect your logs",
    body: "Ship from your SIEM or upload directly. Files are validated on arrival and written under your workspace's RLS policies.",
  },
  {
    step: "02",
    title: "GuardAI triages",
    body: "Streaming analysis correlates events, suppresses noise, and ranks what actually needs a human.",
  },
  {
    step: "03",
    title: "Your analysts act",
    body: "Each incident lands with context, technique mapping, and a remediation plan ready to execute or edit.",
  },
];

const SECURITY_CONTROLS = [
  { icon: ShieldCheckIcon, label: "Zod validation on client and server" },
  { icon: LockKeyholeIcon, label: "HTTP-only, SameSite session cookies" },
  { icon: KeyRoundIcon, label: "Account lockout after 5 failed attempts" },
  { icon: UsersIcon, label: "Role-based route guards in middleware" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollProgress />
      <SiteHeader />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden px-6 pt-32 pb-20 sm:pt-40 sm:pb-28">
        <AuroraBackground />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <Reveal className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-primary" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              Live · Ingestion, pgvector RAG &amp; tenant isolation
            </span>

            <h1 className="font-heading text-[2.5rem] leading-[1.06] font-semibold tracking-tight sm:text-[3.25rem] lg:text-[3.6rem]">
              The SOC analyst
              <br />
              that never{" "}
              <span className="text-gradient-animated">clears the queue</span>
              <br />
              by ignoring it.
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              GuardAI reads every log line your team cannot, correlates it
              against live threat intelligence, and hands your analysts a short
              list of incidents that actually matter — each one already
              investigated.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-gradient-to-r from-brand-1 via-primary to-brand-2 px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110"
                nativeButton={false}
                render={<Link href="/signup" />}
              >
                Create your workspace
                <ArrowRightIcon className="size-4" />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-border/70 bg-background/60 px-6 text-sm font-medium backdrop-blur"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
            </div>

            <p className="font-mono text-[0.7rem] text-muted-foreground">
              Free tier · No credit card · Workspace provisioned instantly
            </p>
          </Reveal>

          <Reveal index={1}>
            <ConsolePreview />
          </Reveal>
        </div>
      </section>

      {/* ---------------- Metrics ---------------- */}
      <section className="border-y border-border/60 bg-card/30">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
          {METRICS.map((metric, index) => (
            <Reveal key={metric.label} index={index}>
              <div className="px-6 py-8 text-center">
                <p className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                  {metric.value}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {metric.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Capabilities ---------------- */}
      <section id="platform" className="relative px-6 py-24 sm:py-28">
        <div className="mx-auto w-full max-w-6xl space-y-14">
          <Reveal className="mx-auto max-w-2xl space-y-4 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              The platform
            </span>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Built like the security tool it is
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Isolation, validation, and rate limiting are not settings you turn
              on later. They are the substrate every GuardAI feature is written
              on top of.
            </p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability, index) => {
              const Icon = capability.icon;
              return (
                <Reveal key={capability.title} index={index}>
                  <SpotlightCard className="h-full p-5">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-20 -right-20 size-40 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover/spotlight:opacity-100"
                    />

                    <div className="relative space-y-3">
                      <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40 transition-colors group-hover/spotlight:border-primary/25 group-hover/spotlight:bg-primary/10">
                        <Icon className="size-4.5 text-primary" />
                      </span>
                      <h3 className="font-heading text-base font-semibold">
                        {capability.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {capability.body}
                      </p>
                    </div>
                  </SpotlightCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section
        id="how-it-works"
        className="relative overflow-hidden border-y border-border/60 bg-card/30 px-6 py-24 sm:py-28"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid-bg opacity-60 mask-radial"
        />

        <div className="relative mx-auto w-full max-w-6xl space-y-14">
          <Reveal className="mx-auto max-w-2xl space-y-4 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              How it works
            </span>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps from raw logs to resolved incidents
            </h2>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal key={step.step} index={index}>
                <div className="relative h-full rounded-2xl border border-border/60 bg-background/60 p-6 backdrop-blur-xl">
                  <span className="font-mono text-4xl font-semibold text-primary/20">
                    {step.step}
                  </span>
                  <h3 className="mt-3 font-heading text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Security ---------------- */}
      <section className="px-6 py-24 sm:py-28">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              Tenant isolation
            </span>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              One tenant can never see another
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Each access token carries a signed{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em]">
                workspace_id
              </code>{" "}
              claim. PostgreSQL Row Level Security policies read that claim on
              every single query and intersect it with real membership — so
              isolation holds even if the application layer is wrong.
            </p>

            <ul className="grid gap-2.5 sm:grid-cols-2">
              {SECURITY_CONTROLS.map((control) => {
                const Icon = control.icon;
                return (
                  <li
                    key={control.label}
                    className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/50 px-3 py-2.5"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {control.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            <Button
              variant="outline"
              className="h-10 rounded-xl"
              nativeButton={false}
              render={<Link href="/security" />}
            >
              Read the security overview
              <ArrowRightIcon className="size-4" />
            </Button>
          </Reveal>

          <Reveal index={1}>
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 font-mono text-xs backdrop-blur-xl">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -left-16 size-56 rounded-full bg-brand-2/15 blur-3xl"
              />
              <p className="relative mb-3 text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
                policy · workspaces
              </p>
              <pre className="relative overflow-x-auto leading-relaxed text-muted-foreground">
                <code>{`create policy "workspaces: read own tenant"
  on public.workspaces for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      id = public.current_workspace_id()
      and public.is_workspace_member(id)
    )
  );`}</code>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 pb-24">
        <Reveal className="mx-auto w-full max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-primary/10 px-6 py-14 text-center backdrop-blur-xl sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
            />

            <div className="relative mx-auto max-w-xl space-y-5">
              <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                Give your analysts their day back
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Provision a workspace in under a minute. You become its Tenant
                Admin, and your team joins by invitation.
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 rounded-xl bg-gradient-to-r from-brand-1 via-primary to-brand-2 px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110"
                  nativeButton={false}
                  render={<Link href="/signup" />}
                >
                  Get started free
                  <ArrowRightIcon className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 rounded-xl px-6 text-sm"
                  nativeButton={false}
                  render={<Link href="/pricing" />}
                >
                  Compare plans
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
