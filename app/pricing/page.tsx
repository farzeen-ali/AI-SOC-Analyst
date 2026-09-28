import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, SparklesIcon } from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { PLANS as CATALOGUE, formatPlanPrice } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "GuardAI plans for security teams of every size.",
};

/**
 * Marketing copy for each tier.
 *
 * Feature text is read from the plan catalogue rather than retyped, so the
 * page cannot promise a limit the upload gate does not actually grant.
 */
const TIERS = [
  {
    ...CATALOGUE.free,
    cadence: "forever",
    description: "For evaluating GuardAI on a single workspace.",
    cta: "Start free",
    href: "/signup",
    featured: false,
  },
  {
    ...CATALOGUE.pro,
    cadence: "per workspace / month",
    description: "For teams running GuardAI as their primary triage layer.",
    cta: "Start free, upgrade in-app",
    href: "/signup",
    featured: true,
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <section className="relative px-6 pt-32 pb-16 sm:pt-40">
        <AuroraBackground subtle />

        <Reveal className="mx-auto max-w-2xl space-y-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur">
            Pricing
          </span>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            One flat price,{" "}
            <span className="text-gradient">not per alert</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Every workspace starts free, with no card. Upgrade to Pro from
            inside the app whenever you need unlimited scans and the full
            analyst roster — checkout is handled by Stripe.
          </p>
        </Reveal>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto grid w-full max-w-4xl gap-5 md:grid-cols-2">
          {TIERS.map((plan, index) => (
            <Reveal key={plan.name} index={index}>
              <article
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur-xl",
                  plan.featured
                    ? "border-primary/30 bg-gradient-to-br from-card/80 to-primary/10 shadow-xl shadow-primary/10"
                    : "border-border/60 bg-card/60"
                )}
              >
                {plan.featured && (
                  <span className="absolute top-5 right-5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[0.55rem] tracking-wide text-primary uppercase">
                    <SparklesIcon className="size-2.5" />
                    Recommended
                  </span>
                )}

                <h2 className="font-heading text-lg font-semibold">
                  {plan.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-heading text-4xl font-semibold tracking-tight">
                    {formatPlanPrice(plan)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.cadence}
                  </span>
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  variant={plan.featured ? "default" : "outline"}
                  className={cn(
                    "mt-6 h-11 rounded-xl",
                    plan.featured &&
                      "bg-gradient-to-r from-brand-1 via-primary to-brand-2 text-primary-foreground hover:brightness-110"
                  )}
                  nativeButton={false}
                  render={<Link href={plan.href} />}
                >
                  {plan.cta}
                  <ArrowRightIcon className="size-4" />
                </Button>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal index={2} className="mx-auto mt-6 max-w-4xl">
          <p className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
            Super Admin accounts are exempt from plan limits by design — the
            platform owner is never blocked by a tenant&apos;s subscription tier.
          </p>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
