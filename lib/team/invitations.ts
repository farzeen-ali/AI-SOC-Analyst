import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { seatLimit } from "@/lib/billing/plans";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkspacePlan } from "@/lib/types/database";

/**
 * Tokenized workspace invitations.
 *
 * The link is the credential, so it is treated like one:
 *
 *  - 32 bytes from a CSPRNG, base64url encoded. Guessing is not a threat
 *    model at that entropy.
 *  - Only a SHA-256 hash is stored. A database leak yields hashes, not
 *    working links — the same reasoning as password storage. A fast hash is
 *    the right choice here precisely because the input is high-entropy
 *    random, so there is nothing to brute force.
 *  - Short lived, single use, and revocable.
 *  - The invited address is bound into the row, so whoever opens the link can
 *    only ever create *that* account, in *that* workspace, as a Member.
 */

const TOKEN_BYTES = 32;
export const INVITE_TTL_HOURS = 72;

export interface CreatedInvitation {
  id: string;
  email: string;
  /** The raw token — returned once, never stored, never logged. */
  url: string;
  expiresAt: string;
}

export interface ResolvedInvitation {
  id: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  expiresAt: string;
}

export type InvitationProblem =
  | "not_found"
  | "expired"
  | "revoked"
  | "accepted"
  | "seats_full"
  | "email_taken"
  | "workspace_suspended";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The lookup below is by indexed hash, so this is belt-and-braces rather than
 * the primary defence — but comparing digests with `===` anywhere near an
 * auth path is a habit worth not forming.
 */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function invitationUrl(rawToken: string): string {
  return `${env.siteUrl}/join/${rawToken}`;
}

/**
 * Issues an invitation, replacing any outstanding one for the same address.
 *
 * Re-inviting is a normal thing to do — the first email was missed, the link
 * expired — and it must invalidate the previous token rather than leaving two
 * live credentials for one seat.
 */
export async function createInvitation(params: {
  workspaceId: string;
  email: string;
  invitedBy: string;
}): Promise<CreatedInvitation> {
  const admin = createAdminClient();
  const email = params.email.trim().toLowerCase();

  // Supersede any live invitation for this address.
  await admin
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", params.workspaceId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("workspace_invitations")
    .insert({
      workspace_id: params.workspaceId,
      email,
      token_hash: hashToken(rawToken),
      workspace_role: "member",
      invited_by: params.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create the invitation.");
  }

  return {
    id: data.id,
    email,
    url: invitationUrl(rawToken),
    expiresAt,
  };
}

/**
 * Validates a raw token and returns what the landing page needs to render.
 *
 * Runs with the service role because the visitor is, by definition, not yet a
 * member of the workspace and cannot pass its RLS policies.
 */
export async function resolveInvitation(
  rawToken: string
): Promise<
  | { ok: true; invitation: ResolvedInvitation }
  | { ok: false; problem: InvitationProblem }
> {
  if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
    return { ok: false, problem: "not_found" };
  }

  const admin = createAdminClient();
  const digest = hashToken(rawToken);

  const { data } = await admin
    .from("workspace_invitations")
    .select(
      "id, email, token_hash, workspace_id, expires_at, accepted_at, revoked_at, workspaces(name, is_suspended)"
    )
    .eq("token_hash", digest)
    .maybeSingle();

  if (!data || !digestsMatch(data.token_hash, digest)) {
    return { ok: false, problem: "not_found" };
  }
  if (data.revoked_at) return { ok: false, problem: "revoked" };
  if (data.accepted_at) return { ok: false, problem: "accepted" };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, problem: "expired" };
  }

  const relation = data.workspaces as unknown;
  const workspace = (Array.isArray(relation) ? relation[0] : relation) as
    | { name: string; is_suspended: boolean }
    | null;

  if (!workspace || workspace.is_suspended) {
    return { ok: false, problem: "workspace_suspended" };
  }

  return {
    ok: true,
    invitation: {
      id: data.id,
      email: data.email,
      workspaceId: data.workspace_id,
      workspaceName: workspace.name,
      expiresAt: data.expires_at,
    },
  };
}

/**
 * Creates the member account and links it to the workspace.
 *
 * Every constraint is re-checked here rather than trusted from the page that
 * rendered the form: the token may have expired between render and submit,
 * the workspace may have been downgraded, and the email is taken from the
 * invitation row rather than the request body so it cannot be substituted.
 */
export async function acceptInvitation(params: {
  rawToken: string;
  password: string;
  fullName: string;
}): Promise<
  { ok: true; email: string } | { ok: false; problem: InvitationProblem }
> {
  const resolved = await resolveInvitation(params.rawToken);
  if (!resolved.ok) return resolved;

  const { invitation } = resolved;
  const admin = createAdminClient();

  // Seat check against the *current* plan — a workspace that dropped to Free
  // since the invitation was sent must not be able to exceed its allowance.
  const { data: workspace } = await admin
    .from("workspaces")
    .select("plan")
    .eq("id", invitation.workspaceId)
    .maybeSingle();

  const plan = (workspace?.plan ?? "free") as WorkspacePlan;

  const { count } = await admin
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", invitation.workspaceId);

  if ((count ?? 0) >= seatLimit(plan)) {
    return { ok: false, problem: "seats_full" };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", invitation.email)
    .maybeSingle();

  if (existing) return { ok: false, problem: "email_taken" };

  /*
   * `email_confirm: true` is correct here and only here: possession of the
   * invitation token already proves control of the mailbox it was sent to,
   * so a second round trip would add friction without adding assurance.
   */
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: invitation.email,
      password: params.password,
      email_confirm: true,
      user_metadata: {
        full_name: params.fullName,
        invited_workspace_id: invitation.workspaceId,
      },
    });

  if (createError || !created.user) {
    // A duplicate here means the address was registered between the check
    // above and now, which is a race rather than a bug.
    if (/already registered|already exists/i.test(createError?.message ?? "")) {
      return { ok: false, problem: "email_taken" };
    }
    throw new Error(createError?.message ?? "Could not create the account.");
  }

  const userId = created.user.id;

  const { error: memberError } = await admin
    .from("workspace_members")
    .insert({
      workspace_id: invitation.workspaceId,
      user_id: userId,
      workspace_role: "member",
    });

  if (memberError) {
    // Leaving an orphaned auth user with no workspace would strand the
    // person on a dead account, so undo the half-finished signup.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Could not link the account: ${memberError.message}`);
  }

  await admin
    .from("workspace_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq("id", invitation.id);

  return { ok: true, email: invitation.email };
}

/** Outstanding invitations for the team page. */
export interface PendingInvitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export async function listPendingInvitations(
  workspaceId: string
): Promise<PendingInvitation[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("workspace_invitations")
    .select("id, email, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(25);

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}
