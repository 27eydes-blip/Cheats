// App Store review readiness: what App Review checks in the iPhone app (APP_STORE_REVIEW.md).
import { expect, test } from "@playwright/test";
import { locate, openGame, press, profileOf, run, settle, tap, waitFor } from "./helpers.js";

/** Pretend to be the Capacitor iPhone app (window.Capacitor before the game loads). */
async function asIOSApp(page) {
  await page.addInitScript(() => {
    window.__hap = [];
    window.__opened = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: { Haptics: { impact: (o) => window.__hap.push(o?.style) } },
    };
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });
}

const texts = (page, key) =>
  page.evaluate((key) => {
    const walk = (list) =>
      list.flatMap((o) => (o.type === "Text" && o.visible ? [o.text] : o.list ? walk(o.list) : []));
    return walk(window.__glydrift.scene.getScene(key).children.list);
  }, key);

test("iPhone app: no Add to Home Screen, privacy policy + support in Settings, native haptics", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await asIOSApp(page);
  const log = await openGame(page);
  await run(page, 600);
  expect(await texts(page, "Menu")).not.toContain("ADD TO HOME SCREEN");
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  const shown = await texts(page, "Menu");
  expect(shown).toContain("PRIVACY POLICY");
  expect(shown).toContain("SUPPORT");
  expect(shown).not.toContain("ADD TO HOME SCREEN");
  await tap(page, "PRIVACY POLICY", 400);
  await tap(page, "SUPPORT", 400);
  expect(await page.evaluate(() => window.__opened)).toEqual([
    "https://glydrift.com/privacy",
    "https://glydrift.com/support",
  ]);
  // every button press is a native Taptic Engine tick
  expect(await page.evaluate(() => window.__hap.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__hap[0])).toBe("LIGHT");
  // DONE still closes Settings (the new row didn't push it off screen)
  await tap(page, "DONE", 600);
  expect(await texts(page, "Menu")).not.toContain("PRIVACY POLICY");
  expect(log.errors).toEqual([]);
});

test("privacy policy and support pages are published with the site", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser");
  await openGame(page);
  for (const [path, words] of [
    ["/privacy.html", ["Privacy Policy", "Crash reports", "Delete my account", "support@glydrift.com"]],
    ["/support.html", ["Support", "RESTORE PURCHASES", "Delete my account", "support@glydrift.com"]],
  ]) {
    const body = await page.evaluate((p) => fetch(p).then((r) => (r.ok ? r.text() : "")), path);
    for (const w of words) expect(body).toContain(w);
  }
});

test("Lucky Spin shows the odds of every prize, matching the wheel", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  await tap(page, "LUCKY SPIN", 0);
  await settle(page, "Spin", 1500);
  await tap(page, "ODDS", 500);
  const shown = await texts(page, "Spin");
  expect(shown).toContain("SPIN ODDS");
  const pcts = shown.filter((t) => /^\d+(\.\d)?%$/.test(t)).map((t) => parseFloat(t));
  expect(pcts.length).toBe(7); // 100 / 150 / 200 / 400 coins, 2 spins, jackpot, hero
  expect(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.5);
  expect(shown).toContain("A new hero");
  // the wheel can't spin while the odds are up; GOT IT closes them
  const spinsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).spins);
  await tap(page, "GOT IT", 400);
  expect(await texts(page, "Spin")).not.toContain("SPIN ODDS");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).spins)).toBe(spinsBefore);
  expect(log.errors).toEqual([]);
});

test("leaderboard: report a name hides it at once and sends a report", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock"] });
  await tap(page, "LEADERBOARD", 1600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 1200);
  const first = await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").rows[0]);
  await press(page, await locate(page, "REPORT A NAME"));
  await expect(page.locator("#account-modal.open h2")).toHaveText("REPORT A NAME");
  await page.locator("#account-modal .report-list button").first().click();
  await expect(page.locator("#account-modal .err")).toContainText("is hidden now");
  await page.locator('#account-modal [data-act="close"]').click();
  await run(page, 1600);
  const after = await page.evaluate(() => ({
    row: window.__glydrift.scene.getScene("Leaderboard").rows[0],
    reports: window.__glyReports,
    hidden: JSON.parse(localStorage.getItem("glydrift.save.v1")).hiddenPlayers,
  }));
  expect(after.reports).toEqual([{ playerId: first.player_id, name: first.username }]);
  expect(after.row.player_id).toBe(first.player_id);
  expect(after.row.username).toBe("Hidden player");
  expect(after.hidden[first.player_id]).toBe(first.username);
  expect(log.errors).toEqual([]);
});
