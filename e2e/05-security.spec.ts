import { createHmac } from "node:crypto";

import { expect, test } from "./support/fixtures";
import { readTestTenant, STORAGE_STATE } from "./support/accounts";

/**
 * Security regression suite.
 *
 * These assert the properties that are expensive to notice by hand and
 * catastrophic to lose: response headers, webhook authenticity, cross-origin
 * refusal, and tenant isolation.
 */

test.describe("HTTP security headers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the landing page sets the expected header set", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["x-frame-options"] ?? "").toMatch(/DENY|SAMEORIGIN/i);

    // Next advertises itself by default; it should be switched off.
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the content security policy constrains script and frame sources", async ({
    request,
  }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("object-src 'none'");
  });
});

test.describe("Stripe webhook", () => {
  const endpoint = "/api/stripe/webhook";
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    type: "customer.subscription.updated",
    data: { object: { id: "sub_e2e", customer: "cus_e2e", status: "active" } },
  });

  test("refuses a request with no signature", async ({ request }) => {
    const response = await request.post(endpoint, {
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    // 400 when Stripe is configured, 503 when it is not. Either way the
    // payload must never be applied.
    expect([400, 503]).toContain(response.status());
    expect(await response.text()).not.toContain("handled\":true");
  });

  test("refuses a forged signature", async ({ request }) => {
    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"de".repeat(32)}`,
      },
      data: payload,
    });

    expect([400, 503]).toContain(response.status());
  });

  test("refuses a signature computed with the wrong secret", async ({
    request,
  }) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const forged = createHmac("sha256", "whsec_not_the_real_secret")
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${forged}`,
      },
      data: payload,
    });

    expect([400, 503]).toContain(response.status());
  });

  test("a forged event does not upgrade the workspace", async ({
    request,
  }) => {
    const tenant = readTestTenant();

    // The most direct statement of the threat: try to inject an entitlement.
    await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"ab".repeat(32)}`,
      },
      data: JSON.stringify({
        id: `evt_injection_${Date.now()}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_forged",
            mode: "subscription",
            payment_status: "paid",
            subscription: "sub_forged",
            metadata: { workspace_id: tenant.workspaceId },
          },
        },
      }),
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const rows = await fetch(
      `${supabaseUrl}/rest/v1/workspaces?id=eq.${tenant.workspaceId}&select=plan`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    ).then((r) => r.json() as Promise<Array<{ plan: string }>>);

    expect(rows[0]?.plan).toBe("free");
  });
});

test.describe("API surface", () => {
  test("ingestion endpoints reject an unauthenticated caller", async ({
    request,
  }) => {
    for (const endpoint of ["/api/ingest/prepare", "/api/ingest/commit"]) {
      const response = await request.post(endpoint, {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ filename: "x.log", size: 10, mimeType: "text/plain" }),
      });

      expect([401, 403]).toContain(response.status());
    }
  });

  test("the job worker rejects a request without a valid signature", async ({
    request,
  }) => {
    const response = await request.post("/api/jobs/process-log", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ fileId: "x", workspaceId: "y" }),
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("state-changing routes refuse a cross-origin caller", async ({
    request,
  }) => {
    const response = await request.post("/api/ingest/prepare", {
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      data: JSON.stringify({ filename: "x.log", size: 10, mimeType: "text/plain" }),
    });

    // 403 for the origin refusal, 401 if authentication is checked first.
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Tenant isolation", () => {
  test.use({ storageState: STORAGE_STATE.superAdmin });

  test("a Super Admin's own workspace cannot see the test tenant's data", async ({
    page,
  }) => {
    const tenant = readTestTenant();

    // The Super Admin signs in with its own workspace. The tenant dashboard
    // is scoped by membership, so another tenant's name must not appear on
    // the operational pages even for a platform operator.
    await page.goto("/dashboard");
    await expect(page.locator("main")).not.toContainText(tenant.workspaceName);
  });
});

test.describe("Session handling", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test("signing out ends the session and blocks the back button", async ({
    page,
    shot,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot("before-sign-out");

    await page.getByRole("button", { name: /sign out/i }).first().click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await shot("after-sign-out");

    // The classic regression: a cached authenticated page served on Back.
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
  });
});
