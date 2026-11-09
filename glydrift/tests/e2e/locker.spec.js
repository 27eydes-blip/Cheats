// LOCKER ROOM: every hero, look, title and badge you own in one screen. Counts per tab, a live
// preview on your hero, equipping that saves exactly what the old menus saved, grey
// silhouettes (with how to get them) for what isn't yours, and the ways in: the home MORE
// sheet, the hero card's "TAP TO EDIT" and Progress → TITLES.
import { expect, test } from "@playwright/test";
import { openGame, press, profileOf, run, SAVE, settle, tap, tapHome, waitFor } from "./helpers.js";

const LOCKER_SAVE = {
  ...SAVE,
  unlocked: { volt: true, ember: true, dawson: true },
  cos: {
    owned: { trail_fire: true, trail_rainbow: true, hat_crown: true, dskin_greatwhite: true, coin_gems: true },
    equipped: { trail: "trail_fire" },
  },
  achievements: { daredevil: true, first: true },
  stats: { maxDistance: 3200, runs: 30 },
};

const TAB_LABELS = ["HEROES", "SKINS", "HATS", "TRAILS", "DEATH FX", "POSES", "FLAP FX", "COINS", "TITLES", "BADGES"];

const locker = (page, fn, arg) =>
  page.evaluate(
    ({ src, arg }) => new Function("L", "arg", src)(window.__glydrift.scene.getScene("Locker"), arg),
    { src: fn, arg },
  );

/** Press the tile for entry `key` like a player, scrolling the grid to it first. */
async function tapTile(page, key, after = 400) {
  await locker(
    page,
    `const t = L.tiles.find((x) => x.entry.key === arg);
     L.setScroll(t.y - (L.gridBottom - L.gridTop) / 2);`,
    key,
  );
  const pt = await page.evaluate((key) => {
    const g = window.__glydrift;
    const L = g.scene.getScene("Locker");
    const t = L.tiles.find((x) => x.entry.key === key);
    const cam = L.cameras.main;
    const wx = t.x;
    const wy = L.grid.y + t.y;
    const r = g.canvas.getBoundingClientRect();
    return {
      x: r.left + (((wx - cam.worldView.x) * cam.zoom + cam.x) * r.width) / g.canvas.width,
      y: r.top + (((wy - cam.worldView.y) * cam.zoom + cam.y) * r.height) / g.canvas.height,
    };
  }, key);
  await press(page, pt);
  await run(page, after);
}

