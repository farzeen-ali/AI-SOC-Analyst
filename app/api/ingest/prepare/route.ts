import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { recordAudit } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/dal";
import {
  formatFromFilename,
  uploadLimitFor,
  formatBytes,
} from "@/lib/ingest/constants";
import { prepareUploadSchema } from "@/lib/ingest/validation";
import {
  checkRateLimit,
  formatRetryAfter,
} from "@/lib/security/rate-limit";
import { guardSameOrigin, getClientIp } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Issues a scoped, single-use upload ticket.
 *
 * Large files go straight from the browser to Supabase Storage, so this route
 * is where the policy decisions happen: membership, plan size limit, filename
 * shape, and content type. The object key is server-generated and prefixed
 * with the workspace id, which is also the boundary the storage RLS policies
 * enforce — a client can neither choose its own path nor reach another
 * tenant's prefix.
 *
 * Content itself is still untrusted after this point; the worker re-validates
 * the actual bytes.
 */
export async function POST(request: NextRequest) {
  const originRefusal = await guardSameOrigin();
  if (originRefusal) return originRefusal;

  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!context.workspace) {
    return NextResponse.json(
      { error: "No active workspace for this account." },
      { status: 403 }
    );
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    "uploadPrepare",
    `ws:${context.workspace.id}:${ip}`
  );
  if (!limit.success) {
    return NextResponse.json(
      {
        error: `Too many uploads. Try again in ${formatRetryAfter(limit.retryAfter)}.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = prepareUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Upload rejected.",
        issues: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 422 }
    );
  }

  const { filename, size, mimeType } = parsed.data;

  const maxBytes = uploadLimitFor(context.workspace.plan, context.isSuperAdmin);
  if (size > maxBytes) {
    await recordAudit({
      action: "ingest.rejected",
      actorId: context.userId,
      workspaceId: context.workspace.id,
      metadata: { reason: "size_limit", size, limit: maxBytes },
    });
    return NextResponse.json(
      {
        error: `File is ${formatBytes(size)}. The ${context.workspace.plan.toUpperCase()} plan allows up to ${formatBytes(maxBytes)}.`,
      },
      { status: 413 }
    );
  }

  const format = formatFromFilename(filename);
  if (!format) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 415 }
    );
  }

  // Server-generated key. The client never chooses where its bytes land.
  const fileId = randomUUID();
  const storagePath = `${context.workspace.id}/${fileId}`;

  const supabase = await createClient();

  // Written through the user's client so the `log_files: members upload`
  // policy is what authorises the row.
  const { error: insertError } = await supabase.from("log_files").insert({
    id: fileId,
    workspace_id: context.workspace.id,
    uploaded_by: context.userId,
    filename,
    storage_path: storagePath,
    mime_type: mimeType || "application/octet-stream",
    size_bytes: size,
    format,
    status: "pending",
  });

  if (insertError) {
    console.error("[ingest] could not create file row", insertError.message);

    // 42501 is Postgres' insufficient_privilege, which is what an RLS denial
    // surfaces as. Almost always a setup gap rather than a bug, so say which
    // one instead of returning a bare 500.
    if (insertError.code === "42501") {
      return NextResponse.json(
        {
          error:
            "Upload was blocked by a database policy. Run the latest migration " +
            "in supabase/migrations, then sign out and back in so a fresh " +
            "access token is issued.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Could not start the upload." },
      { status: 500 }
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("security-logs")
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    await supabase.from("log_files").delete().eq("id", fileId);
    console.error("[ingest] signing failed", signError?.message);
    return NextResponse.json(
      { error: "Could not authorise the upload." },
      { status: 500 }
    );
  }

  await recordAudit({
    action: "ingest.upload_requested",
    actorId: context.userId,
    workspaceId: context.workspace.id,
    targetType: "log_file",
    targetId: fileId,
    metadata: { filename, size, format },
  });

  return NextResponse.json({
    fileId,
    path: signed.path,
    token: signed.token,
    format,
  });
}
