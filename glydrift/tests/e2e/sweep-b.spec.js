// Bug sweep B: safe-area regressions found on the notched iPhones.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run } from "./helpers.js";

test("progress: the last row of achievement names stays above the home indicator @smoke", async ({ page }, testInfo) => {
  test.skip(!["iphone-std", "iphone-large"].includes(profileOf(testInfo)), "notched iPhones");
  const log = await openGame(page);
  // an iPhone with a notch and a home indicator (Playwright reports no safe-area insets itself)
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--sat", "47px");
    document.documentElement.style.setProperty("--sab", "34px");
    window.__glySafe();
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Progress"));
  await run(page, 1500);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const sc = g.scene.getScene("Progress");
    let lowest = 0;
    const walk = (o) => {
      if (o.type === "Text" && o.visible && o.text.trim()) lowest = Math.max(lowest, o.getBounds().bottom);
      (o.list || []).forEach(walk);
    };
    sc.children.list.forEach(walk);
    return { lowest, limit: g.scene.getScene("Menu").H - g.registry.get("safeBottom"), sb: g.registry.get("safeBottom") };
  });
  expect(r.sb).toBeGreaterThan(0);
  expect(r.lowest).toBeLessThanOrEqual(r.limit);
  expect(log.errors).toEqual([]);
});
