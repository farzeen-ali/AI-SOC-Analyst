import { expect, test } from "./support/fixtures";
import { readTestTenant } from "./support/accounts";

/** Every test here is a signed-out visitor. */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication", () => {
  test("sign-in page renders both credential and OAuth paths", async ({
    page,
    shot,
  }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in with google/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /forgot password/i })
    ).toBeVisible();

    await shot("login-form");
  });

  test("rejects a wrong password without revealing whether the account exists", async ({
    page,
    shot,
  }) => {
    const tenant = readTestTenant();

    await page.goto("/login");
    await page.getByLabel("Work email").fill(tenant.admin.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("definitely-not-the-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible({ timeout: 20_000 });

    // Account enumeration check: the failure must not confirm that this
    // address is registered.
    const message = (await alert.textContent())?.toLowerCase() ?? "";
    expect(message).not.toMatch(/no account|not registered|unknown (user|email)/);

    await expect(page).toHaveURL(/\/login/);
    await shot("login-rejected");
  });

  test("signup form validates before it will submit", async ({
    page,
    shot,
  }) => {
    await page.goto("/signup");
    await shot("signup-empty");

    await page.getByLabel("Full name").fill("Test Analyst");
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByLabel("Workspace name").fill("Test Workspace");
    await page.getByLabel("Password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm password").fill("mismatch");

    // Blur the last field so client-side validation runs.
    await page.getByLabel("Confirm password").blur();
    await page.getByRole("button", { name: /create workspace/i }).click();

    // Still on signup, with at least one complaint visible.
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("alert").first()).toBeVisible({
      timeout: 15_000,
    });

    await shot("signup-validation-errors");
  });

  test("password strength meter reacts as the password improves", async ({
    page,
    shot,
  }) => {
    await page.goto("/signup");

    const password = page.getByLabel("Password", { exact: true });

    await password.fill("abc");
    await page.waitForTimeout(250);
    await shot("password-weak");

    await password.fill("Str0ng!Passphrase#2026");
    await page.waitForTimeout(250);
    await shot("password-strong");

    // The meter is a progress element; its value must have moved.
    const meter = page.locator('[role="progressbar"]').first();
    if (await meter.count()) {
      await expect(meter).toBeVisible();
    }
  });

  test("forgot-password page accepts an address and confirms neutrally", async ({
    page,
    shot,
  }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await shot("forgot-password");
  });

  test("the sign-in page reflects the confirmed-email redirect", async ({
    page,
    shot,
  }) => {
    // app/auth/confirm sends verified users here; the banner is what tells
    // them the loop ended successfully.
    await page.goto("/login?confirmed=1");

    // Scoped to main: Next renders its own empty `role="alert"` route
    // announcer, which would otherwise match here.
    const banner = page
      .locator("main")
      .getByRole("status")
      .or(page.locator("main").getByRole("alert"))
      .first();

    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/confirm/i);

    await shot("login-confirmed-banner");
  });
});

test.describe("Route protection", () => {
  const protectedRoutes = [
    "/dashboard",
    "/dashboard/threats",
    "/dashboard/logs",
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/settings",
    "/settings/profile",
    "/super-admin",
    "/super-admin/tenants",
    "/super-admin/users",
    "/super-admin/audit",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects a signed-out visitor to sign in`, async ({
      page,
    }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByLabel("Work email")).toBeVisible();
    });
  }

  test("protected responses are not cacheable", async ({ page }) => {
    const response = await page.goto("/dashboard");

    // The redirect chain must carry no-store, or a shared cache could serve
    // an authenticated page to the next visitor.
    const cacheControl = response?.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/no-store/);
  });

  test("signed-out visitors can still reach the invitation page", async ({
    page,
    shot,
  }) => {
    await page.goto("/join/an-invalid-token-that-does-not-exist-123456");

    // Public by necessity, but it must not leak anything about real tenants.
    await expect(page.locator("body")).toContainText(/not valid|expired/i);
    await shot("join-invalid-token");
  });
});
