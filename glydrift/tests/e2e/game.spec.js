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
  // the release build exposes no test hooks: openGame waits for its canvas and lets it run.
  // It draws every frame, and the test clock ticks every 16 ms (a hair faster than a real
  // 60 Hz screen), so with no frame cap it renders twice what it did under the old 61 fps
  // cap: give it the time.
  test.setTimeout(240_000);
  const log = await openGame(page, {
    base: process.env.RELEASE_URL || "http://localhost:4318", // (a second checkout serves its own)
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
    // the run's normal gaps away from any boundary (early on, at low speed, these are long)
    const atBound = (m) => bounds.some((b) => b.m > 0 && m > b.m - 60 && m < b.m + 90);
    const abyss = bounds.find((b) => b.id === "abyss")?.m ?? Infinity;
    let normal = 0;
    for (let i = 1; i < spawns.length; i++) {
      const m = spawns[i][1];
      if (!atBound(m) && !atBound(spawns[i - 1][1]) && (m < abyss || m > abyss + 600))
        normal = Math.max(normal, spawns[i][0] - spawns[i - 1][0]);
    }
    return { pauses, slowJumps, around, normal, ids: bounds.map((b) => b.id) };
  });
  expect(out.ids).toEqual(expect.arrayContaining(["solar", "frozen", "glitch", "hurricane"]));
  expect(out.ids.length).toBeGreaterThanOrEqual(8); // into at least one dimension
  expect(out.pauses).toBe(0);
  expect(out.slowJumps).toBe(0);
  // no longer wait for an obstacle at a boundary than the run's usual longest gap
  const limit = Math.max(3.5, out.normal * 1.1);
  for (const b of out.around)
    expect(b.worst, `obstacle gap entering ${b.id} (normal ${out.normal})`).toBeLessThan(limit);
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

test("two leaderboards: distance and score", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock"] });
  await tap(page, "LEADERBOARD", 1600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  const view = () =>
    page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Leaderboard");
      const texts = (c) =>
        c.list.flatMap((o) => (o.type === "Text" ? [o.text] : o.list ? texts(o) : []));
      return {
        tab: s.tab,
        tabs: s.tabs.map((t) => t.txt.text),
        filters: s.filters.filter((f) => f.txt.visible).map((f) => f.txt.text),
        rows: texts(s.list),
        you: texts(s.you),
      };
    });
  await run(page, 1200);
  let v = await view();
  expect(v.tabs).toEqual(["DISTANCE", "SCORE", expect.stringMatching(/^DAILY #\d+$/)]);
  expect(v.tab).toBe("distance");
  expect(v.filters).toEqual(["ALL TIME", "THIS WEEK", "TODAY"]);
  expect(v.rows.some((t) => /^\d+ m$/.test(t))).toBe(true); // metres on the distance board
  expect(v.you).toEqual(expect.arrayContaining(["#12", "YOUR FARTHEST"])); // own rank pinned
  await snap(page, testInfo, "13-leaderboard-distance");
  await tap(page, "SCORE", 1200);
  v = await view();
  expect(v.tab).toBe("score");
  expect(v.filters).toEqual(["ALL TIME", "THIS WEEK", "TODAY"]);
  expect(v.rows.some((t) => /^\d+ m$/.test(t))).toBe(false);
  expect(v.you).toEqual(expect.arrayContaining(["#12", "YOUR BEST"]));
  await snap(page, testInfo, "14-leaderboard-score");
  // impossible distances for the run time are rejected before upload
  const plausible = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    return {
      real: isPlausible({ score: 3000, distance: 1700, run_time_ms: 80_000 }),
      teleport: isPlausible({ score: 3000, distance: 9000, run_time_ms: 20_000 }),
    };
  });
  expect(plausible).toEqual({ real: true, teleport: false });
  expect(log.errors).toEqual([]);
});

