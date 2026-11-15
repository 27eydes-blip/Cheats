// The owner edits a player's cloud save in Supabase (coins added, progress raised) while the
// player's game is open: the game must never overwrite that newer cloud copy with its older
// local save. Before every upload it looks at the cloud copy; a change made anywhere else
// (another device, or a hand edit, which keeps the copy's write id) is merged in first.
// Also: coins granted by the owner (supabase/migrations/20261115000002_coin_grants.sql) reach
// an open game exactly once, on a fake server through the game's real requests and on a real
// Postgres.
import { expect, test } from "@playwright/test";
import { fakeSupabase } from "./fakeSupabase.js";
import { openGame, profileOf } from "./helpers.js";
import { pgAvailable, startPg } from "./pg.js";

test.use({ serviceWorkers: "block" });

test("cloud save edited in Supabase while the game is open: merged in, never overwritten by the older local save @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "logic only, once per browser");
  const log = await openGame(page);
  const r = await page.evaluate(async () => {
    const { Account } = window.__glyAccount;
    const Save = window.__glySave;
    const writes = [];
    // the cloud row: the save as the database returns it (jsonb: its own key order) + progress
    let row = null;
    const reorder = (o) =>
      o && typeof o === "object" && !Array.isArray(o)
        ? Object.fromEntries(Object.keys(o).sort().reverse().map((k) => [k, reorder(o[k])]))
        : o;
    Account.backend = {
      ...Account.backend,
      loadSave: async () => (row ? reorder(JSON.parse(JSON.stringify(row.save))) : null),
      storeSave: async (id, save, progress) => {
        writes.push({ coins: save.coins, progress });
        row = { save: JSON.parse(JSON.stringify(save)), progress, updated_at: new Date().toISOString() };
      },
    };
    Account.user = { id: "u-edit", email: "a@b.c", anon: false };
    Account.merged = false;
    Account.isBusy = () => false;
    Save.data.cloudSync = null;
    Save.data.coins = 1000;
    Save.write();
    await Account.pushNow(); // signed in: the first sync
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    const start = { local: Save.data.coins, cloud: row.save.coins };

    // the owner edits the row in Supabase: +5000 coins, a higher level and progress, and the
    // save's write id left exactly as it was
    row.save.coins += 5000;
    row.save.level = (row.save.level || 1) + 5;
    row.progress += 500000;
    // the open game earns 120 coins and saves (its upload follows)
    Save.data.coins += 120;
    Save.write();
    await Account.pushNow();
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    const afterPush = { local: Save.data.coins, cloud: row.save.coins, level: Save.data.level, cloudLevel: row.save.level };

    // another edit while the game sits on a screen (no save of its own): the open game's cloud
    // check finds it (never mid-run)
    row.save.coins += 700;
    Account.isBusy = () => true;
    const duringRun = await Account.checkCloud();
    const coinsDuringRun = Save.data.coins;
    Account.isBusy = () => false;
    const found = await Account.checkCloud();
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    const afterCheck = { local: Save.data.coins, cloud: row.save.coins };
    // nothing changed since: no merge, nothing doubled
    const merges = Account.mergedFromOther;
    const again = await Account.checkCloud();
    await Account.pushNow();
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    return { start, afterPush, duringRun, coinsDuringRun, found, afterCheck, again, extraMerges: Account.mergedFromOther - merges, final: row.save.coins, writes };
  });
  expect(r.start).toEqual({ local: 1000, cloud: 1000 });
  // the edit survived the game's upload, and the 120 coins earned meanwhile were added to it
  expect(r.afterPush.cloud).toBe(1000 + 5000 + 120);
  expect(r.afterPush.local).toBe(r.afterPush.cloud);
  expect(r.afterPush.level).toBe(r.afterPush.cloudLevel); // the raised level came down too
  expect(r.writes.every((w) => w.coins >= 1000)).toBe(true);
  expect(r.writes.some((w) => w.coins === 1120)).toBe(false); // the old local save never went up
  // a later edit shows up while the game is open (not mid-run)
  expect(r.duringRun).toBe(false);
  expect(r.coinsDuringRun).toBe(6120);
  expect(r.found).toBe(true);
  expect(r.afterCheck).toEqual({ local: 6820, cloud: 6820 });
  expect(r.again).toBe(false);
  expect(r.extraMerges).toBe(0);
  expect(r.final).toBe(6820);
  expect(log.errors).toEqual([]);
});

