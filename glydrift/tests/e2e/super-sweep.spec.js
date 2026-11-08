// Regression tests for the super sweep (2026-11-08): one per bug fixed that night.
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  fieldPoint,
  openGame,
  press,
  profileOf,
  reseed,
  run,
  SAVE,
  settle,
} from "./helpers.js";

const phoneOnly = (testInfo) =>
  test.skip(
    profileOf(testInfo) !== "iphone-std",
    "once per browser, at phone size",
  );

test("cloud sync: never uploads before a successful merge; a write during an upload is pushed after it", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(async () => {
    const { Account } = window.__glyAccount;
    const calls = [];
    let cloudUp = false;
    const cloud = {
      coins: 99999,
      best: 50000,
      unlocked: { volt: true, ember: true },
      stats: { runs: 400 },
    };
    // a signed-in player whose launch-time pull failed (offline)
    Account.backend = {
      ...Account.backend,
      loadSave: async () => {
        calls.push("load");
        if (!cloudUp) throw new Error("offline");
        return cloud;
      },
      storeSave: async (id, save) => {
        calls.push("store");
        if (window.__writeMidUpload) Account.schedulePush(); // a Save.write lands mid-upload
        return save;
      },
    };
    Account.user = { id: "u1", email: "a@b.c", anon: false };
    Account.merged = false;
    await Account.pushNow(); // offline: tries to pull, never stores
    const offline = [...calls];
    cloudUp = true;
    calls.length = 0;
    await Account.pushNow(); // back online: pull + merge, then store
    const online = [...calls];
    const merged = Account.merged;
    const keptCloudHero = !!window.__glySave.data.unlocked.ember;
    // a write while an upload is in flight is pushed again afterwards
    Account.pushing = true;
    Account.schedulePush();
    const dirty = Account.dirty;
    Account.pushing = false;
    calls.length = 0;
    window.__writeMidUpload = true;
    await Account.pushNow(); // (finishing it queues the next push for the write that came in)
    window.__writeMidUpload = false;
    const again = !!Account.pushTimer;
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    return { offline, online, merged, keptCloudHero, dirty, again };
  });
  expect(r.offline).toEqual(["load"]);
  expect(r.online).toEqual(["load", "store"]);
  expect(r.merged).toBe(true);
  expect(r.keptCloudHero).toBe(true);
  expect(r.dirty).toBe(true);
  expect(r.again).toBe(true);
  expect(log.errors).toEqual([]);
});

test("log out while the cloud can't be reached: refused, nothing on this device is wiped", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { save: { ...SAVE, coins: 4321 } });
  const r = await page.evaluate(async () => {
    const { Account } = window.__glyAccount;
    Account.backend = {
      ...Account.backend,
      loadSave: async () => null,
      storeSave: async () => {
        throw new Error("offline");
      },
      signOut: async () => {},
    };
    Account.user = { id: "u1", email: "a@b.c", anon: false };
    Account.merged = true;
    let error = null;
    try {
      await Account.logOut();
    } catch (e) {
      error = e.code || e.message;
    }
    return {
      error,
      coins: window.__glySave.data.coins,
      still: Account.signedIn,
    };
  });
  expect(r.error).toBe("offline");
  expect(r.coins).toBe(4321);
  expect(r.still).toBe(true);
  expect(log.errors).toEqual([]);
});

test("cloud merge keeps Drift Pass+ banners, finished event challenges and the finale eye", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const local = {
      ...window.__glySave.data,
      banners: { owned: { crimson: true }, equipped: "crimson" },
      seasons: {
        s1: {
          xp: 10,
          claimed: {},
          plusClaimed: { 16: true },
          ev: { done: { abyss5: true } },
        },
      },
    };
    const cloud = {
      ...JSON.parse(JSON.stringify(local)),
      coins: 10,
      best: 99999,
      stats: { runs: 999 },
      banners: { owned: {}, equipped: null },
      seasons: {
        s1: { xp: 5000, claimed: {}, plusClaimed: {}, ev: { done: {} } },
      },
    };
    const m = mergeSaves(local, cloud);
    const lv = window.__glyLevelMerge(
      { p: {}, eyeOpen: 3 },
      { p: {}, eyeOpen: 1 },
    );
    return {
      banner: !!m.banners.owned.crimson,
      ev: !!m.seasons.s1.ev?.done?.abyss5,
      plus: !!m.seasons.s1.plusClaimed[16],
      eye: lv.eyeOpen,
    };
  });
  expect(r).toEqual({ banner: true, ev: true, plus: true, eye: 3 });
  expect(log.errors).toEqual([]);
});

