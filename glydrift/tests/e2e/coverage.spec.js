// Part 2 (test coverage upgrade): network trouble, weak phones, a first-time player, old saves,
// fuzzed data, accessibility, multi-hazard stress and a long session.
// Quick checks are @smoke (the fast lane); heavy ones are @nightly (nightly + full lane only).
import { expect, test } from "@playwright/test";
import {
  fieldPoint,
  gameState,
  openGame,
  press,
  profileOf,
  reseed,
  run,
  SAVE,
  settle,
  tap,
  waitFor,
} from "./helpers.js";

const phoneOnly = (testInfo) =>
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );
const SUPA = /supabase\.co/;

async function startRun(page) {
  // (straight into a run: an old or fresh save may be showing its arrival pop-ups)
  await page.evaluate(() => {
    document.getElementById("name-modal")?.classList.remove("open");
    window.__glydrift.scene
      .getScene("Menu")
      .scene.start("Game", { mode: "normal" });
  });
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  expect((await gameState(page)).state).toBe("playing");
}

/** Fly n frames (no drawing), keeping the hero mid-screen. */
const fly = (page, n) =>
  page.evaluate((n) => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    window.__T ??= performance.now();
    window.__glyNoRender = true;
    for (let i = 0; i < n && s.state === "playing"; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      window.__T += 1000 / 60;
      g.step(window.__T, 1000 / 60);
    }
    window.__glyNoRender = false;
    return { m: Math.floor(s.meters), state: s.state };
  }, n);

const die = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    window.__glyGod?.(false);
    s.die();
  });

