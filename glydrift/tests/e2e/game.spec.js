// Glydrift on every device profile × browser engine (see playwright.config.js).
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { botPlay } from "./levelBot.js";
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

async function startRun(page, label = "ENDLESS") {
  await tap(page, label, 0);
  await settle(page, "Game", 400);
  await reseed(page); // the same course every time
  await run(page, 600);
  await press(page, await fieldPoint(page)); // the first tap launches the run
  await run(page, 200);
  expect((await gameState(page)).state).toBe("playing");
}

test("loads with no console errors, framed correctly, no browser gestures @smoke", async ({
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

test("release build loads with no console errors @smoke", async ({ page }) => {
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

test("game over and retry in under a second @smoke", async ({ page }, testInfo) => {
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

test("buys an item in the shop @smoke", async ({ page }, testInfo) => {
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
  // free drop ready, a spin to use and the login reward unclaimed: only the two free rewards
  // get a badge (LEVELS replaced the daily chip and never shows one)
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

test("realm changes never pause the run @smoke", async ({ page }, testInfo) => {
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
  // (the Daily Challenge tab went with the Daily Challenge: levels have their own boards)
  expect(v.tabs).toEqual(["SCORE", "DISTANCE"]);
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

test("accounts: create, log out, sign in on a new device, delete @smoke", async ({
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
    // (within 0.05 m: a run starts a frame earlier or later and speed grows with distance; a
    // real speed difference is metres over 240 frames)
    expect(Math.abs(r.metres - base.metres), `${r.skin} speed`).toBeLessThan(0.05);
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
    // (the run starts a frame earlier or later depending on frame timing, and speed grows with
    // distance: a hundredth of a metre either way; a real speed difference is metres)
    expect(Math.abs(r.metres - base.metres), `${r.id} speed`).toBeLessThan(0.05);
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
    // (12 runs: the second with no new obstacles after the Abyss entrance moves the layout a
    // little later, so the stretch tested in each run now holds one pattern, not two)
    for (let run = 0; run < 12; run++) {
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
      // (god mode flies through hazards: turn it off only with nothing at the bird, or the
      // bird starts inside an obstacle that has nothing to do with the pattern under test)
      for (
        let k = 0;
        k < 600 && om.active.some((o) => o.active && Math.abs(o.x - s.player.x) < 260);
        k++
      )
        step();
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

test("music: the pre-rendered reggae soundtrack is complete, fresh and served", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../src/audio/reggae/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  expect(manifest.complete).toBe(true);
  // one track per realm (plus the menu), and a bridge for every realm boundary
  const realms = [
    "menu",
    "void",
    "solar",
    "frozen",
    "glitch",
    "abyss",
    "valley",
    "hurricane",
  ];
  realms.push("prism", "tidal", "chrono", "mirror");
  expect(Object.keys(manifest.tracks).sort()).toEqual([...realms].sort());
  const dims = ["prism", "tidal", "chrono", "mirror"];
  const pairs = [
    "void>solar",
    "solar>frozen",
    "frozen>glitch",
    "abyss>valley",
    "valley>hurricane",
  ];
  for (const d of dims)
    pairs.push(
      `hurricane>${d}`,
      ...dims.filter((e) => e !== d).map((e) => `${d}>${e}`),
    );
  expect(Object.keys(manifest.bridges).sort()).toEqual(pairs.sort());
  const files = [manifest.calib.file, ...Object.values(manifest.calm.files)];
  for (const t of Object.values(manifest.tracks)) {
    files.push(...Object.values(t.files), ...Object.values(t.intro.files));
    // bars line up: the loop is a whole number of bars, the drop starts on a bar
    expect(
      Math.abs(t.length / t.bar - Math.round(t.length / t.bar)),
    ).toBeLessThan(1e-6);
  }
  for (const b of Object.values(manifest.bridges))
    files.push(...Object.values(b.files));
  for (const f of files) {
    const r = await page.request.get(`/music/${f}`);
    expect(r.status(), f).toBe(200);
    expect((await r.body()).length, f).toBeGreaterThan(1000);
  }
});

test("music test page: reggae tracks, the old house tracks and the full journey", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page, { flags: ["music"], screen: "MusicTest" });
  const texts = () =>
    page.evaluate(() => {
      const out = [];
      const walk = (l) => {
        for (const o of l) {
          if (o.list) walk(o.list);
          if (o.type === "Text" && o.visible) out.push(String(o.text));
        }
      };
      walk(window.__glydrift.scene.getScene("MusicTest").children.list);
      return out;
    });
  let shown = await texts();
  for (const t of [
    "PLAY FULL JOURNEY",
    "NEON VOID",
    "SOLAR STORM",
    "ABYSS",
    "THE CALM",
  ])
    expect(shown).toContain(t);
  expect(shown).toContain("90 BPM double-time · A minor");
  await run(page, 2000); // the old engine loads in the background
  await tap(page, "HOUSE (OLD)");
  shown = await texts();
  expect(shown).toContain("NEON VOID");
  expect(shown).toContain("124 BPM · house");
  expect(shown).not.toContain("THE CALM");
  await tap(page, "REGGAE (NEW)");
  await tap(page, "PLAY FULL JOURNEY");
  expect(log.errors).toEqual([]);
});

// ================================================================ LEVEL MODE
test("levels: LEVELS replaces the Daily Challenge; the map, locks, stars and the level card", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page);
  const menuTexts = await page.evaluate(() => {
    const out = [];
    const walk = (o) => {
      if (o.type === "Text") out.push(o.text);
      if (o.list) o.list.forEach(walk);
    };
    window.__glydrift.scene.getScene("Menu").children.list.forEach(walk);
    return out;
  });
  expect(menuTexts).toContain("LEVELS");
  expect(menuTexts).toContain("ENDLESS");
  expect(menuTexts.some((t) => /DAILY CHALLENGE/.test(t))).toBe(false);
  expect(menuTexts.some((t) => t === "DAILY")).toBe(false);
  await tap(page, "LEVELS", 1200);
  const map = await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    return { star: ls.starsText.text, nodes: ls.nodes.length };
  });
  expect(map).toEqual({ star: "0/150 ★", nodes: 50 });
  await snap(page, testInfo, "levels-01-map");
  // level 1 is open, level 2 locked: tapping it explains why. Press the circles like a
  // player (a real tap through the zoomed camera), not by calling openLevel()
  const nodeAt = (n) =>
    page.evaluate((n) => {
      const g = window.__glydrift;
      const ls = window.__glyLevelSelect;
      const nd = ls.nodes[n - 1];
      const cam = ls.cameras.main;
      const sx = (nd.x - cam.worldView.x) * cam.zoom + cam.x;
      const sy = (nd.y + ls.map.y - cam.worldView.y) * cam.zoom + cam.y;
      const r = g.canvas.getBoundingClientRect();
      return { x: r.left + (sx * r.width) / g.canvas.width, y: r.top + (sy * r.height) / g.canvas.height };
    }, n);
  await press(page, await nodeAt(2));
  await run(page, 300);
  const locked = await page.evaluate(() => !window.__glyLevelSelect.modal);
  await press(page, await nodeAt(1));
  await run(page, 300);
  const card = await page.evaluate((locked) => {
    const ls = window.__glyLevelSelect;
    const texts = [];
    const walk = (o) => {
      if (o.type === "Text") texts.push(o.text);
      if (o.list) o.list.forEach(walk);
    };
    if (ls.modal) walk(ls.modal);
    return { locked, texts };
  }, locked);
  expect(card.locked).toBe(true);
  expect(card.texts).toEqual(
    expect.arrayContaining(["FIRST FLIGHT", "PLAY", "PRACTICE"]),
  );
  await run(page, 400);
  await snap(page, testInfo, "levels-02-card");
  expect(log.errors).toEqual([]);
});

test("levels: stars, unlocks in order, first-time rewards, practice never counts, cloud merge", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page);
  // finish level 1 in god mode through the real game, collecting the star coins
  const play = async (n, practice) => {
    await page.evaluate(
      ({ n, practice }) => {
        const g = window.__glydrift;
        for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
        g.scene.start("Game", { mode: "level", level: n, practice });
      },
      { n, practice },
    );
    await run(page, 800);
    await run(page, 300);
    await page.evaluate(() => window.__glyGod(true));
    const res = await page.evaluate(botPlay, { god: true });
    await page.evaluate(() => window.__glyGod(false));
    await run(page, 2200);
    return res;
  };
  const before = await page.evaluate(() => window.__glyShop.data().coins);
  const p1 = await play(1, true); // practice first: nothing counts
  expect(p1.finished).toBe(true);
  const afterPractice = await page.evaluate(() => ({
    coins: window.__glyShop.data().coins,
    lv: JSON.stringify(window.__glyShop.data().lv?.p?.[1] || null),
  }));
  expect(afterPractice.lv).toBe("null");
  const r1 = await play(1, false);
  expect(r1.finished).toBe(true);
  expect(r1.stars).toEqual([true, true, true]); // all three star coins are reachable
  const after = await page.evaluate(() => {
    const d = window.__glyShop.data();
    return {
      coins: d.coins,
      p: d.lv.p[1],
      claimed: Object.keys(d.lv.claimed).sort(),
      result: window.__glyLevelResult.out,
    };
  });
  expect(after.p).toMatchObject({
    done: true,
    coins: [true, true, true],
    flawless: true,
  });
  expect(after.result.newStars).toEqual([0, 1, 2]);
  expect(after.coins).toBeGreaterThan(afterPractice.coins + 150); // finish + 3 stars (+ run coins)
  expect(after.claimed).toEqual(["f1", "s1_0", "s1_1", "s1_2"]);
  // replaying never pays the first-time rewards again
  await play(1, false);
  const again = await page.evaluate(() => window.__glyLevelResult.out);
  expect(again.coins).toBe(0);
  expect(again.first).toBe(false);
  // level 2 is open now, level 3 isn't
  await page.evaluate(() => {
    const g = window.__glydrift;
    for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
    g.scene.start("LevelSelect");
  });
  await run(page, 800);
  const locks = await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    ls.openLevel(3);
    const three = !!ls.modal;
    ls.closeModal();
    ls.openLevel(2);
    return { two: !!ls.modal, three, total: ls.starsText.text };
  });
  expect(locks).toEqual({ two: true, three: false, total: "3/150 ★" });
  expect(before).toBeGreaterThanOrEqual(0);
  expect(log.errors).toEqual([]);
});

test("levels: the cloud merge keeps the most progress and never loses a star", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page);
  const merged = await page.evaluate(() => {
    const merge = window.__glyLevelMerge;
    const a = {
      p: {
        1: {
          done: true,
          coins: [true, false, false],
          flawless: false,
          best: 41000,
          attempts: 3,
        },
        2: {
          done: true,
          coins: [false, false, false],
          flawless: true,
          best: 0,
          attempts: 1,
        },
      },
      claimed: { f1: true },
    };
    const b = {
      p: {
        1: {
          done: true,
          coins: [false, true, true],
          flawless: true,
          best: 39000,
          attempts: 1,
        },
        3: {
          done: false,
          coins: [true, false, false],
          flawless: false,
          best: 0,
          attempts: 2,
        },
      },
      claimed: { f2: true },
    };
    return merge(a, b);
  });
  expect(merged.p[1]).toEqual({
    done: true,
    coins: [true, true, true],
    flawless: true,
    best: 39000,
    attempts: 3,
  });
  expect(merged.p[2].done).toBe(true);
  expect(merged.p[3].coins).toEqual([true, false, false]);
  expect(merged.claimed).toEqual({ f1: true, f2: true });
  expect(log.errors).toEqual([]);
});

test("levels: every level has its own name, shown on the start screen, HUD and LEVEL COMPLETE", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  // 50 different names; the label keeps the number ("Level 7: Upside Down")
  const names = await page.evaluate(() => {
    const L = window.__glyLevels;
    return {
      all: L.names(),
      seven: L.levelLabel(L.getLevel(7)),
      bosses: [10, 20, 30, 40, 50].map((n) => L.getLevel(n).boss),
    };
  });
  expect(names.all).toHaveLength(50);
  expect(new Set(names.all).size).toBe(50);
  expect(names.seven).toBe("Level 7: Upside Down");
  expect(names.bosses).toEqual([true, true, true, true, true]);
  // the start screen and HUD of a boss: the name in red with a skull, never wider than the screen
  const startOf = async (n) => {
    await page.evaluate((n) => {
      const g = window.__glydrift;
      for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
      g.scene.start("Game", { mode: "level", level: n });
    }, n);
    await run(page, 900);
    return page.evaluate(() => {
      const hud = window.__glydrift.scene.getScene("Hud");
      const texts = [];
      const walk = (o) => {
        if (o.type === "Text" && o.visible) {
          const b = o.getBounds();
          texts.push({ t: o.text, c: o.style.color, w: b.width, left: b.left, right: b.right });
        }
        (o.list || []).forEach(walk);
      };
      hud.children.list.forEach(walk);
      const skulls = [];
      const walkI = (o) => {
        if (o.type === "Image" && o.frame?.name === "skull") skulls.push(o.frame.name);
        (o.list || []).forEach(walkI);
      };
      hud.children.list.forEach(walkI);
      return { texts, skulls: skulls.length, W: hud.W };
    });
  };
  const ten = await startOf(10);
  const big = ten.texts.find((t) => t.t === "HEART OF THE VOID");
  expect(big).toBeTruthy();
  expect(ten.texts.some((t) => t.t === "LEVEL 10: HEART OF THE VOID" && t.c === "#ff3a4a")).toBe(true);
  expect(ten.skulls).toBeGreaterThanOrEqual(2);
  for (const t of ten.texts) {
    expect(t.left).toBeGreaterThanOrEqual(-1);
    expect(t.right).toBeLessThanOrEqual(ten.W + 1);
  }
  await snap(page, testInfo, "levels-03-start-boss");
  // the longest name fits too
  const long = await startOf(48);
  expect(long.texts.some((t) => t.t === "POINT OF NO RETURN")).toBe(true);
  for (const t of long.texts) expect(t.right).toBeLessThanOrEqual(long.W + 1);
  // the start screen goes away once you fly
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  await run(page, 800);
  const gone = await page.evaluate(
    () => !window.__glydrift.scene.getScene("Game").levelRun.hud.introC,
  );
  expect(gone).toBe(true);
  // no coin pickups in a level (only its three star coins), and no coin counter
  await page.evaluate(() => window.__glyGod(true));
  await run(page, 8000);
  const coins = await page.evaluate(() => {
    const g = window.__glydrift;
    const om = g.scene.getScene("Game").obstacles;
    return {
      active: om.coins.filter((c) => c.active).length,
      counter: g.scene.getScene("Hud").coinText.visible,
      metres: Math.round(g.scene.getScene("Game").meters),
    };
  });
  await page.evaluate(() => window.__glyGod(false));
  expect(coins.metres).toBeGreaterThan(100);
  expect(coins).toMatchObject({ active: 0, counter: false });
  expect(log.errors).toEqual([]);
});

test("levels map: the journey (hero flies to a tapped level, chests, star milestones, PLAY, portals)", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  // levels 1-5 beaten with every star: 15 stars (the Starlight trail) and the first chest
  const coins0 = await page.evaluate(() => {
    const d = window.__glyShop.data();
    d.lv = { p: {}, claimed: {}, played: 0 };
    for (let n = 1; n <= 5; n++)
      d.lv.p[n] = { done: true, coins: [true, true, true], flawless: true, best: 40000, attempts: 1 };
    window.__glydrift.scene.getScene("Menu").scene.start("LevelSelect");
    return d.coins;
  });
  await run(page, 2800); // the chest opens, then the map returns to the current level
  const arrived = await page.evaluate(() => {
    const d = window.__glyShop.data();
    const ls = window.__glyLevelSelect;
    return {
      coins: d.coins,
      chest: window.__glyLevels.chestState(1),
      trail: !!d.cos?.owned?.trail_starlight,
      newChests: ls.newChests.map((c) => c.k),
      hero: ls.heroAt.n,
      play: ls.playBtn.list.filter((o) => o.type === "Text").map((o) => o.text),
      realm: ls.bands[0].titleObjs.map((o) => o.text),
    };
  });
  expect(arrived.newChests).toEqual([1]);
  expect(arrived.chest).toBe("open");
  expect(arrived.coins).toBe(coins0 + 150);
  expect(arrived.trail).toBe(true); // 15 stars
  expect(arrived.hero).toBe(6); // the hero waits on the next level
  expect(arrived.play).toEqual(["PLAY", "Level 6: Pulse Point"]);
  expect(arrived.realm).toEqual(["NEON VOID", "15/30 ★", "LEVELS 1–10"]);
  await snap(page, testInfo, "levels-04-map-journey");
  // tap level 3 like a player: the hero flies there, its name shows, then its card opens
  const nodeAt = (n) =>
    page.evaluate((n) => {
      const g = window.__glydrift;
      const ls = window.__glyLevelSelect;
      const nd = ls.nodes[n - 1];
      const cam = ls.cameras.main;
      const r = g.canvas.getBoundingClientRect();
      return {
        x: r.left + (((nd.x - cam.worldView.x) * cam.zoom + cam.x) * r.width) / g.canvas.width,
        y: r.top + (((nd.y + ls.map.y - cam.worldView.y) * cam.zoom + cam.y) * r.height) / g.canvas.height,
      };
    }, n);
  await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    ls.scrollY = (ls.headerH + ls.viewBottom) / 2 - ls.nodes[3].y;
  });
  await run(page, 300);
  await press(page, await nodeAt(3));
  await run(page, 200);
  const mid = await page.evaluate(() => window.__glyLevelSelect.flying);
  await run(page, 1800);
  const card = await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    const texts = [];
    const walk = (o) => {
      if (o.type === "Text") texts.push(o.text);
      (o.list || []).forEach(walk);
    };
    if (ls.modal) walk(ls.modal);
    return { at: ls.heroAt.n, modal: !!ls.modal, label: ls.selLabel?.text?.text, texts };
  });
  expect(mid).toBe(true);
  expect(card).toMatchObject({ at: 3, modal: true, label: "PILLAR RUN" });
  expect(card.texts).toEqual(expect.arrayContaining(["PILLAR RUN", "PLAY", "PRACTICE"]));
  await snap(page, testInfo, "levels-05-card");
  // the portal to the Solar Storm stays shut until the boss falls
  await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    ls.closeModal(true);
    ls.tapPortal(ls.portals[0]);
  });
  await run(page, 200);
  const toast = await page.evaluate(() => window.__glyLevelSelect.toastT.list[1].text);
  expect(toast).toBe("Beat level 10 to unlock Solar Storm");
  // PLAY jumps straight to the next unbeaten level
  await page.evaluate(() => window.__glyLevelSelect.playNext());
  await run(page, 2500);
  const started = await page.evaluate(() => {
    const g = window.__glydrift;
    return g.scene.isActive("Game") ? g.scene.getScene("Game").levelRun?.def.n : null;
  });
  expect(started).toBe(6);
  expect(log.errors).toEqual([]);
});

