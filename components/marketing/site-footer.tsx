import Link from "next/link";

import { Logo } from "@/components/brand/logo";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/#platform", label: "Capabilities" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create workspace" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border/60 bg-card/30">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo tagline="SOC Automation" />
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            An AI SOC analyst that triages your security logs, ranks real
            incidents, and drafts the response — inside a strictly isolated
            multi-tenant workspace.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title} className="space-y-3">
            <p className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              {column.title}
            </p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    /* -my-1 py-1 keeps the visual rhythm while lifting the hit
                       area to the 24px WCAG 2.5.8 minimum. */
                    className="-my-1 inline-flex min-h-6 items-center py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} GuardAI. All rights reserved.</p>
          <p className="font-mono text-[0.65rem]">
            Row Level Security · Rate limited · HTTP-only sessions
          </p>
        </div>
      </div>
    </footer>
  );
}