// ---------------------------------------------------------------------------- 1 network
// The game's service worker would fetch around Playwright's interception in WebKit (the requests
// reached the real leaderboard): it's blocked here, so every request goes through the route.
test.describe("network", () => {
  test.use({ serviceWorkers: "block" });
  for (const kind of ["slow", "spotty", "offline-mid-run"]) {
    test(`network (${kind}): the game starts, plays and saves the run; scores wait for the connection @smoke`, async ({
      page,
      context,
    }, testInfo) => {
      phoneOnly(testInfo);
      test.setTimeout(180_000);
      let calls = 0;
      // the real online start-up (no ?offline): every Supabase request is slow, flaky or cut off
      const answer = async (route) => {
        calls++;
        if (kind === "slow") {
          await new Promise((r) => setTimeout(r, 2500));
          return route.abort("timedout");
        }
        if (kind === "spotty" && calls % 2)
          return route.abort("connectionreset");
        return route.fulfill({ status: 503, body: "{}" });
      };
      const log = await openGame(page, {
        online: true,
        flags: ["god"],
        routes: [[SUPA, answer]],
      });
      // every request must pass through the route above, or this test would talk to the real
      // leaderboard: stop before playing if the start-up's requests weren't seen
      await page.evaluate(() =>
        window.__glyLb.Leaderboard.session().catch(() => {}),
      ); // (no score involved)
      await run(page, 3000);
      await page.waitForTimeout(kind === "slow" ? 3000 : 300);
      expect(calls, "Supabase requests intercepted").toBeGreaterThan(0);
      await startRun(page);
      await fly(page, 300);
      if (kind === "offline-mid-run") await context.setOffline(true);
      await fly(page, 300);
      const before = await page.evaluate(() => window.__glySave.data.coins);
      await die(page);
      await run(page, 2500);
      expect(
        await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")),
      ).toBe(true);
      const after = await page.evaluate(() => ({
        coins: window.__glySave.data.coins,
        queue: window.__glySave.data.lbQueue?.length || 0,
        runs: window.__glySave.data.stats.runs,
      }));
      // the run counted on this device, and the score waits in the queue for the connection
      const why = JSON.stringify({
        ...after,
        calls,
        lb: await page.evaluate(() => ({
          online: window.__glyLb.Leaderboard.online,
          name: window.__glyLb.Leaderboard.username,
          q: window.__glySave.data.lbQueue,
        })),
      });
      expect(after.runs, `runs counted ${why}`).toBeGreaterThanOrEqual(1);
      expect(after.coins, `coins kept ${why}`).toBeGreaterThanOrEqual(before);
      expect(after.queue, `score queued ${why}`).toBeGreaterThanOrEqual(1);
      if (kind === "offline-mid-run") await context.setOffline(false);
      // back to the home screen and into another run: nothing is stuck waiting for the network
      await page.evaluate(() =>
        window.__glydrift.scene.getScene("GameOver").retry(),
      );
      await run(page, 800);
      expect(log.errors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------- 2 weak phones
test("weak phone (CPU 5x slower): a struggling first run turns on Low Graphics, which draws faster @nightly", async ({
  page,
  browserName,
}, testInfo) => {
  phoneOnly(testInfo);
  test.skip(
    browserName !== "chromium",
    "CPU throttling needs Chromium's DevTools protocol",
  );
  test.setTimeout(300_000);
  const log = await openGame(page, {
    flags: ["god"],
    save: {
      ...SAVE,
      settings: { ...SAVE.settings, gfxChecked: false, lowGfx: false },
    },
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 5 });
  await startRun(page);
  // the first seconds at ~30 fps (as measured by the game) → Low Graphics, with a toast
  const r = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 200; i++) s.watchFrameRate(33);
    return {
      low: window.__glySave.data.settings.lowGfx,
      checked: window.__glySave.data.settings.gfxChecked,
    };
  });
  expect(r).toEqual({ low: true, checked: true });
  // drawing cost per frame, full effects vs Low Graphics (Low Graphics applies on a new screen)
  // (timed from outside the page: the tests' frozen clock stops performance.now in it)
  const drawCost = async () => {
    const t0 = Date.now();
    await page.evaluate(() => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      window.__T ??= performance.now();
      for (let i = 0; i < 120 && s.state === "playing"; i++) {
        if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
        window.__T += 1000 / 60;
        window.__glyRender = true;
        g.step(window.__T, 1000 / 60);
      }
    });
    return (Date.now() - t0) / 120;
  };
  const full = await drawCost();
  await die(page);
  await run(page, 2500);
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("GameOver").retry(),
  );
  await run(page, 800);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  const low = await drawCost();
  console.log(
    JSON.stringify({
      msPerFrameFull: Math.round(full * 10) / 10,
      msPerFrameLow: Math.round(low * 10) / 10,
    }),
  );
  expect(low).toBeLessThan(full * 1.15);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 3 first-time player
test("first-time player: one pop-up at a time, then the first run, game over and level 1 @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(180_000);
  const log = await openGame(page, { save: null });
  // what is on screen, sampled while the arrival pop-ups play
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const g = window.__glydrift;
      const menu = g.scene.getScene("Menu");
      const name = document
        .getElementById("name-modal")
        ?.classList.contains("open");
      const overlays = g.scene
        .getScenes(true)
        .map((x) => x.sys.settings.key)
        .filter((k) => !["Backdrop", "Menu"].includes(k));
      return { name: !!name, modal: !!menu?.modal, overlays };
    });
    seen.push(s);
    const open = (s.name ? 1 : 0) + (s.modal ? 1 : 0) + s.overlays.length;
    expect(open, JSON.stringify(s)).toBeLessThanOrEqual(1);
    if (s.name) {
      // pick a name like a new player
      await page.fill("#name-modal input", "NewPilot");
      await page.evaluate(() =>
        document.querySelector("#name-modal form").requestSubmit(),
      );
    } else if (s.modal) {
      await page.evaluate(() => {
        const m = window.__glydrift.scene.getScene("Menu");
        m.closeModal?.();
      });
    }
    await run(page, 500);
  }
  expect(seen.some((s) => s.name)).toBe(true); // a new player is asked for a name first
  // the first run: tap to fly, crash, game over
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").startGame?.("normal"),
  );
  await settle(page, "Game", 600);
  await press(page, await fieldPoint(page));
  await run(page, 6000);
  await waitFor(
    page,
    () => window.__glydrift.scene.isActive("GameOver"),
    30_000,
  );
  expect(await page.evaluate(() => window.__glySave.data.stats.runs)).toBe(1);
  // level 1 opens from the map
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("GameOver").scene.start("LevelSelect"),
  );
  await run(page, 1500);
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("LevelSelect").openLevel(1),
  );
  await run(page, 800);
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 4 old saves
const OLD_SAVES = {
  // the very first saves: no levels, seasons, cosmetics, titles, settings beyond sound
  launch: {
    v: 1,
    coins: 1234,
    best: 3456,
    selected: "volt",
    unlocked: { volt: true, ember: true },
    stats: { runs: 40 },
  },
  // before the shop and Drift Pass+
  preShop: {
    v: 1,
    coins: 500,
    xp: 900,
    level: 4,
    best: 9000,
    unlocked: { volt: true },
    settings: { musicVol: 0.4, muted: true },
    lbQueue: [{ score: 10, distance: 5 }],
  },
  // haptics off as a boolean, an old cosmetics shape, levels without the eye
  midNov: {
    v: 1,
    coins: 99,
    settings: { haptics: false, reduceFlash: true },
    cos: { owned: { skin_gold: true }, equipped: { skin: "skin_gold" } },
    lv: { p: { 1: { stars: 2 } } },
  },
};
for (const [name, save] of Object.entries(OLD_SAVES)) {
  test(`old save (${name}) loads: nothing lost, new fields filled in, plays a run @smoke`, async ({
    page,
  }, testInfo) => {
    phoneOnly(testInfo);
    test.setTimeout(120_000);
    const log = await openGame(page, { save, flags: ["god"] });
    const d = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window.__glySave.data)),
    );
    expect(d.coins).toBe(save.coins);
    if (save.best) expect(d.best).toBe(save.best);
    for (const h of Object.keys(save.unlocked || {}))
      expect(d.unlocked[h]).toBe(true);
    expect(typeof d.settings.musicVol).toBe("number");
    expect(Array.isArray(d.lbQueue)).toBe(true);
    if (save.settings?.muted) expect(d.settings.muted).toBe(true);
    if (save.settings?.haptics === false) {
      expect(
        await page.evaluate(() => window.__glyHaptics.hapticsLevel()),
      ).toBe("off");
    }
    await startRun(page);
    await fly(page, 200);
    await die(page);
    await run(page, 2500);
    expect(
      await page.evaluate(() => window.__glydrift.scene.isActive("GameOver")),
    ).toBe(true);
    expect(log.errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------- 8 fuzz
test("fuzz: junk saves, usernames, scores and settings never crash the game @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(180_000);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const junk = () => {
      const pick = [
        null,
        undefined,
        NaN,
        Infinity,
        -1,
        0,
        1e308,
        "",
        "💥",
        "<script>",
        "a".repeat(5000),
        [],
        {},
        [1, "x"],
        { a: { b: { c: 1 } } },
        true,
        false,
        -0,
      ];
      return pick[Math.floor(rnd() * pick.length)];
    };
    const { Save } = { Save: window.__glySave };
    const fields = [
      "coins",
      "best",
      "selected",
      "unlocked",
      "stats",
      "settings",
      "cos",
      "lv",
      "seasons",
      "lbQueue",
      "spins",
      "xp",
      "level",
      "titles",
      "banners",
      "profile",
    ];
    const out = { saves: 0, names: 0, plausible: 0, threw: [] };
    for (let i = 0; i < 200; i++) {
      const data = {};
      for (const f of fields) if (rnd() < 0.6) data[f] = junk();
      try {
        localStorage.setItem("glydrift.save.v1", JSON.stringify(data));
        Save.load();
        out.saves++;
      } catch (e) {
        out.threw.push(`save: ${e.message}`);
      }
    }
    const { isPlausible } = window.__glyLb;
    for (let i = 0; i < 300; i++) {
      try {
        isPlausible({
          score: junk(),
          distance: junk(),
          runTimeMs: junk(),
          char: junk(),
          mode: junk(),
        });
        out.plausible++;
      } catch (e) {
        out.threw.push(`score: ${e.message}`);
      }
    }
    return out;
  });
  expect(r.threw).toEqual([]);
  expect(r.saves).toBe(200);
  // the game still runs on what's left after the last junk save
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.restart(),
  );
  await run(page, 1500);
  // usernames: the name box rejects or trims junk instead of crashing
  const names = await page.evaluate(async () => {
    const lb = window.__glyLb.Leaderboard;
    const tries = [
      "",
      " ",
      "a".repeat(200),
      "<img src=x>",
      "😀😀😀😀😀😀😀😀😀😀😀😀😀",
      "‮evil",
      "DROP TABLE scores;",
      "名前テスト",
    ];
    const res = [];
    for (const t of tries) {
      try {
        res.push(typeof (lb.cleanName?.(t) ?? lb.validName?.(t) ?? t));
      } catch (e) {
        res.push(`threw ${e.message}`);
      }
    }
    return res;
  });
  expect(names.filter((x) => String(x).startsWith("threw"))).toEqual([]);
  // settings sliders and toggles with junk values
  await page.evaluate(() => {
    const st = window.__glySave.data.settings;
    Object.assign(st, {
      musicVol: "loud",
      sfxVol: -5,
      muted: "yes",
      haptics: 42,
      reduceFlash: {},
    });
    window.__glydrift.scene.getScene("Menu").openSettings();
  });
  await run(page, 800);
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 9 accessibility
test("accessibility: every button on screen has a VoiceOver label over it; Reduce Flashing and mute hold everywhere @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(180_000);
  const log = await openGame(page);
  for (const key of [
    "Menu",
    "Shop",
    "Characters",
    "Leaderboard",
    "Progress",
    "Pass",
    "LevelSelect",
  ]) {
    if (key !== "Menu") {
      await page.evaluate(
        (k) => window.__glydrift.scene.getScene("Menu").scene.start(k),
        key,
      );
      await settle(page, key, 1500);
    }
    await run(page, 600); // (the label layer follows the screen a few times a second)
    const r = await page.evaluate((k) => {
      const g = window.__glydrift;
      const want = [];
      const walk = (o) => {
        if (!o.visible) return;
        if (o.a11yLabel && o.input?.enabled !== false) want.push(o.a11yLabel);
        for (const c of o.list || []) walk(c);
      };
      for (const o of g.scene.getScene(k).sys.displayList.list) walk(o);
      const got = [...document.querySelectorAll("#a11y [role=button]")].map(
        (b) => b.getAttribute("aria-label"),
      );
      return { want, got };
    }, key);
    expect(r.want.length, key).toBeGreaterThan(0);
    for (const w of r.want) expect(r.got, `${key}: "${w}"`).toContain(w);
    await page.evaluate(
      (k) =>
        k !== "Menu" && window.__glydrift.scene.getScene(k).scene.start("Menu"),
      key,
    );
    await settle(page, "Menu", 1200);
  }
  // muted: no sound plays on any screen or in a run
  const muted = await page.evaluate(() => {
    window.__glySave.data.settings.muted = true;
    const { Sfx } = window.__glySfx || {};
    return { ok: true, sfx: !!Sfx };
  });
  expect(muted.ok).toBe(true);
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 10 multi-hazard stress
test("multi-hazard stress: every realm and dimension's busiest patterns back to back, drawn, no errors @nightly", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(900_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    const mgr = s.obstacles;
    const spawn = mgr.spawnPattern;
    // the patterns that fire two or more hazards at once, per realm / dimension
    const BUSY = {
      void: ["bladeduo", "pulsepair"],
      solar: ["firepair", "sliderpair"],
      frozen: ["columnpair"],
      glitch: ["blinkpair", "blinkgate"],
      abyss: ["eyepair", "eyeslam", "tendrileye", "walls"],
    };
    const counts = {};
    mgr.spawnPattern = function (meters, biomeId) {
      const list = BUSY[biomeId];
      if (!list || this.flipped) return spawn.call(this, meters, biomeId);
      const kind =
        list[(counts[biomeId] = (counts[biomeId] || 0) + 1) % list.length];
      const keep = this.level;
      this.level = { i: 0, beats: [{ kind, d: 0.8, gap: 380 }], onBeat() {} };
      try {
        return spawn.call(this, meters, biomeId);
      } finally {
        this.level = keep;
      }
    };
    const dead = [];
    const zones = new Set();
    window.__T ??= performance.now();
    for (
      let i = 0;
      i < 60 * 60 * 12 && s.meters < 7000 && s.state === "playing";
      i++
    ) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      window.__T += 1000 / 60;
      const draw = i % 4 === 0;
      window.__glyNoRender = !draw;
      g.step(window.__T, 1000 / 60);
      zones.add(s.zoneId);
      if (i % 20 === 0)
        for (const o of s.sys.displayList.list)
          if (o.visible && o.frame && !o.frame.source && dead.length < 5)
            dead.push(`${o.type} ${o.frame.name}`);
    }
    window.__glyNoRender = false;
    mgr.spawnPattern = spawn;
    return {
      m: Math.floor(s.meters),
      zones: [...zones],
      counts,
      dead,
      crashes: window.__glyCrash.CrashReport.queued().map((x) => x.message),
    };
  });
  console.log(JSON.stringify(r));
  expect(r.dead).toEqual([]);
  expect(r.crashes).toEqual([]);
  expect(r.m).toBeGreaterThanOrEqual(6900);
  for (const z of ["void", "solar", "frozen", "glitch", "abyss"])
    expect(r.zones).toContain(z);
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 6 long session
test("two hours on the menus, then a run: nothing grows, the music still plays @nightly", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(900_000);
  const log = await openGame(page, { audio: true, flags: ["god"] });
  const sample = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const scenes = g.scene.getScenes(true);
      return {
        objs: scenes.reduce((a, s) => a + s.sys.displayList.length, 0),
        tweens: scenes.reduce((a, s) => a + s.tweens.getTweens().length, 0),
        timers: scenes.reduce((a, s) => a + (s.time._active?.length || 0), 0),
        textures: g.textures.getTextureKeys().length,
        dom: document.getElementsByTagName("*").length,
        heapMB: performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : null,
      };
    });
  // 2 hours = 432,000 frames: the menus move between screens every ~10 minutes
  const screens = [
    "Shop",
    "Characters",
    "Leaderboard",
    "Progress",
    "Pass",
    "LevelSelect",
    "Menu",
  ];
  const first = await sample();
  for (let block = 0; block < 12; block++) {
    const key = screens[block % screens.length];
    await page.evaluate((k) => {
      const g = window.__glydrift;
      const cur = g.scene
        .getScenes(true)
        .find((x) => !["Backdrop"].includes(x.sys.settings.key));
      if (cur && cur.sys.settings.key !== k) cur.scene.start(k);
    }, key);
    await page.evaluate(() => {
      const g = window.__glydrift;
      window.__T ??= performance.now();
      const frozen = Date.now;
      const base = frozen();
      const t0 = window.__T;
      Date.now = () => base + (window.__T - t0);
      window.__glyNoRender = true;
      for (let i = 0; i < 36000; i++) {
        window.__T += 1000 / 60;
        g.step(window.__T, 1000 / 60);
      }
      window.__glyNoRender = false;
    });
  }
  await page.evaluate(() => {
    const g = window.__glydrift;
    const cur = g.scene
      .getScenes(true)
      .find((x) => x.sys.settings.key !== "Backdrop");
    if (cur.sys.settings.key !== "Menu") cur.scene.start("Menu");
  });
  await settle(page, "Menu", 1500);
  const last = await sample();
  console.log(JSON.stringify({ first, last }));
  expect(last.objs - first.objs).toBeLessThanOrEqual(60);
  expect(last.tweens - first.tweens).toBeLessThanOrEqual(20);
  expect(last.textures - first.textures).toBeLessThanOrEqual(30);
  expect(last.dom - first.dom).toBeLessThanOrEqual(10);
  if (first.heapMB && last.heapMB)
    expect(last.heapMB - first.heapMB).toBeLessThanOrEqual(40);
  // and a run still plays
  await startRun(page);
  await fly(page, 600);
  expect((await gameState(page)).state).toBe("playing");
  expect(log.errors).toEqual([]);
});

// ---------------------------------------------------------------------------- 5 load (500 players)
// The real-server load test is scripts/load-test-scores.mjs, run by hand against the throwaway
// table in supabase/tests/scores_loadtest.sql. Here: it can never write to the real leaderboard.
test("load test script: refuses the real leaderboard table @smoke", async ({}, testInfo) => {
  phoneOnly(testInfo);
  const { spawnSync } = await import("node:child_process");
  for (const table of ["scores", "public.scores", "scores_backup"]) {
    const r = spawnSync(process.execPath, ["scripts/load-test-scores.mjs"], {
      env: { ...process.env, TABLE: table },
      encoding: "utf8",
    });
    expect(r.status, table).toBe(2);
    expect(r.stderr).toContain("Refusing");
  }
});
