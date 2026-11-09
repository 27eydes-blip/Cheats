// Crash-proofing (docs/CRASH_PROOF.md): long-run leaks, recovery from errors, damaged saves,
// loading failures, background, crash reports.
import { expect, test } from "@playwright/test";
import {
  fieldPoint,
  gameState,
  locate,
  openGame,
  press,
  profileOf,
  reseed,
  run,
  SAVE,
  settle,
  tap,
  tapHome,
  reveal,
  waitFor,
} from "./helpers.js";

const phoneOnly = (testInfo, why = "once per browser, at phone size") =>
  test.skip(profileOf(testInfo) !== "iphone-std", why);

async function startRun(page) {
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  expect((await gameState(page)).state).toBe("playing");
}

/** Counters for things that leak: DOM listeners, timers (installed before the game loads). */
async function countLeaks(page) {
  await page.addInitScript(() => {
    const L = (window.__leak = { listeners: 0, timeouts: new Set(), intervals: 0 });
    const reg = new WeakMap();
    const add = EventTarget.prototype.addEventListener;
    const rem = EventTarget.prototype.removeEventListener;
    const key = (t, o) => `${t}|${typeof o === "boolean" ? o : !!o?.capture}`;
    EventTarget.prototype.addEventListener = function (t, fn, o) {
      let m = reg.get(this);
      if (!m) reg.set(this, (m = new Map()));
      const k = key(t, o);
      if (!m.has(k)) m.set(k, new Set());
      if (fn && !o?.once && !m.get(k).has(fn)) {
        m.get(k).add(fn);
        L.listeners++;
      }
      return add.call(this, t, fn, o);
    };
    EventTarget.prototype.removeEventListener = function (t, fn, o) {
      const s = reg.get(this)?.get(key(t, o));
      if (s?.delete(fn)) L.listeners--;
      return rem.call(this, t, fn, o);
    };
    const st = window.setTimeout;
    const ct = window.clearTimeout;
    const si = window.setInterval;
    const ci = window.clearInterval;
    window.setTimeout = function (f, ms, ...a) {
      const id = st.call(window, (...x) => {
        L.timeouts.delete(id);
        if (typeof f === "function") f(...x);
      }, ms, ...a);
      L.timeouts.add(id);
      return id;
    };
    window.clearTimeout = (id) => (L.timeouts.delete(id), ct.call(window, id));
    window.setInterval = function (...a) {
      L.intervals++;
      return si.apply(window, a);
    };
    window.clearInterval = (id) => (L.intervals--, ci.call(window, id));
  });
}

