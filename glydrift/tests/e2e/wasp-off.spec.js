// WASP LORD switched OFF (src/data/heroSwitch.js + supabase/migrations/20261116000001_wasp_lord_off.sql):
//  1. a save that owns him and has him selected loads fine, lands on the player's usual hero and
//     gets exactly one 55,000-coin refund with its message (a guest: on this device)
//  2. an account: the server pays the refund once, never again on reload, on a second device or
//     after logging out and back in
//  3. he appears nowhere: roster, shop, Heroes screen, locker, Lucky Spin, no ILLEGAL anything,
//     and nobody can fly as him
//  4. the migration on a real Postgres: his scores archived then removed from every board, the
//     crown moves, the server rejects his new scores, the refund function pays once; every other
//     hero's rows are exactly as before
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { MIG, pgAvailable, startPg } from "./pg.js";
import { openGame, profileOf, run, SAVE, settle, waitFor } from "./helpers.js";

const REFUND_TEXT = "Wasp Lord has been removed. Your 55,000 coins were refunded.";
const OWNER = {
  ...SAVE,
  coins: 1000,
  selected: "wasplord",
  unlocked: { volt: true, ember: true, frost: true, wasplord: true },
  revealed: { wasplord: true },
  stats: { heroRuns: { volt: 2, ember: 9, frost: 4, wasplord: 40 } },
  lbQueue: [{ type: "score", level: "endless", score: 9000, character: "wasplord", run_time_ms: 60000, distance: 900 }],
};
const saveNow = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.save.v1")));
/** The refund message on the home screen (null when it isn't up). */
const refundMessage = (page) =>
  page.evaluate(() => {
    const m = window.__glydrift.scene.getScene("Menu");
    const c = m.children.list.find((o) => o.name === "waspRefund" && o.active);
    return c ? c.list.find((o) => o.name === "waspRefundText")?.text ?? "" : null;
  });
async function closeRefund(page) {
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").closeModal());
  await run(page, 400);
}
/** Every piece of text a scene shows, inside containers too. */
const sceneTexts = (page, key) =>
  page.evaluate((key) => {
    const texts = (list) => list.flatMap((o) => (o.type === "Text" ? [o.text] : o.list ? texts(o.list) : []));
    return texts(window.__glydrift.scene.getScene(key).children.list).join(" | ");
  }, key);
async function openScene(page, key) {
  await page.evaluate((key) => {
    const g = window.__glydrift;
    const cur = g.scene.getScenes(true).find((s) => s.sys.settings.key !== "Backdrop");
    cur.scene.start(key);
  }, key);
  await settle(page, key, 1200);
}

test("WASP LORD off: an owner's save loads on their usual hero and gets ONE refund with its message (guest) @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: OWNER });
  await waitFor(page, () => {
    const m = window.__glydrift.scene.getScene("Menu");
    return m.children.list.some((o) => o.name === "waspRefund");
  }, 20_000);
  expect(await refundMessage(page)).toBe(REFUND_TEXT);
  let s = await saveNow(page);
  expect(s.coins).toBe(1000 + 55000);
  expect(s.selected).toBe("ember"); // the hero they flew most (not a blank hero, not him)
  expect(s.unlocked.wasplord).toBeUndefined();
  expect(s.unlocked).toEqual(expect.objectContaining({ volt: true, ember: true, frost: true }));
  expect(s.waspRefund).toEqual({ owed: false, paid: true });
  expect(s.lbQueue.filter((q) => q.character === "wasplord")).toEqual([]); // his queued score is dropped
  // the home screen shows the hero they landed on
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Menu").def.id)).toBe("ember");
  await closeRefund(page);
  // reload: no second refund, no second message
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 2500);
  expect(await refundMessage(page)).toBe(null);
  s = await saveNow(page);
  expect(s.coins).toBe(56000);
  // an old copy of the save written back by an old version (him owned again, flag lost):
  // the flag still says paid, so he's removed again with no second refund
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    d.unlocked.wasplord = true;
    d.selected = "wasplord";
    localStorage.setItem("glydrift.save.v1", JSON.stringify(d));
  });
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 2500);
  expect(await refundMessage(page)).toBe(null);
  s = await saveNow(page);
  expect(s.coins).toBe(56000);
  expect(s.selected).toBe("ember");
  expect(s.unlocked.wasplord).toBeUndefined();
  expect(log.errors).toEqual([]);
});

