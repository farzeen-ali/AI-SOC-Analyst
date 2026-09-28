"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

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

