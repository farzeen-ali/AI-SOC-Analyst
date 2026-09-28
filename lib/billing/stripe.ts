import "server-only";

import Stripe from "stripe";

import { env } from "@/lib/env";

/**
 * Stripe client.
 *
 * Constructed lazily so the app still builds and type-checks without Stripe
 * credentials — the same pattern the Supabase and OpenAI clients follow. The
 * API version is pinned: letting Stripe pick "latest" means a server-side
 * change at Stripe can alter the shape of a webhook payload without a deploy
 * here, which is exactly the kind of silent break a billing path cannot take.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  client ??= new Stripe(env.stripeSecretKey, {
    // Must match the version this SDK was generated against; `stripe`
    // exports it as `Stripe.API_VERSION`, but the literal is written out so a
    // dependency bump surfaces as a visible diff rather than a silent change
    // in webhook payload shape.
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
    appInfo: { name: "GuardAI", url: "https://github.com/guardai" },
    // Network blips on a checkout call should retry rather than surface as a
    // failed upgrade to the user.
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return client;
}

/**
 * Verifies the `Stripe-Signature` HMAC and returns the parsed event.
 *
 * This is the only place a webhook payload becomes trusted. The raw body text
 * must be passed exactly as received — any re-serialisation changes the bytes
 * and the signature will not match, which is the point.
 *
 * Throws `Stripe.errors.StripeSignatureVerificationError` on a bad signature
 * or a timestamp outside the tolerance window, which also defeats replay of a
 * captured-but-old request.
 */
export function constructWebhookEvent(
  rawBody: string,
  signature: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    env.stripeWebhookSecret
  );
}
