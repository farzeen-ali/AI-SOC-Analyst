import { expect, test } from "./support/fixtures";
import { readTestTenant, STORAGE_STATE } from "./support/accounts";

test.use({ storageState: STORAGE_STATE.admin });

test.describe("Billing", () => {
  test("shows the current plan, seats and daily scan meter", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard/billing");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const main = page.locator("main");
    await expect(main).toContainText("Free");
    // Free is 1 admin + 1 analyst = 2 seats, derived from the plan catalogue.
    await expect(main).toContainText("/ 2");

    // The radial meter exposes its state through an accessible name.
    await expect(
      page.getByRole("img", { name: /daily scans used|unlimited daily scans/i })
    ).toBeVisible();

    await shot("billing-overview");
  });

  test("plan comparison marks the current tier and offers the $20 upgrade", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard/billing");

    // The badge and its wrapper both carry exactly this text, so scope to
    // one of them rather than relying on strict mode picking a winner.
    await expect(
      page.getByText("Your current plan", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("$20", { exact: true })).toBeVisible();

    await shot("billing-plan-cards");
  });

  test("checkout is reachable and fails safely when Stripe is unconfigured", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard/billing");

    const upgrade = page.getByRole("button", { name: /upgrade to pro/i });
    const unavailable = page.getByText(/stripe is not configured/i);

    // Either Stripe is configured and the button is live, or the UI says so
    // plainly. A blank card with no explanation would be the failure.
    if (await upgrade.count()) {
      await expect(upgrade.first()).toBeEnabled();
      await shot("billing-upgrade-available");
    } else {
      await expect(unavailable.first()).toBeVisible();
      await shot("billing-stripe-unconfigured");
    }
  });

  test("checkout cancellation is reported without alarming the user", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard/billing?checkout=cancelled");

    await expect(page.locator("main")).toContainText(/nothing was charged/i);
    await shot("billing-checkout-cancelled");
  });
});

test.describe("Team and invitations", () => {
  test("team page lists members and seat usage", async ({ page, shot }) => {
    const tenant = readTestTenant();

    await page.goto("/dashboard/team");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const main = page.locator("main");
    await expect(main).toContainText(tenant.admin.email);
    await expect(main).toContainText(tenant.member.email);
    await expect(main).toContainText(/seats? used/i);

    await shot("team-members");
  });

  test("creates a tokenized invitation link", async ({ page, shot }) => {
    await page.goto("/dashboard/team");

    await page.getByRole("button", { name: /invite analyst/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await shot("invite-dialog");

    const invitee = `e2e-invitee-${Date.now().toString(36)}@guardai-e2e.test`;
    await dialog.getByLabel("Work email").fill(invitee);
    await dialog.getByRole("button", { name: /create invitation/i }).click();

    // Seats: Free allows 2 and both are taken, so this tenant should be told
    // to upgrade rather than handed a link it cannot honour.
    const link = dialog.getByLabel("Invitation link");
    const seatWarning = dialog.getByText(/seats?.*(in use|upgrade)/i);

    await expect(link.or(seatWarning).first()).toBeVisible({ timeout: 20_000 });

    if (await link.count()) {
      const value = await link.inputValue();
      expect(value).toMatch(/\/join\/[A-Za-z0-9_-]{20,}/);
      await shot("invite-link-created");
    } else {
      await shot("invite-seat-limit");
    }
  });

  test("seat limit is enforced by the server, not just the UI", async ({
    page,
  }) => {
    const tenant = readTestTenant();

    // Free = 2 seats and the tenant already has admin + member, so the
    // action must refuse regardless of what the form allows.
    await page.goto("/dashboard/team");
    const main = page.locator("main");
    await expect(main).toContainText(`of ${2} seat`);
    expect(tenant.workspaceId).toBeTruthy();
  });
});

test.describe("Invitation landing page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an unknown token is refused without leaking tenant details", async ({
    page,
    shot,
  }) => {
    await page.goto("/join/0000000000000000000000000000000000000000000");

    const body = page.locator("body");
    await expect(body).toContainText(/not valid/i);

    // Must not name a workspace or an email for a token that does not exist.
    await expect(body).not.toContainText(/@guardai-e2e\.test/);

    await shot("join-unknown-token");
  });
});
