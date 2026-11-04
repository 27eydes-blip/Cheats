// Shared helpers for the Glydrift browser tests.
//
// Every test runs the *test build* (it exposes window.__glydrift) with:
//  - a frozen, fake clock (page.clock): the game only advances when a test calls `run(ms)`,
//    so every run, frame and screenshot is identical from one test run to the next
//  - a seeded Math.random and no audio (?noaudio): no randomness in what's drawn
//  - every request outside the local test server blocked (no Supabase, no analytics)
//  - a saved game seeded into localStorage (no first-launch popups unless a test wants them)
import { expect, test } from "@playwright/test";

export const NOW = new Date("2026-11-04T12:00:00Z");
const TODAY = "2026-11-04";

export const SAVE = {
  coins: 5000,
  best: 1200,
  level: 6,
  xp: 120,
  spins: 1,
  selected: "volt",
  unlocked: { volt: true, ember: true },
  login: { last: TODAY, streak: 3, claimed: TODAY },
  settings: { gfxChecked: true, gfxBoot: true },
  profile: { username: "TestPilot" },
  seasons: { s1: { xp: 900, claimed: {}, started: true, heroSeen: true } },
};

/** Open the game and wait for the home screen. */
export async function openGame(page, opts = {}) {
  const errors = [];
  const warnings = [];
  const failed = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    // blocked outside requests (Supabase, analytics) are expected in tests
    if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(`console: ${t}`);
    else if (m.type() === "warning") warnings.push(t);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith("http://localhost")) failed.push(`${r.url()} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith("http://localhost") && r.status() >= 400)
      failed.push(`${r.status()} ${r.url()}`);
  });
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
  // a frozen clock: time only moves when a test calls run() (install alone keeps it ticking)
  await page.clock.install({ time: new Date(NOW.getTime() - 1000) });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ save, noStorage }) => {
      // seeded Math.random (mulberry32): the same "random" world every run
      let a = 0x9e3779b9;
      window.__glyReseed = (seed) => {
        a = seed;
      };
      Math.random = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      if (noStorage) {
        // private browsing / blocked site data: every storage access throws
        const deny = () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        };
        for (const k of ["localStorage", "sessionStorage"])
          Object.defineProperty(window, k, { configurable: true, get: deny });
      } else if (save && !sessionStorage.getItem("glyTestSeeded")) {
        sessionStorage.setItem("glyTestSeeded", "1");
        localStorage.setItem("glydrift.save.v1", JSON.stringify(save));
      }
    },
    { save: opts.save === undefined ? SAVE : opts.save, noStorage: !!opts.noStorage },
  );
  // draw only every 12th frame (logic still runs every frame): software GPUs are slow
  const query = ["noaudio", "offline", "renderEvery=12", ...(opts.flags || [])].join("&");
  await page.goto(`${opts.base || ""}/?${query}`);
  // Let everything that loads in real time (fonts, images, seasons.json) finish before the
  // fake clock moves, so every run boots on exactly the same frame.
  for (let i = 0; i < 150; i++) {
    if (
      await page.evaluate(
        () => !!(window.__glydrift?.isBooted || document.querySelector("#game canvas")),
      )
    )
      break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
  if (opts.screen === null) {
    // release build: no test hooks, so wait for its canvas and let it run
    await waitFor(page, () => !!document.querySelector("#game canvas"), 30_000).catch(async (e) => {
      const text = await page.evaluate(() =>
        document.getElementById("game")?.innerText.slice(0, 160),
      );
      throw new Error(`${e.message} — page says: ${text} errors: ${errors.join(" | ")}`);
    });
    await run(page, 1200); // draws every frame (no test flags): keep it short
  } else {
    const key = opts.screen || "Menu";
    try {
      await waitFor(page, (k) => window.__glydrift?.scene.isActive(k), 30_000, key);
    } catch (e) {
      // say why the game never reached its first screen
      const why = await page.evaluate(() => {
        const c = document.createElement("canvas");
        return {
          text: document.getElementById("game")?.innerText.slice(0, 160),
          canvas: !!document.querySelector("#game canvas"),
          hooks: typeof window.__glydrift,
          booted: !!window.__glydrift?.isBooted,
          webgl2: !!c.getContext("webgl2"),
          webgl: !!document.createElement("canvas").getContext("webgl"),
          scenes: window.__glydrift?.scene.getScenes(true).map((x) => x.sys.settings.key),
        };
      });
      throw new Error(`${e.message} — ${JSON.stringify(why)} errors: ${errors.join(" | ")}`);
    }
    await run(page, 800);
  }
  return { errors, warnings, failed };
}

/** Restart the "random" sequence (so a run plays out identically every time). */
export const reseed = (page, seed = 12345) => page.evaluate((s) => window.__glyReseed?.(s), seed);

/** Draw a fresh frame now (before a screenshot). */
export async function freshFrame(page) {
  await page.evaluate(() => {
    window.__glyRender = true;
  });
  await page.clock.runFor(20);
}

/** Advance the game by `ms` of (fake) time, in frame-sized steps. */
export async function run(page, ms) {
  await page.clock.runFor(ms);
}

/** Step the fake clock until `fn` (run in the page) is truthy. */
export async function waitFor(page, fn, maxMs = 15_000, arg) {
  for (let t = 0; t < maxMs; t += 100) {
    if (await page.evaluate(fn, arg)) return;
    await page.clock.runFor(100);
  }
  throw new Error(`timed out waiting for: ${fn.toString().slice(0, 120)}`);
}

export const isActive = (page, key) =>
  page.evaluate((k) => window.__glydrift.scene.isActive(k), key);

export const gameState = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    return s?.sys.isActive() || s?.sys.isPaused()
      ? { state: s.state, meters: s.meters, flaps: s.run?.flaps ?? 0, paused: s.sys.isPaused() }
      : null;
  });

/**
 * Page coordinates of the visible text label `label` (topmost screen first), so tests can
 * press real buttons the way a player does.
 */
export async function locate(page, label) {
  const pt = await page.evaluate((label) => {
    const g = window.__glydrift;
    const want = label.toUpperCase();
    const norm = (s) => String(s).replace(/\s+/g, " ").trim().toUpperCase();
    const shown = (o) => {
      for (let p = o; p; p = p.parentContainer) if (!p.visible || p.alpha === 0) return false;
      return true;
    };
    const scenes = g.scene.getScenes(true).reverse();
    for (const sc of scenes) {
      let hit = null;
      const walk = (list) => {
        for (let i = list.length - 1; i >= 0 && !hit; i--) {
          const o = list[i];
          if (o.list) walk(o.list);
          if (!hit && o.type === "Text" && norm(o.text) === want && shown(o)) hit = o;
        }
      };
      walk(sc.children.list);
      if (!hit) continue;
      const b = hit.getBounds();
      const cam = sc.cameras.main;
      const sx = (b.centerX - cam.worldView.x) * cam.zoom + cam.x;
      const sy = (b.centerY - cam.worldView.y) * cam.zoom + cam.y;
      const r = g.canvas.getBoundingClientRect();
      return {
        x: r.left + (sx * r.width) / g.canvas.width,
        y: r.top + (sy * r.height) / g.canvas.height,
      };
    }
    return null;
  }, label);
  if (!pt) throw new Error(`no visible "${label}" on screen`);
  return pt;
}

/** Press a point like a player: a finger on touch devices, the mouse elsewhere. */
export async function press(page, pt) {
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  await run(page, 50);
}

/** Press the button labelled `label`, then let the game run `after` ms. */
export async function tap(page, label, after = 900) {
  await press(page, await locate(page, label));
  await run(page, after);
}

/** A point on the playfield away from every button (for flapping). */
export async function fieldPoint(page) {
  return page.evaluate(() => {
    const r = window.__glydrift.canvas.getBoundingClientRect();
    return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.6 };
  });
}

/** The canvas fits the window and keeps the game's own aspect ratio (never stretched). */
export async function expectFramed(page) {
  const m = await page.evaluate(() => {
    const c = window.__glydrift.canvas;
    const r = c.getBoundingClientRect();
    return {
      cssAspect: r.width / r.height,
      aspect: c.width / c.height,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      vw: innerWidth,
      vh: innerHeight,
      fit: window.__glydrift.scale.scaleMode === 3, // Phaser.Scale.FIT
    };
  });
  expect(Math.abs(m.cssAspect / m.aspect - 1)).toBeLessThan(0.01);
  if (m.fit) {
    // whole frame visible, centred
    expect(m.left).toBeGreaterThanOrEqual(-1);
    expect(m.top).toBeGreaterThanOrEqual(-1);
    expect(m.right).toBeLessThanOrEqual(m.vw + 1);
    expect(m.bottom).toBeLessThanOrEqual(m.vh + 1);
    expect(Math.abs(m.left - (m.vw - m.right))).toBeLessThan(2);
  } else {
    // phones: edge to edge (rounding may crop a hair, never bars)
    expect(m.left).toBeLessThanOrEqual(1);
    expect(m.right).toBeGreaterThanOrEqual(m.vw - 1);
    expect(m.top).toBeLessThanOrEqual(1);
    expect(m.bottom).toBeGreaterThanOrEqual(m.vh - 1);
  }
  return m;
}

export const profileOf = (testInfo) => testInfo.project.metadata.profile;
export const isTouch = (testInfo) => !!testInfo.project.use.hasTouch;