test("coin grants: an open game claims the owner's grant once and the coins stay (two devices asking at once) @smoke", async ({ browser }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(120_000);
  const server = fakeSupabase();
  const ctx = await browser.newContext({ ...testInfo.project.use, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const log = await openGame(page, { online: true, routes: [[/supabase\.co/, (r) => server.handle(r)]] });
  const me = await page.evaluate(async () => {
    await window.__glyLb.Leaderboard.session();
    return window.__glyLb.Leaderboard.userId;
  });
  const before = await page.evaluate(() => window.__glySave.data.coins);
  // the owner grants 500 coins (supabase/admin/grant_coins.sql) while the game is open
  server.db.coin_grants.push({ id: 1, player_id: me, coins: 500, note: "Thanks!", claimed_at: null });
  server.db.coin_grants.push({ id: 2, player_id: "someone-else", coins: 9999, note: null, claimed_at: null });
  const r = await page.evaluate(async () => {
    const G = window.__glyGrants;
    const seen = [];
    const off = G.onGrant((g) => seen.push(g));
    G.isBusy = () => true; // mid-run: not now
    const midRun = await G.claim();
    G.isBusy = () => false;
    const [a, b] = await Promise.all([G.claim(), G.claim()]); // the game asks twice at once
    const again = await G.claim();
    off();
    return { midRun, a, b, again, seen, coins: window.__glySave.data.coins, total: window.__glySave.data.stats.grantCoins };
  });
  expect(r.midRun).toBe(0);
  expect(r.a + r.b).toBe(500 * 2); // (the second call shares the first one's answer)
  expect(r.again).toBe(0);
  expect(r.coins).toBe(before + 500);
  expect(r.seen).toEqual([{ coins: 500, notes: ["Thanks!"] }]);
  expect(server.db.coin_grants.find((g) => g.id === 1).claimed_at).toBeTruthy();
  expect(server.db.coin_grants.find((g) => g.id === 2).claimed_at).toBeNull(); // someone else's
  expect(log.errors).toEqual([]);
  await ctx.close();
});

test("coin grants on a real Postgres: only the owner can grant, each grant is claimed exactly once by its player @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane (no browser needed)");
  test.skip(!pgAvailable(), "PostgreSQL isn't installed here");
  test.setTimeout(120_000);
  const pg = startPg({ upTo: "20261115000002" });
  const { psql, asPlayer } = pg;
  try {
    const A = "aaaaaaaa-0000-4000-8000-000000000001";
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    psql(`insert into auth.users(id) values ('${A}'), ('${B}')`);
    // run twice: safe to run more than once
    psql(null, { file: new URL("../../supabase/migrations/20261115000002_coin_grants.sql", import.meta.url).pathname });
    psql(null, { file: new URL("../../supabase/migrations/20261115000002_coin_grants.sql", import.meta.url).pathname });
    // the owner (SQL editor) grants
    expect(psql(`select public.glydrift_admin_grant_coins('${A}', 500, 'Thanks!')`)).toBe("1");
    expect(psql(`select public.glydrift_admin_grant_coins('${A}', 250)`)).toBe("2");
    // nobody can grant from the app, or read / write the table directly
    expect(asPlayer(A, `select public.glydrift_admin_grant_coins('${A}', 100000)`)).toMatch(/^ERROR permission denied/);
    expect(asPlayer(A, `select public.glydrift_admin_grant_coins('${A}', 100000)`, "anon")).toMatch(/^ERROR permission denied/);
    expect(asPlayer(A, "select count(*) from public.coin_grants")).toMatch(/^ERROR permission denied/);
    expect(asPlayer(A, `insert into public.coin_grants(player_id, coins) values ('${A}', 5)`)).toMatch(/^ERROR permission denied/);
    // bad grants are refused
    expect(() => psql(`select public.glydrift_admin_grant_coins('${A}', 0)`)).toThrow();
    expect(() => psql("select public.glydrift_admin_grant_coins('cccccccc-0000-4000-8000-000000000003', 10)")).toThrow();
    // another player claims nothing of A's
    expect(asPlayer(B, "select coalesce(sum(coins), 0) from public.glydrift_claim_grants()")).toBe("0");
    // A claims both grants, once
    expect(asPlayer(A, "select sum(coins) from public.glydrift_claim_grants()")).toBe("750");
    expect(asPlayer(A, "select coalesce(sum(coins), 0) from public.glydrift_claim_grants()")).toBe("0");
    expect(psql("select count(*) from public.coin_grants where claimed_at is not null")).toBe("2");
  } finally {
    pg.stop();
  }
});
