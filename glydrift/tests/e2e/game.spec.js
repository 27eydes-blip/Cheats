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
      if (!["Backdrop", "Menu"].includes(s.sys.settings.key))
        g.scene.stop(s.sys.settings.key);
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
        [...document.querySelectorAll("#side-bg canvas")].filter(
          (c) => c.style.opacity === "1",
        ).length,
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
      contextMenu: fire(
        new MouseEvent("contextmenu", { cancelable: true, bubbles: true }),
      ),
      dblclick: fire(
        new MouseEvent("dblclick", { cancelable: true, bubbles: true }),
      ),
    };
    try {
      out.touchMove = fire(
        new TouchEvent("touchmove", { cancelable: true, bubbles: true }),
      );
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

  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").openSettings(),
  );
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
    if (key === "Characters" || key === "Shop")
      await matchScreenshot(page, `${shot.slice(3)}.png`); // snap() just drew a fresh frame
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

test("pause and resume (button, keys, app in background)", async ({
  page,
}, testInfo) => {
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const paused = () =>
    page.evaluate(() => !!window.__glydrift.scene.getScene("Hud").pauseLayer);
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
  await waitFor(
    page,
    () => window.__glydrift.scene.isActive("GameOver"),
    30_000,
  );
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
    const priceOf = (c) =>
      c.cta?.list?.find((o) => o.type === "Text" && /^\d+$/.test(o.text));
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
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.save.v1")),
  );
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

test("resize, rotation and Split View keep the run going", async ({
  page,
}, testInfo) => {
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
    const ext =
      window.__glydrift.renderer.gl?.getExtension("WEBGL_lose_context");
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

test("runs in private browsing (no storage) and says progress won't save", async ({
  page,
}) => {
  const log = await openGame(page, { noStorage: true, save: null });
  // first launch: the name prompt may open; dismiss it
  await page.evaluate(() =>
    document.querySelector('#name-modal [data-act="cancel"]')?.click(),
  );
  await run(page, 800);
  await expect(page.locator("#storage-note")).toBeVisible();
  expect(log.errors).toEqual([]);
});

test("same game speed at 30, 60 and 120 Hz", async ({ page }, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "laptop",
    "engine-level check: once per browser",
  );
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

test("a very long run stays smooth and doesn't pile up objects", async ({
  page,
}, testInfo) => {
  // Players reported the game "collapsing" on high-score runs. Two causes, both fixed:
  // registering each realm's art read its pixels back (getImageData) and froze the game for
  // seconds at every realm boundary, and at high speed magnetised coins got stuck orbiting
  // behind the bird forever. Fly ~10 km (every realm and dimension) and check for both.
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  const files = readdirSync("src", { recursive: true }).filter((f) =>
    f.endsWith(".js"),
  );
  const bad = files.filter((f) =>
    readFileSync(`src/${f}`, "utf8").includes("textures.addCanvas("),
  );
  expect(bad).toEqual([]);
});

test("centre pop-ups never pile up", async ({ page }, testInfo) => {
  // A realm change lands on a milestone (both at 500 m / 1000 m) and NEW BEST and SPEED UP
  // can fire in the same moment: only one centre pop-up shows at a time, realm title first,
  // then NEW BEST, then SPEED UP; a distance marker that would be stale is skipped.
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
    expect(
      now.length,
      `centre pop-ups at ${i * 100} ms: ${now}`,
    ).toBeLessThanOrEqual(1);
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
    const toWorld = (hy) =>
      ((hy - hc.worldView.y) * hc.zoom) / gc.zoom + gc.worldView.y;
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

test("home shows at most two '!' badges, free rewards first", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  // daily run unplayed, free drop ready, a spin to use and the login reward unclaimed: four
  // things ready, only the two free rewards get a badge
  const log = await openGame(page, {
    save: {
      ...SAVE,
      login: { last: "2026-11-03", streak: 3, claimed: "2026-11-03" },
    },
  });
  const badged = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    const labels = [];
    for (const c of m.children.list) {
      if (c.type !== "Container") continue;
      const bang = c.list.some(
        (o) =>
          o.type === "Container" &&
          o.list.some((x) => x.type === "Text" && x.text === "!"),
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  // an old save holding 105 spins (spins used to be uncapped) shows 3
  const log = await openGame(page, { save: { ...SAVE, spins: 105 } });
  const shows = (txt) =>
    page.evaluate(
      (t) =>
        window.__glydrift.scene
          .getScene("Menu")
          .children.list.some(
            (c) =>
              c.type === "Container" &&
              c.list.some((x) => x.type === "Text" && x.text === t),
          ),
      txt,
    );
  expect(await shows("3 spins ready")).toBe(true);
  expect(log.errors).toEqual([]);
});

test("a huge run earns one spin, not dozens", async ({ page }, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, {
    save: { ...SAVE, spins: 1, spinPts: 0 },
    flags: ["god"],
  });
  await startRun(page);
  await page.evaluate(() => {
    window.__glydrift.scene.getScene("Game").bonus = 100000; // 40 spins' worth of points
    window.__glyGod(false);
  });
  for (
    let i = 0;
    i < 60 &&
    !(await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")));
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const om = s.obstacles;
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
    const stretches = [];
    let empty = null;
    while (s.meters < 3600) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
      const seg = s.course.segAt(s.meters);
      if (seg.id !== last) {
        bounds.push({ m: seg.start, id: seg.id });
        last = seg.id;
      }
      const preCalm =
        seg.id === "glitch" && s.meters - seg.start > seg.length - 185;
      const designed =
        s.calm || preCalm || s.blackoutT > 0 || seg.id === "abyss";
      if (om.info.pause && !designed) pauses++;
      // slow-mo that no near-miss caused (realm entry used to add a slow-mo beat)
      if (s.slowT > prevSlow + 0.01 && near === prevNear) slowJumps++;
      prevSlow = s.slowT;
      prevNear = near;
      // an empty stretch: no obstacle on screen ahead of the hero (a long pattern is not a wait)
      const ahead = om.active.some(
        (o) => o.kind !== "portal" && o.right > s.player.x && o.left < s.W,
      );
      if (!ahead) {
        if (!empty) empty = { m0: s.meters, t: 0 };
        empty.t += 1 / 60;
      } else if (empty) {
        stretches.push({ m0: empty.m0, m1: s.meters, t: empty.t });
        empty = null;
      }
    }
    // the longest stretch with nothing on screen ahead, around each boundary (bar the Abyss entry)
    const byBound = (st, b) => st.m1 > b.m - 60 && st.m0 < b.m + 90;
    const around = bounds
      .filter((b) => b.m > 0 && b.id !== "abyss")
      .map((b) => {
        let worst = 0;
        for (const st of stretches)
          if (byBound(st, b)) worst = Math.max(worst, st.t);
        return { id: b.id, worst: +worst.toFixed(2) };
      });
    // the run's normal empty stretches away from any boundary (early on, at low speed, these are long)
    const abyss = bounds.find((b) => b.id === "abyss")?.m ?? Infinity;
    let normal = 0;
    for (const st of stretches)
      if (
        !bounds.some((b) => b.m > 0 && byBound(st, b)) &&
        (st.m1 < abyss || st.m0 > abyss + 600)
      )
        normal = Math.max(normal, st.t);
    return { pauses, slowJumps, around, normal, ids: bounds.map((b) => b.id) };
  });
  expect(out.ids).toEqual(
    expect.arrayContaining(["solar", "frozen", "glitch", "hurricane"]),
  );
  expect(out.ids.length).toBeGreaterThanOrEqual(8); // into at least one dimension
  expect(out.pauses).toBe(0);
  expect(out.slowJumps).toBe(0);
  // no longer wait for an obstacle at a boundary than the run's usual longest gap
  const limit = Math.max(3.5, out.normal * 1.1);
  for (const b of out.around)
    expect(
      b.worst,
      `obstacle gap entering ${b.id} (normal ${out.normal})`,
    ).toBeLessThan(limit);
  // the title is drawn small and high, over the play
  const title = await page.evaluate(() => {
    const h = window.__glydrift.scene.getScene("Hud");
    h.pops.clear();
    h.onBiome(2);
    return { y: h.bannerY / h.H, scale: h.banner.scale };
  });
  await run(page, 800);
  const settled = await page.evaluate(
    () => window.__glydrift.scene.getScene("Hud").banner.scale,
  );
  expect(title.y).toBeLessThan(0.32);
  expect(settled).toBeLessThan(0.75);
  expect(log.errors).toEqual([]);
});

test("two leaderboards: score (the main one) and distance", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, { flags: ["lbmock"] });
  await tap(page, "LEADERBOARD", 1600);
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  const view = () =>
    page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Leaderboard");
      const texts = (c) =>
        c.list.flatMap((o) =>
          o.type === "Text" ? [o.text] : o.list ? texts(o) : [],
        );
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
  // Score is the main board: first, and where the leaderboard opens
  expect(v.tabs).toEqual([
    "SCORE",
    "DISTANCE",
    expect.stringMatching(/^DAILY #\d+$/),
  ]);
  expect(v.tab).toBe("score");
  expect(v.filters).toEqual(["ALL TIME", "THIS WEEK", "TODAY"]);
  expect(v.rows.some((t) => / m$/.test(t))).toBe(false);
  expect(v.rows.some((t) => /^\d{1,3}(,\d{3})+$/.test(t))).toBe(true); // 12,345
  expect(v.you).toEqual(expect.arrayContaining(["#12", "YOUR BEST"]));
  // the chase: how far to the next place up
  expect(v.you.some((t) => /^\+[\d,]+ to pass .+ \(#11\)$/.test(t))).toBe(true);
  await snap(page, testInfo, "13-leaderboard-score");
  await tap(page, "DISTANCE", 1200);
  v = await view();
  expect(v.tab).toBe("distance");
  expect(v.filters).toEqual(["ALL TIME", "THIS WEEK", "TODAY"]);
  expect(v.rows.some((t) => /^[\d,]+ m$/.test(t))).toBe(true); // metres on the distance board
  expect(v.you).toEqual(expect.arrayContaining(["#12", "YOUR FARTHEST"])); // own rank pinned
  await snap(page, testInfo, "14-leaderboard-distance");
  // impossible distances for the run time are rejected before upload
  const plausible = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    return {
      real: isPlausible({ score: 3000, distance: 1700, run_time_ms: 80_000 }),
      teleport: isPlausible({
        score: 3000,
        distance: 9000,
        run_time_ms: 20_000,
      }),
    };
  });
  expect(plausible).toEqual({ real: true, teleport: false });
  expect(log.errors).toEqual([]);
});

test("game over shows the score and distance placements (score first)", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  expect(msg).toMatch(/^You placed #\d+ in Score · #\d+ in Distance$/);
  expect(log.errors).toEqual([]);
});

// ---- accounts + cloud save (a local stand-in server: ?mockcloud) ----
async function openSettingsAccount(page) {
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").openSettings(),
  );
  await run(page, 600);
  // "ACCOUNT · SAVE YOUR PROGRESS" for a guest, "ACCOUNT: <email>" when signed in
  const label = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    const texts = (c) =>
      c.list.flatMap((o) => (o.type === "Text" ? [o] : o.list ? texts(o) : []));
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
const saveNow = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));

test("accounts: create, log out, sign in on a new device, delete", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, {
    flags: ["mockcloud"],
    save: {
      ...SAVE,
      coins: 4321,
      unlocked: { volt: true, ember: true, frost: true },
    },
  });
  await run(page, 800); // the account service starts in the background
  // 1. a guest creates an account: their progress is linked to it, nothing lost
  await openSettingsAccount(page);
  await snap(page, testInfo, "15-account-create");
  await page.fill("#account-modal input[name=email]", "pilot@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal h2")).toHaveText("ACCOUNT");
  await expect(page.locator("#account-modal .who")).toHaveText(
    "pilot@example.com",
  );
  let server = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.mockserver")),
  );
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
  await expect(page.locator("#account-modal .err")).toHaveText(
    "Wrong email or password.",
  );
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  reloaded = page.waitForEvent("load");
  await page.click("#account-modal button[type=submit]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  let s = await saveNow(page);
  expect(s.coins).toBe(4321);
  expect(s.unlocked).toEqual(
    expect.objectContaining({ ember: true, frost: true }),
  );
  // 4. delete the account: gone from the server and from this device
  await openAccountScreen(page);
  await page.click("#account-modal [data-act=to-delete]");
  await page.fill("#account-modal input[name=confirm]", "nope");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal .err")).toHaveText(
    "Type DELETE to confirm.",
  );
  await page.fill("#account-modal input[name=confirm]", "DELETE");
  reloaded = page.waitForEvent("load");
  await page.click("#account-modal button[type=submit]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  server = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.mockserver")),
  );
  expect(server.users["pilot@example.com"]).toBeUndefined();
  s = await saveNow(page);
  expect(s.coins).toBe(0);
  expect(log.errors).toEqual([]);
});

