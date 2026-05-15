import { test } from "@playwright/test";

test("dump expanded card html", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("demoSessionId", "e2e-fixture-session");
  });
  await page.goto("/");
  await page.locator(".page-h1").waitFor();
  const card = page.locator("article.card").first();
  await card.click();
  await page.waitForTimeout(500);
  const html = await card.innerHTML();
  console.log("=== EXPANDED CARD HTML ===");
  console.log(html);
  console.log("=== END ===");
});
