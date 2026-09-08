import "server-only";

import { createHash } from "node:crypto";

import { analyzeThreats } from "@/lib/ai/threat-analysis";
import { embedChunks, toVectorLiteral } from "@/lib/ai/embeddings";
import { chunkEvents } from "@/lib/ingest/chunk";
import { ABSOLUTE_MAX_BYTES } from "@/lib/ingest/constants";
import { maskPii } from "@/lib/ingest/pii";
import {
  eventToLine,
  parseLogFile,
  UnsupportedContentError,
  type NormalizedEvent,
  type ParseIssue,
} from "@/lib/ingest/parse";
import { sweepForThreats } from "@/lib/rag/search";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IngestStatus, Json } from "@/lib/types/database";

/**
 * The ingestion worker.
 *
 * Runs entirely off the request path — published to QStash in production,
 * deferred with `after()` locally — so parsing and embedding a 100 MB upload
 * never occupies the Node event loop that is serving pages.
 *
 * It uses the service-role client because there is no user session on a queue
 * callback. Every write is therefore explicitly scoped with the `workspace_id`
 * carried on the job, and the job's workspace is re-read from the file row
 * rather than trusted from the payload.
 */

const CHUNK_INSERT_BATCH = 100;

export class IngestError extends Error {
  constructor(
    message: string,
    readonly userFacing = true
  ) {
    super(message);
    this.name = "IngestError";
  }
}

async function setStatus(
  fileId: string,
  status: IngestStatus,
  patch: Record<string, unknown> = {}
) {
  await createAdminClient()
    .from("log_files")
    .update({ status, ...patch })
    .eq("id", fileId);
}

/** Marks the file failed with a message that is safe to show the uploader. */
async function fail(fileId: string, message: string) {
  await setStatus(fileId, "failed", {
    error_message: message.slice(0, 500),
    processed_at: new Date().toISOString(),
  });
}

