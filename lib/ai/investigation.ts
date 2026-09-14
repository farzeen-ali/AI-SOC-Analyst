import { z } from "zod";

/**
 * Schema for the streaming investigation.
 *
 * Kept in its own module with no server-only imports so the client can pass
 * the identical schema to `useObject` — the browser renders exactly the shape
 * the server validates, and a drifting field cannot silently render as
 * `undefined`.
 *
 * Field order matters: `streamObject` emits keys roughly in declaration order,
 * so the verdict lands first and the UI can show a severity badge while the
 * remediation cards are still arriving.
 */
export const investigationSchema = z.object({
  verdict: z
    .object({
      headline: z
        .string()
        .max(140)
        .describe("One-line answer to the analyst's question"),
      threatType: z
        .string()
        .max(80)
        .describe("Threat classification, or 'None observed'"),
      severityScore: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("1 = informational, 10 = confirmed critical compromise"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("How strongly the retrieved evidence supports this"),
    })
    .describe("Top-level assessment, emitted first"),

  alerts: z
    .array(
      z.object({
        level: z.enum(["critical", "warning", "info"]),
        message: z.string().max(240),
      })
    )
    .max(4)
    .describe("Short warnings worth surfacing immediately"),

  analysis: z
    .string()
    .max(1800)
    .describe("What the evidence shows, in plain analyst language"),

  remediationCards: z
    .array(
      z.object({
        title: z.string().max(90),
        urgency: z.enum(["immediate", "today", "this_week"]),
        rationale: z.string().max(280),
        steps: z.array(z.string().max(220)).min(1).max(6),
      })
    )
    .max(4)
    .describe("Actionable remediation grouped into cards"),

  indicators: z
    .array(z.string().max(160))
    .max(10)
    .describe("Observed indicators, using the masked values from the logs"),
});

export type Investigation = z.infer<typeof investigationSchema>;
export type InvestigationAlert = Investigation["alerts"][number];
export type RemediationCard = Investigation["remediationCards"][number];

export const URGENCY_LABEL: Record<RemediationCard["urgency"], string> = {
  immediate: "Immediate",
  today: "Today",
  this_week: "This week",
};

/** Suggested questions shown before the analyst types their own. */
export const INVESTIGATION_PRESETS = [
  "What is the most serious thing in my logs right now?",
  "Is there evidence of credential access or brute force?",
  "Show me anything that looks like data exfiltration.",
  "Were any security controls disabled or bypassed?",
] as const;