test("cloud save merge keeps the most progress", async ({ page }, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  expect(owned).toEqual({
    daredevil: true,
    gold: true,
    diamond: false,
    plusWear: false,
  });
  // wear one through the Titles screen (Progress → TITLES)
  await tap(page, "PROGRESS", 1200);
  await waitFor(page, () => window.__glydrift.scene.isActive("Progress"));
  await tap(page, "TITLES", 1200);
  await waitFor(page, () => window.__glydrift.scene.isActive("Titles"));
  await run(page, 600);
  await tap(page, "GOLD LEAGUE", 600);
  expect(await page.evaluate(() => window.__glyTitles.equippedId())).toBe(
    "t_gold",
  );
  await snap(page, testInfo, "17-titles");
  // under your name on the leaderboard (pinned row)…
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Titles").scene.start("Leaderboard"),
  );
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 1200);
  const you = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    const texts = (c) =>
      c.list.flatMap((o) =>
        o.type === "Text" ? [o.text] : o.list ? texts(o) : [],
      );
    return texts(s.you);
  });
  expect(you).toContain("GOLD LEAGUE");
  // …and on the game over screen
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Leaderboard").scene.start("Menu"),
  );
  await waitFor(page, () => window.__glydrift.scene.isActive("Menu"));
  await run(page, 1000);
  await startRun(page);
  await page.evaluate(() => window.__glyGod(false));
  for (
    let i = 0;
    i < 60 &&
    !(await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")));
    i++
  )
    await run(page, 250);
  await run(page, 600);
  const go = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("GameOver");
    const texts = (c) =>
      c.list.flatMap((o) =>
        o.type === "Text" ? [o.text] : o.list ? texts(o) : [],
      );
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
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.start("Pass"),
  );
  await waitFor(page, () => window.__glydrift.scene.isActive("Pass"));
  await run(page, 800);
};