// ------------------------------------------------------------------ the long run (Mateo's bug)
test("soak: a 50,000+ score run through every realm and dimension never piles anything up", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std" || testInfo.project.metadata.engine === "firefox",
    "iPhone size, WebKit and Chromium");
  test.setTimeout(1_500_000);
  await countLeaks(page);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const fly = (toScore) =>
    page.evaluate((toScore) => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      window.__T ??= performance.now();
      // the game's clock follows the simulated time, so tweens and timers finish as in play
      const frozen = Date.now;
      const base = frozen();
      const t0 = window.__T;
      Date.now = () => base + (window.__T - t0);
      window.__glyNoRender = true;
      const zones = new Set(window.__zones || []);
      for (let i = 0; i < 60 * 60 * 45 && s.score < toScore && s.state === "playing"; i++) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        window.__T += 1000 / 60;
        g.step(window.__T, 1000 / 60);
        if (i % 120 === 0) zones.add(s.zoneId);
      }
      window.__zones = [...zones];
      window.__glyNoRender = false;
      Date.now = frozen;
      const walk = (list, a) => {
        for (const o of list) {
          a.objs++;
          if (o.type === "ParticleEmitter") a.particles += o.getAliveParticleCount?.() || 0;
          if (o.list) walk(o.list, a);
        }
        return a;
      };
      const a = { objs: 0, particles: 0, tweens: 0, timers: 0, sceneEv: 0 };
      for (const sc of g.scene.getScenes(false)) {
        walk(sc.sys.displayList?.list || [], a);
        a.tweens += sc.tweens ? sc.tweens.getTweens().length : 0;
        a.timers += sc.time ? (sc.time._active?.length || 0) + (sc.time._pendingInsertion?.length || 0) : 0;
        a.sceneEv += sc.events.eventNames().reduce((x, n) => x + sc.events.listenerCount(n), 0);
      }
      const ev = (e) => e.eventNames().reduce((x, n) => x + e.listenerCount(n), 0);
      const save = JSON.parse(localStorage.getItem("glydrift.save.v1") || "{}");
      return {
        score: Math.floor(s.score),
        m: Math.floor(s.meters),
        state: s.state,
        zones: window.__zones,
        ...a,
        gameEv: ev(g.events),
        inputEv: ev(g.input.events),
        textures: g.textures.getTextureKeys().length,
        built: window.__glyArt.builtBiomes().length,
        dom: window.__leak.listeners,
        timeouts: window.__leak.timeouts.size,
        intervals: window.__leak.intervals,
        lbQueue: (save.lbQueue || []).length,
        crashes: window.__glyCrash.CrashReport.queued().length,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      };
    }, toScore);
  const early = await fly(3000);
  const mid = await fly(15000);
  const late = await fly(52000);
  console.log(JSON.stringify({ early, mid, late }));
  expect(late.state).toBe("playing");
  expect(late.score).toBeGreaterThanOrEqual(50000);
  // every realm and every dimension on the way
  for (const z of ["void", "solar", "frozen", "glitch", "abyss", "valley", "hurricane", "prism", "tidal", "chrono", "mirror"])
    expect(late.zones).toContain(z);
  // nothing grows between the middle and the end of the run
  // (the count swings by up to ~120 with the realm on screen at the moment it's sampled; a leak
  // grows without end, so it would be thousands by the end of a 25 km run)
  expect(late.objs - mid.objs).toBeLessThanOrEqual(160);
  expect(late.textures - mid.textures).toBeLessThanOrEqual(60);
  expect(late.built).toBeLessThanOrEqual(4);
  expect(late.particles).toBeLessThan(600);
  expect(late.tweens).toBeLessThan(80);
  expect(late.timers).toBeLessThan(60);
  expect(late.sceneEv - mid.sceneEv).toBeLessThanOrEqual(4);
  expect(late.gameEv - mid.gameEv).toBeLessThanOrEqual(2);
  expect(late.inputEv - mid.inputEv).toBeLessThanOrEqual(2);
  expect(late.dom - mid.dom).toBeLessThanOrEqual(4);
  expect(late.timeouts).toBeLessThan(40);
  expect(late.intervals - mid.intervals).toBeLessThanOrEqual(1);
  expect(late.lbQueue).toBeLessThanOrEqual(20);
  expect(late.crashes).toBe(0);
  if (late.heapMB && mid.heapMB) expect(late.heapMB - mid.heapMB).toBeLessThanOrEqual(25);
  expect(log.errors).toEqual([]);
});

