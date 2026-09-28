"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckIcon, SparklesIcon } from "lucide-react";

import { CheckoutButton } from "@/components/billing/checkout-button";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { PLANS, formatPlanPrice } from "@/lib/billing/plans";
import type { WorkspacePlan } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface PlanCardsProps {
  currentPlan: WorkspacePlan;
  /** Only a Tenant Admin can act on these cards. */
  canPurchase: boolean;
  stripeConfigured: boolean;
}

/**
 * Side-by-side tier comparison.
 *
 * The current plan is stated on the card rather than only in a badge
 * elsewhere, so the page answers "what am I on, and what would change"
 * without the reader holding state in their head.
 */
export function PlanCards({
  currentPlan,
  canPurchase,
  stripeConfigured,
}: PlanCardsProps) {
  const tiers = [PLANS.free, PLANS.pro];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {tiers.map((plan, index) => {
        const isCurrent = plan.id === currentPlan;
        const isPro = plan.id === "pro";

        return (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * 0.08,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <SpotlightCard
              className={cn(
                "relative flex h-full flex-col overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition-colors",
                isPro
                  ? "border-primary/35 bg-gradient-to-br from-primary/[0.08] via-card/70 to-brand-2/[0.06]"
                  : "border-border/60 bg-card/70"
              )}
            >
              {isPro && (
                <>
                  {/* Corner glow, decorative only. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-primary/20 blur-3xl"
                  />
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wider text-primary uppercase">
                    <SparklesIcon className="size-2.5" />
                    Recommended
                  </span>
                </>
              )}

              <div className="relative">
                <h3 className="text-sm font-semibold tracking-tight">
                  {plan.name}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plan.tagline}
                </p>

                <p className="mt-4 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "font-mono text-4xl font-semibold tracking-tight",
                      isPro &&
                        "bg-gradient-to-r from-brand-1 via-primary to-brand-2 bg-clip-text text-transparent"
                    )}
                  >
                    {formatPlanPrice(plan)}
                  </span>
                  {plan.priceCents > 0 && (
                    <span className="text-xs text-muted-foreground">
                      per month
                    </span>
                  )}
                </p>
              </div>

              <ul className="relative mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <CheckIcon
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        isPro ? "text-primary" : "text-success"
                      )}
                    />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="relative mt-5">
                {isCurrent ? (
                  <div className="flex h-10 items-center justify-center rounded-xl border border-success/30 bg-success/10 text-sm font-medium text-success">
                    <CheckIcon className="mr-1.5 size-3.5" />
                    Your current plan
                  </div>
                ) : isPro ? (
                  stripeConfigured ? (
                    <CheckoutButton
                      className="w-full"
                      disabled={!canPurchase}
                      label={
                        canPurchase ? "Upgrade to Pro" : "Tenant Admins only"
                      }
                    />
                  ) : (
                    <div className="flex h-10 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 px-3 text-center text-xs text-warning">
                      Stripe is not configured on this deployment
                    </div>
                  )
                ) : (
                  <div className="flex h-10 items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">
                    Downgrade from the billing portal
                  </div>
                )}
              </div>
            </SpotlightCard>
          </motion.div>
        );
      })}
    </div>
  );
}
