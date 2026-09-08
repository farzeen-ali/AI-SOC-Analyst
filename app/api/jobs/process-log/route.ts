import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { processLogFile } from "@/lib/ingest/processor";
import { verifyJobRequest } from "@/lib/queue/qstash";

export const runtime = "nodejs";
/** Parsing plus embedding a large file legitimately takes minutes. */
export const maxDuration = 300;

const jobSchema = z.object({
  fileId: z.uuid(),
  workspaceId: z.uuid(),
});

/**
 * Ingestion worker.
 *
 * Publicly routable by necessity — QStash calls it over HTTP — so the Upstash
 * signature is the authentication boundary. An unsigned request is rejected
 * before the body is even parsed, and the payload is then validated rather
 * than trusted. The handler is idempotent: `processLogFile` no-ops unless the
 * file is still in `queued`, which makes QStash's retries safe.
 */
export async function POST(request: NextRequest) {
  const verified = await verifyJobRequest(request);

  if (!verified.ok) {
    console.warn("[jobs] rejected unsigned request:", verified.reason);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verified.body);
  } catch {
    return NextResponse.json({ error: "Malformed job." }, { status: 400 });
  }

  const parsed = jobSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed job." }, { status: 400 });
  }

  try {
    await processLogFile(parsed.data.fileId);
  } catch (error) {
    // Surface a 500 so QStash retries; `processLogFile` has already recorded
    // the user-facing failure state on the row.
    console.error("[jobs] processing threw", error);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
