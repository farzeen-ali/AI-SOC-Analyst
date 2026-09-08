import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LogFile, ThreatFinding } from "@/lib/types/database";

/**
 * Tenant-scoped reads for the ingestion and threat screens.
 *
 * All of these go through the user's client, so the `*: read own tenant` RLS
 * policies are what scope the rows — there is no manual workspace filter to
 * forget.
 */

export interface FindingWithFile extends ThreatFinding {
  log_files: { filename: string } | null;
}

export async function listLogFiles(limit = 40): Promise<LogFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_files")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ingest] listing files failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function listFindings(limit = 60): Promise<FindingWithFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("threat_findings")
    .select("*, log_files(filename)")
    .order("severity_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ingest] listing findings failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as FindingWithFile[];
}

export interface IngestStats {
  filesTotal: number;
  filesProcessing: number;
  eventsIndexed: number;
  chunksIndexed: number;
  maskedValues: number;
  openFindings: number;
  criticalFindings: number;
  meanSeverity: number;
}

/** Aggregates for the overview cards. Computed from the RLS-scoped rows. */
export async function getIngestStats(): Promise<IngestStats> {
  const supabase = await createClient();

  const [filesResult, findingsResult] = await Promise.all([
    supabase
      .from("log_files")
      .select("status, event_count, chunk_count, masked_count"),
    supabase.from("threat_findings").select("severity_score, status"),
  ]);

  const files = filesResult.data ?? [];
  const findings = findingsResult.data ?? [];

  const active = new Set(["queued", "parsing", "embedding", "analyzing"]);

  const severitySum = findings.reduce(
    (total, finding) => total + finding.severity_score,
    0
  );

  return {
    filesTotal: files.length,
    filesProcessing: files.filter((file) => active.has(file.status)).length,
    eventsIndexed: files.reduce((total, file) => total + file.event_count, 0),
    chunksIndexed: files.reduce((total, file) => total + file.chunk_count, 0),
    maskedValues: files.reduce((total, file) => total + file.masked_count, 0),
    openFindings: findings.filter((finding) => finding.status === "open").length,
    criticalFindings: findings.filter((finding) => finding.severity_score >= 9)
      .length,
    meanSeverity: findings.length
      ? Math.round((severitySum / findings.length) * 10) / 10
      : 0,
  };
}
