import type { Metadata } from "next";
import {
  CalendarClockIcon,
  CreditCardIcon,
  GaugeIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { AuthAlert } from "@/components/auth/auth-alert";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PlanCards } from "@/components/billing/plan-cards";
import { UsageMeter } from "@/components/billing/usage-meter";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Reveal } from "@/components/motion/reveal";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { planFor, formatPlanPrice } from "@/lib/billing/plans";
import { peekScanUsage } from "@/lib/billing/quota";
import { hasStripe } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing & Plan" };

/** Tenant Admin only — Members never reach this route. */
export default async function BillingPage(
  props: PageProps<"/dashboard/billing">
) {
  const searchParams = await props.searchParams;
  const context = await requireTenantAdmin();
  const workspace = context.workspace;

  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const checkout = first("checkout");

  const plan = planFor(workspace?.plan ?? "free");

  const [usage, memberCount] = await Promise.all([
    workspace
      ? peekScanUsage(workspace.id, workspace.plan, context.isSuperAdmin)
      : Promise.resolve({ used: 0, limit: plan.dailyScans, resetSeconds: 0 }),
    countMembers(workspace?.id),
  ]);

  const renewal = workspace?.current_period_end
    ? new Date(workspace.current_period_end)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Billing & Plan"
        description="Subscription tier, seat allocation, and daily scan metering for this workspace."
        action={
          workspace?.stripe_customer_id && hasStripe ? (
            <CheckoutButton mode="portal" variant="outline" />
          ) : undefined
        }
      />

      {/*
        Checkout returns here. The banner is optimistic about success because
        entitlement is granted by the webhook, not by this redirect — the two
        can land in either order, so the copy must be true in both cases.
      */}
      {checkout === "success" && (
        <AuthAlert
          tone="success"
          message="Payment received. Your workspace is being upgraded — reload in a moment if the plan below still shows Free."
        />
      )}
      {checkout === "cancelled" && (
        <AuthAlert
          tone="info"
          message="Checkout cancelled. Nothing was charged."
        />
      )}
      {checkout === "error" && (
        <AuthAlert
          tone="error"
          message={first("reason") ?? "Could not start checkout."}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Current plan"
          value={plan.name}
          hint={
            plan.priceCents > 0 ? `${formatPlanPrice(plan)} / month` : "No card"
          }
          icon={CreditCardIcon}
          tone={workspace?.plan === "pro" ? "success" : "warning"}
        />
        <StatCard
          index={1}
          label="Status"
          value={workspace?.subscription_status ?? "—"}
          hint={
            workspace?.cancel_at_period_end
              ? "Cancels at period end"
              : "Subscription state"
          }
          icon={ShieldCheckIcon}
        />
        <StatCard
          index={2}
          label="Seats"
          value={`${memberCount} / ${plan.seats}`}
          hint={`${plan.memberSeats} analyst seat${plan.memberSeats === 1 ? "" : "s"} included`}
          icon={UsersIcon}
        />
        <StatCard
          index={3}
          label="Renews"
          value={
            renewal
              ? renewal.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : "—"
          }
          hint={renewal ? renewal.getFullYear().toString() : "No active period"}
          icon={CalendarClockIcon}
        />
      </div>

      <Reveal>
        <section className="grid gap-6 rounded-2xl border border-border/60 bg-card/70 p-6 backdrop-blur-xl sm:grid-cols-[auto_1fr] sm:items-center">
          <UsageMeter
            used={usage.used}
            limit={usage.limit}
            resetSeconds={usage.resetSeconds}
          />

          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <GaugeIcon className="size-4 text-primary" />
              Daily scan metering
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {usage.limit === null ? (
                <>
                  This workspace has unlimited daily scans. Usage is still
                  recorded so you can see what the team is consuming.
                </>
              ) : (
                <>
                  Each uploaded log file counts as one scan. The allowance is
                  claimed atomically in Redis at upload time, so two analysts
                  uploading at once can never share the same remaining scan.
                  It resets at 00:00 UTC.
                </>
              )}
            </p>
            {usage.limit !== null && (
              <p className="text-xs text-muted-foreground">
                Pro removes the daily cap and raises the upload ceiling from 10
                MB to 100 MB.
              </p>
            )}
          </div>
        </section>
      </Reveal>

      <Reveal index={1}>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Compare plans
          </h2>
          <PlanCards
            currentPlan={workspace?.plan ?? "free"}
            canPurchase={context.isTenantAdmin}
            stripeConfigured={hasStripe}
          />
        </div>
      </Reveal>

      <Reveal index={2}>
        <p className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Payments are processed by Stripe. GuardAI never sees or stores your
          card details — checkout and the billing portal are both hosted by
          Stripe, and this application only ever receives a signed webhook
          describing the resulting subscription state.
        </p>
      </Reveal>
    </div>
  );
}

async function countMembers(workspaceId: string | undefined): Promise<number> {
  if (!workspaceId) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  return count ?? 0;
}
