import { expect, test } from "./support/fixtures";
import { STORAGE_STATE } from "./support/accounts";

/** Signed in as the Tenant Admin for this tenant. */
test.use({ storageState: STORAGE_STATE.admin });

test.describe("SOC dashboard", () => {
  test("overview renders the analytics shell", async ({ page, shot }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();

    // A fresh tenant has no findings, so the empty state is the correct
    // result — assert the page resolved rather than that data exists.
    await expect(page.locator("main")).toBeVisible();

    await shot("dashboard-overview");
  });

  test("sidebar exposes every section a Tenant Admin may reach", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard");

    const nav = page.getByRole("navigation").first();
    for (const label of [
      "Overview",
      "Threat Dashboard",
      "Log Ingestion",
      "Team",
      "Billing & Plan",
      "Workspace Settings",
      "Profile & Security",
    ]) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }

    // Billing shipped in Phase 4, so the "Soon" badge must be gone.
    await expect(nav.getByText("Soon", { exact: true })).toHaveCount(0);

    await shot("sidebar-navigation");
  });

  test("threat dashboard loads", async ({ page, shot }) => {
    await page.goto("/dashboard/threats");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot("threat-dashboard");
  });

  test("log ingestion exposes the upload target and plan ceiling", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard/logs");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The dropzone must advertise the Free ceiling, not Pro's.
    await expect(page.locator("main")).toContainText(/10(\.0)? MB/);

    await shot("log-ingestion");
  });

  test("workspace settings renders", async ({ page, shot }) => {
    await page.goto("/dashboard/settings");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot("workspace-settings");
  });

  test("profile and security exposes MFA enrolment", async ({ page, shot }) => {
    await page.goto("/settings/profile");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main")).toContainText(
      /multi-factor authentication/i
    );

    // Both factor types must be offered — WebAuthn is unavailable on some
    // projects, so TOTP has to be reachable independently.
    await expect(
      page.getByRole("button", { name: /authenticator app/i })
    ).toBeVisible();

    await shot("profile-security");
  });

  test("no console errors on the authenticated shell", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Browser extensions and the dev overlay are not in play on a production
    // build, so anything here is ours.
    expect(errors).toEqual([]);
  });
});

test.describe("Role-based access control", () => {
  test.describe("as a SOC Analyst", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test("reaches the operational pages", async ({ page, shot }) => {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot("analyst-overview");

      await page.goto("/dashboard/threats");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot("analyst-threats");
    });

    test("is kept out of Team, Billing and Workspace Settings", async ({
      page,
      shot,
    }) => {
      for (const route of [
        "/dashboard/team",
        "/dashboard/billing",
        "/dashboard/settings",
      ]) {
        await page.goto(route);
        // Redirected away rather than shown a partial page.
        await expect(page).not.toHaveURL(new RegExp(`${route}$`));
      }

      await shot("analyst-denied-admin-routes");
    });

    test("is kept out of the Super Admin console", async ({ page }) => {
      await page.goto("/super-admin");
      await expect(page).not.toHaveURL(/\/super-admin/);
    });

    test("does not see admin links in the sidebar", async ({ page, shot }) => {
      await page.goto("/dashboard");

      const nav = page.getByRole("navigation").first();
      await expect(nav.getByText("Billing & Plan", { exact: true })).toHaveCount(
        0
      );
      await expect(nav.getByText("Team", { exact: true })).toHaveCount(0);

      await shot("analyst-sidebar");
    });
  });

  test.describe("as a Super Admin", () => {
    test.use({ storageState: STORAGE_STATE.superAdmin });

    test("reaches the platform console and its metrics", async ({
      page,
      shot,
    }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("main")).toContainText(/total tenants/i);
      await expect(page.locator("main")).toContainText(
        /active subscriptions/i
      );

      await shot("super-admin-overview");
    });

    test("system health chart switches series", async ({ page, shot }) => {
      await page.goto("/super-admin");

      const tokensTab = page.getByRole("tab", { name: /model tokens/i });
      await expect(tokensTab).toBeVisible();
      await shot("health-chart-scans");

      await tokensTab.click();
      await expect(tokensTab).toHaveAttribute("aria-selected", "true");
      await shot("health-chart-tokens");
    });

    test("tenant table lists plan, seats and suspension controls", async ({
      page,
      shot,
    }) => {
      await page.goto("/super-admin/tenants");

      await expect(page).toHaveURL(/\/super-admin\/tenants/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const main = page.locator("main");
      await expect(main).toContainText(/free|pro/i);
      await expect(main).toContainText(/seats/i);
      await expect(main).toContainText(/active|suspended/i);

      await shot("super-admin-tenants");
    });

    test("users and audit pages render", async ({ page, shot }) => {
      // Assert the URL as well as the heading: a denial redirects to
      // /dashboard, which also has an h1, so the heading alone would pass
      // on a lockout.
      await page.goto("/super-admin/users");
      await expect(page).toHaveURL(/\/super-admin\/users/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot("super-admin-users");

      await page.goto("/super-admin/audit");
      await expect(page).toHaveURL(/\/super-admin\/audit/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot("super-admin-audit");
    });
  });
});
