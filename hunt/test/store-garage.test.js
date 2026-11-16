// Hunt Racers store (public/race/garage.js): catalog integrity, prices, buy / equip / own rules,
// the daily shop rotation and its UTC refresh boundary, old saves, the race roster carrying
// everyone's cosmetics, the HORN event, and cosmetics never touching the race physics.
import assert from 'node:assert';
import { ITEMS, ITEM_IDS, SLOTS, RARITIES, itemsOf, dailyShop, shopDay, msToShopRefresh, DAY_MS, DAILY_SIZE, dealPrice, garageAction, equippedOf, cosRow, resolveCos, owns } from '../public/race/garage.js';
import { applyPurchase, priceOf } from '../public/catalog.js';
import { newProgress, normalize } from '../public/progression.js';
import { DRIVERS, DRIVER_IDS } from '../public/race/physics.js';
import { BASE_LOOKS, makeLook, carName } from '../public/race/looks.js';
import { HORN_GAP } from '../src/race/sim.js';
import { mkRace, startRace, toGo, ticks, driver, collectEvents } from './race-helpers.js';

const rich = () => Object.assign(newProgress(), { coins: 100000, gems: 10000 });
const NAMES = { volt: 'ARCWIRE', brick: 'WARHOG', wisp: 'PHANTOM', dune: 'SANDVIPER', rook: 'COBRA', flicker: 'RAZOR' };

