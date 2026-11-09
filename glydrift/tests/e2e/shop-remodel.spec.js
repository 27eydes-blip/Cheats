// The remodelled shop (neon stage + rarity sections): every offer, price and purchase works
// exactly as before the remodel.
import { expect, test } from "@playwright/test";
import { openGame, press, profileOf, run, SAVE, settle, tap } from "./helpers.js";

// Every offer of every tab as the shop showed it BEFORE the remodel (captured from the old
// carousel on the test save, on the test clock's day): [kind, id, price, currency]. "coins"
// means a coin price; otherwise the card's button label (CLAIM!, EQUIP, LOCKED …).
const BEFORE = {
  featured: [
    ["drop", null, null, "CLAIM!"],
    ["pass", null, null, "CLAIM!"],
    ["event", null, null, "SEASON PASS"],
    ["cos", "trail_bloodmoon", 2800, "coins"],
    ["cos", "trail_abyssal", 1100, "coins"],
    ["cos", "hat_bloodcrown", 3200, "coins"],
    ["cos", "hat_abysseye", 1200, "coins"],
    ["yarms", null, 24000, "coins"],
    ["bundle", "set_solar", 1650, "coins"],
    ["bundle", "set_glitch", 9900, "coins"],
    ["cos", "trail_money", 7000, "coins"],
  ],
  daily: [
    ["drop", null, null, "CLAIM!"],
    ["cos", "skin_frozen", 700, "coins"],
    ["cos", "flap_sparks", 200, "coins"],
    ["cos", "trail_money", 7000, "coins"],
    ["cos", "death_blackhole", 12000, "coins"],
  ],
  heroes: [
    ["yarms", null, 24000, "coins"],
    ["hero", "volt", null, "EQUIPPED"],
    ["hero", "ember", null, "EQUIP"],
    ["hero", "frost", 2000, "coins"],
    ["hero", "shade", 5000, "coins"],
    ["hero", "glitch", 6000, "coins"],
    ["hero", "nova", 16000, "coins"],
    ["hero", "bloom", 2400, "coins"],
    ["hero", "tide", 3000, "coins"],
    ["hero", "mecha", 8000, "coins"],
    ["hero", "draco", 20000, "coins"],
    ["hero", "pip", 600, "coins"],
    ["hero", "coral", 900, "coins"],
    ["hero", "sprout", 1200, "coins"],
    ["hero", "ruby", 1800, "coins"],
    ["hero", "pengu", 2200, "coins"],
    ["hero", "jelly", 2600, "coins"],
    ["hero", "comet", 7000, "coins"],
    ["hero", "ronin", 9000, "coins"],
    ["hero", "seraph", 11000, "coins"],
    ["hero", "leviathan", 24000, "coins"],
    ["hero", "springer", 12000, "coins"],
    ["hero", "dzr", 12000, "coins"],
    ["hero", "mattoe", 4000, "coins"],
    ["hero", "splice", 50000, "coins"],
    ["hero", "haddad", 12000, "coins"],
    ["hero", "jamal", 12000, "coins"],
    ["hero", "dawson", 12000, "coins"],
    ["hero", "dewberry", 4000, "coins"],
    ["hero", "tung", 12000, "coins"],
    ["hero", "newbleizer", 12000, "coins"], // (added after this list was captured: THE NEWBLEIZER, live since)
    ["hero", "wallrunner", 10000, "coins"],
    ["hero", "manny", 5000, "coins"],
    ["hero", "milzzz", null, "LOCKED"],
    ["hero", "smash", 3000, "coins"],
    ["hero", "sonjuwon", 12000, "coins"],
    ["hero", "gloombat", null, "CHALLENGE"],
    ["hero", "grimrat", null, "CHALLENGE"],
    ["hero", "murktoad", null, "CHALLENGE"],
    ["hero", "hollowcrow", null, "CHALLENGE"],
    ["hero", "lurkeel", null, "CHALLENGE"],
    ["hero", "ashspider", null, "CHALLENGE"],
    ["hero", "anglerfiend", null, "CHALLENGE"],
    ["hero", "riftwolf", null, "CHALLENGE"],
    ["hero", "grimvulture", null, "CHALLENGE"],
    ["hero", "levijr", null, "CHALLENGE"],
  ],
  trail: [
    ["cos", "trail_hearts", 300, "coins"],
    ["cos", "trail_fire", 600, "coins"],
    ["cos", "trail_lightning", 800, "coins"],
    ["cos", "trail_glitch", 1000, "coins"],
    ["cos", "trail_rainbow", 2500, "coins"],
    ["cos", "trail_galaxy", 3500, "coins"],
    ["cos", "trail_money", 7000, "coins"],
    ["cos", "trail_bloodmoon", 2800, "coins"],
    ["cos", "trail_abyssal", 1100, "coins"],
  ],
  skin: [
    ["cos", "skin_frozen", 700, "coins"],
    ["cos", "skin_shadow", 1200, "coins"],
    ["cos", "skin_neon", 2000, "coins"],
    ["cos", "skin_chrome", 4000, "coins"],
    ["cos", "skin_gold", 8000, "coins"],
    ["cos", "dskin_greatwhite", 1200, "coins"],
    ["cos", "dskin_neonreef", 3500, "coins"],
    ["cos", "tskin_cottoncandy", 1200, "coins"],
    ["cos", "tskin_moonbeam", 3000, "coins"],
    ["cos", "tskin_rosegold", 4000, "coins"],
  ],
  hat: [
    ["cos", "hat_shades", 200, "coins"],
    ["cos", "hat_phones", 450, "coins"],
    ["cos", "hat_horns", 900, "coins"],
    ["cos", "hat_helmet", 1800, "coins"],
    ["cos", "hat_halo", 3000, "coins"],
    ["cos", "hat_crown", 15000, "coins"],
    ["cos", "hat_bloodcrown", 3200, "coins"],
    ["cos", "hat_abysseye", 1200, "coins"],
  ],
  effects: [
    ["cos", "death_shatter", 250, "coins"],
    ["cos", "death_confetti", 300, "coins"],
    ["cos", "death_ghost", 500, "coins"],
    ["cos", "death_firework", 700, "coins"],
    ["cos", "death_blackhole", 12000, "coins"],
    ["cos", "flap_sparks", 200, "coins"],
    ["cos", "flap_stars", 250, "coins"],
    ["cos", "flap_feathers", 300, "coins"],
    ["cos", "flap_notes", 400, "coins"],
    ["cos", "coin_stars", 300, "coins"],
    ["cos", "coin_gems", 600, "coins"],
    ["cos", "coin_hearts", 1500, "coins"],
  ],
  boosts: [
    ["boosts", null, null, null],
  ],
  pods: [
    ["drop", null, null, "CLAIM!"],
    ["pod", null, 500, "coins"],
  ],
};

