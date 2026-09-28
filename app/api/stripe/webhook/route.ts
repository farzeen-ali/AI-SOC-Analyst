import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { recordAudit } from "@/lib/auth/audit";
import { constructWebhookEvent, getStripe } from "@/lib/billing/stripe";
import { hasStripe } from "@/lib/env";
import {
  applySubscription,
  customerIdOf,
  periodEndOf,
} from "@/lib/billing/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Webhooks are inherently uncacheable and must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver.
 *
 * This is the only path that may promote a workspace to Pro, which makes it
 * the most security-sensitive route in the application: a forged request here
 * is a free subscription. Three things defend it, in order:
 *
 *  1. **HMAC signature verification.** The raw body is verified against
 *     `STRIPE_WEBHOOK_SECRET` before a single field is read. Stripe's
 *     `constructEvent` also enforces a timestamp tolerance, so a genuine
 *     request captured off the wire cannot be replayed later.
 *  2. **Idempotency.** The event id is inserted into `stripe_events` before
 *     the effect is applied. A duplicate delivery — which Stripe guarantees
 *     can happen — hits the primary key and is acknowledged without
 *     re-applying anything.
 *  3. **Server-side truth.** Plan state is derived from the Subscription
 *     object fetched or delivered by Stripe, never from a client and never
 *     from an amount in the payload.
 *
 * Note there is no session, no cookie and no same-origin check here: Stripe is
 * a third party POSTing from its own infrastructure. The signature *is* the
 * authentication. `proxy.ts` excludes this path from session refresh for the
 * same reason.
 */

/** Events we act on. Anything else is acknowledged and ignored. */
const HANDLED_EVENTS = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Resolves the workspace this event belongs to.
 *
 * Metadata is preferred because it is written by us at checkout time. The
 * customer id is the fallback for events that originate in the Stripe
 * dashboard or the billing portal, where our metadata may not be present.
 */
async function resolveWorkspaceId(
  metadataWorkspaceId: string | null | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataWorkspaceId) return metadataWorkspaceId;
  if (!customerId) return null;

  const { data } = await createAdminClient()
    .from("workspaces")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  if (!hasStripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on this deployment." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw text, byte for byte. Parsing and re-serialising would change the
  // bytes and invalidate the HMAC, which is precisely what it is there for.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (error) {
    console.error(
      "[stripe] signature verification failed",
      error instanceof Error ? error.message : error
    );
    // Deliberately terse: a probing client learns nothing about why.
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    // 200 so Stripe stops retrying an event we intentionally ignore.
    return NextResponse.json({ received: true, handled: false });
  }

  const admin = createAdminClient();

  // Claim the event. A duplicate delivery conflicts on the primary key and is
  // acknowledged without re-applying the effect.
  const { error: claimError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });

  if (claimError) {
    if (claimError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe] could not record event", claimError.message);
    return NextResponse.json(
      { error: "Event ledger unavailable." },
      { status: 500 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only subscription checkouts change entitlement, and only a paid one
        // counts — `payment_status` guards against a session that completed
        // without money moving.
        if (session.mode !== "subscription") break;
        if (
          session.payment_status !== "paid" &&
          session.payment_status !== "no_payment_required"
        ) {
          break;
        }

        const workspaceId = await resolveWorkspaceId(
          session.metadata?.workspace_id ?? session.client_reference_id,
          customerIdOf(session.customer)
        );
        if (!workspaceId) {
          console.error("[stripe] no workspace for session", session.id);
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) break;

        // Re-fetch rather than trusting the summary on the session: this is
        // the authoritative object, and it carries the item period data.
        const subscription =
          await getStripe().subscriptions.retrieve(subscriptionId);

        const plan = await applySubscription(workspaceId, subscription);

        await admin
          .from("stripe_events")
          .update({ workspace_id: workspaceId })
          .eq("id", event.id);

        await recordAudit({
          action: "billing.subscription_activated",
          workspaceId,
          targetType: "stripe_subscription",
          targetId: subscription.id,
          metadata: { plan, status: subscription.status },
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const workspaceId = await resolveWorkspaceId(
          subscription.metadata?.workspace_id,
          customerIdOf(subscription.customer)
        );
        if (!workspaceId) {
          console.error(
            "[stripe] no workspace for subscription",
            subscription.id
          );
          break;
        }

        const plan = await applySubscription(workspaceId, subscription);

        await admin
          .from("stripe_events")
          .update({ workspace_id: workspaceId })
          .eq("id", event.id);

        await recordAudit({
          action: "billing.subscription_updated",
          workspaceId,
          targetType: "stripe_subscription",
          targetId: subscription.id,
          metadata: {
            plan,
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const workspaceId = await resolveWorkspaceId(
          subscription.metadata?.workspace_id,
          customerIdOf(subscription.customer)
        );
        if (!workspaceId) break;

        /*
         * Downgrade to Free. Seats shrink with the plan via the database
         * trigger, but existing members are deliberately left in place —
         * silently removing analysts from a workspace because a card expired
         * would destroy access to incident data. The seat limit then blocks
         * *new* invitations until the tenant is back under the Free
         * allowance, which is the non-destructive way to enforce it.
         */
        const { error } = await admin
          .from("workspaces")
          .update({
            plan: "free",
            subscription_status: "cancelled",
            stripe_subscription_id: null,
            stripe_price_id: null,
            cancel_at_period_end: false,
            current_period_end: periodEndOf(subscription),
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);

        if (error) throw new Error(`downgrade failed: ${error.message}`);

        await admin
          .from("stripe_events")
          .update({ workspace_id: workspaceId })
          .eq("id", event.id);

        await recordAudit({
          action: "billing.subscription_cancelled",
          workspaceId,
          targetType: "stripe_subscription",
          targetId: subscription.id,
          metadata: { status: subscription.status },
        });
        break;
      }
    }
  } catch (error) {
    console.error(
      `[stripe] handler failed for ${event.type}`,
      error instanceof Error ? error.message : error
    );

    // Release the idempotency claim so Stripe's retry can try again, rather
    // than being swallowed as a duplicate of a delivery that never applied.
    await admin.from("stripe_events").delete().eq("id", event.id);

    return NextResponse.json(
      { error: "Handler failed; please retry." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, handled: true });
}
