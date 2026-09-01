import type { Metadata } from "next";
import Link from "next/link";
import {
  DatabaseIcon,
  FingerprintIcon,
  GaugeCircleIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  ServerIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How GuardAI isolates tenants, validates input, and hardens its authentication surface.",
};

const GROUPS = [
  {
    icon: DatabaseIcon,
    title: "Tenant isolation",
    items: [
      "PostgreSQL Row Level Security is enabled and forced on every table.",
      "A Custom Access Token Hook embeds workspace_id, workspace_role, and global_role into each JWT.",
      "Policies filter on the signed claim and intersect it with real membership, so a stale claim cannot widen access.",
      "Super Admin reads go through explicit admin policies rather than a disabled policy set.",
    ],
  },
  {
    icon: FingerprintIcon,
    title: "Authentication",
    items: [
      "Email/password with mandatory confirmation, plus Google OAuth with automatic workspace provisioning.",
      "A PostgreSQL trigger creates the profile, workspace, and membership atomically on user creation — no UI race window.",
      "Password reset uses a 6-digit OTP, and updating a password revokes every refresh token on the account.",
      "Sign-out revokes the session globally, clears the sb-* cookies, and invalidates the route cache.",
    ],
  },
  {
    icon: GaugeCircleIcon,
    title: "Abuse resistance",
    items: [
      "Accounts lock for 15 minutes after 5 consecutive failed sign-ins, keyed by address rather than IP.",
      "OTP requests are capped at 3 per 15 minutes, per account and per IP.",
      "Every auth entry point is rate limited twice — once by IP, once by identity.",
      "Counters live in Upstash Redis so limits hold across every instance.",
    ],
  },
  {
    icon: LockKeyholeIcon,
    title: "Request integrity",
    items: [
      "Zod schemas validate every field in the browser and again on the server, from the same module.",
      "Free-text is stripped of control, invisible, and tag-like characters before it is persisted.",
      "Session cookies are HTTP-only and SameSite, and Server Actions additionally verify request origin.",
      "Post-auth redirects are constrained to same-site absolute paths.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <section className="relative px-6 pt-32 pb-16 sm:pt-40">
        <AuroraBackground subtle />

        <ScrollReveal className="mx-auto max-w-3xl space-y-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur">
            <ShieldCheckIcon className="size-3 text-primary" />
            Security overview
          </span>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Isolation you can{" "}
            <span className="text-gradient">read in the schema</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            A security product should be able to show its work. This is exactly
            what GuardAI enforces today, at the database, the request boundary,
            and the session layer.
          </p>
        </ScrollReveal>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-2">
          {GROUPS.map((group, index) => {
            const Icon = group.icon;
            return (
              <ScrollReveal key={group.title} index={index}>
                <article className="h-full rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </span>
                    <h2 className="font-heading text-base font-semibold">
                      {group.title}
                    </h2>
                  </div>

                  <ul className="mt-4 space-y-2.5">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      <section className="px-6 pb-24">
        <ScrollReveal className="mx-auto w-full max-w-5xl">
          <div className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ServerIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-heading text-base font-semibold">
                  Reporting a vulnerability
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  If you believe you have found a security issue, please contact
                  your workspace administrator or the deployment owner before
                  disclosing it publicly.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="h-10 shrink-0 rounded-xl"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              <KeyRoundIcon className="size-4" />
              Create a workspace
            </Button>
          </div>
        </ScrollReveal>
      </section>

      <SiteFooter />
    </div>
  );
}