test("sound effects let go of their audio nodes once they've played", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(120_000);
  const log = await openGame(page, { audio: true });
  await press(page, await fieldPoint(page)); // the first tap unlocks sound
  await run(page, 300);
  const before = await page.evaluate(() => window.__glySfx.live());
  // 400 sounds, as fast as a long run plays them
  for (let k = 0; k < 8; k++) {
    await page.evaluate(() => {
      const { Sfx } = window.__glySfx;
      for (let i = 0; i < 50; i++) [Sfx.coin, Sfx.near, Sfx.combo, Sfx.whoosh, Sfx.tick][i % 5]?.(3);
    });
    await page.waitForTimeout(150);
  }
  const peak = await page.evaluate(() => window.__glySfx.live());
  test.skip(peak === before, "no audio output on this machine");
  await page.waitForTimeout(3000); // real time: every sound has ended
  const after = await page.evaluate(() => window.__glySfx.live() - window.__glySfx.persistent());
  expect(peak).toBeGreaterThan(50);
  expect(after).toBeLessThanOrEqual(10);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ recovery
test("one bad frame never locks up the screens that follow", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  await page.evaluate(() => {
    const menu = window.__glydrift.scene.getScene("Menu");
    const orig = menu.sys.sceneUpdate;
    let once = true;
    menu.sys.sceneUpdate = function (...a) {
      if (once) {
        once = false;
        throw new Error("test: one bad frame");
      }
      return orig.apply(this, a);
    };
  });
  await run(page, 300);
  // a screen change right after (from a tap or a timer): it must happen, and the page live on
  await page.evaluate(() => setTimeout(() => window.__glydrift.scene.getScene("Menu").scene.start("Shop"), 0));
  await run(page, 1200);
  await waitFor(page, () => window.__glydrift.scene.isActive("Shop"));
  await run(page, 600);
  await tap(page, "◀", 0);
  await settle(page, "Menu", 1500);
  expect(log.errors.filter((e) => !/one bad frame|loop kept alive/.test(e))).toEqual([]);
});

test("a screen that fails to open sends the player home with their progress", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const coins = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).coins);
  await page.evaluate(() => {
    const shop = window.__glydrift.scene.getScene("Shop");
    shop.buildBackground = () => {
      throw new Error("test: the shop is broken");
    };
  });
  await tap(page, "SHOP", 0);
  await run(page, 2000);
  await waitFor(page, () => window.__glydrift.scene.isActive("Menu") && !window.__glydrift.scene.isActive("Shop"));
  await run(page, 600);
  // the home screen works: open another screen and come back
  await tapHome(page, "LUCKY SPIN", 0);
  await settle(page, "Spin", 1200);
  await tap(page, "BACK", 0);
  await settle(page, "Menu", 1500);
  const after = await page.evaluate(() => ({
    coins: JSON.parse(localStorage.getItem("glydrift.save.v1")).coins,
    reported: window.__glyCrash.CrashReport.queued().map((r) => r.kind),
  }));
  expect(after.coins).toBe(coins);
  expect(after.reported).toContain("scene");
  expect(log.errors.filter((e) => !/shop is broken|failed to open/.test(e))).toEqual([]);
});

test("the app sent to the background mid-run saves the run straight away", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const m = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 60 * 12; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    window.__glyCrash.CrashSafety.clear(); // only the background save, not the regular one
    window.__glydrift.events.emit("hidden");
    return Math.floor(s.meters);
  });
  const cp = await page.evaluate(() => window.__glyCrash.CrashSafety.pending());
  expect(cp?.run?.distance).toBe(m);
  expect(log.errors).toEqual([]);
});

test("the loading screen offers a retry when the game can't load", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  await page.route(/\/assets\/index-[\w-]+\.js$/, (r) => r.abort());
  await page.goto("/?noaudio&offline");
  await expect(page.locator("#splash")).toContainText("TAP TO TRY AGAIN", { timeout: 15_000 });
  await page.unroute(/\/assets\/index-[\w-]+\.js$/);
  await page.locator("#splash").click();
  await page.waitForFunction(() => window.__glydrift?.scene.isActive("Menu"), null, { timeout: 30_000 });
});