test("levels map: the current level, its hero and its stars sit clear of the realm bar and PLAY", async ({
  page,
}, testInfo) => {
  test.skip(
    !["iphone-small", "iphone-std", "iphone-large"].includes(profileOf(testInfo)),
    "small, standard and large iPhones",
  );
  const log = await openGame(page);
  for (const done of [0, 4, 9, 23, 39, 49]) {
    await page.evaluate((k) => {
      const g = window.__glydrift;
      const d = window.__glyShop.data();
      d.lv = { p: {}, claimed: {}, played: 0 };
      for (let n = 1; n <= k; n++)
        d.lv.p[n] = { done: true, coins: [true, true, false], flawless: true, best: 40000, attempts: 1 };
      for (let c = 1; c <= 10; c++) d.lv.claimed[`chest${c}`] = true; // no chest animations
      for (const m of [15, 40, 75, 110, 150]) d.lv.claimed[`m${m}`] = true;
      const from = g.scene.isActive("LevelSelect") ? "LevelSelect" : "Menu";
      g.scene.getScene(from).scene.start("LevelSelect");
    }, done);
    await run(page, 900);
    const fit = await page.evaluate(() => {
      const ls = window.__glyLevelSelect;
      const nd = ls.nodes[ls.heroAt.n - 1];
      const y = nd.y + ls.map.y;
      const out = {
        n: nd.n,
        top: ls.headerH + 50,
        bottom: ls.playY - 50,
        heroTop: ls.rig.y - 40,
        nodeTop: y - nd.R,
        starsBottom: y + nd.R + 34,
        // where the level sits in the free space (0 = at the realm bar, 1 = at PLAY)
        at: (y - (ls.headerH + 50)) / (ls.playY - 50 - (ls.headerH + 50)),
      };
      ls.openLevel(nd.n);
      return out;
    });
    await run(page, 600);
    const card = await page.evaluate(() => {
      const ls = window.__glyLevelSelect;
      const nd = ls.nodes[ls.heroAt.n - 1];
      return { y: nd.y + ls.map.y + nd.R + 34, sheetTop: ls.sheetTop };
    });
    const where = `level ${fit.n} (${done} beaten)`;
    expect(fit.heroTop, `${where}: hero under the realm bar`).toBeGreaterThanOrEqual(fit.top - 1);
    expect(fit.nodeTop, `${where}: node under the realm bar`).toBeGreaterThanOrEqual(fit.top - 1);
    expect(fit.starsBottom, `${where}: stars behind PLAY`).toBeLessThanOrEqual(fit.bottom + 1);
    expect(card.y, `${where}: stars behind the card`).toBeLessThanOrEqual(card.sheetTop + 1);
    // centred in the free space, not squeezed against PLAY (level 1 sits at the top of the map)
    if (done > 0) expect(fit.at, `${where}: squeezed against PLAY`).toBeLessThan(0.65);
  }
  await snap(page, testInfo, "levels-06-map-fit");
  expect(log.errors).toEqual([]);
});