test("game over shows the distance and score placements", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["god", "lbmock"] });
  await startRun(page);
  await run(page, 4000);
  await page.evaluate(() => window.__glyGod(false));
  let msg = null;
  for (let i = 0; i < 80 && !msg; i++) {
    await run(page, 250);
    msg = await page.evaluate(
      () => window.__glydrift.scene.getScene("GameOver")?.placementText || null,
    );
  }
  expect(msg).toMatch(/^You placed #\d+ in Distance · #\d+ in Score$/);
  expect(log.errors).toEqual([]);
});

// ---- accounts + cloud save (a local stand-in server: ?mockcloud) ----
async function openSettingsAccount(page) {
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  // "ACCOUNT · SAVE YOUR PROGRESS" for a guest, "ACCOUNT: <email>" when signed in
  const label = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    const texts = (c) => c.list.flatMap((o) => (o.type === "Text" ? [o] : o.list ? texts(o) : []));
    return texts(m.modal).find((t) => t.text.startsWith("ACCOUNT"))?.text;
  });
  if (!label) throw new Error("no ACCOUNT button in Settings");
  await tap(page, label, 400);
  await expect(page.locator("#account-modal.open")).toBeVisible();
}
/** Open the account screen directly (after a log out the home screen is busy onboarding). */
async function openAccountScreen(page) {
  await run(page, 800);
  // a fresh guest (after logging out) is first asked for a name
  if (await page.locator("#name-modal.open").isVisible()) {
    await page.fill("#name-modal input", "GuestPilot");
    await page.click("#name-modal [data-act=save]");
    await run(page, 600);
  }
  await page.evaluate(() => {
    window.__glyOpenAccount(); // resolves only when it closes: don't wait for it
  });
  await expect(page.locator("#account-modal.open")).toBeVisible();
}
const saveNow = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));

test("accounts: create, log out, sign in on a new device, delete", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, {
    flags: ["mockcloud"],
    save: { ...SAVE, coins: 4321, unlocked: { volt: true, ember: true, frost: true } },
  });
  await run(page, 800); // the account service starts in the background
  // 1. a guest creates an account: their progress is linked to it, nothing lost
  await openSettingsAccount(page);
  await snap(page, testInfo, "15-account-create");
  await page.fill("#account-modal input[name=email]", "pilot@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal h2")).toHaveText("ACCOUNT");
  await expect(page.locator("#account-modal .who")).toHaveText("pilot@example.com");
  let server = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.mockserver")));
  expect(server.users["pilot@example.com"].save.coins).toBe(4321);
  expect(server.users["pilot@example.com"].save.unlocked.frost).toBe(true);
  expect(server.users["pilot@example.com"].save.settings).toBeUndefined(); // device-only
  // 2. log out: the account keeps everything, this device starts fresh
  let reloaded = page.waitForEvent("load"); // the old page is already loaded: wait for the new one
  await page.click("#account-modal [data-act=logout]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  expect((await saveNow(page)).coins).toBe(0);
  // 3. sign in (as on a new device): everything comes back
  await openAccountScreen(page);
  await page.click("#account-modal [data-act=to-signin]");
  await snap(page, testInfo, "16-account-signin");
  await page.fill("#account-modal input[name=email]", "pilot@example.com");
  await page.fill("#account-modal input[name=password]", "wrong-password");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal .err")).toHaveText("Wrong email or password.");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  reloaded = page.waitForEvent("load");
  await page.click("#account-modal button[type=submit]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  let s = await saveNow(page);
  expect(s.coins).toBe(4321);
  expect(s.unlocked).toEqual(expect.objectContaining({ ember: true, frost: true }));
  // 4. delete the account: gone from the server and from this device
  await openAccountScreen(page);
  await page.click("#account-modal [data-act=to-delete]");
  await page.fill("#account-modal input[name=confirm]", "nope");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal .err")).toHaveText("Type DELETE to confirm.");
  await page.fill("#account-modal input[name=confirm]", "DELETE");
  reloaded = page.waitForEvent("load");
  await page.click("#account-modal button[type=submit]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  server = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.mockserver")));
  expect(server.users["pilot@example.com"]).toBeUndefined();
  s = await saveNow(page);
  expect(s.coins).toBe(0);
  expect(log.errors).toEqual([]);
});

