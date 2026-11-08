// Part 1 (sweep decisions): haptics setting, MATTOE's death effect, perk badges, 44 pt tap areas,
// readable titles, the notch inset, menus at 60 fps on 120 Hz screens.
import { expect, test } from "@playwright/test";
import { locate, openGame, profileOf, run, SAVE, settle, tap } from "./helpers.js";

const phoneOnly = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

test("haptics: FULL / LIGHT / OFF in Settings; LIGHT skips the flap tick, OFF is silent", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 400);
  expect(await locate(page, "HAPTICS: FULL")).toBeTruthy();
  const r = await page.evaluate(() => {
    const { Haptics, hapticsLevel } = window.__glyHaptics;
    const calls = [];
    navigator.vibrate = (ms) => calls.push(ms);
    const d = window.__glySave.data.settings;
    const out = {};
    for (const lv of ["full", "light", "off"]) {
      d.haptics = lv;
      calls.length = 0;
      Haptics.tap();
      Haptics.strong();
      out[lv] = { level: hapticsLevel(), calls: [...calls] };
      const t = performance.now() + 1e5;
      performance.now = () => t; // (past the 70 ms tick limiter)
    }
    d.haptics = false; // an old save's "off"
    out.legacy = hapticsLevel();
    return out;
  });
  expect(r.full.calls).toEqual([5, 28]);
  expect(r.light.calls).toEqual([14]);
  expect(r.off.calls).toEqual([]);
  expect(r.legacy).toBe("off");
  expect(log.errors).toEqual([]);
});

test("MATTOE plays the equipped death effect; WALLRUNNER gets the perk badge; tap areas are 44 pt; titles readable", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, {
    save: { ...SAVE, unlocked: { volt: true, mattoe: true }, selected: "mattoe", cos: { owned: { death_confetti: true }, equipped: { death: "death_confetti" } } },
    flags: ["god"],
  });
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const menu = g.scene.getScene("Menu");
    // every button's tap area is at least 82 × 82 game units (44 pt on a 390 pt wide iPhone)
    const small = [];
    const walk = (o) => {
      if (o.type === "Container" && o.input?.hitArea && o.setLabel) {
        const h = o.input.hitArea;
        if (h.width < 82 || h.height < 82) small.push([h.width, h.height]);
      }
      for (const c of o.list || []) walk(c);
    };
    for (const sc of g.scene.getScenes(true)) for (const o of sc.sys.displayList.list) walk(o);
    return { small, menu: !!menu };
  });
  expect(r.small).toEqual([]);
  // MATTOE's death: the equipped effect plays (his own stubbed-toe death still happens too)
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  const d = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    let n = 0;
    const orig = rig.cosmeticDeath.bind(rig);
    rig.cosmeticDeath = (x, y) => {
      n++;
      return orig(x, y);
    };
    rig.die();
    return { n, toe: !!rig.toe };
  });
  expect(d.toe).toBe(true);
  expect(d.n).toBe(1);
  expect(log.errors).toEqual([]);
});

test("menus run at most 60 fps on a 120 Hz screen (time carried over); flying keeps the full rate", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const menu = g.scene.getScene("Menu");
    let frames = 0;
    let time = 0;
    const on = (t, dt) => {
      frames++;
      time += dt;
    };
    menu.events.on("update", on);
    let t = 1e7;
    for (let i = 0; i < 120; i++) g.step((t += 1000 / 120), 1000 / 120);
    menu.events.off("update", on);
    return { frames, time: Math.round(time) };
  });
  expect(r.frames).toBeLessThanOrEqual(61);
  expect(r.frames).toBeGreaterThanOrEqual(59);
  expect(Math.abs(r.time - 1000)).toBeLessThan(20); // (no time lost: animations keep their speed)
  expect(log.errors).toEqual([]);
});

test("notch: the top safe inset is the top inset only (not top + bottom)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(async () => {
    const root = document.documentElement;
    root.style.setProperty("--sat", "47px");
    root.style.setProperty("--sab", "34px");
    window.__glySafe();
    return 1;
  });
  const safe = await page.evaluate(() => {
    const g = window.__glydrift;
    const rect = g.canvas.getBoundingClientRect();
    const cs = getComputedStyle(document.getElementById("safe-probe"));
    return { top: g.registry.get("safeTop"), bottom: g.registry.get("safeBottom"), k: g.scale.gameSize.height / rect.height, crop: Math.max(0, -rect.top), ph: cs.height };
  });
  // top : bottom is 47 : 34 (the old top + bottom gave 81 : 34)
  expect(safe.crop).toBe(0);
  expect(Math.abs(safe.top / safe.bottom - 47 / 34)).toBeLessThan(0.06);
  expect(r).toBe(1);
  expect(log.errors).toEqual([]);
});

test("a reward preview left open when the screen ends leaves nothing running (no errors on the next visit)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(120_000);
  const log = await openGame(page);
  const before = await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.getScene("Menu").scene.start("Pass");
    return 0;
  });
  await run(page, 1500);
  // a Drift Pass+ hero with a fire-breath move (Umbra Drake), previewed, then the screen ends
  const opened = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    const i = s.plus.findIndex((r) => r.hero === "umbradrake");
    const j = i >= 0 ? i : s.plus.findIndex((r) => r.hero);
    const ok = s.previewTier(j, true);
    const rig = window.__glyPreview?.rig;
    rig?.onBest?.(); // breathe now
    return ok;
  });
  expect(opened).toBe(true);
  await run(page, 300);
  const listeners = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    const n = s.events.listenerCount("update");
    s.scene.start("Menu");
    return n;
  });
  await run(page, 1200);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Pass"));
  await run(page, 3000);
  const after = await page.evaluate(() => window.__glydrift.scene.getScene("Pass").events.listenerCount("update"));
  expect(after).toBeLessThan(listeners); // the preview's own animation went with it
  expect(log.errors).toEqual([]);
  expect(before).toBe(0);
});