test("levels: pause (button, menu, settings, practice, background, back to the map)", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  const startLevel = async (n, practice = false) => {
    await page.evaluate(
      ({ n, practice }) => {
        const g = window.__glydrift;
        for (const k of ["LevelComplete", "Hud", "Game", "LevelSelect", "Menu"]) g.scene.stop(k);
        g.scene.start("Game", { mode: "level", level: n, practice });
      },
      { n, practice },
    );
    await run(page, 900);
  };
  const pauseBtnAt = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const hud = g.scene.getScene("Hud");
      const b = hud.pauseBtn;
      const cam = hud.cameras.main;
      const r = g.canvas.getBoundingClientRect();
      return {
        x: r.left + (((b.x - cam.worldView.x) * cam.zoom + cam.x) * r.width) / g.canvas.width,
        y: r.top + (((b.y - cam.worldView.y) * cam.zoom + cam.y) * r.height) / g.canvas.height,
        top: b.y - 34,
        safeTop: g.registry.get("safeTop") || 0,
        visible: b.visible && b.alpha > 0,
      };
    });
  const pauseTexts = () =>
    page.evaluate(() => {
      const hud = window.__glydrift.scene.getScene("Hud");
      const out = [];
      const walk = (o) => {
        if (o.type === "Text" && o.visible) out.push(o.text);
        (o.list || []).forEach(walk);
      };
      if (hud.pauseLayer) walk(hud.pauseLayer);
      return out;
    });
  const gamePaused = () => page.evaluate(() => window.__glydrift.scene.isPaused("Game"));

  await startLevel(3);
  // the pause button is there before the first tap, top-left, clear of the notch
  let b = await pauseBtnAt();
  expect(b.visible).toBe(true);
  expect(b.top).toBeGreaterThan(b.safeTop);
  await press(page, b);
  await run(page, 300);
  expect(await gamePaused()).toBe(true);
  expect(await pauseTexts()).toEqual(
    expect.arrayContaining(["PAUSED", "RESUME", "RESTART LEVEL", "PRACTICE MODE", "SETTINGS", "BACK TO LEVEL MAP"]),
  );
  await snap(page, testInfo, "levels-07-pause");
  // settings and back
  await tap(page, "SETTINGS", 300);
  const st = await pauseTexts();
  expect(st).toEqual(expect.arrayContaining(["MUSIC", "SOUND EFFECTS", "BACK"]));
  expect(st.some((t) => t.startsWith("REDUCE FLASHING"))).toBe(true);
  await tap(page, "BACK", 300);
  expect(await pauseTexts()).toEqual(expect.arrayContaining(["RESUME"]));
  await tap(page, "RESUME", 300);
  expect(await gamePaused()).toBe(false);
  // fly, crash: the pause button stays (levels respawn at the checkpoint)
  await page.evaluate(() => window.__glyGod(true)); // no real crashes while we test the menu
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  await run(page, 500);
  await page.evaluate(() => window.__glydrift.scene.getScene("Hud").onDeath());
  await run(page, 500);
  b = await pauseBtnAt();
  expect(b.visible).toBe(true);
  // the app goes to the background, or a call takes focus: it pauses by itself
  for (const ev of ["hidden", "blur"]) {
    await page.evaluate((ev) => window.__glydrift.events.emit(ev), ev);
    await run(page, 200);
    expect(await gamePaused(), ev).toBe(true);
    await tap(page, "RESUME", 300);
    expect(await gamePaused()).toBe(false);
  }
  // practice mode restarts the level in practice
  await press(page, await pauseBtnAt());
  await run(page, 300);
  await tap(page, "PRACTICE MODE", 900);
  const prac = await page.evaluate(() => {
    const gs = window.__glydrift.scene.getScene("Game");
    return { n: gs.levelDef?.n, practice: gs.practice };
  });
  expect(prac).toEqual({ n: 3, practice: true });
  // and back to the level map
  await press(page, await pauseBtnAt());
  await run(page, 300);
  expect(await pauseTexts()).toEqual(expect.arrayContaining(["PLAY FOR REAL"]));
  await tap(page, "BACK TO LEVEL MAP", 900);
  expect(
    await page.evaluate(() => {
      const g = window.__glydrift;
      return { map: g.scene.isActive("LevelSelect"), game: g.scene.isActive("Game") || g.scene.isPaused("Game") };
    }),
  ).toEqual({ map: true, game: false });
  await page.evaluate(() => window.__glyGod(false));
  expect(log.errors).toEqual([]);
});