test("cloud save merge keeps the most progress", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await openGame(page, { flags: ["mockcloud"] });
  const m = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const device = {
      level: 3,
      xp: 50,
      coins: 900,
      best: 2500,
      selected: "frost",
      unlocked: { volt: true, frost: true },
      cos: { owned: { trail_fire: true }, equipped: {} },
      achievements: { a1: true },
      stats: { runs: 40, maxDistance: 1800 },
      pass: { xp: 300, claimed: { 0: true } },
      settings: { musicVol: 0.2 },
      lbQueue: [1],
    };
    const cloud = {
      level: 9,
      xp: 10,
      coins: 7000,
      best: 1900,
      selected: "ember",
      unlocked: { volt: true, ember: true },
      cos: { owned: { hat_halo: true }, equipped: {} },
      achievements: { a2: true },
      stats: { runs: 120, maxDistance: 1500 },
      pass: { xp: 1200, claimed: { 1: true } },
    };
    return mergeSaves(device, cloud);
  });
  expect(m.level).toBe(9); // the cloud save had more progress: it's the base…
  expect(m.coins).toBe(7000);
  expect(m.selected).toBe("ember");
  expect(m.unlocked).toEqual({ volt: true, ember: true, frost: true }); // …and nothing earned is lost
  expect(m.cos.owned).toEqual({ trail_fire: true, hat_halo: true });
  expect(m.achievements).toEqual({ a1: true, a2: true });
  expect(m.best).toBe(2500);
  expect(m.stats.maxDistance).toBe(1800);
  expect(m.pass.claimed).toEqual({ 0: true, 1: true });
  expect(m.settings).toEqual({ musicVol: 0.2 }); // this device's settings stay
});

test("titles: earn, wear, and see them on the leaderboard and game over", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, {
    flags: ["lbmock", "god"],
    save: {
      ...SAVE,
      achievements: { daredevil: true, first: true },
      stats: { maxDistance: 3200, runs: 30 },
    },
  });
  // earned from an achievement and the distance leagues; Drift Pass+ ones are not
  const owned = await page.evaluate(() => {
    const T = window.__glyTitles;
    T.sync();
    return {
      daredevil: T.owns("t_daredevil"),
      gold: T.owns("t_gold"),
      diamond: T.owns("t_diamond"),
      plusWear: T.equip("p_starborn"),
    };
  });
  expect(owned).toEqual({ daredevil: true, gold: true, diamond: false, plusWear: false });
  // wear one through the Titles screen (Progress → TITLES)
  await tap(page, "PROGRESS", 1200);
  await waitFor(page, () => window.__glydrift.scene.isActive("Progress"));
  await tap(page, "TITLES", 1200);
  await waitFor(page, () => window.__glydrift.scene.isActive("Titles"));
  await run(page, 600);
  await tap(page, "GOLD LEAGUE", 600);
  expect(await page.evaluate(() => window.__glyTitles.equippedId())).toBe("t_gold");
  await snap(page, testInfo, "17-titles");
  // under your name on the leaderboard (pinned row)…
  await page.evaluate(() => window.__glydrift.scene.getScene("Titles").scene.start("Leaderboard"));
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 1200);
  const you = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    const texts = (c) =>
      c.list.flatMap((o) => (o.type === "Text" ? [o.text] : o.list ? texts(o) : []));
    return texts(s.you);
  });
  expect(you).toContain("GOLD LEAGUE");
  // …and on the game over screen
  await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").scene.start("Menu"));
  await waitFor(page, () => window.__glydrift.scene.isActive("Menu"));
  await run(page, 1000);
  await startRun(page);
  await page.evaluate(() => window.__glyGod(false));
  for (
    let i = 0;
    i < 60 && !(await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")));
    i++
  )
    await run(page, 250);
  await run(page, 600);
  const go = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("GameOver");
    const texts = (c) =>
      c.list.flatMap((o) => (o.type === "Text" ? [o.text] : o.list ? texts(o) : []));
    return texts(s.children);
  });
  expect(go).toContain("GOLD LEAGUE");
  expect(log.errors).toEqual([]);
});