test("Daily Drop: winding the phone clock forward then back can't claim it twice", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const { Shop } = window.__glyShop;
    const d = window.__glySave.data;
    d.dailyDrop = "";
    const tomorrow = !!Shop.claimDrop("2026-11-09");
    const backToday = Shop.dropReady("2026-11-08");
    const dayAfter = Shop.dropReady("2026-11-10");
    return { tomorrow, backToday, dayAfter };
  });
  expect(r).toEqual({ tomorrow: true, backToday: false, dayAfter: true });
  expect(log.errors).toEqual([]);
});

test("Drift Pass+: earned paid tiers are paid out when the season ends (owners only, once)", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const P = window.__glyPassPlus;
    const track = window.__glyPlusS1.plusTrackS1({ banner: "crimson" });
    const season = { id: "s1", pass: { plus: track } };
    const d = window.__glySave.data;
    const i = track.findIndex((t) => t.coins);
    const notOwner = P.claimEnded(season, i);
    P.grant("s1", { transactionId: "t" });
    const c0 = d.coins;
    const first = P.claimEnded(season, i);
    const second = P.claimEnded(season, i);
    return {
      notOwner,
      paid: d.coins - c0,
      coins: track[i].coins,
      first: !!first,
      second,
    };
  });
  expect(r.notOwner).toBe(null);
  expect(r.first).toBe(true);
  expect(r.paid).toBe(r.coins);
  expect(r.second).toBe(null);
  expect(log.errors).toEqual([]);
});

test("heroes: TUNG's level extras go with her on death; the Mirror twin leaves nothing behind; skin portraits", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(180_000);
  const log = await openGame(page, {
    flags: ["god", "character=tung"],
    save: {
      ...SAVE,
      unlocked: { volt: true, tung: true, dawson: true },
      selected: "tung",
      stats: { ...SAVE.stats, tungRuns: 100 },
    },
  });
  await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Menu")
      .scene.start("Game", { mode: "normal" }),
  );
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 300);
  const r = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const step = (n) => {
      for (let i = 0; i < n; i++) {
        s.player.y = s.H * 0.45;
        s.player.vy = 0;
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    };
    step(20);
    const h = s.player.rig.hb;
    const auraBefore = h.aura.visible;
    // the Mirror twin, shown then hidden
    const twin = s.twin;
    twin.setVisible(true);
    twin.hb.aura.setVisible(true);
    twin.hideAll();
    const twinLeft = [...twin.hb.objects].filter(
      (o) => o.visible && o.type !== "Graphics",
    ).length;
    window.__glyGod(false);
    s.die();
    step(4);
    const auraAfter = h.aura.visible;
    const fxgEmpty = h.fxg.commandBuffer.length === 0;
    // portraits wear DAWSON's own skins (not the colour skin underneath)
    const { heroImage } = window.__glyHeroImage;
    const img = heroImage(s, 0, 0, "dawson", 0.5, {
      dskin: "dskin_greatwhite",
      skin: "skin_gold",
    });
    const key = img.img.texture.key;
    const tint = img.img.isTinted;
    img.destroy();
    return { auraBefore, auraAfter, fxgEmpty, twinLeft, key, tint };
  });
  expect(r.auraBefore).toBe(true);
  expect(r.auraAfter).toBe(false);
  expect(r.fxgEmpty).toBe(true);
  expect(r.twinLeft).toBe(0);
  expect(r.key).toBe("hero_dawson_dskin_greatwhite");
  expect(r.tint).toBe(false);
  expect(log.errors).toEqual([]);
});

test("pausing during the Abyss blackout shows the pause menu", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["god"] });
  await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Menu")
      .scene.start("Game", { mode: "normal" }),
  );
  await settle(page, "Game", 800);
  await press(page, await fieldPoint(page));
  await run(page, 300);
  const a = await page.evaluate(() => {
    const hud = window.__glydrift.scene.getScene("Hud");
    hud.setBlackout(true);
    hud.pause();
    return hud.cameras.main.alpha;
  });
  expect(a).toBe(1);
  expect(log.errors).toEqual([]);
});