test("levels: after a crash the level waits at the checkpoint until you tap", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  await page.evaluate(() => {
    const g = window.__glydrift;
    for (const k of ["LevelComplete", "Hud", "Game", "LevelSelect", "Menu"]) g.scene.stop(k);
    g.scene.start("Game", { mode: "level", level: 1 });
  });
  await run(page, 900);
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  await run(page, 600);
  // a crash: back to the checkpoint, holding still
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").levelRun.respawn());
  await run(page, 3000); // hands off for 3 s: no fall into the floor, no extra crashes
  const waiting = await page.evaluate(() => {
    const g = window.__glydrift;
    const gs = g.scene.getScene("Game");
    return {
      state: gs.state,
      deaths: gs.levelRun.deaths,
      hint: g.scene.getScene("Hud").hint.visible,
      onScreen: gs.player.y > 0 && gs.player.y < gs.H,
    };
  });
  expect(waiting).toEqual({ state: "ready", deaths: 1, hint: true, onScreen: true });
  // one tap and it flies on
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  await run(page, 300);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").state)).toBe("playing");
  expect(log.errors).toEqual([]);
});

test("levels map: Low Graphics and Reduce Flashing", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  await page.evaluate(() => {
    const d = window.__glyShop.data();
    d.settings.lowGfx = true;
    d.settings.reduceFlash = true;
    window.__glydrift.scene.getScene("Menu").scene.start("LevelSelect");
  });
  await run(page, 1500);
  const s = await page.evaluate(() => {
    const ls = window.__glyLevelSelect;
    const sy = ls.scrollY;
    ls.scrollY = ls.minY; // all the way down to the Abyss
    return { drops: ls.drops.length, flow: ls.flow.length, rf: ls.rf, low: ls.lowGfx, sy };
  });
  await run(page, 1500);
  expect(s).toMatchObject({ drops: 0, flow: 0, rf: true, low: true });
  const eye = await page.evaluate(() => window.__glyLevelSelect.eyeShown);
  expect(eye).toBeGreaterThan(0);
  expect(log.errors).toEqual([]);
});