test("Drift Pass+ on the web: buy it in the iPhone app", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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

test("Drift Pass+: buy, claim, restore on a new device", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  await page.evaluate(() =>
    localStorage.setItem("glydrift.mockstore.fail", "1"),
  );
  await tap(page, "BUY $3.99", 800);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(false);
  await page.evaluate(() => localStorage.removeItem("glydrift.mockstore.fail"));
  // a verified purchase unlocks the track (and closes the screen)
  await tap(page, "BUY $3.99", 1200);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(true);
  expect(
    await page.evaluate(() => !!window.__glydrift.scene.getScene("Pass").offer),
  ).toBe(false);
  const after = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    return {
      buy: !!s.buyBtn,
      t5: s.rows[4].plusState,
      t15: s.rows[14].plusState,
    };
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
  let save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.save.v1")),
  );
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
  save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.save.v1")),
  );
  expect(Object.keys(save.passPlus)).toEqual(["s1"]);
  expect(log.errors).toEqual([]);
});

test("no skin changes the hitbox, speed or score rules (Pass+ skins look 10% smaller)", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const skins = [
    "",
    "skin_gold",
    "skin_neon",
    "skin_holo",
    "skin_inferno",
    "skin_starlight",
  ];
  const owned = Object.fromEntries(skins.filter(Boolean).map((k) => [k, true]));
  const log = await openGame(page, {
    flags: ["god"],
    // (Pass+ skins only count with a verified Drift Pass+ purchase)
    save: {
      ...SAVE,
      cos: { owned, equipped: {} },
      passPlus: { s1: { verified: true, tx: "t" } },
    },
  });
  const results = [];
  for (const skin of skins) {
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
      s.cos.equipped = k ? { skin: k } : {};
      localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
    }, skin);
    await page.reload();
    await waitFor(
      page,
      () => window.__glydrift?.scene.isActive("Menu"),
      30_000,
    );
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
  "riftling",
  "riftling_armor",
  "riftling_aura",
  "riftsovereign",
];

test("Drift Pass+ heroes: standard hitbox and speed, drawn ~10% smaller", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"], save: SAVE });
  const results = [];
  for (const id of ["volt", "bunbun", ...PASS_HEROES]) {
    await page.goto(
      page.url().replace(/&character=[a-z_]+/, "") + `&character=${id}`,
    );
    await waitFor(
      page,
      () => window.__glydrift?.scene.isActive("Menu"),
      30_000,
    );
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
    expect(
      r.frames,
      `${r.id} animates (idle + flap frames)`,
    ).toBeGreaterThanOrEqual(4);
  }
  expect(log.errors).toEqual([]);
});

test("Drift Pass+ heroes come only from the pass track", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, {
    save: { ...PASS_SAVE, coins: 999999 },
    flags: ["mockiap"],
  });
  // the heroes screen: a DRIFT PASS+ card, no coin price, and buying is refused
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.start("Characters"),
  );
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
    const texts = (o) =>
      o.type === "Text" ? [o.text] : (o.list || []).flatMap(texts);
    return {
      button: texts(c.actionBtn),
      badge: c.cards.find((k) => k.def.id === "umbradrake"),
    };
  });
  expect(card.button).toContain("DRIFT PASS+ · TIER 46");
  expect(card.badge).toBeTruthy();
  // tapping it leads to the pass, not a coin purchase
  const coins = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    c.act();
    return JSON.parse(localStorage.getItem("glydrift.save.v1")).coins;
  });
  expect(coins).toBe(999999);
  await waitFor(page, () => window.__glydrift.scene.isActive("Pass"));
  // claim every tier of the paid track: every pass hero, each at its own tier
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
  // (layout 2: Riftling's four forms at 1 / 15 / 30 / 50; four heroes moved over by a tier or a few)
  expect(got).toEqual({
    1: "riftling",
    2: "voidcat",
    5: "hexowl",
    10: "wraithmoth",
    15: "riftling_armor",
    16: "triphound",
    20: "phantomray",
    25: "scorpyre",
    30: "riftling_aura",
    31: "krakkie",
    35: "crimsonmantis",
    40: "gloomeleon",
    46: "umbradrake",
    50: "riftsovereign",
  });
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.save.v1")),
  );
  for (const id of PASS_HEROES) expect(save.unlocked[id], id).toBe(true);
  // the free track and the coin shop never offer them
  const free = await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Pass")
      .track.filter((r) => r.hero)
      .map((r) => r.hero),
  );
  for (const id of PASS_HEROES) expect(free).not.toContain(id);
  const src = readFileSync("src/scenes/ShopScene.js", "utf8");
  expect(src).toMatch(/!c\.lottery && !c\.passPlus/);
  expect(readFileSync("src/data/progression.js", "utf8")).toMatch(
    /def\.passPlus \|\| !cost/,
  );
  expect(log.errors).toEqual([]);
});

const S1_PLUS_NEW = [
  "trail_pp_galaxydust",
  "trail_pp_lightning",
  "trail_pp_comboflame",
  "death_pp_fireworks",
  "death_pp_melt",
  "death_pp_shatter",
  "pose_pp_power",
  "pose_pp_spinflip",
  "pose_pp_aura",
  "theme_pp_abyss",
  "name_pp_gold",
  "badge_pp_s1",
];
const S1_PLUS_TITLES = [
  "p_riftdiver",
  "p_abysswalker",
  "p_voidtouched",
  "p_s1founder",
];

