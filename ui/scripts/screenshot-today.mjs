// One-off screenshot script. Captures both modes of the Today (v2)
// page: (1) Briefing Mode at /today, and (2) Review Mode at
// /today?review=<id>. Writes both PNGs into ui/test-results/.
//
//   USE_MOCK=1 npm run dev -- --port 5173    # or live backend
//   node scripts/screenshot-today.mjs
//
// Safe to delete after the redesign session.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const TARGET = process.env.URL ?? "http://localhost:5173";
const OUT_DIR = new URL("../test-results/", import.meta.url).pathname;

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// Briefing Mode.
await page.goto(`${TARGET}/today`, { waitUntil: "load" });
await page.waitForSelector('[data-testid="primary-preview"]', { timeout: 15_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT_DIR}today-briefing.png`, fullPage: true });
console.log(`Saved: ${OUT_DIR}today-briefing.png`);

// Click the CTA to enter Review Mode.
await page.click('[data-testid="primary-preview-review"]');
await page.waitForSelector('[data-testid="review-mode"]', { timeout: 10_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT_DIR}today-review.png`, fullPage: true });
console.log(`Saved: ${OUT_DIR}today-review.png`);

await browser.close();