test("levels: the layout is the same every time, and a checkpoint replays it exactly", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["god"] });
  const layout = async () => {
    await page.evaluate(() => {
      const g = window.__glydrift;
      for (const k of ["Hud", "Game"]) g.scene.stop(k);
      g.scene.start("Game", { mode: "level", level: 4 });
    });
    await run(page, 800);
    return page.evaluate(() => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      const lr = s.levelRun;
      window.__glyNoRender = true;
      let t = performance.now() + 1e6;
      const step = (n) => {
        for (let i = 0; i < n; i++) {
          if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
          t += 1000 / 60;
          g.step(t, 1000 / 60);
        }
      };
      // where every pattern of the level starts (metres) and what it is
      const beats = () => lr.beatM.map((b, i) => `${lr.def.beats[i].kind}@${b.m.toFixed(1)}`);
      s.onTap();
      step(60 * 25);
      const seen = beats();
      // crash: back to the last checkpoint, then the same stretch again
      const cp = lr.lastCp;
      window.__glyGod(false);
      s.die();
      window.__glyGod(true);
      step(80);
      // the level now waits at the checkpoint until the player taps
      const waited = s.state;
      s.onTap();
      step(60 * 8);
      const replay = beats();
      window.__glyNoRender = false;
      return { seen, replay, cp, deaths: lr.deaths, state: s.state, waited };
    });
  };
  const a = await layout();
  const b = await layout();
  expect(a.seen.length).toBeGreaterThan(8);
  expect(b.seen).toEqual(a.seen); // identical every time
  // after the crash the patterns from the checkpoint on come back at exactly the same places
  expect(a.cp).toBeGreaterThan(0);
  const n = Math.min(a.replay.length, a.seen.length);
  expect(n).toBeGreaterThan(a.cp + 2);
  expect(a.replay.slice(0, n)).toEqual(a.seen.slice(0, n));
  expect(a.deaths).toBe(1);
  expect(a.waited).toBe("ready");
  expect(a.state).toBe("playing");
  expect(log.errors).toEqual([]);
});

test("levels: offline best times wait in the upload queue (time encoded as a score)", async ({
  page,
}, testInfo) => {
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
  const log = await openGame(page);
  const q = await page.evaluate(async () => {
    const lb = window.__glyLb.Leaderboard;
    await lb
      .submitLevelTime({ n: 3, timeMs: 42000, distance: 700, char: "volt" })
      .catch(() => {});
    return window.__glyShop.data().lbQueue.filter((e) => /lv-3$/.test(e.level));
  });
  expect(q.length).toBe(1);
  expect(q[0].score).toBe(Math.round(5e8 / 42000));
  expect(q[0].run_time_ms).toBe(42000);
  expect(log.errors).toEqual([]);
});

// every built level: a bot flying with real flaps and real collisions finishes it (every stretch
// between checkpoints cleared from a clean respawn), and in god mode it reaches all 3 star coins,
// none of which sits inside a hazard
// smoke: level 1 can be played to the finish (the full lane bots every level, below)
test("levels: level 1 can be flown to the finish @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page);
  await page.evaluate(() => {
    const g = window.__glydrift;
    for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
    g.scene.start("Game", { mode: "level", level: 1 });
  });
  await run(page, 1000);
  const r = await page.evaluate(botPlay, {});
  expect(r.finished).toBe(true);
  expect(r.stuck).toBe(null);
  expect(log.errors).toEqual([]);
});

// one test per realm (10 levels each), so the five can run side by side on separate machines
for (const [realm, from] of [
  ["Neon Void", 1],
  ["Solar Storm", 11],
  ["Frozen Nebula", 21],
  ["Glitch Realm", 31],
  ["Abyss", 41],
])
test(`levels: every built level is beatable (bot) and its star coins are fair (god run): ${realm}`, async ({
  page,
}, testInfo) => {
  // hazards scale with the screen's height, so every Chromium screen size is checked (small
  // phone, tall phone, laptop); the layouts and physics are the same on every engine
  test.skip(
    testInfo.project.name.split("-")[0] !== "chromium",
    "bot runs on Chromium (the layouts are the same on every engine)",
  );
  test.setTimeout(600_000);
  const log = await openGame(page);
  const count = await page.evaluate(() => window.__glyLevelCount());
  test.skip(from > count, `${realm} levels aren't built yet`);
  const report = [];
  for (let n = from; n <= Math.min(count, from + 9); n++) {
    for (const god of [false, true]) {
      await page.evaluate(
        ({ n, god }) => {
          const g = window.__glydrift;
          window.__glyGod(god);
          for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
          g.scene.start("Game", { mode: "level", level: n });
        },
        { n, god },
      );
      await run(page, 800);
      await run(page, 200);
      const r = await page.evaluate(botPlay, { god });
      report.push({ n, god, ...r });
      expect.soft(r.finished, `level ${n} ${god ? "god" : "bot"}`).toBe(true);
      expect.soft(r.stuck, `level ${n}`).toBe(null);
      if (god) {
        expect
          .soft(r.stars, `level ${n} star coins`)
          .toEqual([true, true, true]);
        for (const c of r.starHazard)
          expect
            .soft(c, `level ${n} star coin clear of hazards`)
            .toBeGreaterThan(0);
      }
    }
  }
  await page.evaluate(() => window.__glyGod(false));
  console.log(
    JSON.stringify(
      report.map((r) => ({
        n: r.n,
        god: r.god,
        s: r.seconds,
        d: r.deaths,
        worst: r.worstCp,
        m: r.finishM,
      })),
    ),
  );
  expect(log.errors).toEqual([]);
});