// ------------------------------------------------------------------ saves
test("a damaged save loads from its backup; a save with wrong values is repaired", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  // 1. the main copy is cut off mid-write; the backup copy is good
  await page.addInitScript(() => {
    if (sessionStorage.getItem("damaged")) return;
    sessionStorage.setItem("damaged", "1");
    const good = {
      coins: 4321, level: 7, xp: 50, selected: "ember", unlocked: { volt: true, ember: true },
      settings: { gfxChecked: true, gfxBoot: true }, profile: { username: "TestPilot" },
      login: { last: "2026-11-04", streak: 3, claimed: "2026-11-04" },
    };
    localStorage.setItem("glydrift.save.v1.bak", JSON.stringify(good));
    localStorage.setItem("glydrift.save.v1", JSON.stringify(good).slice(0, 40));
  });
  let log = await openGame(page, { save: null });
  let s = await page.evaluate(() => ({
    coins: window.__glyShop.data().coins,
    sel: window.__glyShop.data().selected,
    kinds: window.__glyCrash.CrashReport.queued().map((r) => r.kind),
    kept: !!localStorage.getItem("glydrift.save.v1.corrupt"),
  }));
  expect(s.coins).toBe(4321);
  expect(s.sel).toBe("ember");
  expect(s.kinds).toContain("save_restored");
  expect(s.kept).toBe(true);
  expect(log.errors).toEqual([]);

  // 2. wrong types everywhere: the game still opens, keeping what's good
  const page2 = await page.context().newPage();
  log = await openGame(page2, {
    save: {
      ...SAVE,
      coins: "lots",
      unlocked: null,
      stats: [],
      lbQueue: "x",
      level: -3,
      spins: Infinity,
      selected: 42,
      settings: { gfxChecked: true, gfxBoot: true },
    },
  });
  s = await page2.evaluate(() => {
    const d = window.__glyShop.data();
    return { coins: d.coins, volt: d.unlocked.volt, lv: d.level, sel: d.selected, q: Array.isArray(d.lbQueue), name: d.profile.username };
  });
  expect(s).toEqual({ coins: 0, volt: true, lv: 1, sel: "volt", q: true, name: "TestPilot" });
  await tap(page2, "HEROES", 0);
  await settle(page2, "Characters", 1500);
  expect(log.errors).toEqual([]);
});

test("a full storage still saves progress (makes room first)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const want = await page.evaluate(() => {
    // the game's own local event log takes 512 KB; junk fills the rest of the storage
    localStorage.setItem("glydrift.analytics.v1", "x".repeat(512 * 1024));
    const chunk = "y".repeat(64 * 1024);
    for (let i = 0; i < 2000; i++) {
      try {
        localStorage.setItem(`junk.${i}`, chunk);
      } catch {
        break;
      }
    }
    const d = window.__glySave.data;
    d.coins += 777;
    d.ghost = { big: "z".repeat(200 * 1024) }; // the save just grew past what fits
    window.__glySave.write();
    return d.coins;
  });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).coins);
  await page.evaluate(() => {
    for (let i = 0; i < 2000; i++) localStorage.removeItem(`junk.${i}`);
  });
  expect(saved).toBe(want);
  expect(log.errors).toEqual([]);
});

test("crash reports never carry personal info", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  await openGame(page);
  const out = await page.evaluate(() =>
    window.__glyCrash.CrashReport.scrub(
      "Sign-in failed for pilot.one+x@mail.example.com token eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl key sb_secret_abc123 " +
        "user 123e4567-e89b-12d3-a456-426614174000 at https://glydrift.com/?email=me%40x.com&code=99",
    ),
  );
  expect(out).not.toMatch(/pilot\.one|mail\.example|eyJhbGci|abc123|123e4567|me%40x|code=99/);
  expect(out).toContain("Sign-in failed");
});

// ------------------------------------------------------------------ chaos / monkey testing
// [the home screen's button (or its row in the MORE sheet), the screen, its back button]
const SCREENS = [
  ["SHOP", "Shop", "◀"],
  ["HEROES", "Characters", "BACK"],
  ["LUCKY SPIN", "Spin", "BACK"],
  ["LEADERBOARD", "Leaderboard", "BACK"],
  ["PROGRESS", "Progress", "BACK"],
  ["SEASON 1 · ABYSS RISING", "Pass", "◀"],
  ["LEVELS", "LevelSelect", "◀"],
];
const OVERLAYS = ["Backdrop", "Boot", "Hud", "GameOver", "LevelComplete"];

