import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import { getClientIp, getUserAgent } from "@/lib/security/request";

export type AuditAction =
  | "auth.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.locked_out"
  | "auth.logout"
  | "auth.oauth_login"
  | "auth.otp_requested"
  | "auth.otp_verified"
  | "auth.password_reset"
  | "auth.rate_limited"
  | "admin.workspace_suspended"
  | "admin.workspace_reinstated"
  | "admin.user_suspended"
  | "admin.user_reinstated"
  | "ingest.upload_requested"
  | "ingest.upload_committed"
  | "ingest.rejected"
  | "ingest.file_deleted"
  | "finding.status_changed"
  | "team.member_invited"
  | "ai.investigation";

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  workspaceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, Json>;
}

/**
 * Appends to the global audit trail.
 *
 * Uses the service-role client because `audit_logs` intentionally has no
 * INSERT policy for `authenticated` — nothing client-reachable may forge an
 * entry. Failures are swallowed: an unavailable audit sink must never break
 * the auth flow it is recording.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

    await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_id: entry.actorId ?? null,
        workspace_id: entry.workspaceId ?? null,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
        ip_address: ip,
        user_agent: userAgent,
      });
  } catch (error) {
    console.error("[audit] failed to record entry", entry.action, error);
  }
}
