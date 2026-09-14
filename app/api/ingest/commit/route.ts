import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";

import { recordAudit } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/dal";
import { ABSOLUTE_MAX_BYTES, uploadLimitFor } from "@/lib/ingest/constants";
import { commitUploadSchema } from "@/lib/ingest/validation";
import { publishIngestJob, queueAvailable } from "@/lib/queue/qstash";
import { checkRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import { guardSameOrigin, getClientIp } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Confirms an upload landed and hands the file to the background queue.
 *
 * The declared size from `prepare` was only a claim; here the real object is
 * stat-ed before any work is scheduled, so a client cannot reserve a 1 KB
 * ticket and then push 100 MB through it.
 */
export async function POST(request: NextRequest) {
  const originRefusal = await guardSameOrigin();
  if (originRefusal) return originRefusal;

  const context = await getAuthContext();
  if (!context?.workspace) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    "uploadCommit",
    `ws:${context.workspace.id}:${ip}`
  );
  if (!limit.success) {
    return NextResponse.json(
      {
        error: `Too many uploads. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = commitUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 422 });
  }

  const supabase = await createClient();

  // Read through the user's client: RLS proves this file belongs to a
  // workspace the caller is actually a member of.
  const { data: file, error: loadError } = await supabase
    .from("log_files")
    .select("id, workspace_id, storage_path, status, filename")
    .eq("id", parsed.data.fileId)
    .single();

  if (loadError || !file) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  if (file.workspace_id !== context.workspace.id) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  if (file.status !== "pending") {
    return NextResponse.json(
      { error: "This upload has already been submitted." },
      { status: 409 }
    );
  }

  /* ---- Verify the object actually exists, and how big it really is ---- */

  const admin = createAdminClient();
  const { data: listed, error: listError } = await admin.storage
    .from("security-logs")
    .list(context.workspace.id, { search: file.id, limit: 1 });

  const object = listed?.find((entry) => entry.name === file.id);

  if (listError || !object) {
    await admin
      .from("log_files")
      .update({
        status: "failed",
        error_message: "Upload did not complete.",
      })
      .eq("id", file.id);
    return NextResponse.json(
      { error: "Upload did not complete. Please try again." },
      { status: 400 }
    );
  }

  const actualSize = Number(object.metadata?.size ?? 0);
  const maxBytes = uploadLimitFor(context.workspace.plan, context.isSuperAdmin);

  if (actualSize <= 0 || actualSize > Math.min(maxBytes, ABSOLUTE_MAX_BYTES)) {
    await admin.storage.from("security-logs").remove([file.storage_path]);
    await admin
      .from("log_files")
      .update({
        status: "failed",
        error_message: "Uploaded object failed size verification.",
      })
      .eq("id", file.id);

    await recordAudit({
      action: "ingest.rejected",
      actorId: context.userId,
      workspaceId: context.workspace.id,
      targetType: "log_file",
      targetId: file.id,
      metadata: { reason: "size_mismatch", actualSize, limit: maxBytes },
    });

    return NextResponse.json(
      { error: "Uploaded file failed verification." },
      { status: 413 }
    );
  }

  const { error: queueError } = await admin
    .from("log_files")
    .update({ status: "queued", size_bytes: actualSize })
    .eq("id", file.id)
    .eq("status", "pending"); // guards against a concurrent double-commit

  if (queueError) {
    return NextResponse.json(
      { error: "Could not queue the file." },
      { status: 500 }
    );
  }

  await recordAudit({
    action: "ingest.upload_committed",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "log_file",
    targetId: file.id,
    metadata: { filename: file.filename, size: actualSize },
  });

  /* ---- Hand off to the background worker ---- */

  try {
    const messageId = await publishIngestJob({
      fileId: file.id,
      workspaceId: context.workspace.id,
    });

    if (!messageId && !queueAvailable) {
      // Local development: QStash cannot call back to a loopback address, so
      // the work runs here instead — still after the response is sent, just
      // not durable or retried.
      console.info(
        `[ingest] queue unreachable; processing ${file.id} locally via after()`
      );
      after(async () => {
        const { processLogFile } = await import("@/lib/ingest/processor");
        await processLogFile(file.id);
      });
    }
  } catch (error) {
    console.error("[ingest] enqueue failed", error);
    await admin
      .from("log_files")
      .update({
        status: "failed",
        error_message: "Could not schedule processing.",
      })
      .eq("id", file.id);

    return NextResponse.json(
      { error: "Could not schedule processing." },
      { status: 503 }
    );
  }

  return NextResponse.json({ fileId: file.id, status: "queued" });
}