/** Back to the home screen from anywhere (and close any page overlay a tap opened). */
const goHome = (page) =>
  page.evaluate(() => {
    for (const id of ["account-modal", "name-modal", "install-modal", "share-modal"])
      document.getElementById(id)?.classList.remove("open");
    const g = window.__glydrift;
    for (const s of g.scene.getScenes(false)) {
      const k = s.sys.settings.key;
      if (!["Backdrop", "Menu"].includes(k) && (s.sys.isActive() || s.sys.isPaused())) g.scene.stop(k);
    }
    if (!g.scene.isActive("Menu")) g.scene.start("Menu");
  });

/** The save is still sound: no negative or broken numbers, the starter hero, real lists. */
const saveIsSound = (page) =>
  page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    const bad = [];
    for (const k of ["coins", "xp", "spins", "best", "level"])
      if (!(Number.isFinite(d[k]) && d[k] >= 0)) bad.push(`${k}=${d[k]}`);
    if (!d.unlocked?.volt) bad.push("no starter hero");
    if (!Array.isArray(d.lbQueue)) bad.push("lbQueue");
    return bad;
  });

/** Exactly one main screen is up once things settle (never two, never none). */
const mainScreens = (page) =>
  page.evaluate(
    (overlays) =>
      window.__glydrift.scene
        .getScenes(true)
        .map((s) => s.sys.settings.key)
        .filter((k) => !overlays.includes(k)),
    OVERLAYS,
  );

test("monkey: random rapid taps, double taps and spam on every screen", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(600_000);
  const log = await openGame(page, { flags: ["lbmock", "god"] });
  const box = await page.evaluate(() => {
    const r = window.__glydrift.canvas.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(r.width, innerWidth), h: Math.min(r.height, innerHeight) };
  });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const touch = testInfo.project.use.hasTouch;
  const hit = async (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  for (const [label, key] of [["(home)", "Menu"], ...SCREENS]) {
    await goHome(page);
    await run(page, 800);
    if (key !== "Menu") {
      await tapHome(page, label, 0);
      await settle(page, key, 1200);
    }
    for (let i = 0; i < 120; i++) {
      const x = box.x + 8 + rnd() * (box.w - 16);
      const y = box.y + 8 + rnd() * (box.h - 16);
      await hit(x, y);
      if (rnd() < 0.3) await hit(x + 2, y + 2); // a double tap
      if (rnd() < 0.1) for (let k = 0; k < 6; k++) await hit(x, y); // spam
      await run(page, Math.floor(rnd() * 140));
      // a page overlay (account, name, share) takes the taps: close it like a player would
      if (i % 20 === 19)
        await page.evaluate(() => {
          for (const id of ["account-modal", "name-modal", "install-modal", "share-modal"])
            document.getElementById(id)?.classList.remove("open");
        });
    }
    await run(page, 1500);
    expect(await page.evaluate(() => window.__glydrift.loop.running)).toBe(true);
    expect(await saveIsSound(page), `after tapping around ${key}`).toEqual([]);
  }
  await goHome(page);
  await run(page, 1000);
  await tap(page, "SHOP", 0);
  await settle(page, "Shop", 1200); // still works normally afterwards
  expect(log.errors).toEqual([]);
});