test("Season 1 Drift Pass+ rewards: placed on the track, exclusive, cosmetic, server-gated", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  const log = await openGame(page, { save: PASS_SAVE });
  // 1. the track: Riftling evolves at 1 / 15 / 30 / 50; the best is saved for the end; every
  //    new reward appears exactly once; something new at least every 3 tiers
  const track = await page.evaluate(() =>
    window.__glyPlusS1.plusTrackS1({ banner: "crimson" }),
  );
  expect(track).toHaveLength(50);
  expect([1, 15, 30, 50].map((t) => track[t - 1].hero)).toEqual([
    "riftling",
    "riftling_armor",
    "riftling_aura",
    "riftsovereign",
  ]);
  expect(track[47].item).toBe("name_pp_gold");
  expect(track[48].item).toBe("badge_pp_s1");
  const ids = track.map((r) => r.item || r.title || r.hero).filter(Boolean);
  for (const id of [...S1_PLUS_NEW, ...S1_PLUS_TITLES])
    expect(
      ids.filter((x) => x === id),
      id,
    ).toHaveLength(1);
  let gap = 0;
  let worst = 0;
  for (const r of track) {
    gap = r.item || r.title || r.hero || r.banner ? 0 : gap + 1;
    worst = Math.max(worst, gap);
  }
  expect(
    worst,
    "tiers in a row with only coins / shards / pods",
  ).toBeLessThanOrEqual(2);
  // the live (sanitised) season uses exactly this track, whatever a remote config says
  const live = await page.evaluate(() =>
    window.__glyPassPlus
      .track()
      .map((r) => r.item || r.title || r.hero || null),
  );
  expect(live).toEqual(track.map((r) => r.item || r.title || r.hero || null));

  // 2. exclusive: never for sale, never in the daily shop or a pod; the shop never lists them
  const shop = await page.evaluate((ids) => {
    const { COSMETICS, forSale, Shop } = window.__glyShop;
    const sale = ids.filter((id) =>
      forSale(COSMETICS.find((c) => c.id === id)),
    );
    let daily = [];
    for (let d = 1; d <= 60; d++)
      daily.push(
        ...Shop.daily(`2026-12-${String((d % 28) + 1).padStart(2, "0")}-${d}`)
          .items,
      );
    daily = daily.filter((id) => ids.includes(id));
    const pods = [];
    for (let k = 0; k < 400; k++) {
      const it = Shop.openPod({ free: true })?.item?.id;
      if (ids.includes(it)) pods.push(it);
    }
    const bought = ids.filter((id) => Shop.buy(id)); // price 0, but never buyable
    return { sale, daily, pods, bought };
  }, S1_PLUS_NEW);
  expect(shop).toEqual({ sale: [], daily: [], pods: [], bought: [] });
  expect(readFileSync("src/scenes/ShopScene.js", "utf8")).toMatch(
    /!c\.plus &&/,
  );
  expect(readFileSync("src/data/progression.js", "utf8")).not.toMatch(/pp_/); // not in the Lucky Spin

  // 3. owned without a verified purchase (e.g. typed into local storage): nothing counts
  const tamper = async (verified) => {
    await page.evaluate(
      ({ items, titles, verified }) => {
        const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
        s.cos.owned = Object.fromEntries(items.map((id) => [id, true]));
        s.cos.equipped = {
          trail: "trail_pp_lightning",
          pose: "pose_pp_aura",
          name: "name_pp_gold",
          badge: "badge_pp_s1",
          theme: "theme_pp_abyss",
        };
        s.titles = {
          owned: Object.fromEntries(titles.map((id) => [id, true])),
          equipped: "p_s1founder",
        };
        s.unlocked.riftsovereign = true;
        s.selected = "riftsovereign";
        s.passPlus = verified ? { s1: { verified: true, tx: "t" } } : {};
        localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
      },
      { items: S1_PLUS_NEW, titles: S1_PLUS_TITLES, verified },
    );
    await page.reload();
    await waitFor(
      page,
      () => window.__glydrift?.scene.isActive("Menu"),
      30_000,
    );
    await run(page, 600);
    return page.evaluate(() => {
      const { Shop } = window.__glyShop;
      const P = window.__glyPlusS1;
      return {
        owns: Shop.owns("trail_pp_lightning"),
        loadout: Object.keys(Shop.loadout()).sort().join(","),
        title: window.__glyTitles.equippedId(),
        hero: P.heroUsable("riftsovereign"),
        flies: P.selectedHero(),
        flair: window.__glyLb.Leaderboard.extraColumns({}).flair,
      };
    });
  };
  expect(await tamper(false)).toEqual({
    owns: false,
    loadout: "",
    title: null,
    hero: false,
    flies: "volt",
    flair: null,
  });
  expect(await tamper(true)).toEqual({
    owns: true,
    loadout: "badge,name,pose,theme,trail",
    title: "p_s1founder",
    hero: true,
    flies: "riftsovereign",
    flair: "gold,s1",
  });
  // ...and the server strips them too: the migration ties title, hero and flair to a purchase
  const sql = readFileSync(
    "supabase/migrations/20261106000001_pass_plus_s1_rewards.sql",
    "utf8",
  );
  for (const id of [
    "riftling",
    "riftling_armor",
    "riftling_aura",
    "riftsovereign",
    "umbradrake",
  ])
    expect(sql).toContain(`'${id}'`);
  expect(sql).toMatch(/new\.flair := null/);
  expect(sql).toMatch(/new\.character := 'volt'/);

  // 4. claims made on the launch layout move with their rewards
  const moved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    s.seasons.s1.plusClaimed = {
      0: true,
      2: true,
      5: true,
      8: true,
      14: true,
      49: true,
    };
    delete s.seasons.s1.plusLayout;
    localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
    return true;
  });
  expect(moved).toBe(true);
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  const claims = await page.evaluate(() => {
    const rec = window.__glyPlusS1.record("s1");
    return {
      layout: rec.plusLayout,
      claimed: Object.keys(rec.plusClaimed)
        .map(Number)
        .sort((a, b) => a - b),
    };
  });
  // voidcat 1→2, holo stays 3, a coins tier that's now Galaxy Dust (6) opens up, coins tier 9
  // stays, triphound 15→16, umbradrake 50→46
  expect(claims).toEqual({ layout: 2, claimed: [1, 2, 8, 15, 45] });

  // 5. the Drift Pass screen: tap a locked Pass+ reward to preview it
  await openPass(page);
  const opened = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    return s.previewTier(49, true) && !!window.__glyPreview && s.busy;
  });
  expect(opened).toBe(true);
  await run(page, 1200);
  await snap(page, testInfo, "21-pass-plus-preview");
  expect(log.errors).toEqual([]);
});