test("WASP LORD off: an account is refunded ONCE by the server (reload, second device, log out and in) @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const UID = "acct-wasp-1";
  const cloud = { ...OWNER, syncId: "s0" };
  delete cloud.lbQueue;
  // the stand-in server: this account owns him (as the migration lists it) and is signed in here
  await page.addInitScript(
    ({ uid, cloud }) => {
      if (sessionStorage.getItem("glyMockSeeded")) return;
      sessionStorage.setItem("glyMockSeeded", "1");
      localStorage.setItem(
        "glydrift.mockserver",
        JSON.stringify({
          users: { "wasp@example.com": { id: uid, password: "hunter2hunter2", save: cloud } },
          session: { id: uid, anon: false, email: "wasp@example.com" },
          n: 1,
          waspOwners: [uid],
        }),
      );
    },
    { uid: UID, cloud },
  );
  const server = () => page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.mockserver")));
  const log = await openGame(page, { flags: ["mockcloud"], save: OWNER });
  await waitFor(page, () => window.__glydrift.scene.getScene("Menu").children.list.some((o) => o.name === "waspRefund"), 20_000);
  expect(await refundMessage(page)).toBe(REFUND_TEXT);
  let s = await saveNow(page);
  expect(s.coins).toBe(56000);
  expect(s.waspRefund.paid).toBe(true);
  expect((await server()).waspRefunds).toEqual({ [UID]: 1 });
  await closeRefund(page);
  await run(page, 6000); // the upload (4 s after the change)
  expect((await server()).users["wasp@example.com"].save.waspRefund).toEqual({ owed: false, paid: true });
  expect((await server()).users["wasp@example.com"].save.unlocked.wasplord).toBeUndefined();

  // 1. reload
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 3000);
  expect(await refundMessage(page)).toBe(null);
  expect((await saveNow(page)).coins).toBe(56000);

  // 2. a second device that still has the old save (him owned, never refunded, never synced)
  await page.evaluate((old) => {
    localStorage.setItem("glydrift.save.v1", JSON.stringify(old));
  }, OWNER);
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 6000);
  expect(await refundMessage(page)).toBe(null);
  s = await saveNow(page);
  expect(s.unlocked.wasplord).toBeUndefined();
  expect(s.waspRefund.paid).toBe(true);
  expect(s.coins).toBeLessThanOrEqual(56000); // never a second 55,000
  expect((await server()).waspRefunds).toEqual({ [UID]: 1 });

  // 3. log out and back in
  await page.evaluate(() => {
    window.__glyOpenAccount();
  });
  await expect(page.locator("#account-modal.open")).toBeVisible();
  let reloaded = page.waitForEvent("load");
  await page.click("#account-modal [data-act=logout]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await page.evaluate(() => {
    window.__glyOpenAccount();
  });
  await page.click("#account-modal [data-act=to-signin]");
  await page.fill("#account-modal input[name=email]", "wasp@example.com");
  await page.fill("#account-modal input[name=password]", "hunter2hunter2");
  reloaded = page.waitForEvent("load");
  await page.click("#account-modal button[type=submit]");
  await reloaded;
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 6000);
  expect(await refundMessage(page)).toBe(null);
  s = await saveNow(page);
  expect(s.unlocked.wasplord).toBeUndefined();
  expect(s.coins).toBeLessThanOrEqual(56000);
  expect((await server()).waspRefunds).toEqual({ [UID]: 1 });
  expect(log.errors).toEqual([]);
});

