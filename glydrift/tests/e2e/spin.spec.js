// Lucky Spin upgrade: odds on screen that add up to 100% and match the wheel, outcomes that
// follow those odds, the rare cosmetic slice (added to your cosmetics, or coins if owned),
// coin prizes doubled, and a full spin animation (rim lights, slowdown, celebration) that
// lands exactly on the prize rolled before it started, with no errors.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, SAVE, settle, tap } from "./helpers.js";

const once = (testInfo) =>
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

// the wheel before the upgrade (coin slices, the jackpot and the all-heroes-owned payout)
const OLD_COINS = [100, 150, 200, 400];
const OLD_JACKPOT = 2000;
const OLD_HERO_COINS = 1000;

async function openSpin(page, save = {}) {
  const log = await openGame(page, { save: { ...SAVE, spins: 3, ...save } });
  await tap(page, "LUCKY SPIN", 0);
  await settle(page, "Spin", 1200);
  return log;
}

const shownTexts = (page, path) =>
  page.evaluate((path) => {
    let o = window.__glySpin.scene;
    for (const k of path) o = o[k];
    const walk = (list) =>
      list.flatMap((x) => (x.type === "Text" && x.visible ? [x.text] : x.list ? walk(x.list) : []));
    return walk(o.list);
  }, path);