// ---- DRIFT PASS+ ----
const PASS_SAVE = {
  ...SAVE,
  seasons: { s1: { xp: 5000, claimed: {}, started: true, heroSeen: true } }, // 11 tiers reached
};
const openPass = async (page) => {
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Pass"));
  await waitFor(page, () => window.__glydrift.scene.isActive("Pass"));
  await run(page, 800);
};

test("Drift Pass+ on the web: buy it in the iPhone app", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: PASS_SAVE });
  await openPass(page);
  const v = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    return {
      note: s.buyNote?.text,
      buy: !!s.buyBtn,
      restore: !!s.restoreBtn,
      states: [...new Set(s.rows.map((r) => r.plusState))],
    };
  });
  expect(v).toEqual({
    note: "Get Drift Pass+\nin the iPhone app",
    buy: false,
    restore: true,
    states: ["plus"],
  });
  expect(log.errors).toEqual([]);
});

test("Drift Pass+: buy, claim, restore on a new device", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: PASS_SAVE, flags: ["mockiap"] });
  await openPass(page);
  await snap(page, testInfo, "18-pass-plus-locked");
  // GET PASS+ opens the Drift Pass+ screen: Umbra Drake and Gloomeleon up front
  await tap(page, "GET PASS+ $3.99", 1500);
  const offer = await page.evaluate(() =>
    window.__glydrift.scene.getScene("Pass").offerRigs?.map((r) => r.def.id),
  );
  expect(offer).toEqual(["umbradrake", "gloomeleon"]);
  await snap(page, testInfo, "18b-pass-plus-offer");
  // a failed server check unlocks nothing
  await page.evaluate(() => localStorage.setItem("glydrift.mockstore.fail", "1"));
  await tap(page, "BUY $3.99", 800);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(false);
  await page.evaluate(() => localStorage.removeItem("glydrift.mockstore.fail"));
  // a verified purchase unlocks the track (and closes the screen)
  await tap(page, "BUY $3.99", 1200);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(true);
  expect(await page.evaluate(() => !!window.__glydrift.scene.getScene("Pass").offer)).toBe(false);
  const after = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    return { buy: !!s.buyBtn, t5: s.rows[4].plusState, t15: s.rows[14].plusState };
  });
  expect(after).toEqual({ buy: false, t5: "ready", t15: "locked" });
  // claim tier 3 (the Hologram skin), tier 5 (HEXOWL) and tier 7 (the ABYSS LORD title)
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    s.claimPlus(2, true);
    s.claimPlus(4, true);
    s.claimPlus(6, true);
  });
  await run(page, 1200);
  await snap(page, testInfo, "19-pass-plus-owned");
  let save = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(save.cos.owned.skin_holo).toBe(true);
  expect(save.unlocked.hexowl).toBe(true);
  expect(save.titles.owned.p_abysslord).toBe(true);
  // a new device: no local record, RESTORE PURCHASES brings it back
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    s.passPlus = {};
    localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
  });
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 600);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(false);
  await openPass(page);
  await tap(page, "RESTORE PURCHASES", 1200);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(true);
  save = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(Object.keys(save.passPlus)).toEqual(["s1"]);
  expect(log.errors).toEqual([]);
});