test("WASP LORD off: he appears nowhere (roster, shop, Heroes, locker, spin) and nobody can fly as him @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const rich = { ...SAVE, coins: 999999, spins: 3 };
  const log = await openGame(page, { save: rich });
  const roster = await page.evaluate(() => {
    const r = window.__glyRoster;
    return { ids: r.ids(), lottery: r.lottery(), visible: r.visible({ wasplord: true }), get: r.get("wasplord"), rarities: r.rarities() };
  });
  expect(roster.ids).not.toContain("wasplord");
  expect(roster.lottery).not.toContain("wasplord");
  expect(roster.visible).not.toContain("wasplord");
  expect(roster.get).toBe("volt"); // an old id resolves to the default hero, never a blank
  expect(roster.rarities).not.toContain("illegal");
  expect(roster.ids.length).toBeGreaterThan(20); // everyone else is still there
  for (const key of ["Shop", "Characters", "Locker", "Spin"]) {
    await openScene(page, key);
    if (key === "Shop")
      for (const tab of ["heroes", "featured"]) {
        const ids = await page.evaluate((tab) => {
          const s = window.__glydrift.scene.getScene("Shop");
          if (s.tabs?.some?.((t) => (t.id || t) === tab) === false) return [];
          s.setTab(tab);
          return s.cards.map((c) => c.offer?.id);
        }, tab);
        expect(ids).not.toContain("wasplord");
      }
    const texts = await sceneTexts(page, key);
    expect(texts, key).not.toMatch(/WASP|ILLEGAL/i);
  }
  // ?character=wasplord (the test builds' "fly as any hero") flies the default hero
  await page.goto("/?noaudio&offline&renderEvery=12&character=wasplord");
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").charDef.id)).toBe("volt");
  expect(log.errors).toEqual([]);
});

