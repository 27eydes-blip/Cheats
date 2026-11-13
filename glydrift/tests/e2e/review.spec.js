// App Store review readiness: what App Review checks in the iPhone app (APP_STORE_REVIEW.md).
import { expect, test } from "@playwright/test";
import { fieldPoint, locate, openGame, press, profileOf, run, settle, tap, tapHome, waitFor } from "./helpers.js";

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
  // nor in the MORE sheet (where it lives in the browser)
  await tap(page, "MORE", 600);
  expect(await texts(page, "Menu")).not.toContain("ADD TO HOME SCREEN");
  await tap(page, "CLOSE", 600);
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
  await tapHome(page, "LUCKY SPIN", 0);
  await settle(page, "Spin", 1500);
  await tap(page, "ODDS", 500);
  const shown = await texts(page, "Spin");
  expect(shown).toContain("SPIN ODDS");
  // (the odds panel's rows; the always-on odds strip under the wheel is checked in spin.spec)
  const panel = await page.evaluate(() => {
    const walk = (list) => list.flatMap((o) => (o.type === "Text" && o.visible ? [o.text] : o.list ? walk(o.list) : []));
    return walk(window.__glydrift.scene.getScene("Spin").reveal.list);
  });
  const pcts = panel.filter((t) => /^\d+(\.\d)?%$/.test(t)).map((t) => parseFloat(t));
  expect(pcts.length).toBe(8); // 200 / 300 / 400 / 800 coins, jackpot, 2 spins, cosmetic, hero
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

// ---------------------------------------------------------------- App Store checklist (Nov 2026)

/** Every visible text in every running scene (Phaser texts only). */
const allTexts = (page) =>
  page.evaluate(() => {
    const walk = (list) =>
      list.flatMap((o) => (o.type === "Text" && o.visible ? [o.text] : o.list ? walk(o.list) : []));
    return window.__glydrift.scene.getScenes(true).flatMap((s) => walk(s.children.list));
  });

// words that must never show inside the App Store app (other stores, the web version, tests).
// ("TestPilot" is only the tests' own saved player name; the release build is checked for it in
// super-sweep.spec.)
const NOT_IN_APP = /android|google play|play store|web version|browser|iphone app|\bbeta\b|debug|todo|music test/i;

test("iPhone app: the support address is in Settings and opens Mail; it fits above DONE", async ({
  page,
}, testInfo) => {
  test.skip(!["iphone-std", "ipad-portrait"].includes(profileOf(testInfo)), "a phone and an iPad");
  await asIOSApp(page);
  await page.addInitScript(() => {
    window.__mail = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("mailto:")) window.__mail.push(this.href);
      else click.call(this);
    };
  });
  const log = await openGame(page);
  await run(page, 600);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  expect(await texts(page, "Menu")).toContain("support@glydrift.com");
  // inside the screen, under the credits, clear of DONE
  const box = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    let mail = null;
    let done = null;
    const walk = (list) =>
      list.forEach((o) => {
        if (o.type === "Text" && o.text === "support@glydrift.com") mail = o.getBounds();
        if (o.type === "Text" && o.text === "DONE") done = o.getBounds();
        if (o.list) walk(o.list);
      });
    walk(m.children.list);
    return { mail: { top: mail.top, bottom: mail.bottom }, done: { top: done.top }, H: m.H };
  });
  expect(box.mail.top).toBeGreaterThan(0);
  expect(box.mail.bottom).toBeLessThan(box.done.top - 20);
  await tap(page, "support@glydrift.com", 300);
  expect(await page.evaluate(() => window.__mail)).toEqual([
    "mailto:support@glydrift.com?subject=Glydrift%20support",
  ]);
  // the creator credit is still there
  expect(await texts(page, "Menu")).toContain("© 2026 Sam Eyde III. All rights reserved.");
  expect(log.errors).toEqual([]);
});

test("leaderboard: BLOCK hides a player without a report; offensive names never show @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock"] });
  // a name the word filter refuses never shows, whoever sent it; your own name always does
  const masked = await page.evaluate(() => {
    const { Leaderboard } = window.__glyLb;
    return Leaderboard.maskHidden([
      { player_id: "a", username: "F4ggot99" },
      { player_id: "b", username: "NeonFox42" },
      { player_id: "c", username: "Sh1tLord" },
    ]).map((r) => r.username);
  });
  expect(masked).toEqual(["Hidden player", "NeonFox42", "Hidden player"]);
  await tap(page, "LEADERBOARD", 1600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 1200);
  const first = await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").rows[0]);
  await press(page, await locate(page, "REPORT A NAME"));
  await expect(page.locator("#account-modal.open h2")).toHaveText("REPORT A NAME");
  // a way to reach the developer, right there
  await expect(page.locator('#account-modal a[href="mailto:support@glydrift.com"]')).toBeVisible();
  await page.locator("#account-modal .report-list button.block").first().click();
  await expect(page.locator("#account-modal .err")).toContainText("Blocked.");
  await page.locator('#account-modal [data-act="close"]').click();
  await run(page, 1600);
  const after = await page.evaluate(() => ({
    row: window.__glydrift.scene.getScene("Leaderboard").rows[0],
    reports: window.__glyReports || [],
    hidden: JSON.parse(localStorage.getItem("glydrift.save.v1")).hiddenPlayers,
  }));
  expect(after.reports).toEqual([]); // blocked, not reported
  expect(after.row.player_id).toBe(first.player_id);
  expect(after.row.username).toBe("Hidden player");
  expect(after.hidden[first.player_id]).toBe(first.username);
  expect(log.errors).toEqual([]);
});