test("no skin changes the hitbox, speed or score rules (Pass+ skins look 10% smaller)", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const skins = ["", "skin_gold", "skin_neon", "skin_holo", "skin_inferno", "skin_starlight"];
  const owned = Object.fromEntries(skins.filter(Boolean).map((k) => [k, true]));
  const log = await openGame(page, {
    flags: ["god"],
    save: { ...SAVE, cos: { owned, equipped: {} } },
  });
  const results = [];
  for (const skin of skins) {
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
      s.cos.equipped = k ? { skin: k } : {};
      localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
    }, skin);
    await page.reload();
    await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
    await run(page, 800);
    await startRun(page);
    results.push(
      await page.evaluate((k) => {
        const s = window.__glydrift.scene.getScene("Game");
        const p = s.player;
        const before = s.meters;
        for (let i = 0; i < 240; i++) {
          // no near-miss slow-mo while measuring (it depends on the obstacle layout, which a
          // skin's particle randomness can shift): this compares the flying speed itself
          s.slowT = 0;
          s.timeScale = 1;
          s.__t = (s.__t || 1e6) + 1000 / 60;
          s.stepFrame(s.__t, 1000 / 60);
          if (p.y > s.H * 0.55 && p.vy > -50) s.onTap();
        }
        return {
          skin: k,
          radius: p.radius,
          metres: Math.round((s.meters - before) * 100) / 100,
          drawn: Math.abs(p.rig.sprite.scaleX),
        };
      }, skin),
    );
  }
  const base = results[0];
  for (const r of results) {
    expect(r.radius, `${r.skin} hitbox`).toBe(base.radius);
    expect(r.metres, `${r.skin} speed`).toBe(base.metres);
  }
  for (const r of results.filter((x) =>
    ["skin_holo", "skin_inferno", "skin_starlight"].includes(x.skin),
  )) {
    const k = r.drawn / base.drawn;
    expect(k, `${r.skin} drawn size`).toBeGreaterThan(0.84);
    expect(k, `${r.skin} drawn size`).toBeLessThan(0.95);
  }
  // nothing a skin does reaches the score / leaderboard submission
  const src = readFileSync("src/online/leaderboard.js", "utf8");
  expect(src).not.toMatch(/skin|passPlus|PassPlus/);
  expect(log.errors).toEqual([]);
});

const PASS_HEROES = [
  "voidcat",
  "hexowl",
  "wraithmoth",
  "triphound",
  "phantomray",
  "scorpyre",
  "krakkie",
  "crimsonmantis",
  "gloomeleon",
  "umbradrake",
];

test("Drift Pass+ heroes: standard hitbox and speed, drawn ~10% smaller", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"], save: SAVE });
  const results = [];
  for (const id of ["volt", "bunbun", ...PASS_HEROES]) {
    await page.goto(page.url().replace(/&character=[a-z]+/, "") + `&character=${id}`);
    await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
    await run(page, 800);
    await startRun(page);
    results.push(
      await page.evaluate((k) => {
        const s = window.__glydrift.scene.getScene("Game");
        const p = s.player;
        const before = s.meters;
        let frames = new Set();
        for (let i = 0; i < 240; i++) {
          s.slowT = 0;
          s.timeScale = 1;
          s.__t = (s.__t || 1e6) + 1000 / 60;
          s.stepFrame(s.__t, 1000 / 60);
          if (p.y > s.H * 0.55 && p.vy > -50) s.onTap();
          frames.add(p.rig.sprite.frame.name);
        }
        // a new best and a near-miss play their reactions (cosmetic: nothing else changes)
        p.rig.onBest();
        p.rig.onNear();
        for (let i = 0; i < 30; i++) {
          s.__t += 1000 / 60;
          s.stepFrame(s.__t, 1000 / 60);
        }
        return {
          id: k,
          def: p.rig.def.id,
          radius: p.radius,
          metres: Math.round((s.meters - before) * 100) / 100,
          width: p.rig.sprite.displayWidth,
          frames: frames.size,
          alive: s.state === "playing",
        };
      }, id),
    );
  }
  const base = results[0];
  for (const r of results) {
    expect(r.def, "flies as the asked hero").toBe(r.id);
    expect(r.radius, `${r.id} hitbox`).toBe(base.radius);
    expect(r.metres, `${r.id} speed`).toBe(base.metres);
    expect(r.alive, `${r.id} still flying`).toBe(true);
  }
  for (const r of results.filter((x) => PASS_HEROES.includes(x.id))) {
    const k = r.width / base.width;
    expect(k, `${r.id} drawn size`).toBeGreaterThan(0.86);
    expect(k, `${r.id} drawn size`).toBeLessThan(0.94);
    expect(r.frames, `${r.id} animates (idle + flap frames)`).toBeGreaterThanOrEqual(4);
  }
  expect(log.errors).toEqual([]);
});