test("WASP LORD off: the migration archives then removes his scores, moves the crown, rejects new ones, refunds once @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane (no browser needed)");
  test.skip(!pgAvailable(), "PostgreSQL isn't installed here");
  test.setTimeout(120_000);
  const pg = startPg({ upTo: "20261116" });
  const { psql, asPlayer } = pg;
  const FILE = join(MIG, "20261116000001_wasp_lord_off.sql");
  try {
    // A holds the crown with a WASP LORD score and owns him (account); B is the best normal hero;
    // C flew him on a level board; D is a guest with a daily run of his
    const A = "aaaaaaaa-0000-4000-8000-000000000001";
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    const C = "cccccccc-0000-4000-8000-000000000003";
    const D = "dddddddd-0000-4000-8000-000000000004";
    psql(`
      insert into auth.users(id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
      insert into public.player_saves(user_id, save) values
        ('${A}', '{"unlocked":{"volt":true,"wasplord":true}}'),
        ('${B}', '{"unlocked":{"volt":true}}');
      insert into public.scores(player_id, username, level, score, distance, run_time_ms, character, created_at) values
        ('${A}', 'WaspKing', 'endless',          60000, 2400, 60000, 'wasplord', '2026-11-15 03:00Z'),
        ('${A}', 'WaspKing', 'endless-distance',  2400, 2400, 60000, 'wasplord', '2026-11-15 03:00Z'),
        ('${B}', 'Bravo',    'endless',          50000, 2000, 60000, 'volt',     '2026-11-10 10:00Z'),
        ('${B}', 'Bravo',    'endless-distance',  2000, 2000, 60000, 'volt',     '2026-11-10 10:00Z'),
        ('${C}', 'Charlie',  'endless',          40000, 1800, 60000, 'splice',   '2026-11-11 10:00Z'),
        ('${C}', 'Charlie',  'lv-3', round(500000000.0 / 30000), 900, 30000, 'wasplord', '2026-11-15 04:00Z'),
        ('${D}', 'Delta',    'daily-321',         9000,  900, 60000, 'wasplord', '2026-11-15 05:00Z');
      select public.glydrift_refresh_all_mighty();`);
    expect(psql("select username from public.all_mighty")).toBe("WaspKing");
    const others = () =>
      psql(`select string_agg(concat_ws('|', id, player_id, username, level, score, distance, run_time_ms, character, created_at), ',' order by id) from public.scores where character <> 'wasplord'`);
    const othersBefore = others();
    const waspBefore = psql(`select string_agg(concat_ws('|', id, player_id, username, level, score, distance, run_time_ms, created_at), ',' order by id) from public.scores where character = 'wasplord'`);

    // ---- run it, twice
    const sum1 = psql(null, { file: FILE }).split("\n").at(-1);
    const sum2 = psql(null, { file: FILE }).split("\n").at(-1);
    // archived | left on boards | owners | refunds | players whose best resets | switch | all mighty | their hero
    expect(sum1).toBe("4|0|1|0|1|OFF|Bravo · volt");
    expect(sum2).toBe(sum1);
    // archived first, every column kept; everyone else's rows are exactly as they were
    expect(
      psql(`select string_agg(concat_ws('|', id, player_id, username, level, score, distance, run_time_ms, created_at), ',' order by id) from public.glydrift_wasp_lord_archive`),
    ).toBe(waspBefore);
    expect(others()).toBe(othersBefore);
    expect(psql("select count(*) from public.scores where character = 'wasplord'")).toBe("0");
    // the crown: the best non-Wasp Lord score; his reign didn't count
    expect(psql("select username || ' ' || score from public.all_mighty")).toBe("Bravo 50000");
    expect(psql("select string_agg(username, ',') from public.all_mighty_history")).toBe("Bravo");

    // ---- the server rejects his scores now (any board, new rows or relabelled ones)
    const up = "on conflict (player_id, level) do update set score = excluded.score, distance = excluded.distance, run_time_ms = excluded.run_time_ms, character = excluded.character";
    const ins = (uid, name, level, score, dist, ms, hero) =>
      asPlayer(uid, `insert into public.scores(player_id, username, level, score, distance, run_time_ms, character) values ('${uid}', '${name}', '${level}', ${score}, ${dist}, ${ms}, '${hero}') ${up} returning level || ' ' || score`);
    expect(ins(A, "WaspKing", "endless", 30000, 1500, 60000, "wasplord")).toMatch(/^ERROR glydrift: hero wasplord is switched off/);
    expect(ins(A, "WaspKing", "endless-distance", 1500, 1500, 60000, "wasplord")).toMatch(/switched off/);
    expect(ins(C, "Charlie", "lv-3", Math.round(500000000 / 30000), 900, 30000, "wasplord")).toMatch(/switched off/);
    expect(asPlayer(B, `update public.scores set character = 'wasplord' where player_id = '${B}' and level = 'endless' returning 1`)).toMatch(/switched off/);
    // every other hero: exactly as before
    expect(ins(A, "WaspKing", "endless", 30000, 1500, 60000, "volt")).toBe("endless 30000");
    expect(ins(B, "Bravo", "endless", 60000, 2200, 60000, "volt")).toBe("endless 60000");
    expect(ins(C, "Charlie", "lv-3", Math.round(500000000 / 30000), 900, 30000, "ember")).toBe(`lv-3 ${Math.round(500000000 / 30000)}`);
    asPlayer(B, `update public.scores set username = 'Bravo2' where player_id = '${B}'`);
    expect(psql(`select string_agg(username, ',') from public.scores where player_id = '${B}'`)).toBe("Bravo2,Bravo2");

    // ---- the refund: once per owner account, never for anyone else
    expect(asPlayer(A, "select public.glydrift_wasp_refund()")).toBe("granted");
    expect(asPlayer(A, "select public.glydrift_wasp_refund()")).toBe("already");
    expect(asPlayer(A, "select public.glydrift_wasp_refund()")).toBe("already");
    expect(asPlayer(B, "select public.glydrift_wasp_refund()")).toBe("not_owner");
    expect(asPlayer(D, "select public.glydrift_wasp_refund()", "anon")).toMatch(/^ERROR permission denied/);
    // the app can't read or write the refund / archive tables directly
    expect(asPlayer(A, "select count(*) from public.glydrift_wasp_refunds")).toMatch(/^ERROR permission denied/);
    expect(asPlayer(A, "delete from public.glydrift_wasp_refunds")).toMatch(/^ERROR permission denied/);
    expect(asPlayer(A, "select count(*) from public.glydrift_wasp_lord_archive")).toMatch(/^ERROR permission denied/);
    // ---- bests set with him: once per player, their highest remaining non-Wasp Lord rows
    // (A has flown VOLT since: 30000 on endless, no distance row left) — the same answer every time
    expect(asPlayer(A, "select public.glydrift_wasp_best_reset()::text")).toBe('{"best": 30000, "reset": true, "distance": 0}');
    expect(ins(A, "WaspKing", "endless", 45000, 1900, 60000, "volt")).toBe("endless 45000");
    expect(asPlayer(A, "select public.glydrift_wasp_best_reset()::text")).toBe('{"best": 30000, "reset": true, "distance": 0}');
    expect(asPlayer(B, "select public.glydrift_wasp_best_reset()::text")).toBe('{"reset": false}');
    expect(asPlayer(C, "select public.glydrift_wasp_best_reset()::text")).toBe('{"reset": false}'); // (a level board only)
    expect(asPlayer(A, "select count(*) from public.glydrift_wasp_best_resets")).toMatch(/^ERROR permission denied/);
    // a re-run keeps the paid refund paid
    expect(psql(null, { file: FILE }).split("\n").at(-1)).toBe("4|0|1|1|1|OFF|Bravo2 · volt");
    expect(asPlayer(A, "select public.glydrift_wasp_refund()")).toBe("already");
  } finally {
    pg.stop();
  }
});