// the November 2026 leaderboard reset: once the server publishes it (glydrift_meta), every
// returning player's best is cleared and they see the notice once; new installs never do
test("leaderboard reset: one notice per player, bests cleared, progress kept, strict score checks", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const returning = {
    ...SAVE,
    best: 25191,
    coins: 4321,
    stats: { runs: 40, maxDistance: 3826 },
    daily: { date: "", best: 9000, attempts: 2, ghost: null, ghostChar: "volt", lastPlayed: "" },
    lv: { p: { 1: { done: true, coins: [true, true, true], flawless: true, best: 30000, attempts: 1 } }, claimed: {}, played: 1 },
    lbQueue: [
      { type: "score", level: "endless", score: 20000, character: "volt", run_time_ms: 120000, distance: 3000 },
      { type: "score", level: "lv-3", score: 11905, character: "volt", run_time_ms: 42000, distance: 700 },
    ],
  };
  const log = await openGame(page, { flags: ["lbreset=2026-11"], save: returning });
  const menuState = () =>
    page.evaluate(() => {
      const m = window.__glydrift.scene.getScene("Menu");
      const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
      const texts = [];
      const walk = (o) => {
        if (o?.text) texts.push(o.text);
        o?.list?.forEach(walk);
      };
      walk(m.modal);
      return {
        open: !!m.lbNoticeOpen,
        modals: [m.modal, document.querySelector("#name-modal.open"), m.claiming].filter(Boolean).length,
        texts,
        best: s.best,
        dailyBest: s.daily.best,
        coins: s.coins,
        unlocked: s.unlocked,
        lv: s.lv,
        queue: s.lbQueue.map((q) => q.level),
        lbReset: s.lbReset,
        lbNotice: s.lbNotice,
        bestText: !!m.bestText,
      };
    });
  let st;
  for (let i = 0; i < 30 && !(st = await menuState()).open; i++) await run(page, 200);
  expect(st.open).toBe(true);
  expect(st.modals).toBe(1); // nothing stacks on top of it
  expect(st.texts).toEqual(
    expect.arrayContaining([
      "LEADERBOARD RESET",
      "Due to inflated scores, the leaderboard has been reset. Your coins, heroes and progress are safe. Everyone starts fresh — go claim the #1 spot!",
      "LET'S GO",
    ]),
  );
  // the old best is gone (so the next run sets a new one); everything else is kept
  expect(st.best).toBe(0);
  expect(st.dailyBest).toBe(0);
  expect(st.bestText).toBe(false);
  expect(st.coins).toBe(4321);
  expect(st.unlocked).toMatchObject(returning.unlocked); // every hero kept (challenges met can add more)
  expect(st.lv).toEqual(returning.lv);
  expect(st.queue).toEqual(["lv-3"]); // a pre-reset endless score never reaches the new board
  await run(page, 700);
  await snap(page, testInfo, "lb-reset-notice");
  // LET'S GO closes it for good
  await tap(page, "LET'S GO", 600);
  st = await menuState();
  expect(st.open).toBe(false);
  expect(st.lbReset).toBe("2026-11");
  expect(st.lbNotice).toBe("");
  // next launch: no notice again
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  for (let i = 0; i < 15; i++) {
    await run(page, 200);
    expect((await menuState()).open).toBe(false);
  }

  // the account remembers it: a save that saw the reset wins over an old best from before it
  const merged = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const old = { best: 25191, lbReset: "", stats: { runs: 40 }, unlocked: { volt: true } };
    const fresh = { best: 300, lbReset: "2026-11", stats: { runs: 41 }, unlocked: { volt: true } };
    const a = mergeSaves(old, fresh);
    const b = mergeSaves(fresh, old);
    return { a: [a.best, a.lbReset], b: [b.best, b.lbReset] };
  });
  expect(merged).toEqual({ a: [300, "2026-11"], b: [300, "2026-11"] });

  // the same limits as the server's glydrift_check_score
  const checks = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    const t = (level, score, distance, run_time_ms) => isPlausible({ level, score, distance, run_time_ms });
    return {
      realTop: t("endless", 25191, 3826, 129000),
      noDistance: t("endless", 25191, 0, 129000),
      tooManyPoints: t("endless", 200000, 3826, 129000),
      teleport: t("endless", 9000, 9000, 20000),
      distanceOk: t("endless-distance", 3826, 3826, 129000),
      distanceMismatch: t("endless-distance", 5000, 3826, 129000),
      levelOk: t("lv-5", Math.round(5e8 / 42000), 700, 42000),
      levelFaked: t("lv-6", 99999, 700, 42000),
    };
  });
  expect(checks).toEqual({
    realTop: true,
    noDistance: false,
    tooManyPoints: false,
    teleport: false,
    distanceOk: true,
    distanceMismatch: false,
    levelOk: true,
    levelFaked: false,
  });
  expect(log.errors).toEqual([]);
});

test("leaderboard reset: never shown on a brand-new install", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, {
    flags: ["lbreset=2026-11"],
    save: { ...SAVE, best: 0, stats: { runs: 0 } },
  });
  for (let i = 0; i < 20; i++) {
    await run(page, 200);
    const open = await page.evaluate(() => !!window.__glydrift.scene.getScene("Menu").lbNoticeOpen);
    expect(open).toBe(false);
  }
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(s.lbReset).toBe("2026-11"); // applied quietly, so it never comes up later
  expect(s.lbNotice).toBe("");
  expect(log.errors).toEqual([]);
});

// the save keeps only the parts it knows on load: LEVEL MODE progress must be one of them
test("levels: stars and best times survive closing and reopening the game", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const lv = {
    p: { 1: { done: true, coins: [true, true, true], flawless: true, best: 30000, attempts: 2 } },
    claimed: {},
    played: 2,
  };
  const log = await openGame(page, { save: { ...SAVE, stats: { runs: 3 }, lv } });
  await run(page, 600);
  const first = await page.evaluate(() => window.__glyShop.data().lv.p[1]);
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 600);
  const again = await page.evaluate(() => window.__glyShop.data().lv.p[1]);
  expect(first).toEqual(lv.p[1]);
  expect(again).toEqual(lv.p[1]);
  expect(log.errors).toEqual([]);
});