test("Drift Pass+ heroes come only from the pass track", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...PASS_SAVE, coins: 999999 }, flags: ["mockiap"] });
  // the heroes screen: a DRIFT PASS+ card, no coin price, and buying is refused
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Characters"));
  await waitFor(page, () => window.__glydrift.scene.isActive("Characters"));
  await run(page, 600);
  await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    c.select(c.roster.findIndex((d) => d.id === "umbradrake"));
  });
  await run(page, 800);
  await snap(page, testInfo, "20-pass-hero-card");
  const card = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    const texts = (o) => (o.type === "Text" ? [o.text] : (o.list || []).flatMap(texts));
    return { button: texts(c.actionBtn), badge: c.cards.find((k) => k.def.id === "umbradrake") };
  });
  expect(card.button).toContain("DRIFT PASS+ · TIER 50");
  expect(card.badge).toBeTruthy();
  // tapping it leads to the pass, not a coin purchase
  const coins = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    c.act();
    return JSON.parse(localStorage.getItem("glydrift.save.v1")).coins;
  });
  expect(coins).toBe(999999);
  await waitFor(page, () => window.__glydrift.scene.isActive("Pass"));
  // claim every tier of the paid track: all ten heroes, each at its own tier
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    s.seasons.s1.xp = 450 * 50;
    localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
  });
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 600);
  await openPass(page);
  await tap(page, "GET PASS+ $3.99", 1200);
  await tap(page, "BUY $3.99", 1200);
  const got = await page.evaluate(() => {
    const P = window.__glyPassPlus;
    const out = {};
    P.track().forEach((r, i) => {
      if (r.hero) out[i + 1] = r.hero;
      P.claim(i);
    });
    return out;
  });
  expect(got).toEqual({
    1: "voidcat",
    5: "hexowl",
    10: "wraithmoth",
    15: "triphound",
    20: "phantomray",
    25: "scorpyre",
    30: "krakkie",
    35: "crimsonmantis",
    40: "gloomeleon",
    50: "umbradrake",
  });
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  for (const id of PASS_HEROES) expect(save.unlocked[id], id).toBe(true);
  // the free track and the coin shop never offer them
  const free = await page.evaluate(() =>
    window.__glydrift.scene.getScene("Pass").track.filter((r) => r.hero).map((r) => r.hero),
  );
  for (const id of PASS_HEROES) expect(free).not.toContain(id);
  const src = readFileSync("src/scenes/ShopScene.js", "utf8");
  expect(src).toMatch(/!c\.lottery && !c\.passPlus/);
  expect(readFileSync("src/data/progression.js", "utf8")).toMatch(/def\.passPlus \|\| !cost/);
  expect(log.errors).toEqual([]);
});

test("after logging out: one pop-up at a time, and no free rewards twice", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  // a player who already claimed today's reward and free drop (and has a username)
  const log = await openGame(page, {
    flags: ["mockcloud"],
    save: { ...SAVE, dailyDrop: SAVE.login.claimed, seasons: { s1: { heroSeen: true } } },
  });
  await run(page, 1500);
  await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    if (m.modal) m.closeModal();
  });
  await run(page, 600);
  const claimed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    return { login: s.login.claimed, drop: s.dailyDrop };
  });
  // create an account, then log out: the device becomes a fresh guest
  await openSettingsAccount(page);
  await page.fill("#account-modal input[name=email]", "pilot@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal h2")).toHaveText("ACCOUNT");
  const reloaded = page.waitForEvent("load"); // the old page is already loaded: wait for the new one
  await page.click("#account-modal [data-act=logout]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  // sample the screen for 8 s: never more than one arrival pop-up at once
  const seen = [];
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    await run(page, 200);
    const st = await page.evaluate(() => {
      const m = window.__glydrift.scene.getScene("Menu");
      const name = document.querySelector("#name-modal.open") ? "name" : null;
      const modal = m.modal ? "modal" : null;
      const reveal = m.revealing ? "reveal" : null;
      const chest = m.claiming ? "chest" : null;
      return [name, modal, reveal, chest].filter(Boolean);
    });
    worst = Math.max(worst, st.length);
    for (const k of st) if (seen[seen.length - 1] !== k) seen.push(k);
    if (st.includes("name")) {
      await page.fill("#name-modal input", "GuestPilot");
      await page.click("#name-modal [data-act=save]");
    }
  }
  expect(worst).toBe(1);
  // the name picker came first and the season's NEW HERO reveal after it
  expect(seen[0]).toBe("name");
  expect(seen).toContain("reveal");
  // the fresh guest can't take today's reward, free drop or a starter spin again
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(after.login.claimed).toBe(claimed.login);
  expect(after.dailyDrop).toBe(claimed.drop);
  expect(after.spins).toBe(0);
  expect(after.coins).toBe(0);
  expect(log.errors).toEqual([]);
});

