"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { recordAudit } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/dal";
import { deleteFileSchema, findingStatusSchema } from "@/lib/ingest/validation";
import { publishIngestJob, queueAvailable } from "@/lib/queue/qstash";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface IngestActionResult {
  ok: boolean;
  message: string;
}

/**
 * Triage a finding.
 *
 * Only `status` can change: the `findings_guard_immutable` trigger pins every
 * other column, so this cannot be used to rewrite an AI verdict or move a
 * finding between tenants even though the RLS policy allows the UPDATE.
 */
export async function setFindingStatusAction(
  _prevState: IngestActionResult | undefined,
  formData: FormData
): Promise<IngestActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }

  const parsed = findingStatusSchema.safeParse({
    findingId: formData.get("findingId"),
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
    .from("threat_findings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.findingId);

  if (error) {
    return { ok: false, message: `Could not update: ${error.message}` };
  }

  await recordAudit({
    action: "finding.status_changed",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "threat_finding",
    targetId: parsed.data.findingId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/dashboard/threats");
  revalidatePath("/dashboard");

  return { ok: true, message: `Marked as ${parsed.data.status}.` };
}

/**
 * Deletes an uploaded file, its vectors, and its findings.
 *
 * Tenant Admin only. The database row is removed through the user's client so
 * the `log_files: tenant admin deletes` policy authorises it; the storage
 * object is then removed with the service role, because a partially deleted
 * file is worse than either outcome.
 */
export async function deleteLogFileAction(
  _prevState: IngestActionResult | undefined,
  formData: FormData
): Promise<IngestActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }
  if (!context.isTenantAdmin) {
    return {
      ok: false,
      message: "Only Tenant Admins can delete ingested files.",
    };
  }

  const parsed = deleteFileSchema.safeParse({ fileId: formData.get("fileId") });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  const supabase = await createClient();

  const { data: file } = await supabase
    .from("log_files")
    .select("id, storage_path, filename, workspace_id")
    .eq("id", parsed.data.fileId)
    .single();

  if (!file || file.workspace_id !== context.workspace.id) {
    return { ok: false, message: "File not found." };
  }

  // Cascades to log_chunks and threat_findings via the foreign keys.
  const { error } = await supabase
    .from("log_files")
    .delete()
    .eq("id", parsed.data.fileId);

  if (error) {
    return { ok: false, message: `Could not delete: ${error.message}` };
  }

  try {
    await createAdminClient()
      .storage.from("security-logs")
      .remove([file.storage_path]);
  } catch (storageError) {
    console.error("[ingest] storage cleanup failed", storageError);
  }

  await recordAudit({
    action: "ingest.file_deleted",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "log_file",
    targetId: file.id,
    metadata: { filename: file.filename },
  });

  revalidatePath("/dashboard/logs");
  revalidatePath("/dashboard/threats");
  revalidatePath("/dashboard");

  return { ok: true, message: "File and its vectors were deleted." };
}

/**
 * Re-queues a failed file without a re-upload.
 *
 * Failures are frequently infrastructural — a missing migration, an expired
 * API key — rather than anything wrong with the bytes, which are still sitting
 * in storage. Only `failed` rows are eligible, and the status flip is
 * conditional on that, so a double-click cannot enqueue the same file twice.
 */
export async function retryLogFileAction(
  _prevState: IngestActionResult | undefined,
  formData: FormData
): Promise<IngestActionResult> {
  await assertSameOrigin();

  const context = await getAuthContext();
  if (!context?.workspace) {
    return { ok: false, message: "Not authenticated." };
  }

  const parsed = deleteFileSchema.safeParse({ fileId: formData.get("fileId") });
  if (!parsed.success) {
    return { ok: false, message: "That request was malformed." };
  }

  const limit = await checkRateLimit("uploadCommit", `ws:${context.workspace.id}`);
  if (!limit.success) {
    return { ok: false, message: "Too many retries. Try again shortly." };
  }

  // Read through the user's client so RLS proves workspace membership.
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("log_files")
    .select("id, workspace_id, status, filename")
    .eq("id", parsed.data.fileId)
    .single();

  if (!file || file.workspace_id !== context.workspace.id) {
    return { ok: false, message: "File not found." };
  }
  if (file.status !== "failed") {
    return { ok: false, message: "Only failed files can be retried." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("log_files")
    .update({
      status: "queued",
      error_message: null,
      event_count: 0,
      chunk_count: 0,
      masked_count: 0,
      processed_at: null,
    })
    .eq("id", file.id)
    .eq("status", "failed");

  if (error) {
    return { ok: false, message: `Could not re-queue: ${error.message}` };
  }

  try {
    const messageId = await publishIngestJob({
      fileId: file.id,
      workspaceId: context.workspace.id,
    });

    if (!messageId && !queueAvailable) {
      after(async () => {
        const { processLogFile } = await import("@/lib/ingest/processor");
        await processLogFile(file.id);
      });
    }
  } catch (enqueueError) {
    console.error("[ingest] retry enqueue failed", enqueueError);
    await admin
      .from("log_files")
      .update({
        status: "failed",
        error_message: "Could not schedule processing.",
      })
      .eq("id", file.id);
    return { ok: false, message: "Could not schedule processing." };
  }

  revalidatePath("/dashboard/logs");
  return { ok: true, message: `${file.filename} re-queued.` };
}