test("Locker Room: opens from MORE, counts match, equips like the old menus, locked items can't be worn @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { save: LOCKER_SAVE });
  // the hero select's roster (the Locker's HEROES tab must list the same heroes)
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Characters"));
  await settle(page, "Characters", 600);
  const roster = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    const P = window.__glyHeroes.Progression;
    return { total: c.roster.length, owned: c.roster.filter((d) => P.isUnlocked(d.id)).length };
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").scene.start("Menu"));
  await settle(page, "Menu", 1200);

  // MORE → LOCKER ROOM
  await tapHome(page, "LOCKER ROOM", 0);
  await settle(page, "Locker", 800);

  // every tab: its "owned/total" matches the catalogues, with no errors switching through
  const expected = await page.evaluate(() => {
    const { COSMETICS, forSale, Shop } = window.__glyShop;
    const cos = (cats) => {
      const list = COSMETICS.filter((c) => cats.includes(c.cat) && (Shop.owns(c.id) || !c.season || forSale(c)));
      return { owned: list.filter((c) => Shop.owns(c.id)).length, total: list.length };
    };
    const t = window.__glyTitles.catalog();
    const badges = cos(["name", "badge", "theme"]);
    return {
      SKINS: cos(["skin", "dskin", "tskin"]),
      HATS: cos(["hat"]),
      TRAILS: cos(["trail"]),
      "DEATH FX": cos(["death"]),
      POSES: cos(["pose"]),
      "FLAP FX": cos(["flap"]),
      COINS: cos(["coin"]),
      TITLES: { owned: t.filter((x) => x.owned).length, total: t.length },
      BADGES: { owned: badges.owned, total: badges.total + 1 }, // + the season banner
    };
  });
  expected.HEROES = roster;
  expect(expected.TRAILS.owned).toBeGreaterThanOrEqual(2);
  for (const label of TAB_LABELS) {
    await tap(page, label, 300);
    const shown = await locker(
      page,
      `const b = L.tabBtns.find((x) => x.label.text === arg);
       const tiles = L.tiles.filter((t) => t.entry.kind !== "none");
       return { sub: b.subLabel.text, tab: L.tab, owned: tiles.filter((t) => t.entry.owned).length, total: tiles.length,
                lockedGrey: tiles.filter((t) => !t.entry.owned).every((t) => !!t.tag.text) };`,
      label,
    );
    const e = expected[label];
    expect(shown.sub, label).toBe(`${e.owned}/${e.total}`);
    expect({ owned: shown.owned, total: shown.total }, label).toEqual(e);
    expect(shown.lockedGrey, `${label}: every locked tile says how to get it`).toBe(true);
    // scroll to the bottom and back: every tile drawn, nothing breaks
    await locker(page, "L.setScroll(1e6);");
    await run(page, 100);
    await locker(page, "L.setScroll(0);");
  }
  expect(expected.HEROES.total).toBeGreaterThan(50); // a big tab: 50+ tiles, still one rig
  await tap(page, "HEROES", 300);
  // tiles are plain pictures: the only hero rig is the preview's
  expect(await locker(page, "return L.tiles.every((t) => t.list.every((o) => o.type !== 'Container' || o.entry));")).toBe(true);

  // equipping from the Locker saves exactly what the old menus (Shop.equip / Titles.equip /
  // HEROES' SELECT) saved
  const snap = () => page.evaluate(() => JSON.stringify({ cos: window.__glySave.data.cos, titles: window.__glySave.data.titles, selected: window.__glySave.data.selected }));
  const restore = (s) =>
    page.evaluate((s) => {
      const o = JSON.parse(s);
      Object.assign(window.__glySave.data, { cos: o.cos, titles: o.titles, selected: o.selected });
    }, s);
  const cases = [
    ["TRAILS", "cos:trail_rainbow", "Shop.equip('trail_rainbow')"],
    ["HATS", "cos:hat_crown", "Shop.equip('hat_crown')"],
    ["SKINS", "cos:dskin_greatwhite", "Shop.equip('dskin_greatwhite')"],
    ["TRAILS", "none:trail", "Shop.unequip('trail')"],
    ["TITLES", "title:t_gold", "T.equip('t_gold')"],
    ["HEROES", "hero:ember", "(() => { S.selected = 'ember'; window.__glySave.write?.(); })()"],
  ];
  for (const [tab, key, old] of cases) {
    const before = await snap();
    await page.evaluate((src) => {
      const Shop = window.__glyShop.Shop;
      const T = window.__glyTitles;
      const S = window.__glySave.data;
      new Function("Shop", "T", "S", src)(Shop, T, S);
    }, old);
    const viaOld = await snap();
    await restore(before);
    await tap(page, tab, 300);
    await tapTile(page, key);
    expect(await snap(), `${key} saves like the old menu`).toBe(viaOld);
    expect(await locker(page, "return L.tiles.find((t) => t.entry.key === arg).entry.equipped;", key)).toBe(true);
  }
  expect(await page.evaluate(() => window.__glyShop.Shop.loadout().trail)).toBeUndefined();
  expect(await page.evaluate(() => window.__glySave.data.selected)).toBe("ember");

  // not yours: can't be worn, and the panel says how to get it (price / pass tier)
  await tap(page, "SKINS", 300);
  const skinBefore = await page.evaluate(() => window.__glyShop.Shop.equipped("skin"));
  await tapTile(page, "cos:skin_frozen");
  expect(await page.evaluate(() => window.__glyShop.Shop.equipped("skin"))).toBe(skinBefore);
  const info = await locker(page, "return { text: L.infoText.text, btn: L.action.visible && L.action.label.text, focus: L.focus.id };");
  expect(info.focus).toBe("skin_frozen");
  expect(info.text).toContain("700 coins");
  expect(info.btn).toBe("GET IN SHOP");
  await tapTile(page, "cos:skin_holo");
  expect(await locker(page, "return L.infoText.text;")).toContain("Drift Pass+ · Season 1, tier 3");
  await tap(page, "TITLES", 300);
  await tapTile(page, "title:t_diamond");
  expect(await page.evaluate(() => window.__glyTitles.equippedId())).toBe("t_gold");
  expect(await locker(page, "return L.infoText.text;")).toContain("Fly 6000m in one run");
  await tap(page, "HEROES", 300);
  await tapTile(page, "hero:frost");
  expect(await page.evaluate(() => window.__glySave.data.selected)).toBe("ember");
  // the same unlock words as the hero screen (one shared source)
  const words = await locker(page, "return { panel: L.infoText.text, heroes: window.__glyLocker.heroUnlock(window.__glyHeroes.getCharacter('frost')).alt };");
  expect(words.panel).toContain(words.heroes);
  // the preview shows the hero you tapped, on the one rig
  expect(await locker(page, "return L.rig.def.id;")).toBe("frost");
  expect(log.errors).toEqual([]);
});

test("Locker Room: the hero card's TAP TO EDIT and Progress → TITLES open it on the right tab @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { save: LOCKER_SAVE });
  // HEROES → (EMBER) → tap the card: the Locker on SKINS, EMBER now flying
  await tap(page, "HEROES", 0);
  await settle(page, "Characters", 900);
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").select(1));
  await run(page, 700);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Characters").roster[1].id)).toBe("ember");
  await tap(page, "✎ TAP TO EDIT", 0);
  await settle(page, "Locker", 600);
  expect(await locker(page, "return L.tab;")).toBe("skin");
  expect(await page.evaluate(() => window.__glySave.data.selected)).toBe("ember");
  expect(await locker(page, "return L.rig.def.id;")).toBe("ember");
  await tapTile(page, "cos:dskin_greatwhite"); // DAWSON's skin: previewed on DAWSON, worn by him
  expect(await locker(page, "return L.rig.def.id;")).toBe("dawson");
  expect(await page.evaluate(() => window.__glyShop.Shop.equipped("dskin"))).toBe("dskin_greatwhite");
  // BACK: to the hero screen, on the same hero
  await tap(page, "BACK", 0);
  await settle(page, "Characters", 600);
  expect(await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    return c.roster[c.index].id;
  })).toBe("ember");
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").scene.start("Menu"));
  await settle(page, "Menu", 1200);

  // Progress → TITLES: the Locker on TITLES; wear one; BACK to Progress
  await tapHome(page, "PROGRESS", 0);
  await settle(page, "Progress", 900);
  await tap(page, "TITLES", 0);
  await settle(page, "Locker", 600);
  expect(await locker(page, "return L.tab;")).toBe("titles");
  await tap(page, "GOLD LEAGUE", 400);
  expect(await page.evaluate(() => window.__glyTitles.equippedId())).toBe("t_gold");
  await tap(page, "BACK", 0);
  await settle(page, "Progress", 300);
  expect(log.errors).toEqual([]);
});