const phoneOnly = (testInfo) =>
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

const openShop = async (page) => {
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Shop"));
  await settle(page, "Shop", 1200);
};

/** Page coordinates of a game object (by a function run in the page that returns it). */
const pointOf = (page, fnSrc) =>
  page.evaluate((src) => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Shop");
    const o = new Function("s", `return (${src})(s)`)(s);
    const b = o.getBounds();
    const cam = s.cameras.main;
    const r = g.canvas.getBoundingClientRect();
    const sx = (b.centerX - cam.worldView.x) * cam.zoom;
    const sy = (b.centerY - cam.worldView.y) * cam.zoom;
    return { x: r.left + (sx * r.width) / g.canvas.width, y: r.top + (sy * r.height) / g.canvas.height };
  }, fnSrc);

const save = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__glySave.data)));

test("shop remodel: the same offers at the same prices, heroes by rarity, live deal timers @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  await openShop(page);
  const now = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    const res = {};
    for (const tab of ["featured", "daily", "heroes", "trail", "skin", "hat", "effects", "boosts", "pods"]) {
      s.setTab(tab);
      res[tab] = s.cards.map((c) => [
        c.offer.kind,
        c.offer.id || null,
        c.price,
        c.price !== null ? "coins" : c.model.cta?.label || null,
      ]);
    }
    return res;
  });
  // the same offers, prices and currency on every tab (only the order changed: sections)
  const key = (r) => JSON.stringify(r);
  for (const tab of Object.keys(BEFORE)) {
    expect(now[tab].map(key).sort(), tab).toEqual(BEFORE[tab].map(key).sort());
  }
  expect(Object.keys(now).sort()).toEqual(Object.keys(BEFORE).sort());

  // heroes: LEGENDARY (MEGA / ULTRA at its top), then EPIC, RARE, COMMON — every hero in the
  // section of its own rarity, with that rarity's border colour
  const heroes = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.setTab("heroes");
    return {
      sections: s.sections.map((x) => ({
        label: x.label,
        rarities: [...new Set(x.items.map((o) => s.offerRarity(o)))],
      })),
      borders: s.cards.every((c) => c.col === s.offerColor(c.offer)),
      ordered: s.cards.map((c) => s.offerRarity(c.offer)),
    };
  });
  expect(heroes.sections.map((x) => x.label)).toEqual(["LEGENDARY", "EPIC", "RARE", "COMMON"]);
  expect(heroes.sections[0].rarities.every((r) => ["ultra", "mega", "legendary"].includes(r))).toBe(true);
  for (const [i, r] of ["epic", "rare", "common"].entries()) expect(heroes.sections[i + 1].rarities).toEqual([r]);
  expect(heroes.borders).toBe(true);
  const rank = { ultra: 0, mega: 0, legendary: 0, epic: 1, rare: 2, common: 3 };
  const ranks = heroes.ordered.map((r) => rank[r]);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

  // featured: today's deals come first, with a live countdown to the daily reset
  const timerText = () =>
    page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Shop");
      return { label: s.sections[0].label, timer: s.headers[0].right.text, n: s.timers.length };
    });
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").setTab("featured"));
  await run(page, 400);
  const t1 = await timerText();
  expect(t1.label).toBe("TODAY'S DEALS");
  expect(t1.timer).toMatch(/^RESETS IN \d+:\d\d:\d\d$/);
  expect(t1.n).toBeGreaterThan(1); // the header and each deal tile
  await run(page, 2100);
  expect((await timerText()).timer).not.toBe(t1.timer);
  expect(log.errors).toEqual([]);
});

