import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { embedQuery } from "@/lib/ai/embeddings";
import { toVectorLiteral } from "@/lib/ai/embeddings";
import { RAG_MATCH_COUNT, RAG_MIN_SIMILARITY } from "@/lib/ingest/constants";
import type { Database, Json } from "@/lib/types/database";

export interface RetrievedChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  metadata: Json;
  similarity: number;
}

export interface SearchOptions {
  matchCount?: number;
  minSimilarity?: number;
  /** Restricts retrieval to a single uploaded file. */
  fileId?: string | null;
}

/**
 * Cosine similarity search over the workspace's log vectors.
 *
 * `workspaceId` is passed explicitly *and* enforced by RLS on `log_chunks`:
 * the argument lets the planner use the composite `(workspace_id, file_id)`
 * index before ranking by distance, while the policy is what actually
 * guarantees a caller can never read another tenant's vectors.
 */
export async function searchLogChunks(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  query: string,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);

  const { data, error } = await supabase.rpc("match_log_chunks", {
    query_embedding: toVectorLiteral(embedding),
    filter_workspace: workspaceId,
    match_count: options.matchCount ?? RAG_MATCH_COUNT,
    similarity_threshold: options.minSimilarity ?? RAG_MIN_SIMILARITY,
    filter_file: options.fileId ?? null,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    similarity: row.similarity,
  }));
}

/**
 * Probe queries used to sweep a freshly ingested file.
 *
 * Retrieval needs a question; a batch upload has none, so the pipeline asks a
 * fixed set covering the common attack families and merges the hits.
 */
export const THREAT_PROBES = [
  "failed login attempts, brute force, password spraying, credential stuffing",
  "privilege escalation, sudo, administrator role granted, permission change",
  "data exfiltration, large outbound transfer, unusual egress, upload to external host",
  "malware execution, suspicious process, encoded powershell, shell command injection",
  "unauthorised access, impossible travel, new device, session hijack, token reuse",
  "configuration change, firewall rule modified, security control disabled, audit logging stopped",
] as const;

/** Runs every probe and returns de-duplicated chunks, best match first. */
export async function sweepForThreats(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  fileId: string,
  perProbe = 4
): Promise<RetrievedChunk[]> {
  const results = await Promise.all(
    THREAT_PROBES.map((probe) =>
      searchLogChunks(supabase, workspaceId, probe, {
        matchCount: perProbe,
        fileId,
        minSimilarity: 0,
      })
    )
  );

  const byId = new Map<string, RetrievedChunk>();
  for (const chunk of results.flat()) {
    const existing = byId.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      byId.set(chunk.id, chunk);
    }
  }

  return [...byId.values()].sort((a, b) => b.similarity - a.similarity);
}