test("SXE: +25% speed with the standard hitbox, falcon moves, speed badge, perch showcase", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  // 1. the same 240 frames from the same start: SPLICE covers ~25% more ground, same hitbox
  const fly = async (id) => {
    await page.goto(
      page.url().replace(/&character=[a-z_]+/, "") + `&character=${id}`,
    );
    await waitFor(
      page,
      () => window.__glydrift?.scene.isActive("Menu"),
      30_000,
    );
    await run(page, 800);
    await startRun(page);
    return page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      const p = s.player;
      const before = s.meters;
      const frames = new Set();
      for (let i = 0; i < 240; i++) {
        s.slowT = 0; // (no near-miss slow-mo: compare pure flight)
        s.timeScale = 1;
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
        if (p.y > s.H * 0.55 && p.vy > -50) s.onTap();
        frames.add(p.rig.sprite.frame.name);
      }
      return {
        radius: p.radius,
        metres: s.meters - before,
        frames: [...frames],
        speed: s.charDef.speed ?? 1,
        ratio: s.speed / (s.speedMul * (s.charDef.speed ?? 1)),
      };
    });
  };
  const log = await openGame(page, { flags: ["god"], save: SAVE });
  const volt = await fly("volt");
  const splice = await fly("splice");
  expect(splice.radius).toBe(volt.radius);
  expect(splice.speed).toBe(1.25);
  expect(splice.metres / volt.metres).toBeGreaterThan(1.2);
  expect(splice.metres / volt.metres).toBeLessThan(1.32);
  // flaps (wings up, driven down), the dive tuck between flaps
  for (const f of ["splice_1", "splice_2", "splice_3"])
    expect(splice.frames, f).toContain(f);
  // 2. near-miss: a barrel roll (the drawing flips over); new best: screech + sonic boom
  const moves = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const r = s.player.rig;
    const step = (n) => {
      for (let i = 0; i < n; i++) {
        s.__t += 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    };
    r.onNear();
    let flipped = false;
    for (let i = 0; i < 24; i++) {
      step(1);
      if (r.sprite.scaleY < 0) flipped = true;
    }
    r.onBest();
    step(3);
    const screech = r.sprite.frame.name;
    // the run ends: he tumbles away, still drawn, then disappears
    window.__glyGod(false);
    let tumbling = false;
    for (let i = 0; i < 60 * 30 && !r.dead; i++) step(1);
    step(20);
    tumbling = r.falcon.dieT > 0 && r.sprite.visible;
    step(90);
    const gone = !r.sprite.visible;
    const dead = r.dead;
    // the next run (retry): he's back and stays visible (the tumble doesn't carry over)
    r.reset(200, 300);
    for (let i = 0; i < 120; i++) r.update(1 / 60, 300);
    return {
      flipped,
      screech,
      dead,
      tumbling,
      gone,
      back: r.sprite.visible && r.falcon.dieT < 0,
    };
  });
  expect(moves).toEqual({
    back: true,
    flipped: true,
    screech: "splice_7",
    dead: true,
    tumbling: true,
    gone: true,
  });
  // 3. shop + unlock: Legendary, 50,000 coins or "Reach 2,000m in one run"
  const def = await page.evaluate(() => {
    const d = window.__heroDefs.find((c) => c.id === "splice");
    return {
      name: d.name,
      rarity: d.rarity,
      cost: d.cost,
      ch: d.challenge,
      perks: d.perks.list,
      desc: d.desc,
    };
  });
  expect(def).toEqual({
    name: "SXE",
    rarity: "legendary",
    cost: 50000,
    ch: { stat: "maxDistance", value: 2000, text: "Reach 2,000m in one run" },
    perks: [
      "+25% SPEED",
      "INDESTRUCTIBLE IN THE GLITCH REALM",
      "COMBO UP TO x13",
    ],
    desc: "Fastest thing in the sky.",
  });
  // 4. the leaderboard marks faster heroes' runs with a speed badge
  await page.goto(page.url().replace(/&character=[a-z_]+/, "") + "&lbmock");
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Menu")
      .scene.start("Leaderboard", { tab: "score" }),
  );
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 2500);
  const badges = await page.evaluate(() => {
    const lb = window.__glydrift.scene.getScene("Leaderboard");
    const all = [...lb.children.list, ...(lb.list?.list || [])].flatMap((o) =>
      o.list ? [o, ...o.list] : [o],
    );
    return all.filter((o) => o.name === "speedBadge").length;
  });
  expect(badges).toBeGreaterThan(0); // RONIN rows on the sample board (+10%)
  // 5. character select: he lands on a perch, ruffles, looks back, launches
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    s.unlocked.splice = true;
    s.selected = "splice";
    localStorage.setItem("glydrift.save.v1", JSON.stringify(s));
  });
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.start("Characters"),
  );
  await waitFor(page, () => window.__glydrift.scene.isActive("Characters"));
  await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    c.select(c.roster.findIndex((d) => d.id === "splice"));
  });
  const poses = new Set();
  for (let i = 0; i < 90; i++) {
    await run(page, 100);
    poses.add(
      await page.evaluate(() => {
        const f = window.__glydrift.scene.getScene("Characters").rig.falcon;
        return f.phase === "perched"
          ? `${f.phase}${f.perchPose}${f.perch.visible ? "+perch" : ""}`
          : f.phase;
      }),
    );
  }
  for (const p of [
    "land",
    "perched4+perch",
    "perched5+perch",
    "perched6+perch",
    "fly",
  ])
    expect([...poses], p).toContain(p);
  await snap(page, testInfo, "22-splice-showcase");
  expect(log.errors).toEqual([]);
});

test("after logging out: one pop-up at a time, and no free rewards twice", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(180_000);
  // a player who already claimed today's reward and free drop (and has a username)
  const log = await openGame(page, {
    flags: ["mockcloud"],
    save: {
      ...SAVE,
      dailyDrop: SAVE.login.claimed,
      seasons: { s1: { heroSeen: true } },
    },
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
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.save.v1")),
  );
  expect(after.login.claimed).toBe(claimed.login);
  expect(after.dailyDrop).toBe(claimed.drop);
  expect(after.spins).toBe(0);
  expect(after.coins).toBe(0);
  expect(log.errors).toEqual([]);
});

