import Link from "next/link";
import { ArrowLeftIcon, LockKeyholeIcon, ShieldCheckIcon, ZapIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThreatFeed } from "@/components/auth/threat-feed";
import { ThemeToggle } from "@/components/theme-toggle";

const PROOF_POINTS = [
  {
    icon: ShieldCheckIcon,
    title: "Tenant isolation by default",
    body: "PostgreSQL Row Level Security scopes every query to your workspace.",
  },
  {
    icon: ZapIcon,
    title: "Triage in seconds, not hours",
    body: "Streaming analysis with retrieval-grounded context on every alert.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Hardened auth surface",
    body: "Brute-force lockout, per-IP rate limits, and HTTP-only sessions.",
  },
];

/**
 * Split-screen auth shell.
 *
 * The brand panel is decorative and hidden below `lg`, where the form takes the
 * full viewport — every auth screen stays single-column and thumb-reachable on
 * a phone.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen w-full">
      {/* ---------------- Brand panel ---------------- */}
      <aside className="relative hidden w-[46%] max-w-[40rem] overflow-hidden bg-[#0b1220] lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 grid-bg opacity-70" />
          <div className="absolute -top-32 -left-24 size-[32rem] animate-aurora rounded-full bg-[radial-gradient(circle_at_center,var(--brand-1),transparent_62%)] opacity-25 blur-3xl" />
          <div
            className="absolute right-[-8rem] bottom-[-10rem] size-[30rem] animate-aurora rounded-full bg-[radial-gradient(circle_at_center,var(--brand-2),transparent_62%)] opacity-30 blur-3xl"
            style={{ animationDelay: "-7s" }}
          />
          <div className="absolute inset-x-0 top-0 h-px animate-scanline bg-gradient-to-r from-transparent via-brand-1/60 to-transparent" />
        </div>

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <Logo tagline="SOC Automation" className="[&_span]:text-white" />

          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[0.65rem] tracking-[0.16em] text-white/70 uppercase">
                <span className="size-1.5 rounded-full bg-brand-1" />
                Autonomous SOC analyst
              </span>

              <h2 className="max-w-md font-heading text-[2.1rem] leading-[1.15] font-semibold text-white xl:text-[2.4rem]">
                Your alert queue,{" "}
                <span className="text-gradient">triaged before</span> you open
                it.
              </h2>

              <p className="max-w-sm text-sm leading-relaxed text-white/55">
                GuardAI ingests your security logs, correlates them against
                threat intelligence, and hands your analysts a ranked incident
                list with the remediation already drafted.
              </p>
            </div>

            <ThreatFeed />
          </div>

          <ul className="space-y-3.5">
            {PROOF_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="size-3.5 text-brand-1" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium text-white/90">
                    {title}
                  </p>
                  <p className="text-xs leading-relaxed text-white/45">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ---------------- Form panel ---------------- */}
      <main className="relative flex flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 dot-bg opacity-70 lg:hidden"
        />

        <header className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to site
          </Link>

          <div className="flex items-center gap-3">
            <Logo showWordmark={false} className="lg:hidden" />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[26.5rem]">{children}</div>
        </div>

        <footer className="px-5 pb-6 text-center text-[0.7rem] text-muted-foreground sm:px-8">
          <p>
            Protected by rate limiting and brute-force detection ·{" "}
            <Link
              href="/security"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Security overview
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
