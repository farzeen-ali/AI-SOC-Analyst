import type { Metadata } from "next";
import { CreditCardIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PhasePlaceholder } from "@/components/dashboard/phase-placeholder";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireTenantAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Billing & Plan" };

/** Tenant Admin only — Members never reach this route. */
export default async function BillingPage() {
  const context = await requireTenantAdmin();
  const workspace = context.workspace;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Billing & Plan"
        description="Subscription tier, seat allocation, and checkout for this workspace."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          index={0}
          label="Current plan"
          value={(workspace?.plan ?? "free").toUpperCase()}
          icon={CreditCardIcon}
          tone={workspace?.plan === "pro" ? "success" : "warning"}
        />
        <StatCard
          index={1}
          label="Status"
          value={workspace?.subscription_status ?? "—"}
          icon={CreditCardIcon}
        />
        <StatCard
          index={2}
          label="Seats"
          value={workspace?.seats ?? 0}
          hint="Included in this plan"
          icon={CreditCardIcon}
        />
      </div>

      <PhasePlaceholder
        icon={CreditCardIcon}
        phase="Phase 2"
        title="Checkout not yet wired"
        description="The plan and subscription columns are live on the workspace record; the payment provider integration lands with the billing phase."
        bullets={[
          "Lemon Squeezy hosted checkout and customer portal",
          "Webhook-driven plan and subscription_status sync",
          "Seat allocation enforced on team invitations",
          "Super Admin accounts remain exempt from plan limits",
        ]}
      />
    </div>
  );
}
