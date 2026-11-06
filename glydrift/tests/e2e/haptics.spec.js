// Haptics (src/systems/haptics.js): each moment has its own pattern, nothing buzzes
// constantly, the OFF / LIGHT / FULL setting is respected and saved, and no call ever throws
// (iPhone Safari has no vibration API at all; the installed app uses the native plugin).
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, run, tap, waitFor } from "./helpers.js";

// stand in for the installed app's native Capacitor Haptics plugin, recording every call
const mockNative = (page) =>
  page.evaluate(() => {
    window.__hapCalls = [];
    const rec =
      (m) =>
      (o) => {
        window.__hapCalls.push(o?.style || o?.type ? `${m}:${o.style || o.type}` : m);
        return Promise.resolve();
      };
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android", // keep the store / account code on its web path
      Plugins: {
        Haptics: {
          impact: rec("impact"),
          notification: rec("notification"),
          selectionStart: rec("selectionStart"),
          selectionChanged: rec("selectionChanged"),
          selectionEnd: rec("selectionEnd"),
        },
      },
    };
  });

const calls = (page) =>
  page.evaluate(() => {
    const c = window.__hapCalls;
    window.__hapCalls = [];
    return c;
  });

test("haptics: a distinct pattern for each moment, never a constant buzz", async ({ page }) => {
  const log = await openGame(page);
  await mockNative(page);
  const H = (fn, arg) => page.evaluate(([f, a]) => window.__haptics[f](a), [fn, arg]);

  await H("flap");
  expect(await calls(page)).toEqual(["impact:LIGHT"]);
  await run(page, 200);
  await H("nearMiss");
  expect(await calls(page)).toEqual(["impact:MEDIUM"]);
  await run(page, 200);
  await H("coin");
  expect(await calls(page)).toEqual(["selectionStart", "selectionChanged"]);
  await run(page, 200);
  await H("starCoin");
  await run(page, 200);
  expect(await calls(page)).toEqual(["impact:MEDIUM", "impact:MEDIUM"]);
  await run(page, 300);
  // realm change at 124 BPM: light → medium → heavy, an eighth note (242 ms) apart
  await H("realm", 124);
  expect(await calls(page)).toEqual(["impact:LIGHT"]);
  await run(page, 250);
  expect(await calls(page)).toEqual(["impact:MEDIUM"]);
  await run(page, 250);
  expect(await calls(page)).toEqual(["impact:HEAVY"]);
  await run(page, 2000);
  await H("abyss");
  expect(await calls(page)).toEqual(["impact:HEAVY"]);
  await run(page, 1000);
  await H("crash");
  await run(page, 200);
  expect(await calls(page)).toEqual(["impact:HEAVY", "impact:MEDIUM"]);
  await run(page, 1000);
  await H("newBest");
  await run(page, 600);
  expect(await calls(page)).toEqual(["notification:SUCCESS", "impact:MEDIUM", "impact:HEAVY"]);
  await run(page, 1000);
  await H("purchase");
  expect(await calls(page)).toEqual(["notification:SUCCESS"]);

  // never a buzzing blur: a burst of coins/flaps in one frame gives a single tick each
  await run(page, 1000);
  for (let i = 0; i < 10; i++) await H("coin");
  expect(await calls(page)).toEqual(["selectionChanged"]);
  await run(page, 300);
  for (let i = 0; i < 10; i++) await H("flap");
  expect(await calls(page)).toEqual(["impact:LIGHT"]);
  // a bigger moment silences the small ticks while it plays, and a crash cuts it short
  await run(page, 300);
  await H("realm", 124);
  await H("flap");
  await H("coin");
  expect(await calls(page)).toEqual(["impact:LIGHT"]);
  await H("crash");
  await run(page, 800);
  expect(await calls(page)).toEqual(["impact:HEAVY", "impact:MEDIUM"]);
  expect(log.errors).toEqual([]);
});

test("haptics: OFF / LIGHT / FULL setting, saved with the settings", async ({ page }) => {
  const log = await openGame(page);
  await mockNative(page);
  const H = (fn, arg) => page.evaluate(([f, a]) => window.__haptics[f](a), [fn, arg]);
  const level = () => page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).settings.haptics);

  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  await tap(page, "HAPTICS: FULL", 300);
  expect(await level()).toBe("off");
  await calls(page);
  await run(page, 500);
  await H("crash");
  await H("newBest");
  await H("flap");
  expect(await calls(page)).toEqual([]);

  await tap(page, "HAPTICS: OFF", 300);
  expect(await level()).toBe("light");
  await calls(page);
  // Light: the frequent ticks are skipped, the rest are softer
  await run(page, 500);
  await H("flap");
  await H("coin");
  expect(await calls(page)).toEqual([]);
  await H("crash");
  await run(page, 300);
  expect(await calls(page)).toEqual(["impact:MEDIUM"]);
  await run(page, 1000);
  await H("newBest");
  await run(page, 600);
  expect(await calls(page)).toEqual(["notification:SUCCESS"]);

  await tap(page, "HAPTICS: LIGHT", 300);
  expect(await level()).toBe("full");
  await tap(page, "DONE", 600);
  expect(log.errors).toEqual([]);
});

test("haptics: the website never throws, with or without a vibration API", async ({ page }) => {
  const log = await openGame(page);
  // a real run (flaps, coins, crash) on the plain web build
  const r = await page.evaluate(() => {
    const vib = [];
    const had = "vibrate" in navigator;
    const out = { had };
    // a browser with vibrate() (Android Chrome) gets short patterns…
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (p) => vib.push(p) || true,
    });
    window.__haptics.cancel();
    window.__haptics.crash();
    out.vib = vib.slice();
    // …and one without it (iPhone Safari) or one that throws gets nothing, silently
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    for (const f of ["flap", "coin", "nearMiss", "starCoin", "abyss", "crash", "newBest", "purchase"])
      window.__haptics[f]();
    window.__haptics.realm(0);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => {
        throw new Error("nope");
      },
    });
    window.__haptics.cancel();
    window.__haptics.crash();
    return out;
  });
  // vibrate only fires after the player has touched the page (browsers block it before)
  const active = await page.evaluate(() => navigator.userActivation?.hasBeenActive ?? true);
  if (active) expect(r.vib).toEqual([[55]]);
  // a real flight still runs cleanly with haptics on every flap and the crash
  await tap(page, "ENDLESS", 600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Game"), 15_000);
  const pt = await fieldPoint(page);
  for (let i = 0; i < 6; i++) {
    await press(page, pt);
    await run(page, 250);
  }
  expect(await page.evaluate(() => window.__haptics.log.includes("flap"))).toBe(true);
  expect(log.errors).toEqual([]);
});