test("Lucky Spin: odds add up to 100%, match the wheel, and are always on screen @smoke", async ({ page }, testInfo) => {
  once(testInfo);
  const log = await openSpin(page);
  const d = await page.evaluate(() => {
    const { spinOdds, SPIN_SLICES } = window.__glySpin;
    const total = SPIN_SLICES.reduce((a, s) => a + s.weight, 0);
    const byType = {};
    for (const s of SPIN_SLICES) {
      const k = s.type === "coins" ? `c${s.amount}` : s.type;
      byType[k] = (byType[k] || 0) + (s.weight / total) * 100;
    }
    return { odds: spinOdds(), byType, total };
  });
  const sum = d.odds.reduce((a, r) => a + r.pct, 0);
  expect(Math.abs(sum - 100)).toBeLessThan(0.05);
  expect(d.total).toBe(100); // weights are percentages, so what's shown is exact
  // every row matches the slices it stands for
  const want = Object.values(d.byType).map((p) => Math.round(p * 10) / 10).sort((a, b) => a - b);
  expect(d.odds.map((r) => r.pct).sort((a, b) => a - b)).toEqual(want);
  expect(d.odds.map((r) => r.label)).toEqual(
    expect.arrayContaining(["A new hero", "A rare cosmetic", "JACKPOT: 4000 coins", "2 free spins"]),
  );

  // the odds strip under the wheel shows every row (no tap needed)
  const strip = await shownTexts(page, ["oddsStrip"]);
  const stripPcts = strip.filter((t) => /^\d+(\.\d)?%$/.test(t)).map(parseFloat);
  expect(stripPcts).toEqual(d.odds.map((r) => r.pct));
  for (const r of d.odds) expect(strip).toContain(r.short);

  // the ODDS panel: the same numbers, with the full labels
  await tap(page, "ODDS", 400);
  const panel = await shownTexts(page, ["reveal"]);
  expect(panel).toContain("SPIN ODDS");
  expect(panel.filter((t) => /^\d+(\.\d)?%$/.test(t)).map(parseFloat)).toEqual(d.odds.map((r) => r.pct));
  for (const r of d.odds) expect(panel).toContain(r.label);
  expect(panel.join(" ")).toMatch(/can't be bought/);
  await tap(page, "GOT IT", 300);
  expect(log.errors).toEqual([]);
});

test("Lucky Spin: over many spins the outcomes follow the odds @smoke", async ({ page }, testInfo) => {
  once(testInfo);
  test.setTimeout(120_000);
  const log = await openSpin(page);
  const r = await page.evaluate(() => {
    const { Progression } = window.__glyHeroes;
    const s = window.__glySave.data;
    // own every spin hero, so the hero guarantee never bends the odds
    for (const c of Progression.lotteryLeft()) s.unlocked[c.id] = true;
    const n = 6000;
    const counts = window.__glySpin.SPIN_SLICES.map(() => 0);
    for (let i = 0; i < n; i++) {
      s.spins = 1;
      counts[Progression.spin().slice]++;
    }
    return { n, counts, weights: window.__glySpin.SPIN_SLICES.map((x) => x.weight) };
  });
  const total = r.weights.reduce((a, b) => a + b, 0);
  r.counts.forEach((c, i) => {
    const p = r.weights[i] / total;
    const sd = Math.sqrt(r.n * p * (1 - p));
    // within 4.5 standard deviations (a false alarm is far less likely than 1 in 100,000)
    expect(Math.abs(c - r.n * p), `slice ${i}: ${c} of ${r.n}, expected ~${Math.round(r.n * p)}`).toBeLessThan(4.5 * sd + 1);
  });
  expect(log.errors).toEqual([]);
});

test("Lucky Spin: a rolled cosmetic is added to your cosmetics, or paid in coins if owned @smoke", async ({ page }, testInfo) => {
  once(testInfo);
  const log = await openSpin(page);
  const r = await page.evaluate(() => {
    const { Progression } = window.__glyHeroes;
    const { SPIN_SLICES, SPIN_COSMETICS, spinCosmeticCoins } = window.__glySpin;
    const s = window.__glySave.data;
    const idx = SPIN_SLICES.findIndex((x) => x.type === "cosmetic");
    s.cos.owned = {};
    const fresh = [];
    for (let i = 0; i < 4; i++) {
      s.spins = 1;
      const before = s.coins;
      const res = Progression.spin(idx);
      fresh.push({
        res,
        owned: !!s.cos.owned[res.prize.id],
        coins: s.coins - before,
        inPool: SPIN_COSMETICS.includes(res.prize.id),
      });
      delete s.cos.owned[res.prize.id]; // keep the next roll a "new" one
    }
    for (const id of SPIN_COSMETICS) s.cos.owned[id] = true;
    s.spins = 1;
    const before = s.coins;
    const dupe = Progression.spin(idx);
    const saved = JSON.parse(localStorage.getItem("glydrift.save.v1"));
    return {
      fresh,
      dupe,
      dupeCoins: s.coins - before,
      fair: spinCosmeticCoins(dupe.prize.id),
      savedOwned: Object.keys(saved.cos.owned).length,
    };
  });
  for (const f of r.fresh) {
    expect(f.res.prize).toMatchObject({ type: "cosmetic", dupe: false });
    expect(f.owned).toBe(true);
    expect(f.inPool).toBe(true);
    expect(f.coins).toBe(0);
  }
  expect(r.dupe.prize).toMatchObject({ type: "cosmetic", dupe: true });
  expect(r.dupe.prize.amount).toBe(r.fair);
  expect(r.dupeCoins).toBe(r.fair);
  expect(r.fair).toBeGreaterThanOrEqual(500);
  expect(r.savedOwned).toBeGreaterThan(0);

  // on screen: the wheel lands on the cosmetic slice and says it was paid in coins
  await page.evaluate(() => {
    const s = window.__glySave.data;
    s.spins = 2;
    const { SPIN_SLICES } = window.__glySpin;
    window.__glySpin.scene.refresh();
    window.__glySpin.scene.spin(SPIN_SLICES.findIndex((x) => x.type === "cosmetic"));
  });
  await run(page, 7000);
  const sheet = await shownTexts(page, ["reveal"]);
  expect(sheet).toContain("ALREADY OWNED");
  expect(sheet.join(" ")).toMatch(/You already own it, so you get \+[\d,]+ coins instead\./);
  await tap(page, "NICE!", 300);
  expect(log.errors).toEqual([]);
});

test("Lucky Spin: coin prizes are double the old wheel @smoke", async ({ page }, testInfo) => {
  once(testInfo);
  const log = await openSpin(page);
  const r = await page.evaluate(() => {
    const { SPIN_SLICES, SPIN_HERO_COINS } = window.__glySpin;
    const { Progression } = window.__glyHeroes;
    const s = window.__glySave.data;
    for (const c of Progression.lotteryLeft()) s.unlocked[c.id] = true;
    s.spins = 1;
    const before = s.coins;
    const hero = Progression.spin(SPIN_SLICES.findIndex((x) => x.type === "hero"));
    return {
      coins: SPIN_SLICES.filter((x) => x.type === "coins").map((x) => x.amount),
      jackpot: SPIN_SLICES.find((x) => x.type === "jackpot").amount,
      heroCoins: SPIN_HERO_COINS,
      heroPaid: s.coins - before,
      heroPrize: hero.prize,
    };
  });
  expect(r.coins.sort((a, b) => a - b)).toEqual(OLD_COINS.map((c) => c * 2));
  expect(r.jackpot).toBe(OLD_JACKPOT * 2);
  expect(r.heroCoins).toBe(OLD_HERO_COINS * 2);
  expect(r.heroPaid).toBe(OLD_HERO_COINS * 2);
  expect(r.heroPrize).toMatchObject({ type: "coins", amount: OLD_HERO_COINS * 2 });
  expect(log.errors).toEqual([]);
});

for (const [name, settings] of [
  ["", {}],
  [" (Reduce Flashing + Low Graphics)", { reduceFlash: true, lowGfx: true }],
]) {
  test(`Lucky Spin: a full spin lands exactly on the rolled prize, no errors${name} @smoke`, async ({ page }, testInfo) => {
    once(testInfo);
    test.setTimeout(300_000);
    const log = await openSpin(page, { spins: 6, settings: { ...SAVE.settings, ...settings } });
    for (let i = 0; i < (name ? 1 : 2); i++) {
      const before = await page.evaluate(() => window.__glySave.data.spins);
      await tap(page, "SPIN", 0);
      // mid-spin: the wheel is turning, the spin is already spent and the prize already decided
      await run(page, 1200);
      const mid = await page.evaluate(() => {
        const sc = window.__glySpin.scene;
        const p = sc.lastResult?.prize;
        return { anim: !!sc.anim, vel: sc.vel, spins: window.__glySave.data.spins, res: !!p, back: p?.type === "spins" ? p.amount : 0 };
      });
      expect(mid.anim).toBe(true);
      expect(mid.vel).toBeGreaterThan(50);
      expect(mid.res).toBe(true);
      expect(mid.spins).toBe(before - 1 + mid.back);
      await run(page, 6000);
      const end = await page.evaluate(() => {
        const g = window.__glySpin;
        const sc = g.scene;
        return { anim: !!sc.anim, at: g.sliceAt(sc.wheel.angle), want: sc.lastResult.slice, type: sc.lastResult.prize.type, reveal: !!sc.reveal };
      });
      expect(end.anim).toBe(false);
      expect(end.at).toBe(end.want);
      if (end.reveal) await tap(page, "NICE!", 300);
      await run(page, 1500);
    }
    // a hero win still works (the spin pool is untouched)
    await page.evaluate(() => {
      const { SPIN_SLICES } = window.__glySpin;
      window.__glySave.data.spins = 1;
      window.__glySpin.scene.refresh();
      window.__glySpin.scene.spin(SPIN_SLICES.findIndex((x) => x.type === "hero"));
    });
    await run(page, 7000);
    const hero = await page.evaluate(() => window.__glySpin.scene.lastResult.prize);
    expect(hero.type).toBe("hero");
    expect(await page.evaluate((id) => !!window.__glySave.data.unlocked[id], hero.id)).toBe(true);
    await tap(page, "NICE!", 300);
    // and a multi-spin with its results sheet
    await page.evaluate(() => {
      window.__glySave.data.spins = 5;
      window.__glySpin.scene.refresh();
    });
    await tap(page, "SPIN ×5", 0);
    await run(page, 4500);
    const multi = await page.evaluate(() => {
      const g = window.__glySpin;
      return { at: g.sliceAt(g.scene.wheel.angle), want: g.scene.lastResult.slice, reveal: !!g.scene.reveal };
    });
    expect(multi.at).toBe(multi.want);
    expect(multi.reveal).toBe(true);
    await tap(page, "COLLECT", 2500);
    // every celebration coin has fallen away
    expect(await page.evaluate(() => window.__glySpin.scene.shower.length)).toBe(0);
    expect(log.errors).toEqual([]);
  });
}
