// Hour sweep D: regression tests for the shop.
import { expect, test } from "@playwright/test";
import { openGame, press, profileOf, run, SAVE, settle, tap, waitFor } from "./helpers.js";

test("shop: tapping the buy button again while a purchase flies in opens nothing and charges once @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...SAVE, coins: 5000 } });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Shop"));
  await waitFor(page, () => window.__glydrift.scene.getScene("Shop")?.sys.isActive() && !!window.__glydrift.scene.getScene("Shop").cta);
  await settle(page, "Shop", 800);
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.setTab("trail");
    s.focus(s.cards.findIndex((c) => c.offer.id === "trail_fire"), true);
  });
  await run(page, 400);
  const ctaPoint = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Shop");
      const b = s.cta.getBounds();
      const cam = s.cameras.main;
      const r = g.canvas.getBoundingClientRect();
      const sx = (b.centerX - cam.worldView.x) * cam.zoom;
      const sy = (b.centerY - cam.worldView.y) * cam.zoom;
      return { x: r.left + (sx * r.width) / g.canvas.width, y: r.top + (sy * r.height) / g.canvas.height };
    });
  await press(page, await ctaPoint());
  await run(page, 500);
  await tap(page, "BUY!", 300); // the purchase is made; its animation is still playing
  expect((await page.evaluate(() => window.__glySave.data)).coins).toBe(5000 - 600);
  // the stage still shows the price button: tapping it again does nothing
  await press(page, await ctaPoint());
  await run(page, 300);
  expect(await page.evaluate(() => !!window.__glydrift.scene.getScene("Shop").modal)).toBe(false);
  await run(page, 2000);
  const s = await page.evaluate(() => window.__glySave.data);
  expect(s.coins).toBe(5000 - 600);
  expect(s.cos.owned.trail_fire).toBe(true);
  expect(log.errors).toEqual([]);
});
