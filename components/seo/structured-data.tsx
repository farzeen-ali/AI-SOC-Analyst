import { env } from "@/lib/env";

/**
 * JSON-LD structured data.
 *
 * Classic search engines use this for rich results; answer engines use it to
 * decide what the product *is* and to quote specifics like pricing tiers and
 * feature claims. Every value here mirrors something the app actually does —
 * structured data that overstates the product is worse than none, because it
 * gets quoted verbatim.
 *
 * This is the one place `dangerouslySetInnerHTML` is warranted: the payload is
 * a server-built constant with no user or model input anywhere in it, and
 * JSON-LD has to be emitted as raw script content. `JSON.stringify` plus the
 * `<` escape below closes the `</script>` breakout.
 */
export function StructuredData() {
  const base = env.siteUrl;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "GuardAI",
        url: base,
        description:
          "GuardAI builds an AI SOC analyst that automates security log triage, threat detection, and incident response.",
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: base,
        name: "GuardAI",
        publisher: { "@id": `${base}/#organization` },
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${base}/#software`,
        name: "GuardAI",
        applicationCategory: "SecurityApplication",
        applicationSubCategory: "Security Operations / SIEM",
        operatingSystem: "Web",
        url: base,
        description:
          "An AI-powered SOC analyst that ingests security logs, detects threats using retrieval-augmented analysis over a pgvector index, and returns ranked incidents with drafted remediation.",
        featureList: [
          "Asynchronous security log ingestion (JSON, CSV, syslog, plain log)",
          "PII masking before indexing",
          "Retrieval-augmented threat detection with cited evidence",
          "Severity scoring from 1 to 10 with remediation steps",
          "Real-time SOC dashboard with live event streaming",
          "Multi-tenant isolation via PostgreSQL Row Level Security",
          "Three-tier RBAC: Super Admin, Tenant Admin, SOC Analyst",
          "Multi-factor authentication via authenticator app (TOTP) or WebAuthn",
        ],
        offers: [
          {
            "@type": "Offer",
            name: "Free",
            price: "0",
            priceCurrency: "USD",
            description:
              "One workspace, three analyst seats, 10 MB log uploads.",
          },
          {
            "@type": "Offer",
            name: "Pro",
            price: "49",
            priceCurrency: "USD",
            description:
              "Unlimited analyst seats and 100 MB log uploads, billed per seat per month.",
          },
        ],
      },
      {
        /*
         * FAQPage is the highest-leverage schema for answer engines: these
         * are the exact questions an evaluator asks about a SOC tool.
         */
        "@type": "FAQPage",
        "@id": `${base}/#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "What does GuardAI do?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "GuardAI ingests your security logs, parses and masks them, embeds them into a pgvector index, and runs retrieval-augmented analysis to produce ranked threat findings with a 1-10 severity score, an explanation citing the evidence, and concrete remediation steps.",
            },
          },
          {
            "@type": "Question",
            name: "How does GuardAI keep one customer's data separate from another's?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Every table has PostgreSQL Row Level Security enabled and forced. Each access token carries a signed workspace_id claim, and policies intersect that claim with real membership, so one workspace cannot read another's logs, vectors, or findings through any application path.",
            },
          },
          {
            "@type": "Question",
            name: "What log formats can GuardAI ingest?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "JSON and NDJSON, CSV and TSV, RFC 3164 and RFC 5424 syslog, and plain text logs. Uploads are limited to 10 MB on the Free plan and 100 MB on Pro, and the file's actual bytes are re-validated server-side before processing.",
            },
          },
          {
            "@type": "Question",
            name: "Does GuardAI support multi-factor authentication?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. GuardAI supports two second factors: a 6-digit code from any TOTP authenticator app such as Google Authenticator, 1Password, or Authy, and WebAuthn using Windows Hello, Touch ID, a device PIN, or a hardware security key. WebAuthn is the stronger option because the private key never leaves the device's secure hardware, so there is no shared secret that can be phished or leaked. Until the second factor is satisfied, the session is held at aal1 and cannot reach any protected route.",
            },
          },
          {
            "@type": "Question",
            name: "Is personal data sent to the AI model?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. PII is masked in the background worker before anything is persisted or sent to an embedding or language model API. Emails, IP addresses, credit card numbers, tokens, and private keys are replaced with stable pseudonyms so analysts can still correlate events without the raw values leaving the system.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
