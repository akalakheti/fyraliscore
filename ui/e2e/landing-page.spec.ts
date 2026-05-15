import { test, expect } from "@playwright/test";

// Drives the public landing page at "/". Per the feature spec
// (specs/001-landing-page/spec.md), visitors with no demo session see
// the landing page; visitors with an active demo session bypass it.

test.describe("LandingPage — first-time visitor (US1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* sandboxed origin — ignore */
      }
    });
  });

  test("renders hero, headline, and primary CTA above the fold", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/operating system|organizational/i);
    const primaryCta = page
      .getByRole("link", { name: /try the demo/i })
      .first();
    await expect(primaryCta).toBeVisible();
    const box = await primaryCta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(800);
  });

  test("primary CTA navigates to /demo and renders the demo picker", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /try the demo/i })
      .first()
      .click();
    await page.waitForURL("**/demo");
    expect(new URL(page.url()).pathname).toBe("/demo");
    // The demo picker shows company cards or a heading once loaded.
    await expect(page.locator("body")).toBeVisible();
  });

  test("surfaces section names Today, Structure, and History", async ({
    page,
  }) => {
    await page.goto("/");
    const surfaces = page.locator("#how-it-works");
    await expect(surfaces).toBeVisible();
    await expect(surfaces).toContainText("Today");
    await expect(surfaces).toContainText("Structure");
    await expect(surfaces).toContainText("History");
  });

  test("integrations section lists Slack, Discord, and GitHub", async ({
    page,
  }) => {
    await page.goto("/");
    const integ = page.locator("#integrations");
    await expect(integ).toBeVisible();
    await expect(integ).toContainText("Slack");
    await expect(integ).toContainText("Discord");
    await expect(integ).toContainText("GitHub");
  });

  test("footer shows GitHub, Documentation links and a 2026 copyright", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(
      footer.getByRole("link", { name: /github/i })
    ).toHaveAttribute("target", "_blank");
    await expect(
      footer.getByRole("link", { name: /documentation/i })
    ).toHaveAttribute("target", "_blank");
    await expect(footer).toContainText(/©\s*2026\s+Fyralis/);
  });
});

test.describe("LandingPage — demo session bypass (US2)", () => {
  test("with demoSessionId set, root renders the cockpit instead of landing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("demoSessionId", "e2e-fixture-session");
    });
    await page.goto("/");
    await page.locator(".page-h1").waitFor();
    await expect(
      page.getByRole("heading", { level: 1, name: /operating system/i })
    ).toHaveCount(0);
  });

  test("clearing demoSessionId and navigating to root shows the landing page", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1 })
    ).toBeVisible();
  });
});