test("taps during transitions, pop-ups and reveals never leave two screens (or none)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(900_000);
  const log = await openGame(page, { flags: ["lbmock", "god"] });
  for (const [label, key] of SCREENS) {
    for (const delay of [0, 40, 120, 260]) {
      await goHome(page);
      await run(page, 700);
      await reveal(page, label); // (opens the MORE sheet for the screens that live in it)
      const a = await locate(page, label);
      await press(page, a);
      await run(page, delay);
      // mid-fade: tap the same button again, then where BACK will be, then another menu button
      await press(page, a);
      await press(page, { x: a.x, y: a.y + 90 });
      await page.mouse.click(40, 60);
      await run(page, 2000);
      const main = await mainScreens(page);
      expect(main.length, `${key} after ${delay} ms: ${main.join(",")}`).toBe(1);
    }
  }
  // the Lucky Spin reveal: spam taps while the wheel spins and the prize is shown
  await goHome(page);
  await run(page, 700);
  await tapHome(page, "LUCKY SPIN", 0);
  await settle(page, "Spin", 1200);
  const spin = await locate(page, "SPIN");
  for (let i = 0; i < 30; i++) {
    await press(page, spin);
    await run(page, 60);
  }
  await run(page, 6000);
  expect(await saveIsSound(page)).toEqual([]);
  expect(log.errors).toEqual([]);
});

test("opening and closing every screen over and over leaves nothing behind", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(1_200_000);
  await countLeaks(page);
  const log = await openGame(page, { flags: ["lbmock"] });
  const measure = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const ev = (e) => e.eventNames().reduce((x, n) => x + e.listenerCount(n), 0);
      let sceneEv = 0;
      let objs = 0;
      for (const s of g.scene.getScenes(false)) {
        sceneEv += ev(s.events);
        if (s.sys.isActive()) objs += s.sys.displayList.length;
      }
      return {
        gameEv: ev(g.events),
        inputEv: ev(g.input.events),
        sceneEv,
        objs,
        textures: g.textures.getTextureKeys().length,
        dom: window.__leak.listeners,
        intervals: window.__leak.intervals,
      };
    });
  const cycle = async () => {
    for (const [label, key, back] of SCREENS) {
      await tapHome(page, label, 0);
      await settle(page, key, 900);
      await tap(page, back, 0);
      await settle(page, "Menu", 900);
    }
    await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
    await run(page, 400);
    await tap(page, "DONE", 400);
  };
  await cycle(); // the first visit builds each screen's art once
  const first = await measure();
  for (let i = 0; i < 4; i++) await cycle();
  const last = await measure();
  console.log(JSON.stringify({ first, last }));
  expect(last.gameEv - first.gameEv).toBeLessThanOrEqual(1);
  expect(last.inputEv - first.inputEv).toBeLessThanOrEqual(1);
  expect(last.sceneEv - first.sceneEv).toBeLessThanOrEqual(2);
  expect(last.objs - first.objs).toBeLessThanOrEqual(20);
  expect(last.textures - first.textures).toBeLessThanOrEqual(10);
  expect(last.dom - first.dom).toBeLessThanOrEqual(2);
  expect(last.intervals - first.intervals).toBeLessThanOrEqual(0);
  expect(log.errors).toEqual([]);
});

test("rotating, resizing, backgrounding and going offline mid-run", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const fly = (frames) =>
    page.evaluate((frames) => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let i = 0; i < frames && s.state === "playing"; i++) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
      return { m: Math.floor(s.meters), state: s.state };
    }, frames);
  const size = page.viewportSize();
  const resume = async () => {
    // the pause menu came up: RESUME
    await run(page, 400);
    await tap(page, "RESUME", 300);
    await run(page, 3500); // the 3-2-1 countdown
    await press(page, await fieldPoint(page));
    await run(page, 200);
  };
  for (let round = 0; round < 3; round++) {
    await fly(400);
    // rotate to landscape and back, and a Split View-style narrow window
    await page.setViewportSize({ width: size.height, height: size.width });
    await run(page, 500);
    await fly(120);
    await page.setViewportSize({ width: Math.round(size.width * 0.6), height: size.height });
    await run(page, 500);
    await page.setViewportSize(size);
    await run(page, 500);
    // the app goes to the background (a call, the home button) and comes back
    await page.evaluate(() => window.__glydrift.events.emit("hidden"));
    await run(page, 300);
    await page.evaluate(() => window.__glydrift.events.emit("visible"));
    if (await page.evaluate(() => !!window.__glydrift.scene.getScene("Hud").pauseLayer)) await resume();
    // the connection drops and comes back mid-run
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await fly(200);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const st = await fly(200);
    expect(st.state, `round ${round}`).toBe("playing");
  }
  expect(await page.evaluate(() => window.__glydrift.scene.isActive("Game"))).toBe(true);
  expect(log.errors).toEqual([]);
});