export async function processLogFile(fileId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: file, error: loadError } = await admin
    .from("log_files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (loadError || !file) {
    console.error("[ingest] file row not found", fileId, loadError?.message);
    return;
  }

  // Idempotency: QStash retries, and a duplicate delivery must not re-embed a
  // file that already succeeded or is mid-flight.
  if (file.status !== "queued") {
    console.warn(
      `[ingest] skipping ${fileId}: status is "${file.status}", expected "queued".`
    );
    return;
  }

  try {
    await setStatus(fileId, "parsing");

    /* ---------------- 1. Fetch the uploaded object ---------------- */

    const { data: blob, error: downloadError } = await admin.storage
      .from("security-logs")
      .download(file.storage_path);

    if (downloadError || !blob) {
      throw new IngestError(
        `Could not read the uploaded file: ${downloadError?.message ?? "not found"}`
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // The signed URL let the client write arbitrary bytes; the declared size
    // is only a claim until now.
    if (bytes.byteLength > ABSOLUTE_MAX_BYTES) {
      throw new IngestError("Uploaded object exceeds the maximum allowed size.");
    }
    if (bytes.byteLength === 0) {
      throw new IngestError("Uploaded file is empty.");
    }

    const checksum = createHash("sha256").update(bytes).digest("hex");

    // Reject anything that is not decodable text before doing real work.
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new IngestError(
        "File is not valid UTF-8 text. Binary and compressed logs are not supported."
      );
    }

    /* ---------------- 2. Parse and normalise ---------------- */

    let events: NormalizedEvent[];
    let issues: ParseIssue[];
    let truncated: boolean;
    let detectedFormat = file.format;

    try {
      const parsed = parseLogFile(content, file.format);
      events = parsed.events;
      issues = parsed.issues;
      truncated = parsed.truncated;
      detectedFormat = parsed.format;
    } catch (error) {
      if (error instanceof UnsupportedContentError) {
        throw new IngestError(error.message);
      }
      throw error;
    }

    if (events.length === 0) {
      throw new IngestError("No log events could be read from this file.");
    }

    /* ---------------- 3. Mask PII before anything is persisted ---------------- */

    let maskedCount = 0;
    const maskedEvents = events.map((event) => {
      const masked = maskPii(eventToLine(event));
      maskedCount += masked.count;
      return { ...event, message: masked.text, fields: undefined };
    });

    /* ---------------- 4. Chunk with overlap ---------------- */

    const chunks = chunkEvents(maskedEvents);
    if (chunks.length === 0) {
      throw new IngestError("File produced no indexable content.");
    }

    await setStatus(fileId, "embedding", {
      event_count: events.length,
      masked_count: maskedCount,
      chunk_count: chunks.length,
      checksum,
    });

    /* ---------------- 5. Embed and store vectors ---------------- */

    const vectors = await embedChunks(chunks.map((chunk) => chunk.content));

    // Replace any partial state from a previous failed attempt.
    await admin.from("log_chunks").delete().eq("file_id", fileId);

    for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH) {
      const slice = chunks.slice(start, start + CHUNK_INSERT_BATCH);
      const rows = slice.map((chunk, offset) => ({
        workspace_id: file.workspace_id,
        file_id: fileId,
        chunk_index: chunk.index,
        content: chunk.content,
        token_estimate: chunk.tokenEstimate,
        metadata: {
          ...chunk.metadata,
          format: detectedFormat,
          filename: file.filename,
        } as unknown as Json,
        embedding: toVectorLiteral(vectors[start + offset]),
      }));

      const { error: insertError } = await admin
        .from("log_chunks")
        .insert(rows);

      if (insertError) {
        throw new IngestError(
          `Failed to store vectors: ${insertError.message}`,
          false
        );
      }
    }

    /* ---------------- 6. RAG sweep and threat analysis ---------------- */

    await setStatus(fileId, "analyzing");

    const retrieved = await sweepForThreats(
      admin,
      file.workspace_id,
      fileId,
      4
    );

    const blocks = retrieved.slice(0, 14).map((chunk, index) => ({
      index,
      chunkId: chunk.id,
      content: chunk.content,
      similarity: chunk.similarity,
    }));

    const analysis = await analyzeThreats(blocks, {
      filename: file.filename,
      format: detectedFormat,
      eventCount: events.length,
    });

    if (analysis.findings.length > 0) {
      const findingRows = analysis.findings.map((finding) => ({
        workspace_id: file.workspace_id,
        file_id: fileId,
        title: finding.title,
        threat_type: finding.threatType,
        severity_score: finding.severityScore,
        confidence: finding.confidence,
        explanation: finding.explanation,
        remediation: finding.remediation as unknown as Json,
        indicators: finding.indicators as unknown as Json,
        mitre_techniques: finding.mitreTechniques as unknown as Json,
        // Map the model's block indexes back to real chunk ids, dropping
        // anything out of range rather than trusting the number.
        evidence_chunk_ids: finding.evidenceChunkIndexes
          .map((index) => blocks[index]?.chunkId)
          .filter((id): id is string => Boolean(id)),
      }));

      const { error: findingError } = await admin
        .from("threat_findings")
        .insert(findingRows);

      if (findingError) {
        console.error("[ingest] storing findings failed", findingError.message);
      }
    }

    /* ---------------- 7. Done ---------------- */

    await setStatus(fileId, "completed", {
      processed_at: new Date().toISOString(),
      error_message:
        issues.length > 0 || truncated
          ? summariseIssues(issues, truncated, events.length)
          : null,
    });
  } catch (error) {
    const message =
      error instanceof IngestError && error.userFacing
        ? error.message
        : "Processing failed unexpectedly. Please try again or contact support.";

    console.error("[ingest] processing failed", fileId, error);
    await fail(fileId, message);
  }
}

/** Non-fatal parse notes, surfaced next to a completed file. */
function summariseIssues(
  issues: ParseIssue[],
  truncated: boolean,
  eventCount: number
): string {
  const parts: string[] = [];
  if (truncated) {
    parts.push(
      `File was truncated after ${eventCount.toLocaleString()} events.`
    );
  }
  if (issues.length > 0) {
    parts.push(
      `${issues.length} line${issues.length === 1 ? "" : "s"} could not be parsed (first: line ${issues[0].line} — ${issues[0].reason}).`
    );
  }
  return parts.join(" ").slice(0, 500);
}
