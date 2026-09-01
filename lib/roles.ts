import type { UserDTO } from "@/lib/auth/dal";
import type { WorkspaceRole } from "@/lib/types/database";

/** Human-readable role name, matching the RBAC matrix in the product spec. */
export function roleLabel(user: {
  isSuperAdmin: boolean;
  workspaceRole: WorkspaceRole | null;
}): string {
  if (user.isSuperAdmin) return "Super Admin";
  if (user.workspaceRole === "tenant_admin") return "Tenant Admin";
  return "SOC Analyst";
}

/** Short description of what the role may do, shown on the overview screen. */
export function roleSummary(user: UserDTO): string {
  if (user.isSuperAdmin) {
    return "Full platform access across every tenant, exempt from plan limits.";
  }
  if (user.workspaceRole === "tenant_admin") {
    return "Owns this workspace: billing, team invitations, and SOC configuration.";
  }
  return "Log ingestion, threat dashboard, and remediation playbooks for this workspace.";
}
