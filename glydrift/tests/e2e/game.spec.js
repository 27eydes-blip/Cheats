// Glydrift on every device profile × browser engine (see playwright.config.js).
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  expectFramed,
  fingerprint,
  freshFrame,
  fieldPoint,
  gameState,
  isActive,
  isTouch,
  openGame,
  press,
  profileOf,
  reseed,
  run,
  settle,
  tap,
  waitFor,
  SAVE,
} from "./helpers.js";

/**
 * Compare the screen with its baseline. Firefox (headed in a virtual display on CI) presents
 * frames on its own schedule, so its pictures drift between runs: it is checked functionally
 * and screenshotted for review, but not pixel-compared.
 */
async function matchScreenshot(page, name, opts) {
  if (test.info().project.metadata.engine === "firefox") return;
  await expect(page).toHaveScreenshot(name, opts);
}

/** Save a screenshot of the current screen for review (and attach it to the report). */
async function snap(page, testInfo, name) {
  const dir = `test-results/screens/${testInfo.project.name}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  await freshFrame(page);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Leave whatever screen is open and go back to the home screen. */
const home = (page) =>
  page.evaluate(() => {
    const g = window.__glydrift;
    for (const s of g.scene.getScenes(true))
      if (!["Backdrop", "Menu"].includes(s.sys.settings.key)) g.scene.stop(s.sys.settings.key);
    if (!g.scene.isActive("Menu")) g.scene.start("Menu");
  });

async function startRun(page, label = "PLAY") {
  await tap(page, label, 0);
  await settle(page, "Game", 400);
  await reseed(page); // the same course every time
  await run(page, 600);
  await press(page, await fieldPoint(page)); // the first tap launches the run
  await run(page, 200);
  expect((await gameState(page)).state).toBe("playing");
}

test("loads with no console errors, framed correctly, no browser gestures", async ({
  page,
}, testInfo) => {
  const log = await openGame(page);
  await run(page, 3000);
  const frame = await expectFramed(page);
  // wide screens: the sides show the biome's own (blurred) background, not black bars
  if (frame.fit && frame.left > 20) {
    const shown = await page.evaluate(
      () =>
        [...document.querySelectorAll("#side-bg canvas")].filter((c) => c.style.opacity === "1")
          .length,
    );
    expect(shown).toBe(1);
  }
  // pinch / double-tap zoom, pull-to-refresh, long-press menus and ctrl+wheel zoom are blocked
  const blocked = await page.evaluate(() => {
    const fire = (e) => !document.body.dispatchEvent(e);
    const out = {
      wheelZoom: fire(
        new WheelEvent("wheel", {
          ctrlKey: true,
          cancelable: true,
          bubbles: true,
        }),
      ),
      contextMenu: fire(new MouseEvent("contextmenu", { cancelable: true, bubbles: true })),
      dblclick: fire(new MouseEvent("dblclick", { cancelable: true, bubbles: true })),
    };
    try {
      out.touchMove = fire(new TouchEvent("touchmove", { cancelable: true, bubbles: true }));
    } catch {
      out.touchMove = true; // no TouchEvent constructor in this engine (desktop)
    }
    return out;
  });
  expect(blocked).toEqual({
    wheelZoom: true,
    contextMenu: true,
    dblclick: true,
    touchMove: true,
  });
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
  await snap(page, testInfo, "01-home");
});

test("release build loads with no console errors", async ({ page }) => {
  // the release build exposes no test hooks: openGame waits for its canvas and lets it run
  const log = await openGame(page, {
    base: "http://localhost:4318",
    screen: null,
  });
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
  expect(await page.evaluate(() => typeof window.__glydrift)).toBe("undefined");
});

test("every screen opens", async ({ page }, testInfo) => {
  test.setTimeout(300_000); // eight screens in one test
  const log = await openGame(page);
  await freshFrame(page);
  console.log(
    `[${testInfo.project.name}] home fingerprint`,
    JSON.stringify(await fingerprint(page)),
  );
  await matchScreenshot(page, "home.png");

  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  await snap(page, testInfo, "02-settings");
  await tap(page, "DONE", 600);

  const screens = [
    ["HEROES", "Characters", "03-heroes"],
    ["SHOP", "Shop", "04-shop"],
    ["LUCKY SPIN", "Spin", "05-spin"],
    ["LEADERBOARD", "Leaderboard", "06-leaderboard"],
    ["PROGRESS", "Progress", "07-progress"],
    ["SEASON 1 · ABYSS RISING", "Pass", "08-pass"],
  ];
  for (const [label, key, shot] of screens) {
    await tap(page, label, 0);
    await settle(page, key, 2000);
    await expectFramed(page);
    await snap(page, testInfo, shot);
    if (key === "Characters" || key === "Shop") await matchScreenshot(page, `${shot.slice(3)}.png`); // snap() just drew a fresh frame
    await home(page);
    await run(page, 1200);
  }
  expect(log.errors).toEqual([]);
});

test("plays a short run with taps, clicks and keys, no double inputs", async ({
  page,
}, testInfo) => {
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const pt = await fieldPoint(page);
  const before = (await gameState(page)).flaps;
  for (let i = 0; i < 6; i++) {
    await press(page, pt);
    await run(page, 260);
  }
  // one flap per tap / click: touch never also fires a mouse click
  expect((await gameState(page)).flaps - before).toBe(6);
  if (!isTouch(testInfo)) {
    const k0 = (await gameState(page)).flaps;
    for (const key of ["Space", "KeyW", "ArrowUp"]) {
      await page.keyboard.press(key);
      await run(page, 260);
    }
    // holding a key flaps once, never auto-repeats
    await page.keyboard.down("Space");
    await run(page, 700);
    await page.keyboard.up("Space");
    expect((await gameState(page)).flaps - k0).toBe(4);
  }
  // fly a few seconds like a player would
  const m0 = (await gameState(page)).meters;
  for (let i = 0; i < 20; i++) {
    const low = await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      return s.player.y > s.H * 0.55;
    });
    if (low) await press(page, pt);
    await run(page, 100);
  }
  expect((await gameState(page)).meters).toBeGreaterThan(m0 + 20);
  await snap(page, testInfo, "09a-gameplay-after-input");
  expect(log.errors).toEqual([]);
});

test("gameplay looks right", async ({ page }, testInfo) => {
  // no real input after the launch tap (input reaches the page a frame early or late from run
  // to run), so this picture is identical every time: an in-page autopilot flies the hero
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
    });
    await run(page, 100);
  }
  await snap(page, testInfo, "09-gameplay");
  // the busiest scene (rain, particles, spinning hazards): a looser match, still catches a
  // missing hero, hazards or background
  await matchScreenshot(page, "gameplay.png", { maxDiffPixelRatio: 0.08 });
  expect(log.errors).toEqual([]);
});

test("pause and resume (button, keys, app in background)", async ({ page }, testInfo) => {
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const paused = () => page.evaluate(() => !!window.__glydrift.scene.getScene("Hud").pauseLayer);
  if (isTouch(testInfo)) {
    const pt = await page.evaluate(() => {
      const g = window.__glydrift;
      const h = g.scene.getScene("Hud");
      const b = h.pauseBtn; // a container placed at the button's centre
      const cam = h.cameras.main;
      const r = g.canvas.getBoundingClientRect();
      const sx = (b.x - cam.worldView.x) * cam.zoom;
      const sy = (b.y - cam.worldView.y) * cam.zoom;
      return {
        x: r.left + (sx * r.width) / g.canvas.width,
        y: r.top + (sy * r.height) / g.canvas.height,
      };
    });
    await press(page, pt);
  } else await page.keyboard.press("Escape");
  await run(page, 400);
  expect(await paused()).toBe(true);
  const m = (await gameState(page)).meters;
  await run(page, 1500);
  expect((await gameState(page)).meters).toBe(m); // frozen while paused
  await snap(page, testInfo, "10-pause");
  if (isTouch(testInfo)) await tap(page, "RESUME", 300);
  else await page.keyboard.press("KeyP");
  await run(page, 600);
  expect(await paused()).toBe(false);
  expect((await gameState(page)).meters).toBeGreaterThan(m);

  // the tab / app goes to the background → the run pauses itself
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await run(page, 300);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await run(page, 300);
  expect(await paused()).toBe(true);
  await tap(page, "RESUME", 600);
  expect((await gameState(page)).state).toBe("playing");
  expect(log.errors).toEqual([]);
});

test("game over and retry in under a second", async ({ page }, testInfo) => {
  const log = await openGame(page);
  await startRun(page);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 30_000);
  await settle(page, "GameOver", 3500); // let the results roll up
  await snap(page, testInfo, "11-game-over");
  await freshFrame(page);
  await matchScreenshot(page, "game-over.png");
  await tap(page, "RETRY", 0);
  // RETRY goes straight into a fresh run
  const fresh = async () => {
    const g = await gameState(page);
    return g && ["ready", "playing"].includes(g.state) && g.meters < 30;
  };
  let t = 0;
  while (t < 2000 && !(await fresh())) {
    await run(page, 50);
    t += 50;
  }
  expect(await fresh()).toBe(true);
  expect(t).toBeLessThan(1000);
  expect(log.errors).toEqual([]);
});

test("buys an item in the shop", async ({ page }, testInfo) => {
  const log = await openGame(page);
  await tap(page, "SHOP", 1600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Shop"));
  const item = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.setTab("trail");
    const coins = JSON.parse(localStorage.getItem("glydrift.save.v1")).coins;
    const priceOf = (c) => c.cta?.list?.find((o) => o.type === "Text" && /^\d+$/.test(o.text));
    const i = s.cards.findIndex((c) => priceOf(c) && +priceOf(c).text <= coins);
    if (i < 0) return null;
    s.focus(i, true);
    return { id: s.cards[i].offer.id, price: +priceOf(s.cards[i]).text, coins };
  });
  expect(item).not.toBeNull();
  await run(page, 800);
  const ctaPt = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Shop");
    const b = s.cards[s.index].cta.getBounds();
    const cam = s.cameras.main;
    const r = g.canvas.getBoundingClientRect();
    const sx = (b.centerX - cam.worldView.x) * cam.zoom;
    const sy = (b.centerY - cam.worldView.y) * cam.zoom;
    return {
      x: r.left + (sx * r.width) / g.canvas.width,
      y: r.top + (sy * r.height) / g.canvas.height,
    };
  });
  await press(page, ctaPt);
  await run(page, 600);
  await snap(page, testInfo, "12-shop-confirm");
  await tap(page, "BUY!", 1500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(after.coins).toBe(item.coins - item.price);
  expect(after.cos.owned[item.id]).toBeTruthy();
  expect(log.errors).toEqual([]);
});

const SIZES = {
  phone: (v) => [
    { width: v.height, height: v.width }, // rotate to landscape
    { width: v.width, height: v.height - 80 }, // address bar shows
    v, // and back
  ],
  ipad: () => [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1024, height: 1366 },
    { width: 1366, height: 1024 },
    { width: 507, height: 1024 }, // Split View, half
    { width: 320, height: 1024 }, // Slide Over
    { width: 694, height: 1024 }, // Split View, two thirds
  ],
  desktop: () => [
    { width: 2560, height: 720 }, // very wide
    { width: 1366, height: 420 }, // very short
    { width: 520, height: 900 }, // narrow window
    { width: 1920, height: 1080 },
  ],
};

test("resize, rotation and Split View keep the run going", async ({ page }, testInfo) => {
  const log = await openGame(page, { flags: ["god"] });
  const profile = profileOf(testInfo);
  const v = page.viewportSize();
  const sizes = profile.startsWith("iphone")
    ? SIZES.phone(v)
    : profile.startsWith("ipad")
      ? SIZES.ipad()
      : SIZES.desktop();
  await startRun(page);
  const pt = () => fieldPoint(page);
  for (const size of sizes) {
    await page.setViewportSize(size);
    const m = (await gameState(page)).meters;
    for (let i = 0; i < 3; i++) {
      await press(page, await pt());
      await run(page, 250);
    }
    expect((await gameState(page)).state).toBe("playing"); // never restarted
    expect((await gameState(page)).meters).toBeGreaterThan(m);
    await expectFramed(page);
  }
  // back on the home screen the canvas is re-rendered at the new size (crisp), and still fits
  await page.setViewportSize(sizes.at(-2));
  await run(page, 500);
  await home(page);
  await run(page, 2000);
  expect(await isActive(page, "Menu")).toBe(true);
  await expectFramed(page);
  // crisp: the canvas is drawn at (close to) the screen's real pixel size again
  const measure = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const c = g.canvas;
      const r = c.getBoundingClientRect();
      return {
        ratio: (r.width * devicePixelRatio) / c.width,
        cssW: Math.round(r.width),
        cssH: Math.round(r.height),
        canvas: `${c.width}x${c.height}`,
        game: `${g.scale.gameSize.width}x${g.scale.gameSize.height}`,
        dpr: devicePixelRatio,
        view: `${innerWidth}x${innerHeight}`,
        mode: g.scale.scaleMode,
      };
    });
  let m = await measure();
  for (let i = 0; i < 30 && !(m.ratio > 0.6 && m.ratio < 1.6); i++) {
    await run(page, 200);
    m = await measure();
  }
  expect(m.ratio, JSON.stringify(m)).toBeGreaterThan(0.6); // the budget may render a little under 1:1
  expect(m.ratio, JSON.stringify(m)).toBeLessThan(1.6);
  await snap(page, testInfo, "13-after-resize");
  expect(log.errors).toEqual([]);
});

test("survives a lost WebGL context", async ({ page }) => {
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const ok = await page.evaluate(() => {
    const ext = window.__glydrift.renderer.gl?.getExtension("WEBGL_lose_context");
    if (!ext) return false;
    window.__lose = ext;
    ext.loseContext();
    return true;
  });
  test.skip(!ok, "this engine can't simulate a lost context");
  await run(page, 500);
  await page.evaluate(() => window.__lose.restoreContext());
  await run(page, 1500);
  const m = (await gameState(page)).meters;
  await run(page, 1000);
  expect((await gameState(page)).meters).toBeGreaterThan(m);
  // still drawing: the frame isn't blank (the snapshot arrives with the next drawn frame)
  await page.evaluate(() => {
    const g = window.__glydrift;
    window.__lit = null;
    window.__glyRender = true;
    g.renderer.snapshot((img) => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 32, 32);
      const d = x.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      window.__lit = sum / (32 * 32 * 3);
    });
  });
  await waitFor(page, () => window.__lit !== null, 5000);
  const lit = await page.evaluate(() => window.__lit);
  expect(lit).toBeGreaterThan(4);
  expect(log.errors).toEqual([]);
});

test("runs in private browsing (no storage) and says progress won't save", async ({ page }) => {
  const log = await openGame(page, { noStorage: true, save: null });
  // first launch: the name prompt may open; dismiss it
  await page.evaluate(() => document.querySelector('#name-modal [data-act="cancel"]')?.click());
  await run(page, 800);
  await expect(page.locator("#storage-note")).toBeVisible();
  expect(log.errors).toEqual([]);
});

test("same game speed at 30, 60 and 120 Hz", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "laptop", "engine-level check: once per browser");
  await openGame(page, { flags: ["god"] });
  const meters = await page.evaluate(async () => {
    const g = window.__glydrift;
    const out = {};
    g.loop.sleep();
    let t = performance.now();
    for (const hz of [30, 60, 120]) {
      g.scene.stop("Menu");
      g.scene.stop("Game");
      g.scene.start("Game", { autoStart: true });
      for (let i = 0; i < 30; i++) g.step((t += 16.667), 16.667);
      const s = g.scene.getScene("Game");
      if (s.state !== "playing") s.startRun();
      const m0 = s.meters;
      const dt = 1000 / hz;
      for (let i = 0; i < hz * 4; i++) {
        const p = s.player;
        if (p.y > s.H * 0.5 && p.vy > -50) s.onTap();
        // near-miss slow motion would land at different moments at different frame rates
        s.slowT = 0;
        s.timeScale = 1;
        g.step((t += dt), dt);
      }
      out[hz] = s.meters - m0;
    }
    g.loop.wake();
    return out;
  });
  expect(Math.abs(meters[30] / meters[60] - 1)).toBeLessThan(0.02);
  expect(Math.abs(meters[120] / meters[60] - 1)).toBeLessThan(0.02);
});

test("a very long run stays smooth and doesn't pile up objects", async ({ page }, testInfo) => {
  // Players reported the game "collapsing" on high-score runs. Two causes, both fixed:
  // registering each realm's art read its pixels back (getImageData) and froze the game for
  // seconds at every realm boundary, and at high speed magnetised coins got stuck orbiting
  // behind the bird forever. Fly ~10 km (every realm and dimension) and check for both.
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const samples = [];
  for (let chunk = 0; chunk < 36; chunk++) {
    samples.push(
      await page.evaluate(() => {
        const g = window.__glydrift;
        const s = g.scene.getScene("Game");
        for (let i = 0; i < 600; i++) {
          if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
          s.__t = (s.__t || 1e6) + 1000 / 60;
          s.stepFrame(s.__t, 1000 / 60);
        }
        return {
          m: Math.floor(s.meters),
          state: s.state,
          coins: s.obstacles.coins.filter((c) => c.active).length,
          // a coin the magnet caught is collected within a few frames, never left hovering
          caught: s.obstacles.coins.filter((c) => c.active && c.magnet).length,
        };
      }),
    );
    await run(page, 50); // draw a frame now and then, so new textures upload
  }
  const last = samples.at(-1);
  expect(last.state).toBe("playing");
  expect(last.m).toBeGreaterThan(8000);
  // live coins are only the ones on screen ahead of the bird
  expect(Math.max(...samples.map((x) => x.coins))).toBeLessThan(30);
  expect(Math.max(...samples.map((x) => x.caught))).toBeLessThan(3);
  expect(log.errors).toEqual([]);
});

test("realm art never uses read-back canvas textures", () => {
  // textures.addCanvas() makes a CanvasTexture, which reads the whole canvas back with
  // getImageData(): seconds of freeze per realm on iPhones. Use canvasTexture() (pixel/px.js).
  const files = readdirSync("src", { recursive: true }).filter((f) => f.endsWith(".js"));
  const bad = files.filter((f) => readFileSync(`src/${f}`, "utf8").includes("textures.addCanvas("));
  expect(bad).toEqual([]);
});

test("centre pop-ups never pile up", async ({ page }, testInfo) => {
  // A realm change lands on a milestone (both at 500 m / 1000 m) and NEW BEST and SPEED UP
  // can fire in the same moment: only one centre pop-up shows at a time, realm title first,
  // then NEW BEST, then SPEED UP; a distance marker that would be stale is skipped.
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const centre = () =>
    page.evaluate(() => {
      const h = window.__glydrift.scene.getScene("Hud");
      const on = (o) => !!o && o.visible && o.alpha > 0.05;
      return [
        on(h.banner) && "realm",
        on(h.speedText) && "speed",
        on(h.centerText) && h.centerText.text,
      ].filter(Boolean);
    });
  await page.evaluate(() => {
    const h = window.__glydrift.scene.getScene("Hud");
    h.onDistance(1000, 2);
    h.onBiome(3);
    h.onCenterBest();
    h.onSpeedUp();
  });
  const seen = [];
  for (let i = 0; i < 60; i++) {
    await run(page, 100);
    const now = await centre();
    expect(now.length, `centre pop-ups at ${i * 100} ms: ${now}`).toBeLessThanOrEqual(1);
    if (now[0] && seen.at(-1) !== now[0]) seen.push(now[0]);
  }
  // (the run keeps flying, so a real 100m marker may follow)
  expect(seen.slice(0, 3)).toEqual(["realm", "NEW BEST!", "speed"]);
  expect(seen).not.toContain("1000m!"); // it waited too long: stale, skipped

  // pop text by the bird is moved out of the strip a live centre pop-up uses
  const clear = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    const h = g.scene.getScene("Hud");
    h.onBiome(4);
    const band = h.centerBand();
    const hc = h.cameras.main;
    const gc = s.cameras.main;
    const toWorld = (hy) => ((hy - hc.worldView.y) * hc.zoom) / gc.zoom + gc.worldView.y;
    const mid = (toWorld(band.y0) + toWorld(band.y1)) / 2;
    const t = s.popNear(s.player.x, mid, "CLOSE!", "#ffffff", 40);
    const top = t.y - 70 - t.height / 2;
    const bottom = t.y + t.height / 2;
    return bottom < toWorld(band.y0) || top > toWorld(band.y1);
  });
  expect(clear).toBe(true);

  // a pop that was already rising when a realm title appears is cleared out of its strip
  const cleared = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    const h = g.scene.getScene("Hud");
    h.pops.clear();
    const band = h.centerBandFor("realm");
    const mid = (s.hudToWorldY(band.y0) + s.hudToWorldY(band.y1)) / 2;
    const t = s.fx.floatText(s.player.x, mid, "CLOSE!", "#ffffff", 32);
    h.onBiome(5);
    return !t.visible;
  });
  expect(cleared).toBe(true);

  // and through a real stretch of run across a realm change at 1000 m
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    while (s.meters < 880) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  });
  let maxCentre = 0;
  let covered = 0;
  for (let i = 0; i < 70; i++) {
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
    });
    await run(page, 100);
    maxCentre = Math.max(maxCentre, (await centre()).length);
    // while a realm title shows, no CLOSE! / coin / combo pop is on top of it
    covered += await page.evaluate(() => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      const h = g.scene.getScene("Hud");
      if (!(h.banner.visible && h.banner.alpha > 0.05)) return 0;
      const band = h.centerBandFor("realm");
      const b0 = s.hudToWorldY(band.y0);
      const b1 = s.hudToWorldY(band.y1);
      return s.fx.texts.filter(
        (t) =>
          t.visible &&
          t.alpha > 0.05 &&
          t.y + t.displayHeight / 2 > b0 &&
          t.y - t.displayHeight / 2 < b1,
      ).length;
    });
  }
  expect(covered).toBe(0);
  expect(
    await page.evaluate(() => window.__glydrift.scene.getScene("Game").meters),
  ).toBeGreaterThan(1000);
  expect(maxCentre).toBeLessThanOrEqual(1);
  expect(log.errors).toEqual([]);
});

test("home shows at most two '!' badges, free rewards first", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  // daily run unplayed, free drop ready, a spin to use and the login reward unclaimed: four
  // things ready, only the two free rewards get a badge
  const log = await openGame(page, {
    save: { ...SAVE, login: { last: "2026-11-03", streak: 3, claimed: "2026-11-03" } },
  });
  const badged = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    const labels = [];
    for (const c of m.children.list) {
      if (c.type !== "Container") continue;
      const bang = c.list.some(
        (o) => o.type === "Container" && o.list.some((x) => x.type === "Text" && x.text === "!"),
      );
      if (bang) labels.push(c.list.find((x) => x.type === "Text")?.text);
    }
    return labels;
  });
  expect(badged.sort()).toEqual(["FREE DROP", "STREAK"]);
  expect(log.errors).toEqual([]);
});

test("lucky spins: old saves trimmed to 3, one spin per run at most", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  // an old save holding 105 spins (spins used to be uncapped) shows 3
  const log = await openGame(page, { save: { ...SAVE, spins: 105 } });
  const shows = (txt) =>
    page.evaluate(
      (t) =>
        window.__glydrift.scene
          .getScene("Menu")
          .children.list.some(
            (c) => c.type === "Container" && c.list.some((x) => x.type === "Text" && x.text === t),
          ),
      txt,
    );
  expect(await shows("3 spins ready")).toBe(true);
  expect(log.errors).toEqual([]);
});

test("a huge run earns one spin, not dozens", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...SAVE, spins: 1, spinPts: 0 }, flags: ["god"] });
  await startRun(page);
  await page.evaluate(() => {
    window.__glydrift.scene.getScene("Game").bonus = 100000; // 40 spins' worth of points
    window.__glyGod(false);
  });
  for (
    let i = 0;
    i < 60 && !(await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")));
    i++
  )
    await run(page, 250);
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    return { spins: s.spins, spinPts: s.spinPts };
  });
  expect(after.spins).toBe(2); // one earned
  expect(after.spinPts).toBeLessThan(2500); // and no pile of points banked for later
  expect(log.errors).toEqual([]);
});

test("realm changes never pause the run", async ({ page }, testInfo) => {
  // Entering a realm or a dimension keeps the action going: no slow-mo, obstacles keep
  // spawning straight through the boundary, and the title shows small and high over the play.
  // The Calm (and the blackout into the Abyss) is the one designed pause.
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const om = s.obstacles;
    let t = 0;
    const spawns = [];
    const orig = om.spawnPattern.bind(om);
    om.spawnPattern = (m, b) => {
      spawns.push([t, s.meters]);
      orig(m, b);
    };
    let near = 0;
    const onNear = s.nearMiss.bind(s);
    s.nearMiss = (o) => {
      near++;
      return onNear(o);
    };
    const bounds = [];
    let last = null;
    let pauses = 0;
    let slowJumps = 0;
    let prevSlow = 0;
    let prevNear = 0;
    while (s.meters < 3600) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      t += 1 / 60;
      s.stepFrame(s.__t, 1000 / 60);
      const seg = s.course.segAt(s.meters);
      if (seg.id !== last) {
        bounds.push({ m: seg.start, id: seg.id });
        last = seg.id;
      }
      const preCalm = seg.id === "glitch" && s.meters - seg.start > seg.length - 185;
      const designed = s.calm || preCalm || s.blackoutT > 0 || seg.id === "abyss";
      if (om.info.pause && !designed) pauses++;
      // slow-mo that no near-miss caused (realm entry used to add a slow-mo beat)
      if (s.slowT > prevSlow + 0.01 && near === prevNear) slowJumps++;
      prevSlow = s.slowT;
      prevNear = near;
    }
    // the longest wait for the next obstacle around each boundary (bar the Abyss entry)
    const around = bounds
      .filter((b) => b.m > 0 && b.id !== "abyss")
      .map((b) => {
        let worst = 0;
        for (let i = 1; i < spawns.length; i++)
          if (spawns[i][1] > b.m - 60 && spawns[i - 1][1] < b.m + 90)
            worst = Math.max(worst, spawns[i][0] - spawns[i - 1][0]);
        return { id: b.id, worst: +worst.toFixed(2) };
      });
    return { pauses, slowJumps, around, ids: bounds.map((b) => b.id) };
  });
  expect(out.ids).toEqual(expect.arrayContaining(["solar", "frozen", "glitch", "hurricane"]));
  expect(out.ids.length).toBeGreaterThanOrEqual(8); // into at least one dimension
  expect(out.pauses).toBe(0);
  expect(out.slowJumps).toBe(0);
  for (const b of out.around) expect(b.worst, `obstacle gap entering ${b.id}`).toBeLessThan(3.5);
  // the title is drawn small and high, over the play
  const title = await page.evaluate(() => {
    const h = window.__glydrift.scene.getScene("Hud");
    h.pops.clear();
    h.onBiome(2);
    return { y: h.bannerY / h.H, scale: h.banner.scale };
  });
  await run(page, 800);
  const settled = await page.evaluate(() => window.__glydrift.scene.getScene("Hud").banner.scale);
  expect(title.y).toBeLessThan(0.32);
  expect(settled).toBeLessThan(0.75);
  expect(log.errors).toEqual([]);
});
