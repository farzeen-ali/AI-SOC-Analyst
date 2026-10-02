import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

export { expect };

const SCREENSHOT_ROOT = resolve(process.cwd(), "test-results/screenshots");

/** Filesystem-safe, stable, readable. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export interface Shooter {
  /** Captures the current page, numbered in call order within the test. */
  (name: string): Promise<string>;
}

/**
 * Walks the page so scroll-triggered entrances have fired before capture.
 *
 * Sections wrapped in `<Reveal>` start at `opacity: 0` and animate in via
 * IntersectionObserver. A full-page screenshot does not scroll, so anything
 * below the fold would be captured still transparent — the image would show
 * an empty page where real content exists. Worth knowing: Playwright treats
 * an `opacity: 0` element as *visible*, so an assertion alone would not catch
 * this; only the screenshot does.
 *
 * Scrolling to the bottom and back restores the original position, so the
 * capture still reflects where the test left the page.
 */
async function settleReveals(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      const startedAt = window.scrollY;
      const step = Math.max(320, window.innerHeight * 0.8);

      // IntersectionObserver delivers its callbacks asynchronously, so each
      // position needs a real pause — a single rAF returns before the
      // observer has reported anything.
      const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await settle();
      }

      window.scrollTo(0, startedAt);
      await settle();
    });

    // One beat for the entrance transitions to reach their end state.
    await page.waitForTimeout(450);
  } catch {
    // A navigation mid-scroll is harmless here; capture whatever is there.
  }
}

/**
 * Per-step screenshot capture.
 *
 * Playwright's built-in `screenshot: "only-on-failure"` documents failures;
 * this documents *behaviour*, which is what makes the run reviewable by
 * someone who was not watching it. Files land in
 * `test-results/screenshots/<spec>/<test>/NN-step.png`, numbered in call
 * order so the sequence reads top to bottom in a file listing.
 *
 * Animations are disabled at capture time so a mid-transition frame never
 * makes two identical runs produce different images.
 */
function createShooter(page: Page, testInfo: TestInfo): Shooter {
  const specDir = slug(
    testInfo.titlePath[0]?.replace(/\.spec\.ts$/, "") ?? "spec"
  );
  const testDir = slug(testInfo.title);
  const directory = join(SCREENSHOT_ROOT, specDir, testDir);
  mkdirSync(directory, { recursive: true });

  let step = 0;

  return async (name: string) => {
    step += 1;
    const file = join(
      directory,
      `${String(step).padStart(2, "0")}-${slug(name)}.png`
    );

    await settleReveals(page);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });

    // Also attach to the HTML report so the run is reviewable in one place.
    await testInfo.attach(`${step}. ${name}`, {
      path: file,
      contentType: "image/png",
    });

    return file;
  };
}

export const test = base.extend<{ shot: Shooter }>({
  shot: async ({ page }, use, testInfo) => {
    await use(createShooter(page, testInfo));
  },
});
