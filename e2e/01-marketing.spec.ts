import { expect, test } from "./support/fixtures";

/**
 * Public marketing surface.
 *
 * Signed-out visitors are the only people who see these pages, so they run
 * with no storage state at all — an accidental dependency on a session would
 * make a broken public site look healthy.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Marketing site", () => {
  test("landing page renders its hero and primary calls to action", async ({
    page,
    shot,
  }) => {
    await page.goto("/");

    // The hero is the LCP element. It has been broken before by gating it
    // behind a scroll-triggered animation, so assert it is actually visible
    // rather than merely present in the DOM.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();

    await expect(
      page.getByRole("link", { name: /get started/i }).first()
    ).toBeVisible();

    await shot("landing-hero");

    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(600);
    await shot("landing-scrolled");
  });

  test("pricing page states the Free and $20 Pro tiers", async ({
    page,
    shot,
  }) => {
    await page.goto("/pricing");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The price is the single most important number on the site; assert the
    // exact figure rather than "some price is shown".
    await expect(page.getByText("$20", { exact: true })).toBeVisible();

    const body = page.locator("body");
    await expect(body).toContainText("5 log scans per day");
    await expect(body).toContainText("Unlimited daily log scans");
    await expect(body).toContainText("10 MB maximum upload");
    await expect(body).toContainText("100 MB maximum upload");
    await expect(body).toContainText("1 Tenant Admin + up to 10 analyst seats");

    await shot("pricing-tiers");
  });

  test.describe("legal and trust pages", () => {
    for (const path of ["/security", "/privacy", "/terms"]) {
      test(`${path} renders`, async ({ page, shot }) => {
        const response = await page.goto(path);

        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        await shot(`page${path.replace(/\//g, "-")}`);
      });
    }
  });

  test("unknown routes return a 404 page rather than an error", async ({
    page,
    shot,
  }) => {
    const response = await page.goto("/this-route-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).toContainText(/not found|404/i);

    await shot("not-found");
  });

  test("theme toggle switches between dark and light", async ({
    page,
    shot,
  }) => {
    await page.goto("/");

    const html = page.locator("html");
    const before = await html.getAttribute("class");

    await shot("theme-initial");

    await page.getByRole("button", { name: /theme|appearance|dark|light/i })
      .first()
      .click();

    // next-themes writes the class on <html>; waiting on the change rather
    // than a fixed delay keeps this stable on a slow machine.
    await expect
      .poll(async () => html.getAttribute("class"), { timeout: 5_000 })
      .not.toBe(before);

    await shot("theme-toggled");
  });

  test("renders without horizontal overflow on a phone viewport", async ({
    page,
    shot,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // A horizontal scrollbar on mobile is the classic layout regression.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await shot("mobile-landing");
  });
});

test.describe("SEO and crawlability", () => {
  test("robots.txt and sitemap.xml are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("landing page carries JSON-LD structured data", async ({ page }) => {
    await page.goto("/");

    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toHaveCount(1);

    const parsed = JSON.parse((await jsonLd.textContent()) ?? "{}");
    expect(parsed["@context"]).toBe("https://schema.org");

    const types = (parsed["@graph"] ?? []).map(
      (node: { "@type": string }) => node["@type"]
    );
    expect(types).toContain("Organization");
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("FAQPage");
  });

  test("the invitation page is excluded from indexing", async ({ page }) => {
    // Invitation URLs carry a live credential and must never be indexed.
    await page.goto("/join/not-a-real-token-value-for-robots-check");

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/i);
  });
});
