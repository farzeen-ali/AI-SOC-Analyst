/**
 * Centralised environment access.
 *
 * Values are read lazily so the app can still be built and type-checked in an
 * environment that has no credentials. Anything that actually needs a secret
 * fails loudly, at call time, with a message that names the missing variable.
 */

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env.local and fill it in.`
    );
    this.name = "MissingEnvError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") throw new MissingEnvError(name);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
  },
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  },
  /** Server-only. Bypasses RLS — never import this into a client component. */
  get supabaseServiceRoleKey() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  },
  /** Server-only. Powers embeddings and the RAG threat analysis. */
  get openaiApiKey() {
    return required("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  },
  get qstashToken() {
    return required("QSTASH_TOKEN", process.env.QSTASH_TOKEN);
  },
  /**
   * Supabase origin only (no path), safe to render into a `preconnect` tag.
   * Returns an empty string when unset so the tag degrades to a no-op rather
   * than throwing during a build without credentials.
   */
  get supabaseOrigin() {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  },
  /** Server-only. Stripe secret key — `sk_test_…` in sandbox mode. */
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  },
  /**
   * Server-only. The endpoint signing secret (`whsec_…`) for the webhook.
   * Without it every incoming payload is untrusted, so this throws rather
   * than defaulting — an unverified billing webhook is worse than none.
   */
  get stripeWebhookSecret() {
    return required(
      "STRIPE_WEBHOOK_SECRET",
      process.env.STRIPE_WEBHOOK_SECRET
    );
  },
  /** The recurring Price the Pro plan checks out against (`price_…`). */
  get stripeProPriceId() {
    return required("STRIPE_PRO_PRICE_ID", process.env.STRIPE_PRO_PRICE_ID);
  },
  get siteUrl() {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:3000"
    );
  },
} as const;

/** True when Upstash is configured; otherwise limiters fall back to memory. */
export const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

/**
 * True when Supabase is configured.
 *
 * Lets the proxy serve the public marketing routes on a fresh clone that has
 * no `.env.local` yet, instead of 500-ing every request. Protected routes
 * still fail loudly, because the DAL reaches for a real client.
 */
export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/** True when QStash is configured and background jobs can be published. */
export const hasQStash = Boolean(
  process.env.QSTASH_TOKEN &&
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
);

export const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

/**
 * True when Stripe is fully configured.
 *
 * All three values are required together: a secret key without a price id
 * cannot start a checkout, and either without the signing secret would leave
 * the webhook unable to verify what Stripe sends back. Billing UI degrades to
 * a "not configured" state rather than throwing when this is false.
 */
export const hasStripe = Boolean(
  process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRO_PRICE_ID
);

export const isProduction = process.env.NODE_ENV === "production";