test("flow: the camera shakes only on death and the Abyss entrance; zoom and lead ease", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
    return {
      shakes,
      abyssAt,
      zoomOut: 1 - cam.zoom / z0,
      maxZoomStep,
      maxLeadStep,
    };
  });
  // the only shake on the way was the Abyss entrance (its title slam lives in the HUD)
  for (const m of out.shakes)
    expect(Math.abs(m - out.abyssAt), `shake at ${m} m`).toBeLessThan(40);
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
      if (c.state !== "fly" && c.clearance(c.x, s.H / 2, 20) !== Infinity)
        hurtBeforeFly = true;
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
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
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
        if (
          e.state !== "beam" &&
          e.clearance(e.x, top ? 10 : s.H - 10, 10) !== Infinity
        )
          hurtBeforeBeam = true;
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

test("SXE: indestructible in the Glitch Realm, and only there; combo up to x13", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  // Fly (god mode) into the Glitch Realm, then let go: no flaps at all, real collisions.
  const glitchRun = async (id) => {
    await openGame(page, { flags: ["god", `character=${id}`] });
    await startRun(page);
    return page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      let t = 1e6;
      const step = () => {
        t += 1000 / 60;
        s.stepFrame(t, 1000 / 60);
      };
      // combo: SXE climbs to x13 (22 in a row), everyone else stops at x10
      const steps = [];
      for (let i = 0; i < 30; i++) {
        s.addChain();
        if (steps.at(-1) !== s.mult) steps.push(s.mult);
      }
      const comboLabel = s.comboMeter.labels[s.mult]?.visible;
      s.chain = 0;
      s.mult = 1;
      s.comboMeter.setTier(1);
      let start = 0;
      let end = 0;
      for (let m = 0; m < 20000; m += 10)
        if (s.course.segAt(m).id === "glitch") {
          const seg = s.course.segAt(m);
          start = seg.start;
          end = seg.end;
          break;
        }
      window.__glyGod(true);
      while (s.meters < start + 40) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        step();
      }
      window.__glyGod(false);
      const out = {
        alive: 0,
        phased: 0,
        minY: Infinity,
        maxY: -Infinity,
        diedIn: null,
        end,
        steps,
        comboLabel,
      };
      const blocks0 = s.run.wardBlocks || 0;
      // 20 s with no input (or until the realm ends)
      for (
        let i = 0;
        i < 60 * 20 && s.state === "playing" && s.zoneId === "glitch";
        i++
      ) {
        step();
        out.alive++;
        out.minY = Math.min(out.minY, s.player.y);
        out.maxY = Math.max(out.maxY, s.player.y);
      }
      out.phased = (s.run.wardBlocks || 0) - blocks0;
      out.playing = s.state === "playing";
      out.H = s.H;
      out.r = s.player.radius;
      // after the realm: mortal again (still no flaps, so he falls off the bottom)
      if (s.state === "playing") {
        window.__glyGod(true);
        while (s.zoneId === "glitch") step();
        window.__glyGod(false);
        for (let i = 0; i < 60 * 10 && s.state === "playing"; i++) step();
        out.diedIn = s.state === "playing" ? null : s.run.killedIn;
      }
      window.__glyGod(true);
      return out;
    });
  };
  const sxe = await glitchRun("splice");
  expect(sxe.steps).toEqual([1, 2, 3, 5, 10, 13]); // SXE's combo goes to x13
  expect(sxe.comboLabel).toBe(true);
  expect(sxe.playing).toBe(true); // 20 s without a flap and he's still flying
  expect(sxe.alive).toBeGreaterThan(60 * 5);
  expect(sxe.phased).toBeGreaterThan(0); // he flew through hazards
  expect(sxe.maxY).toBeLessThan(sxe.H - sxe.r / 2); // held on screen, not off the bottom
  expect(sxe.diedIn).not.toBeNull(); // outside the realm a fall ends the run again
  expect(sxe.diedIn).not.toBe("glitch");
  // control: VOLT in the same spot dies without flapping
  const volt = await glitchRun("volt");
  expect(volt.playing).toBe(false);
  expect(volt.steps).toEqual([1, 2, 3, 5, 10]); // everyone else still stops at x10
});

test("SXE Afterburner: twin jet flames, flare, vapour, sonic boom, sputter; SXE only", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["god", "character=splice"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const r = s.player.rig;
    const f = r.falcon;
    let t = 1e6;
    const step = (n) => {
      for (let i = 0; i < n; i++) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        t += 1000 / 60;
        s.stepFrame(t, 1000 / 60);
      }
    };
    step(90);
    const res = {
      burner: f.burner,
      flames: r.trailG.commandBuffer.length > 40, // flames + contrails drawn
    };
    // flap: the burners flare, then settle
    s.onTap();
    res.flare = f.flareT > 0.3;
    step(30);
    res.settled = f.flareT === 0;
    // speed: the trail gets longer at top speed
    const slowTrail = r.trailTime;
    f.speedK = 1;
    f.update(1 / 60, 900);
    res.longer = r.trailTime > slowTrail * 1.4;
    // near-miss: wing-tip vapour; new best: the sonic boom (and his screech pose)
    r.onNear();
    res.vapor = f.vaporT > 0.4;
    r.onBest();
    res.boom = f.flareT > 0.5 && f.screechT > 0;
    step(60);
    // death: the engines sputter out, then stop drawing
    window.__glyGod(false);
    s.die();
    res.sputter = f.sputterT > 0.5;
    window.__glyGod(true);
    for (let i = 0; i < 80; i++) r.update(1 / 60, 0);
    res.out = f.sputterT === 0;
    // another trail equipped: that trail shows, the reactions are his usual ones
    r.cos = { trail: "trail_fire" };
    res.otherTrail = !f.burner;
    r.cos = { trail: "trail_afterburner" };
    res.equipped = f.burner;
    // the shop: never sold, never in pods or the daily shop; yours with SXE
    const { COSMETICS, forSale, Shop, data } = window.__glyShop;
    const c = COSMETICS.find((x) => x.id === "trail_afterburner");
    const d = data();
    const had = !!d.unlocked.splice;
    delete d.unlocked.splice;
    res.notOwned = !Shop.owns(c.id);
    d.unlocked.splice = true;
    res.owned = Shop.owns(c.id);
    if (!had) delete d.unlocked.splice;
    res.shop = { name: c.name, cat: c.cat, sold: forSale(c) };
    return res;
  });
  expect(out).toEqual({
    burner: true,
    flames: true,
    flare: true,
    settled: true,
    longer: true,
    vapor: true,
    boom: true,
    sputter: true,
    out: true,
    otherTrail: true,
    equipped: true,
    notOwned: true,
    owned: true,
    shop: { name: "Afterburner", cat: "trail", sold: false },
  });
  // Low Graphics + Reduce Flashing: still draws, with no errors
  const calm = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const r = s.player.rig;
    window.__glyShop.data().settings.reduceFlash = true;
    r.lowGfx = true;
    r.reset(r.x, s.H / 2);
    for (let i = 0; i < 60; i++) r.update(1 / 60, 500);
    return r.falcon.burner && r.trailG.commandBuffer.length > 0;
  });
  expect(calm).toBe(true);
  expect(log.errors).toEqual([]);
});