test("Sign in with Apple is on CREATE ACCOUNT and SIGN IN in the iPhone app, never on the web", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await asIOSApp(page);
  const log = await openGame(page, { flags: ["mockcloud"] });
  await run(page, 300);
  page.evaluate(() => window.__glyOpenAccount("create"));
  await expect(page.locator("#account-modal.open h2")).toHaveText("CREATE ACCOUNT");
  await expect(page.locator('#account-modal [data-act="apple"]')).toBeVisible();
  await page.locator('#account-modal [data-act="to-signin"]').click();
  await expect(page.locator("#account-modal.open h2")).toHaveText("SIGN IN");
  await expect(page.locator('#account-modal [data-act="apple"]')).toBeVisible();
  await page.locator('#account-modal [data-act="close"]').click();
  // the web build has no Apple button (it can't use Apple's native sheet)
  await page.evaluate(() => {
    window.Capacitor = undefined;
  });
  page.evaluate(() => window.__glyOpenAccount("signin"));
  await expect(page.locator("#account-modal.open h2")).toHaveText("SIGN IN");
  await expect(page.locator('#account-modal [data-act="apple"]')).toHaveCount(0);
  await page.locator('#account-modal [data-act="close"]').click();
  expect(log.errors).toEqual([]);
});

/**
 * Pretend to be the iPhone app the way Capacitor itself sees it: platform "ios" (a custom
 * platform, so it works the same in Chromium, Firefox and WebKit) plus the native plugins'
 * headers, so @capacitor/core calls "native" methods through window.Capacitor.nativePromise
 * (recorded in window.__native).
 */
async function asNativeIOSApp(page) {
  await page.addInitScript(() => {
    window.__native = [];
    window.__hap = [];
    window.CapacitorCustomPlatform = { name: "ios" };
    const promise = (...names) => names.map((name) => ({ name, rtype: "promise" }));
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      PluginHeaders: [
        { name: "GlydriftStore", methods: promise("purchase", "restore", "products") },
        { name: "Haptics", methods: promise("impact") },
      ],
      Plugins: { Haptics: { impact: (o) => window.__hap.push(o?.style) } },
      nativePromise: (plugin, method) => {
        window.__native.push(`${plugin}.${method}`);
        if (method === "products") return Promise.resolve({ products: [{ displayPrice: "4,49 €" }] });
        if (method === "restore") return Promise.resolve({ transactions: [] });
        return Promise.resolve({});
      },
    };
  });
}

test("iPhone app with no internet: launches, plays, saves on the device; Drift Pass sells through Apple only", async ({
  page,
}, testInfo) => {
  test.skip(!["iphone-std", "ipad-portrait"].includes(profileOf(testInfo)), "a phone and an iPad");
  await asNativeIOSApp(page);
  // (every request outside the local server fails in tests: the app is fully offline)
  const log = await openGame(page);
  await run(page, 1500);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).stats.runs || 0);
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await run(page, 600);
  await press(page, await fieldPoint(page)); // launch, then fall
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 30_000);
  await settle(page, "GameOver", 2500);
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    return { runs: s.stats.runs, queued: (s.lbQueue || []).length };
  });
  expect(saved.runs).toBe(before + 1); // saved on the device
  expect(saved.queued).toBeGreaterThan(0); // the score waits to upload once online
  for (const t of await allTexts(page)) expect(t).not.toMatch(NOT_IN_APP);
  // the Drift Pass: RESTORE PURCHASES next to an App Store buy button showing StoreKit's own
  // price (the native store call must finish: awaiting the plugin itself used to hang forever)
  await page.evaluate(() =>
    window.__glyUi.fadeTo(window.__glydrift.scene.getScene("GameOver"), "Pass", { from: "Menu" }),
  );
  await settle(page, "Pass", 1500);
  await waitFor(page, () => {
    const walk = (list) =>
      list.flatMap((o) => (o.type === "Text" && o.visible ? [o.text] : o.list ? walk(o.list) : []));
    return walk(window.__glydrift.scene.getScene("Pass").children.list).includes("GET PASS+\n4,49 €");
  });
  const pass = await texts(page, "Pass");
  expect(pass).toContain("RESTORE\nPURCHASES");
  for (const t of await allTexts(page)) expect(t).not.toMatch(NOT_IN_APP);
  await tap(page, "RESTORE PURCHASES", 1500);
  expect(await page.evaluate(() => window.__native)).toEqual(
    expect.arrayContaining(["GlydriftStore.products", "GlydriftStore.restore"]),
  );
  expect(log.errors).toEqual([]);
});
