// NIGHTLY SOAK (no AI anywhere: a scripted player). One test per device profile, run only by the
// nightly sweep (.github/workflows/glydrift.yml, "soak" job): for SOAK_MINUTES (default 10) of
// real time it loops through
//   a long god-mode run (every realm and dimension in turn) → a few deaths and RETRYs →
//   a hero swap → the Shop (tabs, cards) → home again
// and fails on: a console error, a page crash, a WebGL context loss, a crash report, steady
// memory growth, or a big frame-time spike. The numbers it saw go in soak-<project>.json.
// Normal CI lanes skip it (@nightly); the nightly full suite skips it too (@soak runs on its own).
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, reseed, run, SAVE, settle } from "./helpers.js";

const MINUTES = Number(process.env.SOAK_MINUTES) || 10;
// frame-time spikes, judged in two groups. Measured: locally the longest game-logic frame is
// ~17 ms; on GitHub's machines (no graphics card: drawing is done in software and its leftover
// work lands on later frames) Chromium's reached 1.4-2.2 s on the first nights; drawn frames
// take 1-13 s there now and then:
//   game-logic frames (not drawn): longer than SPIKE_MS = a spike (about twice CI's normal worst)
//   drawn frames: longer than DRAW_SPIKE_MS = a hang
// the slowest frames of each night are in the report (soak-*.json)
const SPIKE_MS = Number(process.env.SOAK_SPIKE_MS) || 4000;
const DRAW_SPIKE_MS = Number(process.env.SOAK_DRAW_SPIKE_MS) || 20000;
// home-screen memory may wander a little between visits; steady growth beyond this fails
const HEAP_GROWTH_MB = 40; // Chromium: JS heap after a forced garbage collection
const TEXTURE_GROWTH = 120; // every engine: textures alive on the home screen
const OBJECT_GROWTH = 300; // every engine: display objects alive on the home screen