test("shop remodel: buying each kind of offer charges the shown price and grants it @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(300_000); // (eight purchases, each with its full animation: ~1.3 min here, slower on CI)
  const log = await openGame(page, { save: { ...SAVE, coins: 60000 } });
  await openShop(page);
  // select an offer, press the stage's buy button, then BUY! in the confirmation
  const buyVia = async (tab, match) => {
    const info = await page.evaluate(
      ({ tab, match }) => {
        const s = window.__glydrift.scene.getScene("Shop");
        s.setTab(tab);
        const i = s.cards.findIndex((c) => c.offer.kind === match.kind && (match.id === undefined || c.offer.id === match.id));
        s.focus(i, true);
        return { price: s.cards[i].price, label: s.cta?.a11yLabel || s.cta?.label?.text };
      },
      { tab, match },
    );
    await run(page, 400);
    await press(page, await pointOf(page, "(s) => s.cta"));
    await run(page, 500);
    await tap(page, "BUY!", 2600); // the whole purchase animation
    return info;
  };
  const coins = async () => (await save(page)).coins;

  // a cosmetic at full price
  let c0 = await coins();
  let r = await buyVia("trail", { kind: "cos", id: "trail_fire" });
  expect(r.price).toBe(600);
  let s = await save(page);
  expect(s.coins).toBe(c0 - 600);
  expect(s.cos.owned.trail_fire).toBe(true);
  // ...the stage now offers EQUIP, and it equips it
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.focus(s.cards.findIndex((c) => c.offer.id === "trail_fire"), true);
  });
  await run(page, 300);
  await tap(page, "EQUIP", 400);
  expect((await save(page)).cos.equipped.trail).toBe("trail_fire");

  // today's deal (30% off, shown and charged at the deal price)
  c0 = await coins();
  r = await buyVia("featured", { kind: "cos", id: "trail_money" });
  expect(r.price).toBe(7000);
  s = await save(page);
  expect(s.coins).toBe(c0 - 7000);
  expect(s.cos.owned.trail_money).toBe(true);

  // a bundle: 25% off what you still need, every piece granted
  c0 = await coins();
  const need = await page.evaluate(() => window.__glyShop.Shop.bundle("set_solar"));
  r = await buyVia("featured", { kind: "bundle", id: "set_solar" });
  expect(r.price).toBe(need.price);
  s = await save(page);
  expect(s.coins).toBe(c0 - need.price);
  for (const id of need.need) expect(s.cos.owned[id], id).toBe(true);

  // a hero: unlocked and flown
  c0 = await coins();
  r = await buyVia("heroes", { kind: "hero", id: "frost" });
  expect(r.price).toBe(2000);
  s = await save(page);
  expect(s.coins).toBe(c0 - 2000);
  expect(s.unlocked.frost).toBe(true);
  expect(s.selected).toBe("frost");

  // a Mystery Pod: 500 coins for a cosmetic (or 250 back when that rarity is all owned)
  c0 = await coins();
  const ownedBefore = Object.keys((await save(page)).cos.owned).length;
  r = await buyVia("pods", { kind: "pod" });
  expect(r.price).toBe(500);
  await run(page, 1500);
  s = await save(page);
  const gotItem = Object.keys(s.cos.owned).length === ownedBefore + 1;
  expect(gotItem ? s.coins === c0 - 500 : s.coins === c0 - 500 + 250).toBe(true);
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").closeModal());

  // the free daily drop costs nothing
  c0 = await coins();
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").setTab("pods"));
  await run(page, 300);
  await tap(page, "CLAIM!", 2500);
  s = await save(page);
  expect(s.coins >= c0).toBe(true); // (a refund if that rarity is all owned)
  expect(s.dailyDrop).toBeTruthy();
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").closeModal());

  // not enough coins: nothing is charged or granted
  await page.evaluate(() => {
    window.__glySave.data.coins = 100;
  });
  c0 = 100;
  await buyVia("hat", { kind: "cos", id: "hat_crown" });
  s = await save(page);
  expect(s.coins).toBe(100);
  expect(s.cos.owned.hat_crown).toBeFalsy();

  // Reduce Flashing + Low Graphics: the purchase animation still plays, with no errors
  await page.evaluate(() => {
    const d = window.__glySave.data;
    d.coins = 5000;
    d.settings.reduceFlash = true;
    d.settings.lowGfx = true;
    window.__glydrift.scene.getScene("Shop").scene.restart({ tab: "hat" });
  });
  await run(page, 200); // (the restart happens on the next frame)
  await settle(page, "Shop", 1000);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Shop").lowGfx)).toBe(true);
  c0 = await coins();
  // (the cheapest hat the pods above didn't already hand out)
  const hat = await page.evaluate(() => {
    const { COSMETICS, forSale, Shop } = window.__glyShop;
    const h = COSMETICS.filter((c) => c.cat === "hat" && forSale(c) && !Shop.owns(c.id)).sort((a, b) => a.price - b.price)[0];
    return { id: h.id, price: Shop.priceOf(h.id) };
  });
  r = await buyVia("hat", { kind: "cos", id: hat.id });
  expect(r.price).toBe(hat.price);
  s = await save(page);
  expect(s.coins).toBe(c0 - hat.price);
  expect(s.cos.owned[hat.id]).toBe(true);
  expect(log.errors).toEqual([]);
});