test("100 deaths and retries in a row", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(900_000);
  await countLeaks(page);
  const log = await openGame(page, { save: { ...SAVE, stats: { runs: 0 } } });
  await startRun(page);
  const measure = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const ev = (e) => e.eventNames().reduce((x, n) => x + e.listenerCount(n), 0);
      let objs = 0;
      let sceneEv = 0;
      for (const s of g.scene.getScenes(false)) {
        sceneEv += ev(s.events);
        if (s.sys.isActive()) objs += s.sys.displayList.length;
      }
      return { objs, sceneEv, gameEv: ev(g.events), dom: window.__leak.listeners, textures: g.textures.getTextureKeys().length };
    });
  let first = null;
  for (let i = 0; i < 100; i++) {
    // fly a moment, crash, GAME OVER, RETRY (by tapping the background, like a player)
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let k = 0; k < 30; k++) {
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
      if (s.state === "playing") s.die();
    });
    await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"));
    await run(page, 700);
    // (a tap skips the score roll-up, the next one retries; the roll-up's tweens don't run on
    // the test's frozen clock, so press RETRY itself)
    await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
    await run(page, 400);
    await waitFor(page, () => !window.__glydrift.scene.isActive("GameOver"));
    await press(page, await fieldPoint(page));
    await run(page, 150);
    if (i === 9) first = await measure();
  }
  const last = await measure();
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")).stats.runs);
  console.log(JSON.stringify({ first, last, runs }));
  expect(runs).toBe(100);
  expect(last.objs - first.objs).toBeLessThanOrEqual(30);
  expect(last.sceneEv - first.sceneEv).toBeLessThanOrEqual(2);
  expect(last.gameEv - first.gameEv).toBeLessThanOrEqual(1);
  expect(last.dom - first.dom).toBeLessThanOrEqual(2);
  expect(last.textures - first.textures).toBeLessThanOrEqual(10);
  expect(await saveIsSound(page)).toEqual([]);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ data safety
test("a crashed run is credited exactly once, however many times the game restarts", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["god"], save: { ...SAVE, coins: 1000, stats: { runs: 5 } } });
  await startRun(page);
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 60 * 20; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    s.saveCheckpoint();
  });
  // the phone closes the game, then it's reopened three times
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
    await run(page, 800);
  }
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
  expect(s.stats.runs).toBe(6); // one run, credited once
  expect(s.coins).toBeGreaterThanOrEqual(1000);
  expect(await page.evaluate(() => window.__glyCrash.CrashSafety.pending())).toBe(null);
  expect(log.errors).toEqual([]);
});