test("nightly soak: 10 minutes of scripted play (realms, retries, hero swaps, shop) @nightly @soak", async ({
  page,
}, testInfo) => {
  test.setTimeout((MINUTES + 8) * 60_000);
  const engine = testInfo.project.metadata.engine;
  const problems = [];
  page.on("crash", () => problems.push("the page crashed"));
  // real time for frame measurements (the tests' fake clock stops performance.now)
  await page.addInitScript(() => {
    const now = performance.now.bind(performance);
    window.__realNow = () => now();
    window.__ctxLost = 0;
    document.addEventListener("webglcontextlost", () => window.__ctxLost++, true);
  });
  const log = await openGame(page, { flags: ["god"], save: { ...SAVE, coins: 999999 } });
  // every hero owned, so the swaps can go through the whole roster
  const heroes = await page.evaluate(() => {
    const ids = window.__glyRoster.ids();
    const s = window.__glySave.data;
    for (const id of ids) s.unlocked[id] = true;
    window.__glySave.write();
    return ids;
  });
  const cdp = engine === "chromium" ? await page.context().newCDPSession(page) : null;

  /**
   * Fly `frames` frames of the current run. The game's logic runs every frame and is timed
   * strictly; each realm or dimension is DRAWN for its first 90 frames (every 2nd frame, checking
   * it draws, timed only for hangs). On CI the graphics are drawn in software and leave work behind
   * that slows the frames after them, so logic timing pauses for 600 frames after drawing
   * (measured: with no drawing the longest logic frame is ~10 ms).
   */
  const fly = (frames, autoTap) =>
    page.evaluate(
      ({ frames, autoTap }) => {
        const g = window.__glydrift;
        const s = g.scene.getScene("Game");
        window.__T ??= 1e6;
        let max = 0;
        let maxDraw = 0;
        const zones = new Set();
        let zone = null;
        let drawUntil = 0;
        let timeFrom = 0;
        for (let i = 0; i < frames && s.state === "playing"; i++) {
          if (autoTap && s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
          if (s.zoneId !== zone || i === 0) {
            zone = s.zoneId;
            drawUntil = i + 90;
          }
          window.__glyNoRender = !(i < drawUntil && i % 2 === 0);
          if (!window.__glyNoRender) timeFrom = i + 600;
          const t0 = window.__realNow();
          window.__T += 1000 / 60;
          g.step(window.__T, 1000 / 60);
          const ms = window.__realNow() - t0;
          const drawn = !window.__glyNoRender;
          if (drawn) maxDraw = Math.max(maxDraw, ms);
          else if (i >= timeFrom) max = Math.max(max, ms);
          if (ms > 200 && (drawn || i >= timeFrom) && (window.__slow ??= []).length < 50) window.__slow.push({ i, ms: Math.round(ms), m: Math.floor(s.meters), zone: s.zoneId, drawn });
          if (i % 60 === 0) zones.add(s.zoneId);
        }
        window.__glyNoRender = false;
        return { state: s.state, m: Math.floor(s.meters), maxFrameMs: Math.round(max), maxDrawMs: Math.round(maxDraw), zones: [...zones] };
      },
      { frames, autoTap },
    );
  /** What's alive on the home screen (the same place every lap, so laps compare fairly). */
  const homeSample = async () => {
    if (cdp) await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
    return page.evaluate(() => {
      const g = window.__glydrift;
      let objs = 0;
      const walk = (l) => l.forEach((o) => (objs++, o.list && walk(o.list)));
      for (const sc of g.scene.getScenes(true)) walk(sc.sys.displayList?.list || []);
      return {
        textures: g.textures.getTextureKeys().length,
        objs,
      };
    }).then(async (x) => {
      // Chromium: the JS heap after a forced garbage collection
      const h = cdp ? await cdp.send("Runtime.getHeapUsage").catch(() => null) : null;
      return { ...x, heapMB: h ? Math.round(h.usedSize / 1048576) : null };
    });
  };
  const toScene = async (key, data) => {
    await page.evaluate(
      ({ key, data }) => {
        const g = window.__glydrift;
        const cur = g.scene.getScenes(true).find((s) => s.sys.settings.key !== "Backdrop");
        cur.scene.start(key, data);
      },
      { key, data },
    );
    await settle(page, key, 600);
  };
  const startRun = async () => {
    await toScene("Game", { mode: "normal" });
    await reseed(page, 1000 + laps);
    await run(page, 500);
    await begin();
  };
  /** Start the run that's waiting for its first tap (a real tap, then the game's own tap handler). */
  const begin = async () => {
    await press(page, await fieldPoint(page));
    await run(page, 100);
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      if (s.state === "ready") s.onTap();
    });
    await run(page, 100);
  };
  const die = async () => {
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      window.__glyGod(false);
      s.die();
      for (let i = 0; i < 400 && !window.__glydrift.scene.isActive("GameOver"); i++) {
        window.__T += 1000 / 60;
        window.__glydrift.step(window.__T, 1000 / 60);
      }
      window.__glyGod(true);
    });
    await settle(page, "GameOver", 600);
  };

  const deadline = Date.now() + MINUTES * 60_000;
  const samples = [];
  const zonesSeen = new Set();
  let laps = 0;
  let maxFrameMs = 0;
  let maxDrawMs = 0;
  let farthest = 0;
  while (Date.now() < deadline) {
    laps++;
    // 1. a hero from the roster, in turn
    const hero = heroes.at(laps % heroes.length);
    await page.evaluate((id) => {
      window.__glySave.data.selected = id;
      window.__glySave.write();
    }, hero);
    // 2. a god-mode run: every other lap a long one (6 minutes of game time: through every realm
    // and into the dimensions), the others a short one
    await startRun();
    // in pieces of 30 s of game time, so a slow browser stops at the deadline, not 8 min past it
    const r = { state: "playing", m: 0, maxFrameMs: 0, maxDrawMs: 0, zones: [] };
    for (let left = 60 * 60 * (laps % 2 ? 6 : 1); left > 0 && r.state === "playing" && Date.now() < deadline; left -= 1800) {
      const part = await fly(Math.min(1800, left), true);
      r.state = part.state;
      r.m = part.m;
      r.maxFrameMs = Math.max(r.maxFrameMs, part.maxFrameMs);
      r.maxDrawMs = Math.max(r.maxDrawMs, part.maxDrawMs);
      r.zones.push(...part.zones);
    }
    maxFrameMs = Math.max(maxFrameMs, r.maxFrameMs);
    maxDrawMs = Math.max(maxDrawMs, r.maxDrawMs);
    farthest = Math.max(farthest, r.m);
    r.zones.forEach((z) => zonesSeen.add(z));
    // 3. three deaths and RETRYs
    for (let k = 0; k < 3 && Date.now() < deadline; k++) {
      await die();
      await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
      await run(page, 600);
      await begin();
      const short = await fly(60 * 8, true);
      maxFrameMs = Math.max(maxFrameMs, short.maxFrameMs);
      maxDrawMs = Math.max(maxDrawMs, short.maxDrawMs);
    }
    await die();
    // 4. the Shop: every tab, a few cards
    await toScene("Shop");
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Shop");
      for (const tab of s.tabs?.map?.((t) => t.id || t) || ["heroes"]) {
        try {
          s.setTab(tab);
          for (let i = 0; i < Math.min(3, s.cards?.length || 0); i++) s.focus(i, true);
        } catch {
          /* a tab without cards */
        }
      }
    });
    await run(page, 800);
    // 5. home, and a sample of what's alive there
    await toScene("Menu");
    await run(page, 1500);
    samples.push(await homeSample());
    const st = await page.evaluate(() => ({
      lost: window.__ctxLost,
      crashes: window.__glyCrash?.CrashReport?.queued?.().length || 0,
    }));
    if (st.lost) problems.push(`WebGL context lost (${st.lost} times)`);
    if (st.crashes) problems.push(`${st.crashes} crash report(s) queued`);
    if (log.errors.length || problems.length) break;
  }

  // steady growth = the last third of the laps higher than the first third (the first lap warms
  // the caches up and doesn't count)
  const warm = samples.slice(1);
  const third = Math.max(1, Math.floor(warm.length / 3));
  const avg = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0) / Math.max(1, xs.length);
  const head = warm.slice(0, third);
  const tail = warm.slice(-third);
  const growth = {
    heapMB: Math.round(avg(tail, "heapMB") - avg(head, "heapMB")),
    textures: Math.round(avg(tail, "textures") - avg(head, "textures")),
    objs: Math.round(avg(tail, "objs") - avg(head, "objs")),
  };
  const report = {
    project: testInfo.project.name,
    minutes: MINUTES,
    laps,
    farthestM: farthest,
    zonesSeen: [...zonesSeen].sort(),
    maxFrameMs,
    maxDrawMs,
    growth,
    samples,
    errors: log.errors,
    problems,
  };
  report.slowFrames = await page.evaluate(() => window.__slow || []);
  writeFileSync(`soak-${testInfo.project.name}.json`, JSON.stringify(report, null, 2));
  await testInfo.attach("soak-report", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  console.log(JSON.stringify({ ...report, samples: undefined }));

  expect(log.errors, "console errors").toEqual([]);
  expect(problems, "crashes / context loss").toEqual([]);
  if (MINUTES >= 5) expect(laps, "laps finished").toBeGreaterThanOrEqual(2);
  expect(maxFrameMs, `longest game-logic frame (limit ${SPIKE_MS} ms)`).toBeLessThan(SPIKE_MS);
  expect(maxDrawMs, `longest drawn frame (limit ${DRAW_SPIKE_MS} ms)`).toBeLessThan(DRAW_SPIKE_MS);
  if (warm.length >= 3) {
    if (samples[0].heapMB != null) expect(growth.heapMB, "JS heap growth on the home screen (MB)").toBeLessThan(HEAP_GROWTH_MB);
    expect(growth.textures, "texture growth on the home screen").toBeLessThan(TEXTURE_GROWTH);
    expect(growth.objs, "display-object growth on the home screen").toBeLessThan(OBJECT_GROWTH);
  }
});