test("flow: the camera shakes only on death and the Abyss entrance; zoom and lead ease", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const cam = s.cameras.main;
    const shakes = [];
    const orig = cam.shake.bind(cam);
    cam.shake = (...a) => {
      shakes.push(Math.round(s.meters));
      return orig(...a);
    };
    let t = 1e6;
    let maxZoomStep = 0;
    let maxLeadStep = 0;
    let lastZ = cam.zoom;
    let lastY = cam.scrollY;
    const z0 = cam.zoom;
    let abyssAt = null;
    while (s.meters < 3000) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      t += 1000 / 60;
      s.stepFrame(t, 1000 / 60);
      if (abyssAt === null && s.inAbyss) abyssAt = Math.round(s.meters);
      maxZoomStep = Math.max(maxZoomStep, Math.abs(cam.zoom - lastZ) / z0);
      maxLeadStep = Math.max(maxLeadStep, Math.abs(cam.scrollY - lastY));
      lastZ = cam.zoom;
      lastY = cam.scrollY;
    }
    return { shakes, abyssAt, zoomOut: 1 - cam.zoom / z0, maxZoomStep, maxLeadStep };
  });
  // the only shake on the way was the Abyss entrance (its title slam lives in the HUD)
  for (const m of out.shakes) expect(Math.abs(m - out.abyssAt), `shake at ${m} m`).toBeLessThan(40);
  // the view widens a little at speed, and never in a visible jump
  expect(out.zoomOut).toBeGreaterThan(0.005);
  expect(out.zoomOut).toBeLessThan(0.035);
  expect(out.maxZoomStep).toBeLessThan(0.002);
  expect(out.maxLeadStep).toBeLessThan(1.5);
  expect(log.errors).toEqual([]);
});

test("micro-polish: hazard hitboxes ~12% inside the art, retry grace, short death slow-mo, no blank load", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  // the loading splash fades out once the home screen has drawn
  await run(page, 600);
  expect(await page.locator("#splash:not(.gone)").count()).toBe(0);
  await startRun(page);
  const v = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const first = s.obstacles.nextX;
    // fly (god-free, steering isn't needed: we only look) until a gate is on screen
    let t = 1e6;
    let gate = null;
    for (let i = 0; i < 2000 && !gate; i++) {
      s.player.y = s.H / 2;
      s.player.vy = 0;
      t += 1000 / 60;
      s.stepFrame(t, 1000 / 60);
      gate = s.obstacles.active.find((o) => o.yt !== undefined && o.w > 0);
    }
    if (!gate) return { first, gate: false };
    // a point 3 px inside the drawn top pillar no longer counts as a hit
    const inside = gate.clearance(gate.x, gate.yt - 3, 0);
    // but 20 px inside still does
    const deep = gate.clearance(gate.x, gate.yt - 20, 0);
    return { first, gate: true, inside, deep };
  });
  expect(v.gate).toBe(true);
  expect(v.inside).toBeGreaterThan(0);
  expect(v.deep).toBeLessThan(0);
  // retry: the first obstacle starts farther away than on a fresh run
  const lead = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    s.resetRun(false);
    const fresh = s.obstacles.nextX;
    s.resetRun(true);
    return s.obstacles.nextX - fresh;
  });
  expect(lead).toBeGreaterThanOrEqual(200);
  // the crash slow-mo is short
  const slow = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    s.startRun?.();
    s.state = "playing";
    s.die();
    return s.slowT;
  });
  expect(slow).toBeGreaterThan(0.2);
  expect(slow).toBeLessThanOrEqual(0.35);
  expect(log.errors).toEqual([]);
});

