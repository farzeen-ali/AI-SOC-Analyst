import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/dal";
import type { AuditLog, Profile, Workspace } from "@/lib/types/database";

/**
 * Platform-wide reads for the Super Admin console.
 *
 * These use the service-role client, which bypasses RLS by design — the whole
 * point of the role is to see across tenants. Every function calls
 * `requireSuperAdmin()` first, so the guard cannot be skipped by importing the
 * query directly.
 */

export interface PlatformMetrics {
  totalTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  suspendedUsers: number;
  proTenants: number;
  auditEvents: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };

  const results = await Promise.all([
    admin.from("workspaces").select("*", head),
    admin.from("workspaces").select("*", head).eq("is_suspended", true),
    admin.from("workspaces").select("*", head).eq("plan", "pro"),
    admin.from("profiles").select("*", head),
    admin.from("profiles").select("*", head).eq("is_suspended", true),
    admin.from("audit_logs").select("*", head),
  ]);

  const [
    totalTenants,
    suspendedTenants,
    proTenants,
    totalUsers,
    suspendedUsers,
    auditEvents,
  ] = results.map((result) => result.count ?? 0);

  return {
    totalTenants,
    suspendedTenants,
    proTenants,
    totalUsers,
    suspendedUsers,
    auditEvents,
  };
}

export interface TenantRow extends Workspace {
  memberCount: number;
  ownerEmail: string | null;
}

export async function listTenants(limit = 50): Promise<TenantRow[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: workspaces } = await admin
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!workspaces?.length) return [];

  const ownerIds = [...new Set(workspaces.map((w) => w.owner_id))];
  const workspaceIds = workspaces.map((w) => w.id);

  const [{ data: owners }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("id, email").in("id", ownerIds),
    admin
      .from("workspace_members")
      .select("workspace_id")
      .in("workspace_id", workspaceIds),
  ]);

  const emailById = new Map((owners ?? []).map((o) => [o.id, o.email]));
  const countByWorkspace = new Map<string, number>();
  for (const row of memberships ?? []) {
    countByWorkspace.set(
      row.workspace_id,
      (countByWorkspace.get(row.workspace_id) ?? 0) + 1
    );
  }

  return workspaces.map((workspace) => ({
    ...workspace,
    memberCount: countByWorkspace.get(workspace.id) ?? 0,
    ownerEmail: emailById.get(workspace.owner_id) ?? null,
  }));
}

export async function listUsers(limit = 50): Promise<Profile[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export interface AuditRow extends AuditLog {
  actorEmail: string | null;
}

export async function listAuditLogs(limit = 100): Promise<AuditRow[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: logs } = await admin
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!logs?.length) return [];

  const actorIds = [
    ...new Set(logs.map((log) => log.actor_id).filter((id): id is string => !!id)),
  ];

  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id, email").in("id", actorIds)
    : { data: [] };

  const emailById = new Map((actors ?? []).map((a) => [a.id, a.email]));

  return logs.map((log) => ({
    ...log,
    actorEmail: log.actor_id ? (emailById.get(log.actor_id) ?? null) : null,
  }));
}
