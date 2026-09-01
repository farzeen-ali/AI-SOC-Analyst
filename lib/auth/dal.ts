import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  GlobalRole,
  GuardAIClaims,
  Profile,
  Workspace,
  WorkspaceRole,
} from "@/lib/types/database";

/**
 * Data Access Layer.
 *
 * The proxy performs optimistic redirects from JWT claims; everything in here
 * is the authoritative check. Each function re-verifies the session against
 * Supabase and reads the membership tables through RLS, so a stale or forged
 * claim cannot widen access. `cache()` collapses repeat calls within a single
 * render pass.
 */

export interface SessionContext {
  userId: string;
  email: string;
  claims: GuardAIClaims;
}

export interface AuthContext {
  userId: string;
  email: string;
  profile: Profile;
  workspace: Workspace | null;
  workspaceRole: WorkspaceRole | null;
  globalRole: GlobalRole;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

/** Verified session claims, or `null` when signed out. */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims?.sub) return null;

    const raw = data.claims;
    return {
      userId: raw.sub,
      email: typeof raw.email === "string" ? raw.email : "",
      claims: {
        sub: raw.sub,
        email: typeof raw.email === "string" ? raw.email : undefined,
        global_role: raw.global_role === "super_admin" ? "super_admin" : "user",
        workspace_id:
          typeof raw.workspace_id === "string" ? raw.workspace_id : null,
        workspace_role:
          raw.workspace_role === "tenant_admin" ||
          raw.workspace_role === "member"
            ? raw.workspace_role
            : null,
        is_suspended: raw.is_suspended === true,
      },
    };
  }
);

/**
 * Full authorization context read from the database.
 *
 * Returns `null` rather than redirecting so callers can decide — use
 * `requireAuth()` when a signed-in user is mandatory.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await getSessionContext();
  if (!session) return null;

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.userId)
    .single();

  if (profileError || !profile) return null;
  if (profile.is_suspended) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspace_role, workspaces(*)")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspaceRelation = membership?.workspaces as unknown;
  const workspace = (Array.isArray(workspaceRelation)
    ? (workspaceRelation[0] ?? null)
    : (workspaceRelation ?? null)) as Workspace | null;

  const workspaceRole = (membership?.workspace_role ??
    null) as WorkspaceRole | null;
  const isSuperAdmin = profile.global_role === "super_admin";

  return {
    userId: session.userId,
    email: profile.email,
    profile,
    workspace: workspace && !workspace.is_suspended ? workspace : null,
    workspaceRole,
    globalRole: profile.global_role,
    isSuperAdmin,
    isTenantAdmin: isSuperAdmin || workspaceRole === "tenant_admin",
  };
});

/** Signed-in context, or a redirect to `/login`. */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login?reason=session-expired");
  return context;
}

/** Requires a Tenant Admin (or Super Admin). Members are sent to `/forbidden`. */
export async function requireTenantAdmin(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.isTenantAdmin) redirect("/dashboard?denied=tenant-admin");
  return context;
}

/** Requires platform-owner privileges. */
export async function requireSuperAdmin(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.isSuperAdmin) redirect("/dashboard?denied=super-admin");
  return context;
}

/** Landing route for a freshly authenticated session. */
export function homePathForRole(globalRole: GlobalRole): string {
  return globalRole === "super_admin" ? "/super-admin" : "/dashboard";
}

/**
 * Trimmed projection safe to hand to Client Components.
 * Keeps internal columns (suspension flags, subscription state) server-side.
 */
export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  workspaceRole: WorkspaceRole | null;
  workspaceName: string | null;
  workspacePlan: string | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export function toUserDTO(context: AuthContext): UserDTO {
  const fullName = context.profile.full_name?.trim() || context.email;
  const initials =
    fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "GA";

  return {
    id: context.userId,
    email: context.email,
    fullName,
    initials,
    avatarUrl: context.profile.avatar_url,
    globalRole: context.globalRole,
    workspaceRole: context.workspaceRole,
    workspaceName: context.workspace?.name ?? null,
    workspacePlan: context.workspace?.plan ?? null,
    isSuperAdmin: context.isSuperAdmin,
    isTenantAdmin: context.isTenantAdmin,
  };
}
