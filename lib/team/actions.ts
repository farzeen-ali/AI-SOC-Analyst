"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/dal";
import { seatLimit } from "@/lib/billing/plans";
import {
  acceptInvitation,
  createInvitation,
  type InvitationProblem,
} from "@/lib/team/invitations";
import {
  checkDualRateLimit,
  checkRateLimit,
  formatRetryAfter,
} from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  getClientIp,
  hashIdentifier,
} from "@/lib/security/request";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fullNameSchema, passwordSchema } from "@/lib/validations/auth";

export interface TeamActionResult {
  ok: boolean;
  message: string;
  /** Present on a successful invite — the tokenized link to share. */
  inviteUrl?: string;
}

const inviteSchema = z.object({ email: emailSchema });

/**
 * Issues a tokenized invitation for a Member seat.
 *
 * Role, workspace and seat allowance are all resolved server-side. The form
 * supplies an email address and nothing else — it cannot name a workspace, it
 * cannot request `tenant_admin`, and it cannot raise the seat ceiling.
 */
export async function inviteMemberAction(
  _prevState: TeamActionResult | undefined,
  formData: FormData
): Promise<TeamActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }
  if (!context.isTenantAdmin) {
    return { ok: false, message: "Only Tenant Admins can invite analysts." };
  }

  const parsed = inviteSchema.safeParse({
    email: sanitizeEmail(formData.get("email")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter a valid work email.",
    };
  }

  const workspace = context.workspace;
  const limit = await checkRateLimit("signup", `invite:${workspace.id}`);
  if (!limit.success) {
    return {
      ok: false,
      message: `Too many invitations. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const { count } = await supabase
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);

  const seats = seatLimit(workspace.plan);
  if (!context.isSuperAdmin && (count ?? 0) >= seats) {
    return {
      ok: false,
      message:
        workspace.plan === "pro"
          ? `All ${seats} Pro seats are in use.`
          : `The Free plan includes ${seats} seats and both are in use. Upgrade to Pro for up to 10 analysts.`,
    };
  }

  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMember } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspace.id)
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMember) {
      return { ok: false, message: `${email} is already in this workspace.` };
    }

    // The account exists but belongs elsewhere. Pulling an arbitrary existing
    // user into a tenant on an admin's say-so is deliberately not automated.
    return {
      ok: false,
      message:
        "That address already has a GuardAI account. Ask them to sign in and request access instead.",
    };
  }

  try {
    const invitation = await createInvitation({
      workspaceId: workspace.id,
      email,
      invitedBy: context.userId,
    });

    await recordAudit({
      action: "team.member_invited",
      actorId: context.userId,
      workspaceId: workspace.id,
      targetType: "invitation",
      targetId: invitation.id,
      // The address itself is not recorded — the domain is enough to audit
      // "who was invited from where" without copying PII into the log.
      metadata: { email_domain: email.split("@")[1] ?? "unknown" },
    });

    revalidatePath("/dashboard/team");

    return {
      ok: true,
      message: `Invitation ready for ${email}.`,
      inviteUrl: invitation.url,
    };
  } catch (error) {
    console.error(
      "[team] invite failed",
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      message: "Could not create that invitation. Please try again.",
    };
  }
}

const revokeSchema = z.object({ id: z.uuid() });

export async function revokeInvitationAction(
  _prevState: TeamActionResult | undefined,
  formData: FormData
): Promise<TeamActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace || !context.isTenantAdmin) {
    return { ok: false, message: "Only Tenant Admins can revoke invitations." };
  }

  const parsed = revokeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  // Scoped by workspace as well as id, so an admin cannot revoke another
  // tenant's invitation by guessing a uuid.
  const { error } = await createAdminClient()
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("workspace_id", context.workspace.id)
    .is("accepted_at", null);

  if (error) {
    return { ok: false, message: "Could not revoke that invitation." };
  }

  await recordAudit({
    action: "team.invitation_revoked",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "invitation",
    targetId: parsed.data.id,
  });

  revalidatePath("/dashboard/team");
  return { ok: true, message: "Invitation revoked." };
}

/* ------------------------------------------------------------------ *
 *  Acceptance — runs for a signed-out visitor
 * ------------------------------------------------------------------ */

const acceptSchema = z.object({
  token: z.string().min(16).max(256),
  fullName: fullNameSchema,
  password: passwordSchema,
});

const PROBLEM_MESSAGES: Record<InvitationProblem, string> = {
  not_found: "This invitation link is not valid.",
  expired: "This invitation has expired. Ask your admin to send a new one.",
  revoked: "This invitation was revoked.",
  accepted: "This invitation has already been used. Try signing in instead.",
  seats_full:
    "That workspace has no seats left. Ask your admin to upgrade or free a seat.",
  email_taken:
    "An account already exists for this address. Sign in instead of joining.",
  workspace_suspended: "That workspace is not currently active.",
};

/**
 * Creates the Member account behind an invitation link.
 *
 * Unauthenticated by necessity, so the token is the only credential and the
 * endpoint is rate limited on both the IP and the token — an attacker who
 * harvested one link should not be able to grind at it, and one who has none
 * should not be able to enumerate.
 */
export async function acceptInvitationAction(
  _prevState: TeamActionResult | undefined,
  formData: FormData
): Promise<TeamActionResult> {
  await assertSameOrigin();

  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the details and try again.",
    };
  }

  const ip = await getClientIp();
  const limit = await checkDualRateLimit(
    "signup",
    ip,
    hashIdentifier(parsed.data.token)
  );
  if (!limit.success) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
    };
  }

  try {
    const result = await acceptInvitation({
      rawToken: parsed.data.token,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
    });

    if (!result.ok) {
      return { ok: false, message: PROBLEM_MESSAGES[result.problem] };
    }

    await recordAudit({
      action: "team.invitation_accepted",
      targetType: "invitation",
      metadata: { email_domain: result.email.split("@")[1] ?? "unknown" },
    });

    return {
      ok: true,
      message: "Account created. Sign in to reach your workspace.",
    };
  } catch (error) {
    console.error(
      "[team] accept failed",
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      message: "Could not complete your registration. Please try again.",
    };
  }
}
