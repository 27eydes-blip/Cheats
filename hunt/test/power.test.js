// Brawler Power 1-11, Gadgets (Power 7), Star Powers (Power 9), power matchmaking brackets,
// the Test Range, and old saves loading with the new fields.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLERS, BRAWLER_IDS } from '../public/shared.js';
import { powerMult, POWER_COST, MAX_POWER, GADGETS, STARS, powerBracket, powerSetup } from '../public/power.js';
import { normalize, applyMatch, newProgress, loadoutFor } from '../public/progression.js';
import { applyPurchase } from '../public/catalog.js';

const openMap = () => { const m = generateArena(3, 'meadow', 2); for (let i = 0; i < m.t.length; i++) if (!m.border[i]) m.t[i] = 0; return m; };
const mk = (o = {}) => new Sim({ map: openMap(), mode: 'bounty', phase: 'play', fillBots: false, events: false, ...o });
const setup = (b, power, gadget = null, star = null) => ({ power: { [b]: { power, gadget, star } } });

// +4% HP and damage per level
assert.equal(powerMult(1), 1); assert(Math.abs(powerMult(11) - 1.4) < 1e-9);
{
  const sim = mk(); const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' });
  sim.setLoadout(a.id, setup('volt', 6));
  assert.equal(a.maxHp, Math.round(BRAWLERS.volt.hp * 1.2), 'power 6 = +20% HP');
  assert(Math.abs(sim.dmgMult(a) / sim.dmgMult(b) - 1.2) < 1e-9, 'power 6 = +20% damage');
  a.hp = 10; sim.respawn(a); assert.equal(a.hp, a.maxHp); assert.equal(a.maxHp, Math.round(BRAWLERS.volt.hp * 1.2), 'respawn keeps power HP');
}
// coins earned by playing buy power; gadget/star picks need the level
{
  const p = normalize({ coins: 0 });
  assert(applyPurchase(p, { action: 'upgrade', brawler: 'volt' }).error, 'no coins, no upgrade');
  const m = applyMatch(newProgress(), { rank: 1, players: 10, kills: 4, bounty: 3, brawler: 'volt' });
  assert(m.coins > 0 && m.progress.coins === 200 + m.coins + m.levels.reduce((t, r) => t + r.coins, 0), 'matches pay coins');
  const q = normalize({ coins: 99999 });
  for (let L = 1; L < MAX_POWER; L++) assert(!applyPurchase(q, { action: 'upgrade', brawler: 'rook' }).error);
  assert.equal(q.power.rook, 11); assert.equal(q.coins, 99999 - POWER_COST.reduce((a, b) => a + b, 0));
  assert(applyPurchase(q, { action: 'upgrade', brawler: 'rook' }).error, 'max 11');
  assert(applyPurchase(normalize({}), { action: 'gadget', brawler: 'rook', id: 'rook_hook' }).error, 'gadget needs power 7');
  assert(!applyPurchase(q, { action: 'gadget', brawler: 'rook', id: 'rook_hook' }).error);
  assert(applyPurchase(q, { action: 'star', brawler: 'rook', id: 'volt_boots' }).error, "another brawler's star power is refused");
  assert.equal(loadoutFor(q).power.rook.gadget, 'rook_hook');
  assert.equal(powerSetup(normalize({ power: { volt: 6 }, gadget: { volt: 'volt_jolt' } })).volt.gadget, null, 'no gadget below 7');
  for (const b of BRAWLER_IDS) assert(GADGETS[b].length === 2 && STARS[b].length === 2, b + ': 2 gadgets + 2 star powers');
}
// GADGETS: 3 uses, each one does its thing
{
  const sim = mk(); const a = sim.addPlayer({ name: 'A', brawler: 'brick' }), e = sim.addPlayer({ name: 'E', brawler: 'volt' });
  a.x = 600; a.y = 1000; e.x = 700; e.y = 1000;
  sim.setLoadout(a.id, setup('brick', 7, 'brick_pound'));
  assert.equal(a.gUses, 3);
  const hp = e.hp; sim.useGadget(a); assert(e.hp < hp && e.knock, 'Ground Pound hits and shoves');
  for (let i = 0; i < 5; i++) { a.gadgetT = -9; sim.useGadget(a); }
  assert.equal(a.gUses, 0, 'only 3 uses');
  const b2 = mk(); const w = b2.addPlayer({ name: 'W', brawler: 'brick' }); b2.setLoadout(w.id, setup('brick', 7, 'brick_iron'));
  const t = b2.addPlayer({ name: 'T', brawler: 'volt' });
  b2.useGadget(w); const h0 = w.hp; b2.damage(t, w, 1000, false); assert.equal(h0 - w.hp, 700, 'Iron Skin: 30% less damage');
  const r = mk(); const rk = r.addPlayer({ name: 'R', brawler: 'rook' }), v = r.addPlayer({ name: 'V', brawler: 'volt' });
  rk.x = 600; rk.y = 1000; v.x = 950; v.y = 1000; r.setLoadout(rk.id, setup('rook', 7, 'rook_hook'));
  r.useGadget(rk); for (let i = 0; i < 6; i++) r.tick(); assert(v.x < 800, `Chain Hook pulls (${v.x | 0})`);
}
// STAR POWERS: passive bonuses
{
  const sim = mk(); const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' });
  sim.setLoadout(a.id, setup('volt', 9, null, 'volt_boots'));
  assert(Math.abs(sim.stats(a).speed / sim.stats(b).speed - 1.06) < 1e-9, 'Spark Boots: +6% speed');
  const s2 = mk(); const k = s2.addPlayer({ name: 'K', brawler: 'brick' }), x = s2.addPlayer({ name: 'X', brawler: 'volt' });
  s2.setLoadout(k.id, setup('brick', 9, null, 'brick_wind'));
  s2.damage(x, k, k.maxHp * 0.8, false); assert(k.hp > k.maxHp * 0.4, 'Second Wind heals once under 25%');
}
// MATCHMAKING: similar power, same bracket; bots match the humans' power
assert.equal(powerBracket(1), powerBracket(3)); assert.notEqual(powerBracket(3), powerBracket(11));
{
  const sim = new Sim({ map: generateArena(4, 'meadow', 10), mode: 'showdown', fillBots: true, events: false, lobbyTime: 0 });
  const id = sim.join('Me', 'volt'); sim.setLoadout(id, setup('volt', 8, 'volt_jolt'));
  for (let i = 0; i < 3; i++) sim.tick();
  const bots = [...sim.players.values()].filter((p) => p.wasBot);
  assert(bots.length && bots.every((b) => b.power === 8 && b.gadget), 'bots play at your power, with gadgets');
}
// TEST RANGE: one player, six dummies that never fight back, no rewards
{
  let finished = 0;
  const sim = new Sim({ map: openMap(), mode: 'range', fillBots: true, events: false, lobbyTime: 0, hooks: { finished: () => finished++ } });
  const id = sim.join('Me', 'volt'); for (let i = 0; i < 3; i++) sim.tick();
  const d = [...sim.players.values()].filter((p) => p.dummy);
  assert.equal(d.length, 6, '6 dummies'); assert.equal(sim.join('Other', 'volt'), null, 'private');
  const me = sim.players.get(id); sim.setWeapon(me, 'needle'); me.slot = 1;
  for (let i = 0; i < 200; i++) sim.tick();
  assert(me.hp === me.maxHp && me.alive, 'dummies never attack');
  const mover = d.find((x) => x.mover); assert(Math.abs(mover.y - mover.home.y) > 5, 'the moving dummy strafes');
}
// OLD SAVES still load, keep everything, and get the new fields
{
  const old = normalize({ xp: 4300, coins: 77, trophies: { volt: 120 }, owned: ['volt_storm'], equipped: { 'skin:volt': 'volt_storm' } });
  assert.equal(old.coins, 77); assert.equal(old.trophies.volt, 120); assert(old.owned.includes('volt_storm'));
  assert.deepEqual(old.power, {}); assert.deepEqual(old.mastery, {}); assert.equal(loadoutFor(old).power.volt.power, 1);
}
console.log('POWER OK');
// through the network input path: gadget + emote messages reach the sim
{
  const sim = mk(); const a = sim.addPlayer({ name: 'A', brawler: 'dune' }); a.connected = true;
  sim.setLoadout(a.id, setup('dune', 7, 'dune_mend')); a.hp = 100;
  sim.input(a.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, gd: 1 }); sim.tick();
  assert(a.hp > 100 && a.gUses === 2, 'gadget from a client input');
  sim.input(a.id, { t: 'emote', e: 1 }); assert(sim.fx.some((f) => f[0] === 'emote'), 'emote from a client message');
  console.log('gadget + emote inputs: OK');
}