test("every hero is visible again after a quick RETRY (no death move carries over)", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const res = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const Rig = s.player.rig.constructor;
    const bad = [];
    let n = 0;
    for (const def of window.__heroDefs) {
      const rig = new Rig(s, def, s.fx, { x: 200, y: 400, depth: 31 });
      const tick = (k) => {
        for (let i = 0; i < k; i++) rig.update(1 / 60, 400);
      };
      tick(20);
      rig.die();
      tick(8); // RETRY lands while the death move is still playing
      rig.reset(200, 400);
      // a death move that was still running finishes now (it may try to hide the hero)
      for (const tw of s.tweens.getTweensOf(rig.sprite)) tw.complete();
      tick(150); // longer than any death tumble
      const sp = rig.sprite;
      if (!sp.visible || sp.alpha < 0.5)
        bad.push(`${def.id}: visible=${sp.visible} alpha=${sp.alpha}`);
      rig.destroy();
      n++;
    }
    return { bad, n };
  });
  expect(res.n).toBeGreaterThan(40); // every hero, not a handful
  expect(res.bad).toEqual([]);
  expect(log.errors).toEqual([]);
});

test("scenery: Slammer + Eye Beam always leaves a lane (forced, real collisions)", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  // A steady pilot (at most 650 px/s up or down; a real bird manages 790 up / 1080 down)
  // flies the Slammer's always-open slot and keeps out of a warning or burning beam.
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const om = s.obstacles;
    const H = s.H;
    const R = 21;
    let t = 1e6;
    let target = H / 2;
    const pilot = () => {
      const p = s.player;
      let best = Infinity;
      for (const o of om.active) {
        if (o.gc === undefined || o.right === undefined) continue;
        const d = o.right - (p.x - R);
        if (d > 0 && d < best) {
          best = d;
          target = o.gc;
        }
      }
      for (const o of om.active) {
        if (o.type !== "eyebeam" || !(o.state === "warn" || o.state === "beam"))
          continue;
        if (o.x < p.x - 60 || o.x > p.x + 420) continue;
        target = o.top
          ? Math.max(target, o.L + R + 40)
          : Math.min(target, H - o.L - R - 40);
      }
      const dy = target - p.y;
      p.y += Math.sign(dy) * Math.min(Math.abs(dy), 650 / 60);
      p.vy = 0;
    };
    const step = () => {
      pilot();
      t += 1000 / 60;
      s.stepFrame(t, 1000 / 60);
    };
    const res = {
      patterns: 0,
      minLane: Infinity,
      deaths: [],
      minLead: Infinity,
    };
    const origSpawn = om.spawnPattern.bind(om);
    om.spawnPattern = (m, b) => {
      const before = new Set(om.active);
      origSpawn(m, b);
      if (om.lastKind !== "eyeslam") return;
      const fresh = om.active.filter((o) => !before.has(o));
      const sl = fresh.find((o) => o.type === "slammer");
      const e = fresh.find((o) => o.type === "eyebeam");
      if (!sl || !e) return;
      res.patterns++;
      const lane = e.top
        ? sl.gc - sl.minGap / 2 - R - e.L
        : H - e.L - (sl.gc + sl.minGap / 2 + R);
      res.minLane = Math.min(res.minLane, lane);
    };
    for (let run = 0; run < 8; run++) {
      window.__glyGod(true);
      if (run > 0) {
        s.resetRun(false);
        s.startRun?.();
      }
      let start = 0;
      for (let m = 0; m < 6000; m += 10)
        if (s.course.segAt(m).id === "abyss") {
          start = s.course.segAt(m).start;
          break;
        }
      while (s.meters < start + 262) step();
      // from here every pick that can be Slammer + Eye is, with real collisions
      const r = om.rng;
      const orig = r.weighted.bind(r);
      r.weighted = (w) => ("eyeslam" in w ? "eyeslam" : orig(w));
      window.__glyGod(false);
      for (
        let i = 0;
        i < 60 * 240 && s.course.segAt(s.meters).id === "abyss";
        i++
      ) {
        step();
        for (const o of om.active)
          if (o.type === "eyebeam" && o.state === "warn" && !o._lead) {
            o._lead = true;
            res.minLead = Math.min(
              res.minLead,
              (o.x - s.player.x) / Math.max(60, om.scroll),
            );
          }
        if (s.state !== "playing") {
          res.deaths.push(Math.round(s.meters - start));
          break;
        }
      }
      for (const pool of Object.values(om.pools))
        for (const o of pool) delete o._lead;
      r.weighted = orig;
    }
    window.__glyGod(true);
    return res;
  });
  expect(out.patterns).toBeGreaterThan(8);
  expect(out.deaths).toEqual([]);
  expect(out.minLane).toBeGreaterThan(100); // px of open sky between the slot and the beam
  expect(out.minLead).toBeGreaterThan(1.1); // the eye warns over a second before arrival
  expect(log.errors).toEqual([]);
});