test("Drift Pass+: a purchase that fails mid-way grants nothing; restoring it later grants it once", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["mockiap"] });
  // through the game's own screen: the store is reached from the Pass
  await tapHome(page, "SEASON 1 · ABYSS RISING", 0);
  await settle(page, "Pass", 1500);
  await page.evaluate(() => localStorage.setItem("glydrift.mockstore.fail", "1")); // the server can't be reached
  await page.evaluate(() => window.__glydrift.scene.getScene("Pass").buyPlus());
  await run(page, 800);
  expect(await page.evaluate(() => window.__glyPassPlus.owns())).toBe(false);
  await page.evaluate(() => localStorage.removeItem("glydrift.mockstore.fail"));
  await page.evaluate(() => window.__glydrift.scene.getScene("Pass").buyPlus());
  await run(page, 800);
  await page.evaluate(() => window.__glydrift.scene.getScene("Pass").restorePurchases());
  await run(page, 800);
  await page.evaluate(() => window.__glydrift.scene.getScene("Pass").restorePurchases());
  await run(page, 800);
  const after = await page.evaluate(() => ({
    owns: window.__glyPassPlus.owns(),
    bought: JSON.parse(localStorage.getItem("glydrift.mockstore")).purchases.length,
  }));
  expect(after).toEqual({ owns: true, bought: 1 });
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ all 50 levels in practice mode
// (normal mode and god runs: game.spec.js "every built level is beatable"; this is the other mode)
for (const [realm, from] of [
  ["Neon Void", 1],
  ["Solar Storm", 11],
  ["Frozen Nebula", 21],
  ["Glitch Realm", 31],
  ["Abyss", 41],
])
  test(`levels in practice mode: start to finish, nothing saved: ${realm}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-iphone-std", "the layouts are the same on every engine");
    test.setTimeout(600_000);
    const { botPlay } = await import("./levelBot.js");
    const log = await openGame(page);
    const before = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("glydrift.save.v1")).lv || {}));
    for (let n = from; n <= from + 9; n++) {
      await page.evaluate((n) => {
        const g = window.__glydrift;
        window.__glyGod(true);
        for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
        g.scene.start("Game", { mode: "level", level: n, practice: true });
      }, n);
      await run(page, 1000);
      const r = await page.evaluate(botPlay, { god: true });
      expect.soft(r.finished, `level ${n} (practice)`).toBe(true);
      expect.soft(await page.evaluate(() => window.__glydrift.scene.getScene("Game").practice), `level ${n}`).toBe(true);
    }
    await page.evaluate(() => window.__glyGod(false));
    const after = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("glydrift.save.v1")).lv || {}));
    expect(after).toBe(before); // practice never records anything: no stars, no best times
    expect(log.errors).toEqual([]);
  });

// ------------------------------------------------------------------ every hero on level 1 and a boss
// (every hero through every realm and dimension in endless: the overnight sweep in
// docs/CRASH_PROOF.md; visible again after RETRY: game.spec.js)
for (let part = 0; part < 5; part++)
  test(`every hero flies level 1 and the level 50 boss to the finish (part ${part + 1} of 5)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-iphone-std", "the layouts are the same on every engine");
    test.setTimeout(900_000);
    const { botPlay } = await import("./levelBot.js");
    const log = await openGame(page);
    const ids = await page.evaluate((part) => window.__heroDefs.map((c) => c.id).filter((_, i) => i % 5 === part), part);
    const bad = [];
    for (const id of ids) {
      for (const n of [1, 50]) {
        await page.evaluate(
          ({ id, n }) => {
            const g = window.__glydrift;
            const d = window.__glySave.data;
            d.unlocked[id] = true;
            d.selected = id;
            // (Pass+ and season heroes need their pass too: fly them regardless)
            window.__glyHeroes.Progression.selectedHero = () => id;
            window.__glyGod(true);
            for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
            g.scene.start("Game", { mode: "level", level: n });
          },
          { id, n },
        );
        await run(page, 900);
        const r = await page.evaluate(botPlay, { god: true });
        const look = await page.evaluate(() => {
          const s = window.__glydrift.scene.getScene("Game");
          const sp = s.player.rig.sprite;
          return { hero: s.charDef.id, visible: !!sp?.visible && sp.alpha > 0.3, tex: sp?.texture?.key };
        });
        if (!r.finished || look.hero !== id || look.tex === "__MISSING")
          bad.push(`${id} level ${n}: finished=${r.finished} hero=${look.hero} tex=${look.tex}`);
      }
    }
    await page.evaluate(() => window.__glyGod(false));
    expect(ids.length).toBeGreaterThan(10);
    expect(bad).toEqual([]);
    expect(log.errors).toEqual([]);
  });