test("scenery: the Frost Comet always warns first; no pattern twice in a row", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const om = s.obstacles;
    // 1. a comet on its own: its path shows for over a second before it can hurt anyone
    const c = om.obtain("comet");
    c.spawn(s.player.x + 900, { dir: 1, lead: 0.7, span: 280 });
    let t = 1e6;
    let warnT = 0;
    let hurtBeforeFly = false;
    let flew = false;
    for (let i = 0; i < 600 && c.state !== "gone"; i++) {
      t += 1000 / 60;
      s.stepFrame(t, 1000 / 60);
      if (c.state === "warn") warnT += 1 / 60;
      if (c.state !== "fly" && c.clearance(c.x, s.H / 2, 20) !== Infinity) hurtBeforeFly = true;
      if (c.state === "fly") flew = true;
    }
    // 2. a long run: the same pattern never comes twice in a row
    let last = null;
    let repeats = 0;
    let picks = 0;
    const orig = om.spawnPattern.bind(om);
    om.spawnPattern = (m, b) => {
      const n = om.count;
      orig(m, b);
      if (om.count === n) return;
      picks++;
      if (om.lastKind === last) repeats++;
      last = om.lastKind;
    };
    while (s.meters < 2000) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      t += 1000 / 60;
      s.stepFrame(t, 1000 / 60);
    }
    return { warnT, hurtBeforeFly, flew, repeats, picks };
  });
  expect(out.flew).toBe(true);
  expect(out.warnT).toBeGreaterThan(1.0);
  expect(out.hurtBeforeFly).toBe(false);
  expect(out.picks).toBeGreaterThan(40);
  expect(out.repeats).toBe(0);
  expect(log.errors).toEqual([]);
});

test("scenery: the Abyss Eye Beam warns first and never closes the way", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const res = [];
    let t = 1e6;
    for (const top of [true, false]) {
      const e = s.obstacles.obtain("eyebeam");
      e.spawn(s.player.x + 900, { top, L: s.H * 0.4 });
      let warnT = 0;
      let hurtBeforeBeam = false;
      let fired = false;
      let maxExt = 0;
      for (let i = 0; i < 900 && e.state !== "done"; i++) {
        t += 1000 / 60;
        s.stepFrame(t, 1000 / 60);
        if (e.state === "warn") warnT += 1 / 60;
        if (e.state !== "beam" && e.clearance(e.x, top ? 10 : s.H - 10, 10) !== Infinity) hurtBeforeBeam = true;
        if (e.burning) fired = true;
        maxExt = Math.max(maxExt, e.ext);
      }
      res.push({ warnT, hurtBeforeBeam, fired, open: 1 - maxExt / s.H });
    }
    return res;
  });
  for (const r of out) {
    expect(r.fired).toBe(true);
    expect(r.warnT).toBeGreaterThan(1.0);
    expect(r.hurtBeforeBeam).toBe(false);
    expect(r.open).toBeGreaterThanOrEqual(0.59); // the beam leaves most of the screen open
  }
  expect(log.errors).toEqual([]);
});

test("accounts wait for the server to be set up", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["mockcloud"] });
  await page.evaluate(() => localStorage.setItem("glydrift.mockserver.notready", "1"));
  await run(page, 800);
  await page.evaluate(() => {
    window.__glyOpenAccount();
  });
  await expect(page.locator("#account-modal.open")).toBeVisible();
  await page.fill("#account-modal input[name=email]", "early@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal .err")).toHaveText(
    "Accounts open soon — your progress is safe on this device until then.",
  );
  const server = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.mockserver")));
  expect(server?.users?.["early@example.com"]).toBeUndefined();
  expect(log.errors).toEqual([]);
});