// ---------------------------------------------------------------- catalog
{
  for (const id of DRIVER_IDS) assert.strictEqual(carName(id), NAMES[id], `display name of ${id}`);
  assert.deepStrictEqual(Object.keys(BASE_LOOKS).sort(), [...DRIVER_IDS].sort(), 'a base look for every car');
  const neons = DRIVER_IDS.map((d) => BASE_LOOKS[d].neon);
  assert.strictEqual(new Set(neons).size, 6, 'one signature neon colour per car');
  const names = new Set();
  for (const id of ITEM_IDS) {
    const it = ITEMS[id];
    assert.strictEqual(it.id, id);
    assert.ok(SLOTS.includes(it.kind), `${id}: kind`);
    assert.ok(RARITIES.includes(it.rarity), `${id}: rarity`);
    assert.ok(it.name && it.name.length <= 16, `${id}: short name`);
    assert.ok(!names.has(it.kind + it.name), `${id}: unique name`); names.add(it.kind + it.name);
    assert.ok(it.price && ['coins', 'gems'].includes(it.price.cur) && it.price.n > 0 && Number.isInteger(it.price.n), `${id}: price`);
    assert.strictEqual(it.price.cur, it.rarity === 'legendary' ? 'gems' : 'coins', `${id}: legendary items cost gems, the rest coins`);
    assert.strictEqual(priceOf(id), null, `${id}: never sold through the shooter Locker`);
    assert.ok(Object.isFrozen(it) && Object.isFrozen(it.opt), `${id}: frozen`);
    // option objects in the shapes makeLook reads
    const o = it.opt;
    if (it.kind === 'skin') { assert.ok(/^#[0-9a-f]{6}$/.test(o.neon) && DRIVER_IDS.includes(it.car)); assert.ok(id.startsWith(NAMES[it.car].toLowerCase() + '_'), `${id}: skin id starts with its car`); }
    if (it.kind === 'glow') assert.ok(/^#[0-9a-f]{6}$/.test(o.color) && ['pool', 'mist', 'twin'].includes(o.style));
    if (it.kind === 'wheel') assert.ok(/^#[0-9a-f]{6}$/.test(o.rim) && o.spokes >= 3 && o.spokes <= 8);
    if (it.kind === 'flame') assert.ok(/^#[0-9a-f]{6}$/.test(o.core) && /^#[0-9a-f]{6}$/.test(o.outer));
    if (it.kind === 'trail') assert.ok(/^#[0-9a-f]{6}$/.test(o.color) && ['line', 'ribbon', 'sparks'].includes(o.style));
    if (it.kind === 'horn') { assert.ok(o.notes.length >= 1 && o.notes.every(([f, d]) => f >= 0 && f < 4000 && d > 0)); assert.ok(o.notes.reduce((s, [, d]) => s + d, 0) <= 0.8, `${id}: a short horn`); }
  }
  for (const car of DRIVER_IDS) {
    const sk = itemsOf('skin', car).filter((it) => it.car === car);
    assert.strictEqual(sk.length, 3, `${car}: 3 skins`);
    assert.strictEqual(sk.filter((it) => it.opt.pattern && it.opt.pattern !== 'none').length, 1, `${car}: one animated pattern`);
    assert.strictEqual(sk.find((it) => it.opt.pattern).rarity, 'legendary', `${car}: the animated one is legendary`);
    assert.strictEqual(sk.filter((it) => !it.opt.pattern).length, 2, `${car}: two neon colour swaps`);
  }
  for (const kind of ['glow', 'wheel', 'flame', 'trail', 'horn']) {
    const list = itemsOf(kind);
    assert.ok(list.length >= 5, `${kind}: a set to choose from`);
    assert.ok(RARITIES.every((r) => list.some((it) => it.rarity === r)), `${kind}: every rarity`);
  }
  // rarer costs more (within a kind and currency)
  for (const kind of SLOTS) {
    const c = (r) => itemsOf(kind).filter((it) => it.rarity === r).map((it) => it.price.n);
    if (c('common').length && c('rare').length) assert.ok(Math.max(...c('common')) < Math.min(...c('rare')));
    assert.ok(Math.max(...c('rare')) < Math.min(...c('epic')), `${kind}: epic above rare`);
  }
  // every option object resolves into a look
  for (const id of ITEM_IDS) {
    const it = ITEMS[id], car = it.car || 'volt', look = makeLook(car, resolveCos({ [it.kind]: id }, car));
    if (it.kind === 'skin') assert.strictEqual(look.neon, it.opt.neon);
    if (it.kind === 'glow') assert.deepStrictEqual([look.glow, look.glowStyle], [it.opt.color, it.opt.style]);
    if (it.kind === 'wheel') assert.strictEqual(look.rim, it.opt.rim);
    if (it.kind === 'flame') assert.deepStrictEqual([look.flame.core, look.flame.outer], [it.opt.core, it.opt.outer]);
    if (it.kind === 'trail') assert.deepStrictEqual([look.trail.color, look.trail.style], [it.opt.color, it.opt.style]);
    if (it.kind === 'wheel') assert.strictEqual(look.spokes, it.opt.spokes, `${id}: spokes within the look's range`);
  }
  console.log(`catalog: ${ITEM_IDS.length} items ok`);
}

// ---------------------------------------------------------------- buy / own / equip
{
  const buy = (p, id, daily) => applyPurchase(p, { action: 'gbuy', id, ...(daily ? { daily: true } : {}) });
  const eq = (p, car, slot, id) => applyPurchase(p, { action: 'gequip', car, slot, id });
  let p = normalize(newProgress()); // 200 coins, 20 gems
  assert.match(buy(p, 'arcwire_redline').error, /Not enough coins/);
  assert.match(buy(p, 'glow_goldrush').error, /Not enough gems/);
  assert.strictEqual(p.coins, 200, 'a failed buy costs nothing');
  assert.strictEqual(buy(p, 'nope').error, 'not for sale');
  assert.strictEqual(buy(p, 'volt_storm').error, 'not for sale', 'shooter skins are not in this store');
  assert.strictEqual(buy(p, '__proto__').error, 'not for sale');
  const r = buy(p, 'glow_lime');
  assert.ok(!r.error);
  assert.strictEqual(p.coins, 200 - ITEMS.glow_lime.price.n, 'paid in coins');
  assert.ok(owns(p, 'glow_lime'));
  assert.strictEqual(buy(p, 'glow_lime').error, 'already owned');
  p.gems = 100;
  assert.ok(!buy(p, 'rim_goldspin').error);
  assert.strictEqual(p.gems, 100 - ITEMS.rim_goldspin.price.n, 'legendary paid in gems');
  // equip per car
  assert.strictEqual(eq(p, 'volt', 'glow', 'glow_violet').error, 'not owned');
  assert.strictEqual(eq(p, 'volt', 'wheel', 'glow_lime').error, 'wrong item for that slot');
  assert.strictEqual(eq(p, 'tank', 'glow', 'glow_lime').error, 'bad car');
  assert.strictEqual(eq(p, 'volt', 'paint', 'glow_lime').error, 'bad slot');
  assert.strictEqual(eq(p, '__proto__', 'glow', 'glow_lime').error, 'bad car');
  assert.ok(!eq(p, 'volt', 'glow', 'glow_lime').error);
  assert.ok(!eq(p, 'rook', 'wheel', 'rim_goldspin').error);
  assert.deepStrictEqual(equippedOf(p, 'volt'), { skin: null, glow: 'glow_lime', wheel: null, flame: null, trail: null, horn: null });
  assert.deepStrictEqual(equippedOf(p, 'rook').wheel, 'rim_goldspin', 'equipped on each car separately');
  assert.strictEqual(equippedOf(p, 'brick').glow, null, 'other cars keep their default');
  // skins belong to one car
  p = rich();
  assert.ok(!buy(p, 'cobra_venom').error);
  assert.strictEqual(eq(p, 'volt', 'skin', 'cobra_venom').error, 'that skin is for another car');
  assert.ok(!eq(p, 'rook', 'skin', 'cobra_venom').error);
  assert.deepStrictEqual(cosRow(p, 'rook'), ['cobra_venom', 0, 0, 0, 0, 0]);
  assert.ok(!eq(p, 'rook', 'skin', null).error, 'unequip = back to the default');
  assert.deepStrictEqual(cosRow(p, 'rook'), [0, 0, 0, 0, 0, 0]);
  // a hand-edited save cannot equip what it does not own: equippedOf ignores it
  p.race.cos.volt = { skin: 'arcwire_stormcore', glow: 'cobra_venom', horn: 'horn_victory' };
  assert.deepStrictEqual(cosRow(p, 'volt'), [0, 0, 0, 0, 0, 0], 'not owned / wrong slot -> default');
  // the server path: a JSON round trip through normalize keeps the equip
  p = rich(); buy(p, 'horn_siren'); eq(p, 'dune', 'horn', 'horn_siren');
  assert.strictEqual(equippedOf(normalize(JSON.parse(JSON.stringify(p))), 'dune').horn, 'horn_siren');
  console.log('buy / own / equip: ok');
}

// ---------------------------------------------------------------- daily shop: 6 items, a new set every UTC day
{
  const day = shopDay(Date.UTC(2026, 10, 16, 12));
  assert.strictEqual(day, 20773);
  const a = dailyShop(day);
  assert.strictEqual(a.length, DAILY_SIZE);
  assert.strictEqual(new Set(a.map((d) => d.id)).size, 6, 'six different items');
  assert.deepStrictEqual(dailyShop(day), a, 'the same for everyone all day');
  assert.ok(['epic', 'legendary'].includes(ITEMS[a[0].id].rarity) && ITEMS[a[0].id].kind === 'skin', 'a featured skin first');
  for (const d of a) { assert.deepStrictEqual(d.was, ITEMS[d.id].price); assert.ok(d.price.cur === d.was.cur && d.price.n < d.was.n, 'a deal: cheaper, same currency'); }
  let changed = 0;
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const s = dailyShop(day + k);
    assert.strictEqual(new Set(s.map((d) => d.id)).size, 6);
    assert.strictEqual(new Set(s.slice(3).map((d) => ITEMS[d.id].kind)).size, 3, 'three different kinds besides the skins');
    if (k && s.map((d) => d.id).join() !== dailyShop(day + k - 1).map((d) => d.id).join()) changed++;
    for (const d of s) seen.add(d.id);
  }
  assert.ok(changed >= 58, `rotates every day (${changed}/59)`);
  assert.ok(seen.size > ITEM_IDS.length * 0.7, `most of the store comes round (${seen.size}/${ITEM_IDS.length})`);
  assert.deepStrictEqual(dealPrice({ cur: 'coins', n: 1000 }), { cur: 'coins', n: 700 });
  assert.deepStrictEqual(dealPrice({ cur: 'gems', n: 60 }), { cur: 'gems', n: 42 });
  // refresh boundary: 23:59:59.999 UTC is still today, 00:00:00 is the next day's shop
  const mid = Date.UTC(2026, 10, 17), before = mid - 1;
  assert.strictEqual(shopDay(before), day); assert.strictEqual(shopDay(mid), day + 1);
  assert.strictEqual(msToShopRefresh(before), 1);
  assert.strictEqual(msToShopRefresh(mid), DAY_MS, 'a full day right after the refresh');
  assert.strictEqual(msToShopRefresh(Date.UTC(2026, 10, 16, 18)), 6 * 3600e3);
  // buying a deal: today's price; a deal that just left the shop is refused (no stale prices)
  const today = a.find((d) => d.price.cur === 'coins') || a[0], tomorrow = dailyShop(day + 1);
  const p = rich(), c0 = p.coins, g0 = p.gems;
  assert.ok(!garageAction(p, { action: 'gbuy', id: today.id, daily: true }, before).error);
  assert.strictEqual(today.price.cur === 'coins' ? c0 - p.coins : g0 - p.gems, today.price.n, 'paid the deal price');
  const gone = a.find((d) => !tomorrow.some((t) => t.id === d.id) && d.id !== today.id);
  assert.match(garageAction(rich(), { action: 'gbuy', id: gone.id, daily: true }, mid).error, /daily shop just refreshed/);
  assert.ok(!garageAction(rich(), { action: 'gbuy', id: gone.id }, mid).error, 'still for sale at the list price');
  const notToday = ITEM_IDS.find((id) => !a.some((d) => d.id === id));
  assert.match(garageAction(rich(), { action: 'gbuy', id: notToday, daily: true }, before).error, /refreshed/, 'no deal price for an item not in the shop');
  console.log('daily shop: ok');
}

// ---------------------------------------------------------------- old saves keep everything
{
  const old = { v: 1, xp: 5000, coins: 777, gems: 33, trophies: { volt: 120, rook: 40 }, claimed: [100], owned: ['volt_storm', 'sharpshooter'], equipped: { title: 'sharpshooter', 'skin:volt': 'volt_storm' }, pass: { premium: true, claimed: ['free:1'], xp: 300 }, games: 50, wins: 7, race: { races: 12, wins: 3, best: { neon: 61.5 }, bestLap: { neon: 19.9 } } };
  const n = normalize(JSON.parse(JSON.stringify(old)));
  assert.deepStrictEqual([n.xp, n.coins, n.gems, n.games, n.wins], [5000, 777, 33, 50, 7]);
  assert.deepStrictEqual([n.trophies.volt, n.trophies.rook, n.trophies.flicker], [120, 40, 0], 'drivers / trophies kept');
  assert.ok(n.owned.includes('volt_storm') && n.owned.includes('sharpshooter'), 'owned items kept');
  assert.deepStrictEqual(n.equipped, old.equipped);
  assert.deepStrictEqual(n.pass, old.pass);
  assert.deepStrictEqual([n.race.races, n.race.wins, n.race.best.neon, n.race.bestLap.neon], [12, 3, 61.5, 19.9], 'race stats kept');
  assert.deepStrictEqual(n.race.cos, {}, 'no cosmetics yet: every car on its default look');
  for (const car of DRIVER_IDS) assert.deepStrictEqual(cosRow(n, car), [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(normalize({}).race.cos, {});
  // broken shapes don't throw and don't leak
  for (const bad of [{ race: 5 }, { race: [] }, { race: { cos: 'x' } }, { race: { cos: { volt: 7, brick: [], ghost: {} } } }, { race: { cos: JSON.parse('{"__proto__": {"skin": "x"}}') } }]) {
    const q = normalize(bad);
    assert.deepStrictEqual(q.race.cos, {}, JSON.stringify(bad));
    assert.strictEqual({}.skin, undefined);
  }
  // equipped ids survive normalize
  const e = normalize({ owned: ['glow_lime'], race: { cos: { volt: { glow: 'glow_lime', skin: null, junk: 5 } } } });
  assert.deepStrictEqual(e.race.cos.volt, { glow: 'glow_lime', skin: null });
  // buying into an old save works and keeps everything
  const o2 = normalize(JSON.parse(JSON.stringify(old)));
  assert.ok(!applyPurchase(o2, { action: 'gbuy', id: 'glow_lime' }).error);
  assert.ok(!applyPurchase(o2, { action: 'gequip', car: 'volt', slot: 'glow', id: 'glow_lime' }).error);
  assert.ok(o2.owned.includes('volt_storm') && o2.race.races === 12 && o2.equipped['skin:volt'] === 'volt_storm');
  console.log('old saves: ok');
}

// ---------------------------------------------------------------- race: roster carries cosmetics, HORN events
{
  const sim = mkRace();
  const sent = [];
  sim.send = (id, m) => sent.push([id, m]);
  const [A, B] = startRace(sim, ['rook', 'volt']);
  const pr = rich();
  applyPurchase(pr, { action: 'gbuy', id: 'cobra_eclipse' }); applyPurchase(pr, { action: 'gequip', car: 'rook', slot: 'skin', id: 'cobra_eclipse' });
  applyPurchase(pr, { action: 'gbuy', id: 'horn_arcade' }); applyPurchase(pr, { action: 'gequip', car: 'rook', slot: 'horn', id: 'horn_arcade' });
  sent.length = 0;
  sim.setGarage(A.id, JSON.parse(JSON.stringify(pr))); // the account arrives after the start
  const ro = sent.filter(([, m]) => m.t === 'ro');
  assert.strictEqual(ro.length, 2, 'everyone gets the updated roster row');
  assert.deepStrictEqual(ro[0][1].add[A.id], [A.name, 'rook', 0, ['cobra_eclipse', 0, 0, 0, 0, 'horn_arcade']]);
  assert.deepStrictEqual(sim.rosterMsg().add[B.id][3], 0, 'guests: the default look');
  assert.strictEqual(resolveCos(sim.rosterMsg().add[A.id][3], 'rook').skin, ITEMS.cobra_eclipse.opt);
  // horn: one event per press, rate limited, seen by everyone
  const ev = collectEvents(sim);
  toGo(sim);
  sim.input(A.id, { t: 'horn' }); ticks(sim, 1);
  sim.input(A.id, { t: 'horn' }); ticks(sim, 1); // too soon
  ticks(sim, Math.ceil(HORN_GAP * 30));
  sim.input(A.id, { t: 'horn' }); sim.input(A.id, { t: 'horn' }); ticks(sim, 1);
  assert.strictEqual(ev.filter((e) => e[1] === 'horn' && e[2] === A.id).length, 2, 'rate limited to one per 1.5 s');
  // the lobby ignores the horn (it does not go off later at the start)
  const s2 = mkRace(), id = s2.join('X', 'volt');
  s2.input(id, { t: 'horn' });
  assert.strictEqual(s2.players.get(id).honk, 0);
  console.log('race roster + horn: ok');
}

// ---------------------------------------------------------------- cosmetics never touch the race
{
  const run = (withCos) => {
    const sim = mkRace({ seed: 77, fillBots: true });
    const [A, B] = startRace(sim, ['rook', 'flicker']);
    if (withCos) {
      const pr = rich();
      for (const id of ITEM_IDS) applyPurchase(pr, { action: 'gbuy', id });
      for (const car of DRIVER_IDS) for (const it of Object.values(ITEMS)) if (!it.car || it.car === car) applyPurchase(pr, { action: 'gequip', car, slot: it.kind, id: it.id });
      sim.setGarage(A.id, pr); sim.setGarage(B.id, pr);
      assert.notDeepStrictEqual(sim.rosterRow(A)[3], [0, 0, 0, 0, 0, 0]);
    }
    const dA = driver(sim, A), dB = driver(sim, B);
    for (let i = 0; i < 30 * 12; i++) { dA({ th: 1, st: Math.sin(i / 20), dr: i % 50 < 20 ? 1 : 0, f: i % 40 === 0 ? 1 : 0, i: i % 60 === 0 ? 1 : 0 }); dB({ th: 1, st: -0.3 }); sim.tick(); }
    return [...sim.players.values()].map((p) => [p.driver, p.st, p.hp, p.maxHp, p.lap, p.cp, p.kills, Math.round(p.car.x * 1000), Math.round(p.car.y * 1000), Math.round(p.car.vx * 1000), p.car.boostT]);
  };
  const before = JSON.stringify(DRIVERS);
  assert.deepStrictEqual(run(true), run(false), 'the same race with or without every cosmetic equipped');
  assert.strictEqual(JSON.stringify(DRIVERS), before, 'driver stats untouched');
  console.log('cosmetics never touch physics: ok');
}
console.log('STORE OK');
