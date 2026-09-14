"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/request";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validations/auth";
import { env } from "@/lib/env";

export interface SocActionResult {
  ok: boolean;
  message: string;
}

/* ------------------------------------------------------------------ *
 *  Remediation checklist
 * ------------------------------------------------------------------ */

const stepStatusSchema = z.object({
  stepId: z.uuid("Malformed step reference."),
  status: z.enum(["pending", "in_progress", "resolved"]),
});

/**
 * Moves one remediation step through its triage states.
 *
 * Open to every workspace role — analysts are the ones doing the work. The
 * write goes through the user's client so RLS authorises it, and the
 * `guard_remediation_step_fields` trigger pins everything except `status`,
 * so this cannot be used to rewrite the AI's remediation text.
 */
export async function setRemediationStepStatusAction(
  _prevState: SocActionResult | undefined,
  formData: FormData
): Promise<SocActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }

  const parsed = stepStatusSchema.safeParse({
    stepId: formData.get("stepId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  const limit = await checkRateLimit("mutation", `ws:${context.workspace.id}`);
  if (!limit.success) {
    return { ok: false, message: "Too many changes. Slow down a moment." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("finding_remediation_steps")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.stepId);

  if (error) {
    return { ok: false, message: `Could not update: ${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/threats");

  return { ok: true, message: "Step updated." };
}

/* ------------------------------------------------------------------ *
 *  Team invitations
 * ------------------------------------------------------------------ */

const inviteSchema = z.object({
  email: emailSchema,
});

/**
 * Invites an analyst into the workspace.
 *
 * Tenant Admin only. The invite carries `invited_workspace_id` in user
 * metadata, which the Phase 1 `on_auth_user_created` trigger reads to add the
 * new account as a `member` of exactly this workspace — the client never gets
 * to name the target workspace, and the invitee cannot be provisioned as an
 * admin.
 *
 * Seat limits are enforced here because the plan is the gate, not RLS.
 */
export async function inviteMemberAction(
  _prevState: SocActionResult | undefined,
  formData: FormData
): Promise<SocActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }
  if (!context.isTenantAdmin) {
    return {
      ok: false,
      message: "Only Tenant Admins can invite analysts.",
    };
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

  const limit = await checkRateLimit(
    "signup",
    `invite:${context.workspace.id}`
  );
  if (!limit.success) {
    return {
      ok: false,
      message: "Too many invitations sent. Try again shortly.",
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  // Seat check. RLS scopes this count to the caller's workspace.
  const { count } = await supabase
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", context.workspace.id);

  const seats = context.workspace.seats;
  if (!context.isSuperAdmin && (count ?? 0) >= seats) {
    return {
      ok: false,
      message: `All ${seats} seats on the ${context.workspace.plan.toUpperCase()} plan are in use. Upgrade to add more analysts.`,
    };
  }

  const admin = createAdminClient();

  // Already a member? Say so plainly rather than sending a pointless email.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMember } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", context.workspace.id)
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMember) {
      return { ok: false, message: `${email} is already in this workspace.` };
    }

    // The account exists but belongs elsewhere. Adding it directly would let
    // a Tenant Admin pull an arbitrary existing user into their tenant, so
    // this path is deliberately not automated.
    return {
      ok: false,
      message:
        "That address already has a GuardAI account. Ask them to sign in and request access instead.",
    };
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_workspace_id: context.workspace.id },
    redirectTo: `${env.siteUrl}/auth/callback?next=/dashboard`,
  });

  if (error) {
    console.error("[soc] invite failed", error.message);
    return {
      ok: false,
      message: "Could not send that invitation. Please try again.",
    };
  }

  await recordAudit({
    action: "team.member_invited",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "invitation",
    metadata: { email_domain: email.split("@")[1] ?? "unknown" },
  });

  revalidatePath("/dashboard/team");

  return { ok: true, message: `Invitation sent to ${email}.` };
}
