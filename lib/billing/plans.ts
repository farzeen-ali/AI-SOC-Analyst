import type { WorkspacePlan } from "@/lib/types/database";

/**
 * Plan catalogue — the single source of truth for every tier limit.
 *
 * Seat counts, upload ceilings and scan quotas are read from here by the
 * upload route, the invitation flow, the quota meter and the pricing UI, so a
 * tier change is one edit rather than a hunt through the codebase. The values
 * must stay in step with `seats_for_plan()` in migration 0007, which is what
 * the database enforces.
 */

export interface PlanDefinition {
  id: WorkspacePlan;
  name: string;
  /** Monthly price in the smallest currency unit (cents). */
  priceCents: number;
  currency: string;
  tagline: string;
  /** Total workspace_members rows allowed, admin included. */
  seats: number;
  /** Member seats excluding the Tenant Admin — what the marketing copy says. */
  memberSeats: number;
  /** Daily log scans, or null for unlimited. */
  dailyScans: number | null;
  maxUploadBytes: number;
  aiPriority: "standard" | "priority";
  features: readonly string[];
}

export const PLANS: Record<WorkspacePlan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    currency: "usd",
    tagline: "Evaluate GuardAI on real logs.",
    seats: 2,
    memberSeats: 1,
    dailyScans: 5,
    maxUploadBytes: 10 * 1024 * 1024,
    aiPriority: "standard",
    features: [
      "1 Tenant Admin + 1 analyst seat",
      "5 log scans per day",
      "10 MB maximum upload",
      "Standard AI execution queue",
      "Full RAG threat detection and remediation",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 2000,
    currency: "usd",
    tagline: "For teams running a live SOC.",
    seats: 11,
    memberSeats: 10,
    dailyScans: null,
    maxUploadBytes: 100 * 1024 * 1024,
    aiPriority: "priority",
    features: [
      "1 Tenant Admin + up to 10 analyst seats",
      "Unlimited daily log scans",
      "100 MB maximum upload",
      "Priority AI execution queue",
      "Full RAG threat detection and remediation",
    ],
  },
};

export const FREE_PLAN = PLANS.free;
export const PRO_PLAN = PLANS.pro;

export function planFor(plan: WorkspacePlan): PlanDefinition {
  return PLANS[plan] ?? PLANS.free;
}

/** "$20" / "Free" — no trailing cents when the price is whole. */
export function formatPlanPrice(plan: PlanDefinition): string {
  if (plan.priceCents === 0) return "Free";
  const whole = plan.priceCents / 100;
  const body = Number.isInteger(whole) ? whole.toFixed(0) : whole.toFixed(2);
  return `$${body}`;
}

/**
 * Daily scan allowance for a workspace.
 *
 * Super Admins are exempt from tier limits by design — the role exists to
 * operate the platform, and metering the operator would make incident
 * response depend on a billing state.
 */
export function dailyScanLimit(
  plan: WorkspacePlan,
  isSuperAdmin: boolean
): number | null {
  if (isSuperAdmin) return null;
  return planFor(plan).dailyScans;
}

export function seatLimit(plan: WorkspacePlan): number {
  return planFor(plan).seats;
}
