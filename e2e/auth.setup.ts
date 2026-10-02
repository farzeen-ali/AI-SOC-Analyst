import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test as setup, type Page } from "@playwright/test";

import {
  clearUsage,
  ensureTestTenant,
  resetWorkspacePlan,
  STORAGE_STATE,
  type TestAccount,
} from "./support/accounts";

/**
 * Seeds the test tenants and captures a signed-in storage state per role.
 *
 * Sign-in goes through the real form rather than injecting a session: it is
 * the cheapest possible smoke test of the auth path, and if it breaks every
 * dependent suite should fail here with one clear message instead of
 * thirty confusing ones.
 */

setup.setTimeout(120_000);

async function signIn(page: Page, account: TestAccount, statePath: string) {
  await page.goto("/login");

  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  // Exact match: "Sign in with Google" also contains "Sign in".
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Landing anywhere inside the authenticated shell proves the session took.
  await page.waitForURL(/\/(dashboard|super-admin)/, { timeout: 30_000 });
  await expect(page.locator("main")).toBeVisible();

  mkdirSync(dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
}

setup("seed tenants and authenticate each role", async ({ page }) => {
  const tenant = await ensureTestTenant();

  // Deterministic starting point: Free plan, no scans consumed today.
  await resetWorkspacePlan(tenant.workspaceId);
  await clearUsage(tenant.workspaceId);

  await signIn(page, tenant.admin, STORAGE_STATE.admin);

  await page.context().clearCookies();
  await signIn(page, tenant.member, STORAGE_STATE.member);

  await page.context().clearCookies();
  await signIn(page, tenant.superAdmin, STORAGE_STATE.superAdmin);
});