test("THE HADDAD: standard hitbox, uppercut flap, slip, punch-count combo, K.O.! best, knockout death, showcase", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["character=haddad"] });
  await startRun(page);
  const step = (n) =>
    page.evaluate((n) => {
      const s = window.__glydrift.scene.getScene("Game");
      window.__t ??= 2e6;
      for (let i = 0; i < n; i++) {
        if (s.state === "playing" && s.player.y > s.H * 0.5 && s.player.vy > -60) s.onTap();
        window.__t += 1000 / 60;
        s.stepFrame(window.__t, 1000 / 60);
      }
    }, n);
  await page.evaluate(() => window.__glyGod(true));
  await step(150);
  const base = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    return {
      id: s.charDef.id,
      radius: s.player.radius,
      speed: s.charDef.speed ?? 1,
      perks: s.charDef.perks ?? null,
      mode: rig.px.mode,
      frame: rig.boxer.frame(),
      hasHat: !!rig.hat,
    };
  });
  expect(base).toMatchObject({ id: "haddad", radius: 21, speed: 1, perks: null, mode: "boxer" });
  // gliding: boxer stance, gloves up (wait for the uppercut from the last flap to finish)
  await page.evaluate(() => {
    const b = window.__glydrift.scene.getScene("Game").player.rig.boxer;
    b.punchT = 0;
  });
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.boxer.frame())).toBe(0);
  await snap(page, testInfo, "haddad-1-glide");
  // the flap is an uppercut with a red streak
  const flap = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    s.onTap();
    window.__t += 1000 / 60;
    s.stepFrame(window.__t, 1000 / 60);
    const b = s.player.rig.boxer;
    return { frame: b.frame(), streak: b.g.commandBuffer.length > 0 };
  });
  expect(flap).toEqual({ frame: 1, streak: true });
  await snap(page, testInfo, "haddad-2-uppercut");
  // near-miss: the slip and a WHOOSH; combo steps: punch counts
  const texts = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    rig.onNear();
    const slip = rig.boxer.frame();
    rig.onCombo(1);
    rig.onCombo(2);
    rig.onCombo(3);
    const shown = s.fx.texts.filter((x) => x.active && x.visible).map((x) => x.text);
    return { slip, shown };
  });
  expect(texts.slip).toBe(2);
  expect(texts.shown).toEqual(expect.arrayContaining(["WHOOSH", "1!", "2!", "3!"]));
  await step(60);
  // new best: K.O.! and the knockout pose
  const ko = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    rig.onBest();
    return {
      frame: rig.boxer.frame(),
      shown: s.fx.texts.filter((x) => x.active && x.visible).map((x) => x.text),
    };
  });
  expect(ko.frame).toBe(3);
  expect(ko.shown).toContain("K.O.!");
  await run(page, 250);
  await snap(page, testInfo, "haddad-3-ko-new-best");
  await run(page, 600);
  await step(90);
  // death: a knockout spin, stars round his head, then he drops
  await page.evaluate(() => window.__glyGod(false));
  const death = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    s.die();
    const b = s.player.rig.boxer;
    for (let i = 0; i < 22; i++) {
      window.__t += 1000 / 60;
      s.stepFrame(window.__t, 1000 / 60);
    }
    return {
      dying: b.dieT > 0,
      spun: Math.abs(s.player.rig.sprite.angle) > 0,
      stars: b.fg.commandBuffer.length > 0,
      visible: s.player.rig.sprite.visible,
    };
  });
  expect(death).toEqual({ dying: true, spun: true, stars: true, visible: true });
  await snap(page, testInfo, "haddad-4-knockout-death");
  // the next run: back on his feet
  const back = await page.evaluate(() => {
    const rig = window.__glydrift.scene.getScene("Game").player.rig;
    rig.reset?.();
    rig.boxer.reset();
    return rig.boxer.dieT;
  });
  expect(back).toBe(-1);

  // character select: the showcase (shadowboxing, toe bounce, glove taps, the smile)
  await home(page);
  await run(page, 600);
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.registry.set("heroFocus", "haddad");
    g.scene.getScene("Menu").scene.start("Characters");
  });
  await waitFor(page, () => window.__glydrift.scene.isActive("Characters"));
  await run(page, 1500);
  const show = await page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Characters");
    const rig = sc.rig;
    const seen = new Set();
    if (!rig?.boxer) return { found: false, id: rig?.def?.id };
    for (let i = 0; i < 400; i++) {
      rig.boxer.update(1 / 60);
      seen.add(rig.boxer.frame());
    }
    rig.boxer.smileT = 1.5;
    return { found: true, frames: [...seen].sort() };
  });
  expect(show.found).toBe(true);
  expect(show.frames).toEqual(expect.arrayContaining([0, 4, 6])); // guard, glove tap / smile, jab
  await snap(page, testInfo, "haddad-5-showcase");
  expect(log.errors).toEqual([]);
});

test("THE HADDAD: 12,000 coins or a x10 combo; his best combo is saved; hats fit him", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...SAVE, coins: 12500, stats: { runs: 5, maxCombo: 5 } } });
  const out = await page.evaluate(() => {
    const { Progression, getCharacter } = window.__glyHeroes;
    const s = window.__glyShop.data();
    const def = getCharacter("haddad");
    const info = {
      name: def.name,
      rarity: def.rarity,
      cost: def.cost,
      desc: def.desc,
      challenge: def.challenge,
      perks: def.perks ?? null,
      speed: def.speed ?? 1,
    };
    // the challenge: not yet at x5, done at x10 (a run's best combo is saved)
    const before = Progression.challengeMet(def);
    Progression.commitRun({ mode: "normal", score: 900, distance: 400, coins: 3, nearMiss: 2, lasers: 0, saws: 0, portals: 0, biome: 0, bestCombo: 10, runTimeMs: 30000, char: "volt" });
    const saved = s.stats.maxCombo;
    const after = Progression.challengeMet(def);
    // or buy him for 12,000 coins
    s.unlocked.haddad = false;
    const bought = Progression.buy("haddad");
    return { info, before, saved, after, bought, coinsLeft: s.coins };
  });
  expect(out.info).toEqual({
    name: "THE HADDAD",
    rarity: "legendary",
    cost: 12000,
    desc: "Never stays down.",
    challenge: { stat: "maxCombo", value: 10, text: "Get a x10 combo" },
    perks: null,
    speed: 1,
  });
  expect(out.before).toBe(false);
  expect(out.saved).toBe(10);
  expect(out.after).toBe(true);
  expect(out.bought).toBe(true);
  // a shop hat sits on his hair (head anchor from the guard pose, not the uppercut glove)
  const hat = await page.evaluate(() => {
    const g = window.__glydrift;
    const tex = g.textures.get("pxc");
    return {
      frames: [0, 1, 2, 3, 4, 5, 6].every((f) => tex.has(`haddad_${f}`)),
      portrait: g.textures.exists("hero_haddad"),
    };
  });
  expect(hat).toEqual({ frames: true, portrait: true });
  expect(log.errors).toEqual([]);
});