test("WASP LORD off: a best set with him resets ONCE to the server's numbers, and a cloud merge can't bring it back @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const old = { ...SAVE, best: 90000, stats: { maxDistance: 3400, runs: 50 }, ghost: [1, 2, 3], ghostChar: "wasplord" };
  const log = await openGame(page, { save: old });
  const r = await page.evaluate(() => {
    const W = window.__glyWaspBest;
    const first = W.apply({ reset: true, best: 42000, distance: 1700 });
    const again = W.apply({ reset: true, best: 1, distance: 1 }); // once only
    return { first, again };
  });
  expect(r).toEqual({ first: true, again: false });
  let s = await saveNow(page);
  expect([s.best, s.stats.maxDistance, s.ghost, s.ghostChar]).toEqual([42000, 1700, null, "volt"]);
  expect(s.waspBest).toEqual({ done: true, reset: true, best: 42000, distance: 1700 });
  await page.reload();
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await run(page, 1500);
  s = await saveNow(page);
  expect([s.best, s.stats.maxDistance, s.waspBest.done]).toEqual([42000, 1700, true]);
  // cloud merges: an older copy (not reset, his best) never brings 90000 back, either way round;
  // two reset copies keep the larger best as always; a player who never flew him: the larger
  const m = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const reset = { coins: 10, level: 3, best: 42000, stats: { maxDistance: 1700, runs: 60 }, waspBest: { done: true, reset: true } };
    const older = { coins: 10, level: 3, best: 90000, stats: { maxDistance: 3400, runs: 50 } };
    const pick = (x) => ({ best: x.best, dist: x.stats.maxDistance, done: !!x.waspBest?.done, runs: x.stats.runs });
    return {
      localReset: pick(mergeSaves(reset, older)),
      cloudReset: pick(mergeSaves(older, reset)),
      bothReset: pick(mergeSaves(reset, { ...reset, best: 50000, stats: { maxDistance: 1800, runs: 70 } })),
      unaffected: pick(mergeSaves({ ...older, waspBest: { done: true, reset: false } }, { ...older, best: 95000 })),
    };
  });
  expect(m.localReset).toEqual({ best: 42000, dist: 1700, done: true, runs: 60 });
  expect(m.cloudReset).toEqual({ best: 42000, dist: 1700, done: true, runs: 60 });
  expect(m.bothReset).toEqual({ best: 50000, dist: 1800, done: true, runs: 70 });
  expect(m.unaffected).toEqual({ best: 95000, dist: 3400, done: true, runs: 50 });
  expect(log.errors).toEqual([]);
});

test("WASP LORD off: the migration also runs on a project without ALL MIGHTY set up @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane (no browser needed)");
  test.skip(!pgAvailable(), "PostgreSQL isn't installed here");
  test.setTimeout(120_000);
  // (the live project: 20261109000001_all_mighty.sql was never run there)
  const pg = startPg({ upTo: "20261109" });
  const { psql } = pg;
  try {
    const A = "aaaaaaaa-0000-4000-8000-000000000001";
    psql(`
      insert into auth.users(id) values ('${A}');
      insert into public.player_saves(user_id, save) values ('${A}', '{"unlocked":{"volt":true,"wasplord":true}}');
      insert into public.scores(player_id, username, level, score, distance, run_time_ms, character) values
        ('${A}', 'WaspKing', 'endless', 60000, 2400, 60000, 'wasplord');`);
    expect(psql("select to_regclass('public.all_mighty') is null")).toBe("t");
    const file = join(MIG, "20261116000001_wasp_lord_off.sql");
    expect(psql(null, { file }).split("\n").at(-1)).toBe("1|0|1|0|1|OFF|not set up");
    expect(psql(null, { file }).split("\n").at(-1)).toBe("1|0|1|0|1|OFF|not set up");
  } finally {
    pg.stop();
  }
});
