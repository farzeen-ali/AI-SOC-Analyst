import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { RemediationStatus } from "@/lib/types/database";

/**
 * Read models for the SOC Intelligence Center.
 *
 * Aggregation happens in Postgres (`workspace_threat_analytics`) so the
 * dashboard is one round trip rather than several client-side reductions over
 * full row sets. The RPC is SECURITY INVOKER, so RLS scopes every count to the
 * caller's workspace.
 */

/** The RPC returns `jsonb`; validate rather than trust the shape. */
const analyticsSchema = z.object({
  total_findings: z.coerce.number().default(0),
  open_findings: z.coerce.number().default(0),
  critical_findings: z.coerce.number().default(0),
  mean_severity: z.coerce.number().default(0),
  max_severity: z.coerce.number().default(0),
  by_severity: z.record(z.string(), z.coerce.number()).default({}),
  by_vector: z
    .array(
      z.object({
        threat_type: z.string(),
        total: z.coerce.number(),
        max_severity: z.coerce.number(),
      })
    )
    .default([]),
  steps_by_status: z.record(z.string(), z.coerce.number()).default({}),
});

export interface AttackVector {
  threatType: string;
  total: number;
  maxSeverity: number;
}

export interface SocAnalytics {
  totalFindings: number;
  openFindings: number;
  criticalFindings: number;
  meanSeverity: number;
  /** Highest severity among still-open findings — drives the risk gauge. */
  maxOpenSeverity: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  vectors: AttackVector[];
  steps: Record<RemediationStatus, number>;
}

const EMPTY_ANALYTICS: SocAnalytics = {
  totalFindings: 0,
  openFindings: 0,
  criticalFindings: 0,
  meanSeverity: 0,
  maxOpenSeverity: 0,
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  vectors: [],
  steps: { pending: 0, in_progress: 0, resolved: 0 },
};

export async function getSocAnalytics(
  workspaceId: string | null
): Promise<SocAnalytics> {
  if (!workspaceId) return EMPTY_ANALYTICS;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workspace_threat_analytics", {
    target: workspaceId,
  });

  if (error) {
    console.error("[soc] analytics failed", error.message);
    return EMPTY_ANALYTICS;
  }

  const parsed = analyticsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[soc] analytics shape unexpected", parsed.error.message);
    return EMPTY_ANALYTICS;
  }

  const value = parsed.data;

  return {
    totalFindings: value.total_findings,
    openFindings: value.open_findings,
    criticalFindings: value.critical_findings,
    meanSeverity: value.mean_severity,
    maxOpenSeverity: value.max_severity,
    bySeverity: {
      critical: value.by_severity.critical ?? 0,
      high: value.by_severity.high ?? 0,
      medium: value.by_severity.medium ?? 0,
      low: value.by_severity.low ?? 0,
    },
    vectors: value.by_vector.map((vector) => ({
      threatType: vector.threat_type,
      total: vector.total,
      maxSeverity: vector.max_severity,
    })),
    steps: {
      pending: value.steps_by_status.pending ?? 0,
      in_progress: value.steps_by_status.in_progress ?? 0,
      resolved: value.steps_by_status.resolved ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Live activity feed
 * ------------------------------------------------------------------ */

export type SocEventKind = "ingest" | "finding";

export interface SocEvent {
  id: string;
  kind: SocEventKind;
  at: string;
  label: string;
  detail: string;
  severity: number | null;
  /** Ingest status or finding triage state. */
  state: string;
}

/**
 * Recent workspace activity, newest first.
 *
 * Shared by the initial server render and the SSE tail, so both paths produce
 * identically shaped events and the stream can simply append.
 */
export async function getRecentSocEvents(
  limit = 40,
  since?: string
): Promise<SocEvent[]> {
  const supabase = await createClient();

  const filesQuery = supabase
    .from("log_files")
    .select("id, filename, status, format, event_count, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  const findingsQuery = supabase
    .from("threat_findings")
    .select("id, title, threat_type, severity_score, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    filesQuery.gt("updated_at", since);
    findingsQuery.gt("created_at", since);
  }

  const [files, findings] = await Promise.all([filesQuery, findingsQuery]);

  const events: SocEvent[] = [];

  for (const file of files.data ?? []) {
    events.push({
      id: `file:${file.id}:${file.updated_at}`,
      kind: "ingest",
      at: file.updated_at,
      label: file.filename,
      detail:
        file.event_count > 0
          ? `${file.format.toUpperCase()} · ${file.event_count.toLocaleString()} events`
          : file.format.toUpperCase(),
      severity: null,
      state: file.status,
    });
  }

  for (const finding of findings.data ?? []) {
    events.push({
      id: `finding:${finding.id}`,
      kind: "finding",
      at: finding.created_at,
      label: finding.title,
      detail: finding.threat_type,
      severity: finding.severity_score,
      state: finding.status,
    });
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 *  Remediation checklists
 * ------------------------------------------------------------------ */

export interface RemediationStepView {
  id: string;
  findingId: string;
  stepIndex: number;
  description: string;
  status: RemediationStatus;
  findingTitle: string;
  severityScore: number;
}

/** Open remediation work across the workspace, most severe first. */
export async function listRemediationSteps(
  limit = 40
): Promise<RemediationStepView[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finding_remediation_steps")
    .select(
      "id, finding_id, step_index, description, status, threat_findings(title, severity_score)"
    )
    .order("status", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[soc] remediation steps failed", error.message);
    return [];
  }

  type Row = (typeof data)[number] & {
    threat_findings: { title: string; severity_score: number } | null;
  };

  return (data as unknown as Row[])
    .map((row) => ({
      id: row.id,
      findingId: row.finding_id,
      stepIndex: row.step_index,
      description: row.description,
      status: row.status,
      findingTitle: row.threat_findings?.title ?? "Unknown finding",
      severityScore: row.threat_findings?.severity_score ?? 0,
    }))
    .sort((a, b) => b.severityScore - a.severityScore);
}