test("glydrift.com launch: portal pop-up, Founding Drifter reward, LATER returns once", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(480_000); // six launches of the game
  const texts = () =>
    page.evaluate(() => {
      const m = window.__glydrift.scene.getScene("Menu");
      const all = [];
      const walk = (o) => {
        if (o.type === "Text" && o.visible) all.push(o.text);
        (o.list || []).forEach(walk);
      };
      m.children.list.forEach(walk);
      return all.join(" | ");
    });
  const save = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  const launch = async () => {
    await page.reload();
    await waitFor(
      page,
      () => !!window.__glydrift?.scene.isActive("Menu"),
      30_000,
    );
    await run(page, 4000); // portal + panel + typing
  };
  const base = { ...SAVE, dailyDrop: SAVE.login.claimed };
  // 1. accounts not open on the server yet: nothing (it would lead nowhere), and nothing used up
  const log = await openGame(page, {
    flags: ["mockcloud", "movenotice"],
    save: base,
  });
  await page.evaluate(() =>
    localStorage.setItem("glydrift.mockserver.notready", "1"),
  );
  await launch();
  expect(await texts()).not.toContain("GLYDRIFT HAS A NEW HOME");
  expect((await save()).moveNotice).toEqual({ shown: 0, done: false });
  // 2. accounts open: a guest sees the launch pop-up with the reward; LATER closes it
  await page.evaluate(() =>
    localStorage.removeItem("glydrift.mockserver.notready"),
  );
  await launch();
  let t = await texts();
  expect(t).toContain("GLYDRIFT HAS A NEW HOME");
  expect(t).toContain("glydrift.com"); // typed in fully
  expect(t).toContain("Lock in your progress before the jump.");
  expect(t).toContain("FOUNDING DRIFTER REWARD");
  expect(t).toContain("CREATE ACCOUNT");
  // the hero flies through the portal wearing the Founding trail (a live preview)
  const fly = await page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    return m.moveFly ? m.moveFly.rig.cos.trail : null;
  });
  expect(fly).toBe("trail_founder");
  await snap(page, testInfo, "17-move-guest");
  await tap(page, "LATER", 600);
  expect(await texts()).not.toContain("GLYDRIFT HAS A NEW HOME");
  // ... back on the home screen again in the same launch: not again
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.restart(),
  );
  await run(page, 3000);
  expect(await texts()).not.toContain("GLYDRIFT HAS A NEW HOME");
  // 3. the next launch: once more; CREATE ACCOUNT → sign-up → reward + celebration
  await launch();
  expect(await texts()).toContain("GLYDRIFT HAS A NEW HOME");
  await tap(page, "CREATE ACCOUNT", 800);
  await expect(
    page.locator("#account-modal.open input[name=email]"),
  ).toBeVisible();
  await page.fill("#account-modal input[name=email]", "pilot@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  await page.click("#account-modal button[type=submit]");
  await expect(page.locator("#account-modal .who")).toHaveText(
    "pilot@example.com",
  );
  await page.click("#account-modal [data-act=close]");
  await run(page, 900);
  expect(await texts()).toContain("PROGRESS LOCKED IN!");
  await snap(page, testInfo, "18-move-celebrate");
  await run(page, 4000);
  let s = await save();
  expect(s.cos.owned.trail_founder).toBe(true);
  expect(s.titles.owned.t_founder).toBe(true);
  expect(s.cos.equipped.trail).toBe("trail_founder"); // nothing was worn: wear it
  expect(s.moveNotice.done).toBe(true);
  // the account's cloud copy has it too (it travels to glydrift.com)
  const cloud = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("glydrift.mockserver")).users[
        "pilot@example.com"
      ].save,
  );
  expect(cloud.cos.owned.trail_founder).toBe(true);
  expect(cloud.titles.owned.t_founder).toBe(true);
  // 4. finished: never again
  await launch();
  expect(await texts()).not.toContain("GLYDRIFT HAS A NEW HOME");
  // 5. a signed-in player (here: the same one, reward reset): "You're all set!" + LET'S GO
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    v.moveNotice = { shown: 0, done: false };
    delete v.cos.owned.trail_founder;
    delete v.titles.owned.t_founder;
    localStorage.setItem("glydrift.save.v1", JSON.stringify(v));
  });
  await launch();
  t = await texts();
  expect(t).toContain("You're all set! Your progress is coming with you.");
  expect(t).toContain("LET'S GO");
  expect(t).not.toContain("CREATE ACCOUNT");
  await snap(page, testInfo, "19-move-signed-in");
  await tap(page, "LET'S GO", 900);
  expect(await texts()).toContain("PROGRESS LOCKED IN!");
  await run(page, 4000);
  s = await save();
  expect(s.cos.owned.trail_founder && s.titles.owned.t_founder).toBe(true);
  // 6. exclusive: never for sale, never in the daily shop or a Mystery Pod
  const shop = await page.evaluate(() => {
    const { COSMETICS, forSale, Shop, data } = window.__glyShop;
    delete data().cos.owned.trail_founder; // not owned, so a pod could pick it if it were allowed
    const sale = forSale(COSMETICS.find((c) => c.id === "trail_founder"));
    let daily = false;
    for (let d = 1; d <= 60; d++)
      if (
        Shop.daily(
          `2026-12-${String((d % 28) + 1).padStart(2, "0")}-${d}`,
        ).items.includes("trail_founder")
      )
        daily = true;
    let pod = false;
    for (let k = 0; k < 400; k++)
      if (Shop.openPod({ free: true })?.item?.id === "trail_founder")
        pod = true;
    return { sale, daily, pod };
  });
  expect(shop).toEqual({ sale: false, daily: false, pod: false });
  expect(log.errors).toEqual([]);
});

test("MATTOE: standard hitbox, always-on aura, STUBBED! death, Neon Void challenge", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["character=mattoe"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    const toe = rig.toe;
    let t = (window.__t = 2e6);
    const step = (n) => {
      for (let i = 0; i < n; i++) {
        t += 1000 / 60;
        s.stepFrame(t, 1000 / 60);
      }
    };
    window.__glyGod(true);
    for (let i = 0; i < 120; i++) {
      if (s.player.y > s.H * 0.5 && s.player.vy > -60) s.onTap();
      step(1);
    }
    const auraDrawn = toe.g.commandBuffer.length > 0;
    const before = toe.flare;
    s.onTap();
    step(1);
    const flared = toe.flare > before;
    // the aura is drawn behind the sprite
    const behind = toe.g.depth < rig.sprite.depth;
    // die (in the Neon Void, where every run starts)
    window.__glyGod(false);
    for (let i = 0; i < 600 && s.state === "playing"; i++) step(1);
    step(8);
    const texts = s.fx.texts
      .filter((x) => x.active && x.visible)
      .map((x) => x.text);
    return {
      radius: s.player.radius,
      std: 21,
      speed: s.charDef.speed ?? 1,
      auraDrawn,
      flared,
      behind,
      killedIn: s.run.killedIn,
      stubbed: texts.includes("STUBBED!"),
      spriteStays: rig.sprite.visible, // it flattens and bounces away before vanishing
    };
  });
  expect(out.radius).toBe(out.std); // the standard hitbox
  expect(out.speed).toBe(1);
  expect(out.auraDrawn && out.flared && out.behind).toBe(true);
  expect(out.killedIn).toBe("void");
  expect(out.stubbed).toBe(true);
  expect(out.spriteStays).toBe(true);
  await run(page, 4000); // game over: the run is saved
  const st = await page.evaluate(
    () => JSON.parse(localStorage.getItem("glydrift.save.v1")).stats,
  );
  expect(st.voidDeaths).toBe(1); // 1 of 10 toward MATTOE's challenge
  expect(log.errors).toEqual([]);
});

test("accounts wait for the server to be set up", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, { flags: ["mockcloud"] });
  await page.evaluate(() =>
    localStorage.setItem("glydrift.mockserver.notready", "1"),
  );
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
  const server = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("glydrift.mockserver")),
  );
  expect(server?.users?.["early@example.com"]).toBeUndefined();
  expect(log.errors).toEqual([]);
});
