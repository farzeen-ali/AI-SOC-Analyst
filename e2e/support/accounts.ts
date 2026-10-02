import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { requireEnv } from "./env";

/**
 * Disposable test tenants.
 *
 * Accounts are provisioned through the Supabase Admin API rather than the
 * signup form, because self-signup sends a confirmation email and this suite
 * must not depend on a mailbox. Everything else about them is real: the
 * `on_auth_user_created` trigger provisions the workspace, the membership and
 * the role exactly as it would for a human, so the tests exercise genuine
 * tenant state rather than hand-stitched rows.
 *
 * Passwords are generated per run and written to a gitignored file under
 * `test-results/`. They only ever authenticate against a local server using
 * the project's own Supabase instance.
 */

export type Role = "admin" | "member" | "superAdmin";

export interface TestAccount {
  email: string;
  password: string;
  fullName: string;
  userId: string;
}

export interface TestTenant {
  workspaceId: string;
  workspaceName: string;
  admin: TestAccount;
  member: TestAccount;
  superAdmin: TestAccount;
}

const STATE_FILE = resolve(process.cwd(), "test-results/.auth/tenant.json");

export const STORAGE_STATE: Record<Role, string> = {
  admin: resolve(process.cwd(), "test-results/.auth/admin.json"),
  member: resolve(process.cwd(), "test-results/.auth/member.json"),
  superAdmin: resolve(process.cwd(), "test-results/.auth/super-admin.json"),
};

/** A password that satisfies the app's own strength rules. */
function generatePassword(): string {
  return `Gx7!${randomBytes(12).toString("base64url")}aZ9`;
}

function supabaseHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function supabaseUrl(path: string): string {
  return `${requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}${path}`;
}

async function createUser(params: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch(supabaseUrl("/auth/v1/admin/users"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      // Possession of the service role key already proves far more than a
      // mailbox round trip would, and the suite must run unattended.
      email_confirm: true,
      user_metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Could not create ${params.email}: ${response.status} ${await response.text()}`
    );
  }

  const body = (await response.json()) as { id: string };
  return body.id;
}

async function restGet<T>(path: string): Promise<T> {
  const response = await fetch(supabaseUrl(`/rest/v1${path}`), {
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Query failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function restPatch(path: string, body: unknown): Promise<void> {
  const response = await fetch(supabaseUrl(`/rest/v1${path}`), {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Update failed (${response.status}): ${await response.text()}`);
  }
}

/**
 * Provisions one tenant with all three roles, or reuses the previous run's.
 *
 * Reuse keeps re-runs fast while a failure is being fixed. Delete
 * `test-results/.auth/` to force a clean tenant.
 */
export async function ensureTestTenant(): Promise<TestTenant> {
  if (existsSync(STATE_FILE)) {
    const cached = JSON.parse(readFileSync(STATE_FILE, "utf8")) as TestTenant;
    // Confirm the tenant still exists — the database may have been reset.
    const rows = await restGet<Array<{ id: string }>>(
      `/workspaces?id=eq.${cached.workspaceId}&select=id`
    );
    if (rows.length === 1) return cached;
  }

  const stamp = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const workspaceName = `E2E Tenant ${stamp}`;

  const admin: TestAccount = {
    email: `e2e-admin-${stamp}@guardai-e2e.test`,
    password: generatePassword(),
    fullName: "Avery Admin",
    userId: "",
  };
  const member: TestAccount = {
    email: `e2e-member-${stamp}@guardai-e2e.test`,
    password: generatePassword(),
    fullName: "Morgan Member",
    userId: "",
  };
  const superAdmin: TestAccount = {
    email: `e2e-super-${stamp}@guardai-e2e.test`,
    password: generatePassword(),
    fullName: "Sam Superuser",
    userId: "",
  };

  // 1. Tenant Admin — the trigger provisions the workspace from this metadata.
  admin.userId = await createUser({
    email: admin.email,
    password: admin.password,
    metadata: { full_name: admin.fullName, workspace_name: workspaceName },
  });

  const workspaces = await restGet<Array<{ id: string }>>(
    `/workspaces?owner_id=eq.${admin.userId}&select=id`
  );
  if (workspaces.length !== 1) {
    throw new Error(
      `Expected exactly one workspace for the seeded admin, found ${workspaces.length}. ` +
        `Is migration 0001 applied?`
    );
  }
  const workspaceId = workspaces[0].id;

  // 2. Analyst — joins the same workspace, never provisions its own.
  member.userId = await createUser({
    email: member.email,
    password: member.password,
    metadata: {
      full_name: member.fullName,
      invited_workspace_id: workspaceId,
    },
  });

  // 3. Super Admin — gets its own workspace, then the global role is elevated.
  superAdmin.userId = await createUser({
    email: superAdmin.email,
    password: superAdmin.password,
    metadata: {
      full_name: superAdmin.fullName,
      workspace_name: `E2E Platform ${stamp}`,
    },
  });
  await restPatch(`/profiles?id=eq.${superAdmin.userId}`, {
    global_role: "super_admin",
  });

  const tenant: TestTenant = {
    workspaceId,
    workspaceName,
    admin,
    member,
    superAdmin,
  };

  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(tenant, null, 2), "utf8");

  return tenant;
}

export function readTestTenant(): TestTenant {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      "Test tenant has not been seeded. Run the `setup` project first."
    );
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as TestTenant;
}

/** Resets the seeded workspace to Free so plan assertions are deterministic. */
export async function resetWorkspacePlan(workspaceId: string): Promise<void> {
  await restPatch(`/workspaces?id=eq.${workspaceId}`, {
    plan: "free",
    subscription_status: "trialing",
    stripe_subscription_id: null,
    stripe_price_id: null,
    cancel_at_period_end: false,
  });
}

/** Clears today's scan counter so quota tests start from a known state. */
export async function clearUsage(workspaceId: string): Promise<void> {
  const response = await fetch(
    supabaseUrl(`/rest/v1/usage_daily?workspace_id=eq.${workspaceId}`),
    { method: "DELETE", headers: supabaseHeaders() }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not clear usage: ${await response.text()}`);
  }
}