test("a screen change can't be started twice by a second tap during the fade", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const started = await page.evaluate(async () => {
    const { fadeTo } = window.__glyUi;
    const g = window.__glydrift;
    const menu = g.scene.getScene("Menu");
    const seen = [];
    const orig = menu.scene.start.bind(menu.scene);
    menu.scene.start = (k, d) => {
      seen.push(k);
      return orig(k, d);
    };
    fadeTo(menu, "Shop");
    fadeTo(menu, "Characters");
    return seen;
  });
  await run(page, 600);
  expect(started).toEqual([]); // (nothing yet: the fade runs first)
  const active = await page.evaluate(() =>
    ["Shop", "Characters"].filter((k) => window.__glydrift.scene.isActive(k)),
  );
  expect(active).toEqual(["Shop"]);
  expect(log.errors).toEqual([]);
});

test("release build: offline pre-cache lists the game's files; no soundtrack test page or synth engine", async ({}, testInfo) => {
  phoneOnly(testInfo);
  const sw = readFileSync("dist/sw.js", "utf8");
  const assets = readdirSync("dist/assets");
  const js = assets.filter((f) => f.endsWith(".js"));
  for (const f of js) expect(sw).toContain(`assets/${f}`);
  expect(sw).toMatch(/r\.mode === "navigate" \? caches\.match\("\.\/"\)/);
  expect(sw).toMatch(/version\.json"\)\) return/);
  expect(assets.some((f) => /houseEngine|^tone-/.test(f))).toBe(false);
  expect(
    js.some((f) =>
      readFileSync(`dist/assets/${f}`, "utf8").includes('"MusicTest"'),
    ),
  ).toBe(false);
});

test("crash reports: two flushes at once send each row once; a refused upload keeps the rows", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(async () => {
    const { CrashReport } = window.__glyCrash;
    localStorage.setItem("glydrift.crashq", "[]");
    const sent = [];
    let fail = false;
    CrashReport.setFlushHook(async (rows) => {
      await Promise.resolve();
      if (fail) return { message: "offline" };
      sent.push(...rows.map((x) => x.message));
      return null;
    });
    CrashReport.report("error", new Error("sweep test one"));
    CrashReport.report("error", new Error("sweep test two")); // a second report mid-upload
    await CrashReport.flush();
    await CrashReport.flush();
    fail = true;
    CrashReport.report("error", new Error("sweep test three"));
    await CrashReport.flush();
    const kept = CrashReport.queued().map((x) => x.message);
    CrashReport.setFlushHook(null);
    return { sent, kept };
  });
  expect(r.sent.filter((m) => m === "sweep test one")).toHaveLength(1);
  expect(r.sent.filter((m) => m === "sweep test two")).toHaveLength(1);
  expect(r.kept).toEqual(["sweep test three"]);
  expect(log.errors.filter((e) => !/sweep test/.test(e))).toEqual([]);
});

test("a run already credited by another page load isn't checkpointed (and reported) again", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const { CrashSafety } = window.__glyCrash;
    const run = {
      mode: "normal",
      char: "volt",
      score: 900,
      distance: 300,
      coins: 0,
      runTimeMs: 61000,
    };
    CrashSafety.checkpoint(run, { realm: "void" });
    const hiddenFlag = "hidden" in CrashSafety.pending();
    // another page load (second tab / reopened app) recovers this page's run…
    const cp = CrashSafety.pending();
    localStorage.setItem(
      "glydrift.liveRun",
      JSON.stringify({ ...cp, sid: "other-page" }),
    );
    localStorage.setItem(
      "glydrift.recoveredRuns",
      JSON.stringify([CrashSafety.session]),
    );
    CrashSafety.clear();
    // …then this page, still alive in the background, is hidden again
    CrashSafety.checkpoint(run, { realm: "void" });
    const rewritten = !!CrashSafety.pending();
    localStorage.removeItem("glydrift.recoveredRuns");
    return { hiddenFlag, rewritten };
  });
  expect(r).toEqual({ hiddenFlag: true, rewritten: false });
  expect(log.errors).toEqual([]);
});

test("shop: an unknown item in today's offers (old config / removed item) doesn't crash any tab", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  await page.evaluate(() => {
    const { Shop } = window.__glyShop;
    const real = Shop.daily.bind(Shop);
    Shop.daily = () => ({
      ...real(),
      deal: "gone_item",
      items: ["gone_item", ...real().items],
    });
    window.__glydrift.scene.getScene("Menu").scene.start("Shop");
  });
  await settle(page, "Shop", 600);
  for (const tab of ["featured", "daily", "skin", "effects"]) {
    await page.evaluate(
      (t) => window.__glydrift.scene.getScene("Shop").setTab(t),
      tab,
    );
    await run(page, 300);
  }
  expect(log.errors).toEqual([]);
});
