import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus, WorkspacePlan } from "@/lib/types/database";

/**
 * Maps a Stripe Subscription onto a workspace row.
 *
 * Shared by the webhook and the checkout action so there is exactly one place
 * that decides what a given Stripe state means for entitlement. The checkout
 * action uses it to self-heal: if a webhook was missed, the next visit to
 * billing reconciles from Stripe rather than leaving a paying customer on the
 * Free plan.
 */

/**
 * `trialing` and `active` both entitle the tenant. `past_due` keeps access
 * while payment is retried — standard dunning, and locking a paying customer
 * out of incident data over a temporary card decline would be worse than the
 * missed revenue.
 */
export function toSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "paused":
    case "incomplete":
      return "suspended";
    default:
      return "cancelled";
  }
}

/** Only these statuses grant Pro entitlements. */
export function planForStatus(status: string): WorkspacePlan {
  return ["active", "trialing", "past_due"].includes(status) ? "pro" : "free";
}

export function customerIdOf(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * The renewal date.
 *
 * In the current API version `current_period_end` lives on the subscription
 * *item*, not the subscription — a breaking change from older integrations
 * that read `subscription.current_period_end`. Taking the furthest item end
 * is correct for the single-item subscriptions this app creates and stays
 * sane if a second item is ever added.
 */
export function periodEndOf(subscription: Stripe.Subscription): string | null {
  const ends = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");

  if (!ends.length) return null;
  return new Date(Math.max(...ends) * 1000).toISOString();
}

export async function applySubscription(
  workspaceId: string,
  subscription: Stripe.Subscription
): Promise<WorkspacePlan> {
  const plan = planForStatus(subscription.status);

  // `seats` is intentionally not set here — the `workspaces_sync_seats`
  // trigger derives it from the plan, so exactly one place decides how many
  // seats a tier gets.
  const { error } = await createAdminClient()
    .from("workspaces")
    .update({
      plan,
      subscription_status: toSubscriptionStatus(subscription.status),
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
      stripe_customer_id: customerIdOf(subscription.customer),
      current_period_end: periodEndOf(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (error) {
    // Throwing gives Stripe a non-2xx, which makes it retry — the right
    // outcome for a transient database failure on a paid upgrade.
    throw new Error(`workspace update failed: ${error.message}`);
  }

  return plan;
}
