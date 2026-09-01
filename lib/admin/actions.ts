"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/auth/audit";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { assertSameOrigin } from "@/lib/security/request";

/**
 * Super Admin moderation actions.
 *
 * Suspension is reversible and is the enforcement primitive behind the
 * "Suspend / Ban" requirement: a suspended user or workspace is rejected by
 * the proxy on the next request, by `getAuthContext()` on the next render, and
 * loses its workspace claim on the next token mint. Irreversible account
 * deletion is deliberately not exposed here — see the Phase 1 notes in
 * README.md.
 */

const targetSchema = z.object({
  id: z.uuid("Expected a workspace or user id."),
  suspended: z.enum(["true", "false"]),
});

export interface ModerationResult {
  ok: boolean;
  message: string;
}

export async function setWorkspaceSuspensionAction(
  _prevState: ModerationResult | undefined,
  formData: FormData
): Promise<ModerationResult> {
  await assertSameOrigin();
  const actor = await requireSuperAdmin();

  const parsed = targetSchema.safeParse({
    id: formData.get("id"),
    suspended: formData.get("suspended"),
  });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  const suspend = parsed.data.suspended === "true";

  const { error } = await createAdminClient()
    .from("workspaces")
    .update({ is_suspended: suspend })
    .eq("id", parsed.data.id);

  if (error) {
    return { ok: false, message: `Could not update tenant: ${error.message}` };
  }

  await recordAudit({
    action: suspend ? "admin.workspace_suspended" : "admin.workspace_reinstated",
    actorId: actor.userId,
    workspaceId: parsed.data.id,
    targetType: "workspace",
    targetId: parsed.data.id,
    metadata: { admin_action: suspend ? "suspend" : "reinstate" },
  });

  revalidatePath("/super-admin/tenants");
  revalidatePath("/super-admin");

  return {
    ok: true,
    message: suspend ? "Tenant suspended." : "Tenant reinstated.",
  };
}

export async function setUserSuspensionAction(
  _prevState: ModerationResult | undefined,
  formData: FormData
): Promise<ModerationResult> {
  await assertSameOrigin();
  const actor = await requireSuperAdmin();

  const parsed = targetSchema.safeParse({
    id: formData.get("id"),
    suspended: formData.get("suspended"),
  });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  if (parsed.data.id === actor.userId) {
    return { ok: false, message: "You cannot suspend your own account." };
  }

  const suspend = parsed.data.suspended === "true";
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ is_suspended: suspend })
    .eq("id", parsed.data.id);

  if (error) {
    return { ok: false, message: `Could not update user: ${error.message}` };
  }

  // Suspension takes effect immediately rather than at token expiry.
  if (suspend) {
    try {
      await admin.auth.admin.updateUserById(parsed.data.id, {
        ban_duration: "876000h",
      });
    } catch (banError) {
      console.error("[admin] force-logout failed", banError);
    }
  } else {
    try {
      await admin.auth.admin.updateUserById(parsed.data.id, {
        ban_duration: "none",
      });
    } catch (banError) {
      console.error("[admin] lifting ban failed", banError);
    }
  }

  await recordAudit({
    action: suspend ? "admin.user_suspended" : "admin.user_reinstated",
    actorId: actor.userId,
    targetType: "user",
    targetId: parsed.data.id,
    metadata: { admin_action: suspend ? "suspend" : "reinstate" },
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/super-admin");

  return {
    ok: true,
    message: suspend
      ? "User suspended and signed out."
      : "User reinstated.",
  };
}