// A player crashed at 33K points on a long run: every realm's and dimension's art (~5 MB
// each) stayed in memory, so by the rift into the dimensions it was the same memory that once
// crashed iPhones at launch. Now only the art near the player is kept. Fly a long run through
// every realm, The Calm, the Abyss and the dimensions (the whole engine, animations included)
// and fail if art, objects, pop-ups, tweens or memory keep growing.
test("long runs never pile up: passed realms' art is freed, objects and memory stay flat @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(420_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const fly = (toM) =>
    page.evaluate((toM) => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      window.__T ??= performance.now();
      window.__glyNoRender = true; // the game logic runs every frame; drawing would just be slow here
      for (let i = 0; i < 60 * 60 * 20 && s.meters < toM && s.state === "playing"; i++) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        window.__T += 1000 / 60;
        g.step(window.__T, 1000 / 60); // the whole engine: tweens and timers too
      }
      window.__glyNoRender = false;
      const texMB =
        g.textures
          .getTextureKeys()
          .reduce(
            (a, k) => a + g.textures.get(k).source.reduce((b, src) => b + (src.width || 0) * (src.height || 0) * 4, 0),
            0,
          ) / 1048576;
      return {
        m: Math.floor(s.meters),
        state: s.state,
        built: window.__glyArt.builtBiomes(),
        texMB: Math.round(texMB),
        objs: s.sys.displayList.length,
        backdrop: g.scene.getScene("Backdrop").sys.displayList.length,
        texts: s.fx.texts.length,
        tweens: s.tweens.getTweens().length + g.scene.getScene("Hud").tweens.getTweens().length,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      };
    }, toM);
  const early = await fly(1500);
  const mid = await fly(7000); // past the Abyss, through the rift, into the dimensions
  const late = await fly(14000); // the dimensions again and again
  console.log(JSON.stringify({ early, mid, late }));
  expect(late.state).toBe("playing");
  expect(late.m).toBeGreaterThanOrEqual(13900);
  // only the art near the player: the first biome, the one you're in, the last and the next
  expect(late.built.length).toBeLessThanOrEqual(4);
  expect(mid.built.length).toBeLessThanOrEqual(4);
  // nothing keeps growing between the middle and the end of the run
  expect(late.texMB - mid.texMB).toBeLessThanOrEqual(8);
  expect(late.texMB - early.texMB).toBeLessThanOrEqual(20);
  expect(late.objs - mid.objs).toBeLessThanOrEqual(40);
  expect(late.backdrop - mid.backdrop).toBeLessThanOrEqual(40);
  // (pop-up texts and tweens aren't checked here: tweens run on the page's real clock, which the
  // test freezes, so no fade-out ever finishes in this test. With a running clock the pop-up
  // pool holds at ~15, measured with a free-running soak.)
  if (late.heapMB && mid.heapMB) expect(late.heapMB - mid.heapMB).toBeLessThanOrEqual(15);
  // a new run comes back to the freed realms: their art is built again, no errors
  const again = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    window.__glyGod(false);
    s.die();
    window.__glyGod(true);
    for (let i = 0; i < 400 && s.state !== "dead"; i++) {
      window.__T += 1000 / 60;
      g.step(window.__T, 1000 / 60);
    }
    for (const k of ["GameOver", "Hud", "Game"]) g.scene.stop(k);
    g.scene.start("Game", { mode: "normal" });
    return true;
  });
  expect(again).toBe(true);
  await run(page, 800);
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  const back = await fly(1800);
  expect(back.state).toBe("playing");
  // the new run's realms were built again (and the far ones freed again)
  expect(back.built).toContain("void");
  expect(back.built.some((id) => ["solar", "frozen", "glitch", "abyss"].includes(id))).toBe(true);
  expect(back.built.length).toBeLessThanOrEqual(4);
  expect(log.errors).toEqual([]);
});

// crash safety: the phone closes the game mid-run (iOS does that, without any error, when
// memory runs out). The next launch finishes the run from its checkpoint, puts the score on
// the leaderboard queue, reports it, and tells the player.
test("crash safety: a run the phone closed is saved and reported at the next launch @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["god"], save: { ...SAVE, best: 100, stats: { runs: 3 } } });
  await startRun(page);
  const at = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 60 * 30 && s.meters < 600; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    s.saveCheckpoint();
    return { score: s.score, m: Math.floor(s.meters), cp: !!window.__glyCrash.CrashSafety.pending() };
  });
  expect(at.cp).toBe(true);
  // the phone closes the game: no game over, no commit. Reopen it.
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 1500);
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    const m = window.__glydrift.scene.getScene("Menu");
    const texts = [];
    const walk = (o) => {
      if (o?.text) texts.push(o.text);
      (o?.list || []).forEach(walk);
    };
    m.children.list.forEach(walk);
    return {
      best: s.best,
      runs: s.stats.runs,
      queued: s.lbQueue.filter((q) => q.type === "score" && /endless/.test(q.level)).map((q) => q.score),
      crashes: window.__glyCrash.CrashReport.queued().map((r) => [r.kind, r.score, r.distance, r.realm != null, r.build]),
      left: window.__glyCrash.CrashSafety.pending(),
      toast: texts.some((t) => t === "YOUR LAST RUN WAS SAVED"),
    };
  });
  expect(after.best).toBe(at.score);
  expect(after.runs).toBe(4);
  expect(after.queued).toContain(at.score);
  expect(after.crashes).toEqual([["killed_mid_run", at.score, at.m, true, expect.any(String)]]);
  expect(after.left).toBe(null);
  expect(after.toast).toBe(true);
  expect(log.errors).toEqual([]);
});

// crash safety: an error mid-run. The frame guard keeps the game alive; if the frame keeps
// failing it goes back to the home screen. Before it does, the run is finished (saved, score
// queued) and the crash is reported with the score, distance and realm.
test("crash safety: an error mid-run is reported and the run is still saved @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["god"], save: { ...SAVE, best: 50, stats: { runs: 3 } } });
  await startRun(page);
  const at = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 60 * 30 && s.meters < 500; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    s.saveCheckpoint();
    // something breaks: every frame of the run now throws
    s.sys.sceneUpdate = () => {
      throw new Error("test: broken frame");
    };
    return { score: s.score, m: Math.floor(s.meters) };
  });
  await run(page, 1500); // > 20 failing frames: the run ends the normal way
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 20_000);
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    return {
      best: s.best,
      runs: s.stats.runs,
      queued: s.lbQueue.filter((q) => q.type === "score" && /endless/.test(q.level)).map((q) => q.score),
      kinds: window.__glyCrash.CrashReport.queued().map((r) => r.kind),
      frame: window.__glyCrash.CrashReport.queued().find((r) => r.kind === "frame"),
      left: window.__glyCrash.CrashSafety.pending(),
    };
  });
  expect(after.best).toBe(at.score);
  expect(after.runs).toBe(4);
  expect(after.queued).toContain(at.score);
  expect(after.kinds).toEqual(expect.arrayContaining(["frame", "recovered"]));
  expect(after.frame.message).toContain("broken frame");
  expect(after.frame.score).toBeGreaterThan(0);
  expect(after.frame.distance).toBeGreaterThan(400);
  expect(after.left).toBe(null);
  // GAME OVER shows the run like any other; RETRY starts a fresh, working run
  expect(await page.evaluate(() => window.__glydrift.scene.isActive("Hud"))).toBe(true);
  await run(page, 1500);
  // (the button can sit under a NEW BEST / level-up pop-up for a moment: press RETRY itself)
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 1200);
  await waitFor(page, () => {
    const s = window.__glydrift.scene.getScene("Game");
    return window.__glydrift.scene.isActive("Game") && !window.__glydrift.scene.isPaused("Game") && s.state !== "dead";
  });
  await press(page, await fieldPoint(page));
  await run(page, 1000);
  expect((await gameState(page)).state).toBe("playing");
  expect(await page.evaluate(() => window.__glydrift.scene.isActive("GameOver"))).toBe(false);
  // the frame error is logged on purpose here
  expect(log.errors.filter((e) => !/broken frame|loop kept alive/.test(e))).toEqual([]);
});

// always the latest version: every build publishes its id in version.json (an open game polls
// it and reloads into a new version when it's safe), the same id as the service worker's cache
test("every build publishes its version for the auto-update check @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const v = JSON.parse(readFileSync("dist/version.json", "utf8"));
  expect(v.build).toMatch(/^[a-z0-9]+$/);
  expect(readFileSync("dist/sw.js", "utf8")).toContain(`glydrift-${v.build}`);
  const js = readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
  expect(js.some((f) => readFileSync(`dist/assets/${f}`, "utf8").includes(v.build))).toBe(true);
});
