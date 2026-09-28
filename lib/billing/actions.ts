"use server";

import { recordAudit } from "@/lib/auth/audit";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { getStripe } from "@/lib/billing/stripe";
import { applySubscription } from "@/lib/billing/sync";
import { env, hasStripe } from "@/lib/env";
import { assertSameOrigin } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BillingActionResult {
  ok: boolean;
  message: string;
  /** Present on success — the client sends the browser here. */
  url?: string;
}

/**
 * Hosted Stripe Checkout and Billing Portal entry points.
 *
 * Both are Tenant-Admin-only and both re-resolve the workspace server-side.
 * Nothing about the price, the plan or the customer is taken from the client:
 * the price id comes from the environment and the customer from the
 * workspace row, so a crafted form post cannot buy a different product, pay a
 * different amount, or open someone else's billing portal.
 */

function notConfigured(): BillingActionResult {
  return {
    ok: false,
    message:
      "Billing is not configured on this deployment. Set STRIPE_SECRET_KEY, " +
      "STRIPE_WEBHOOK_SECRET and STRIPE_PRO_PRICE_ID, then restart the server.",
  };
}

/**
 * Finds or creates the Stripe Customer for a workspace.
 *
 * The id is persisted on the workspace so the mapping survives, and so the
 * webhook can resolve a workspace from a customer without searching. Metadata
 * carries the workspace id in the other direction, which is what makes a
 * `checkout.session.completed` payload self-describing.
 */
async function resolveCustomerId(
  workspaceId: string,
  workspaceName: string,
  email: string
): Promise<string> {
  const admin = createAdminClient();

  const { data: workspace } = await admin
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspace?.stripe_customer_id) return workspace.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email,
    name: workspaceName,
    metadata: { workspace_id: workspaceId },
  });

  await admin
    .from("workspaces")
    .update({ stripe_customer_id: customer.id })
    .eq("id", workspaceId);

  return customer.id;
}

export async function createCheckoutSessionAction(): Promise<BillingActionResult> {
  await assertSameOrigin();

  if (!hasStripe) return notConfigured();

  const context = await requireTenantAdmin();
  if (!context.workspace) {
    return { ok: false, message: "No active workspace for this account." };
  }

  const workspace = context.workspace;

  if (workspace.plan === "pro") {
    return {
      ok: false,
      message: "This workspace is already on Pro.",
    };
  }

  // Checkout creation is cheap but it does create Stripe objects, so it is
  // rate limited like any other mutation.
  const limit = await checkRateLimit("mutation", `checkout:${workspace.id}`);
  if (!limit.success) {
    return {
      ok: false,
      message: "Too many checkout attempts. Try again in a moment.",
    };
  }

  try {
    const customerId = await resolveCustomerId(
      workspace.id,
      workspace.name,
      context.email
    );

    /*
     * Never start a second subscription for a customer that already has one.
     *
     * The `plan === "pro"` check above is not enough on its own: entitlement
     * is granted by the webhook, so between paying and the webhook landing
     * the workspace still reads Free, and a second click would buy a second
     * subscription. Asking Stripe — the system of record — closes that
     * window, and reconciling from what it returns self-heals a webhook that
     * was missed entirely.
     */
    const existing = await getStripe().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const live = existing.data.find((subscription) =>
      ["active", "trialing", "past_due"].includes(subscription.status)
    );

    if (live) {
      const plan = await applySubscription(workspace.id, live);
      return {
        ok: false,
        message:
          plan === "pro"
            ? "This workspace already has an active subscription — the plan has been refreshed. Reload the page."
            : "An existing subscription was found and re-synced. Reload the page.",
      };
    }

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: env.stripeProPriceId, quantity: 1 }],
      // Both ids are echoed back on the completed event. `client_reference_id`
      // is the belt, the metadata the braces — the webhook accepts either.
      client_reference_id: workspace.id,
      metadata: { workspace_id: workspace.id },
      subscription_data: {
        metadata: { workspace_id: workspace.id },
      },
      success_url: `${env.siteUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/dashboard/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    if (!session.url) {
      return { ok: false, message: "Stripe did not return a checkout URL." };
    }

    await recordAudit({
      action: "billing.checkout_started",
      actorId: context.userId,
      workspaceId: workspace.id,
      targetType: "stripe_checkout_session",
      targetId: session.id,
      metadata: { price_id: env.stripeProPriceId },
    });

    return { ok: true, message: "Redirecting to Stripe…", url: session.url };
  } catch (error) {
    console.error(
      "[billing] checkout failed",
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      message:
        "Could not start checkout. Check the Stripe keys and price id, then try again.",
    };
  }
}

/**
 * Opens the Stripe-hosted Billing Portal.
 *
 * Card updates, invoices and cancellation all live there rather than being
 * rebuilt here — every one of those flows touches payment data, and the
 * hosted portal keeps that data out of this application entirely.
 */
export async function createPortalSessionAction(): Promise<BillingActionResult> {
  await assertSameOrigin();

  if (!hasStripe) return notConfigured();

  const context = await requireTenantAdmin();
  if (!context.workspace) {
    return { ok: false, message: "No active workspace for this account." };
  }

  const workspace = context.workspace;

  if (!workspace.stripe_customer_id) {
    return {
      ok: false,
      message: "This workspace has no billing history yet.",
    };
  }

  const limit = await checkRateLimit("mutation", `portal:${workspace.id}`);
  if (!limit.success) {
    return { ok: false, message: "Too many attempts. Try again in a moment." };
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: `${env.siteUrl}/dashboard/billing`,
    });

    await recordAudit({
      action: "billing.portal_opened",
      actorId: context.userId,
      workspaceId: workspace.id,
      targetType: "stripe_customer",
      targetId: workspace.stripe_customer_id,
    });

    return { ok: true, message: "Opening billing portal…", url: session.url };
  } catch (error) {
    console.error(
      "[billing] portal failed",
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      message:
        "Could not open the billing portal. In Stripe test mode you may need " +
        "to save the portal settings once at " +
        "https://dashboard.stripe.com/test/settings/billing/portal.",
    };
  }
}
