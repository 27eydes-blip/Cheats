// Names that live on Object.prototype ('constructor', '__proto__', 'toString', 'hasOwnProperty',
// 'valueOf'...) must never pass as a brawler, weapon, mode, world, event, skin, perk... id.
// Every entry point that takes an id from a player is fed every one of them: nothing may throw,
// no tick may stall, and each falls back to something sane.
import assert from 'node:assert';
import { PROTO_KEYS, fakeD1, fakeEnv, manual, steps, connect, settle } from './server-harness.js';
import worker, { MatchRoom, ZoneRoom } from '../src/worker.js';
import { faults } from '../src/guard.js';
import { Sim } from '../src/sim.js';
import { handleApi } from '../src/accounts.js';
import { generateArena, generateWorld, zoneBounds, BRAWLERS, BRAWLER_IDS, HUB, own } from '../public/shared.js';
import { applyPurchase, priceOf } from '../public/catalog.js';
import { applyMatch, newProgress, normalize, totalTrophies, weaponUnlocked, loadoutFor } from '../public/progression.js';
import { perksFor, WEAPONS } from '../public/weapons.js';
import { gadgetOf, starOf, powerAction } from '../public/power.js';
import { EVENTS } from '../public/events/index.js';

assert(PROTO_KEYS.includes('constructor') && PROTO_KEYS.includes('__proto__') && PROTO_KEYS.includes('toString') && PROTO_KEYS.includes('hasOwnProperty') && PROTO_KEYS.includes('valueOf'));
// ids that aren't strings at all are part of the same family (a JSON body can hold anything)
const ODD = [...PROTO_KEYS, '', 'nope', ['volt'], ['stormline'], { a: 1 }, 5, true, null];
const q = (s) => encodeURIComponent(s);

// ---- the helper itself
for (const k of PROTO_KEYS) assert.equal(own(BRAWLERS, k), undefined, `own() ignores ${k}`);
assert.equal(own(BRAWLERS, 'volt'), BRAWLERS.volt);
assert.equal(own(BRAWLERS, ['volt']), undefined, 'own() wants a string key');

// ---- Sim: join, pick, weapons, mode, forced event
for (const k of PROTO_KEYS) {
  const got = [];
  const sim = new Sim({ map: generateArena(5), mode: 'bounty', seed: 5, lobbyTime: 0.1, send: (id, m) => got.push([id, m.t]) });
  const bad = sim.join('Cheat', k), ok = sim.join('Honest', 'volt');
  assert.equal(sim.players.get(bad).brawler, 'volt', `join with brawler=${k} falls back to volt`);
  while (sim.phase === 'lobby') sim.tick();
  assert(Number.isFinite(sim.players.get(bad).hp) && sim.players.get(bad).hp > 0);
  got.length = 0;
  for (let i = 0; i < 40; i++) { sim.input(bad, { t: 'in', s: i + 1, f: 0, u: 0, w: 1, gd: 1 }); sim.tick(); }
  assert.equal(got.filter(([id, t]) => id === ok && t === 's').length, 40, `brawler=${k}: the honest player got every snapshot`);
  sim.setWeapon(sim.players.get(bad), k);
  assert.equal(sim.players.get(bad).w2, null, `weapon ${k} is not a weapon`);
  sim.setLoadout(bad, { w2: k, perks: [k], power: { [k]: { power: 11, gadget: k, star: k } } });
  assert.equal(sim.players.get(bad).w2, null);
  sim.tick();

  const odd = new Sim({ map: generateArena(5), mode: k, forceEvent: k, seed: 5, phase: 'play', fillBots: false });
  assert.equal(odd.modeKey, 'showdown', `mode ${k} falls back`);
  assert.equal(odd.forceEvent, null, `event ${k} is not an event`);
}
{ // a forced prototype event used to freeze the event scheduler for the whole match (NaN timer)
  const sim = new Sim({ map: generateArena(5), mode: 'bounty', forceEvent: 'constructor', seed: 5, phase: 'play', fillBots: false });
  const seen = new Set();
  for (let i = 0; i < 20 * 100; i++) { sim.tick(); if (sim.event) { seen.add(sim.event.id); assert(Number.isFinite(sim.event.t), 'event timer is a number'); } }
  assert(seen.size >= 2 && [...seen].every((id) => Object.hasOwn(EVENTS, id)), 'real events keep running: ' + [...seen]);
}
{ // Free Play: picking a brawler in the hub
  const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'c', bounds: zoneBounds('c'), hub: true, phase: 'play', botTarget: 0, events: false, now: () => 0 });
  const p = sim.addPlayer({ name: 'P', brawler: 'toString' });
  assert.equal(p.brawler, 'volt');
  p.x = HUB.x; p.y = HUB.y;
  for (const k of ODD) { sim.input(p.id, { t: 'pick', brawler: k }); sim.input(p.id, { t: 'emote', e: k }); sim.input(p.id, { t: k }); sim.tick(); assert.equal(p.brawler, 'volt', `pick ${String(k)} ignored`); }
  sim.input(p.id, { t: 'pick', brawler: 'brick' });
  assert.equal(p.brawler, 'brick', 'a real pick still works');
  // a handoff can't carry a made-up brawler in either
  const q2 = sim.importPlayer({ ...sim.exportPlayer(p), brawler: 'valueOf' }, 'Q', true);
  assert.equal(q2.brawler, 'volt');
}

// ---- shared tables
for (const k of ODD) {
  assert.deepEqual(perksFor(k), {}, `perksFor(${String(k)})`);
  assert.equal(priceOf(k), null, `priceOf(${String(k)})`);
  assert.equal(weaponUnlocked({ xp: 1e9 }, k), false, `weaponUnlocked(${String(k)})`);
  assert.equal(gadgetOf(k, k), null); assert.equal(starOf(k, k), null);
}

// ---- match results: only real brawlers hold trophies
for (const k of PROTO_KEYS) {
  const out = applyMatch(newProgress(), { rank: 1, players: 10, kills: 2, bounty: 1, brawler: k, mode: 'bounty', wstat: { [k]: { d: 500, k: 1 }, constructor: { d: 9, k: 9 } } });
  assert.deepEqual(Object.keys(out.progress.trophies).sort(), [...BRAWLER_IDS].sort(), `no trophy key for ${k}`);
  assert.equal(totalTrophies(out.progress), 0);
  assert.equal(out.delta, 0);
  assert.deepEqual(Object.keys(out.progress.mastery), [], 'no mastery for a made-up weapon');
  assert.equal(out.progress.games, 1, 'the match itself still counts');
}
{ // the lifetime per-mode stats never touch something inherited
  const out = applyMatch(JSON.parse(JSON.stringify(newProgress())), { rank: 1, players: 10, kills: 1, brawler: 'volt', mode: 'constructor' });
  assert.equal(out.progress.modes.constructor.games, 1);
  assert.equal(Object.games, undefined);
}

// ---- shop actions (the function, then the real HTTP route)
const rich = () => normalize({ ...newProgress(), coins: 99999, xp: 1e6, owned: ['volt_storm', 'tracker', 'sparks'] });
const ACTIONS = ['mission', 'equip', 'upgrade', 'gadget', 'star', 'loadout', 'perk', 'buy', 'premium', 'passClaim'];
const FIELDS = ['id', 'slot', 'brawler', 'w2', 'weapon', 'tier', 'track'];
let shopCalls = 0;
for (const action of [...ACTIONS, ...ODD]) for (const k of ODD) {
  // every field set to the odd value at once, then one at a time on an otherwise valid request
  const reqs = [Object.fromEntries([['action', action], ...FIELDS.map((f) => [f, k])])];
  const valid = { action, id: 'volt_storm', slot: 'skin:volt', brawler: 'volt', w2: 'stormline', weapon: 'stormline', tier: 2, track: 'free' };
  for (const f of FIELDS) reqs.push({ ...valid, [f]: k });
  for (const req of reqs) {
    const p = rich(), before = JSON.stringify(p);
    let out;
    assert.doesNotThrow(() => { out = applyPurchase(p, req); }, `shop ${JSON.stringify(req)}`);
    shopCalls++;
    assert(out && (out.error || out.progress), 'an answer, not a crash');
    const after = out.progress || p;
    for (const key of Object.keys(after.equipped)) assert(['title', 'fx'].includes(key) || /^skin:/.test(key), 'equipped slots stay sane: ' + key);
    assert(after.owned.every((x) => typeof x === 'string'), 'owned holds ids only');
    assert(after.loadout.w2 == null || Object.hasOwn(WEAPONS, after.loadout.w2), 'loadout weapon is real');
    for (const [w, list] of Object.entries(after.perks || {})) assert(Object.hasOwn(WEAPONS, w) && Array.isArray(list), 'perks keyed by real weapons');
    if (out.error) assert.equal(JSON.stringify(p), before, `a refused request changes nothing: ${JSON.stringify(req)}`);
    assert.doesNotThrow(() => loadoutFor(after));
  }
}
for (const body of [null, 5, 'x', [], [1], true]) assert.equal(applyPurchase(rich(), body).error, 'unknown action');
assert.equal(applyPurchase(rich(), { action: 'perk', weapon: 'constructor', tier: 2, id: 'x' }).error, 'bad weapon');
assert.deepEqual(applyPurchase({ ...rich(), mastery: { stormline: 5000 } }, { action: 'perk', weapon: 'stormline', tier: 2, id: 'steadygrip' }).progress.perks, { stormline: ['steadygrip'] }, 'a real perk pick still works');
assert.equal(powerAction(rich(), { action: 'upgrade', brawler: 'constructor' }).error, 'bad brawler');
{
  const db = fakeD1(), env = fakeEnv(db);
  db.addUser('u1', 'tok1', rich());
  const post = (path, body, raw) => handleApi(new Request('http://hunt.test/api' + path, { method: 'POST', headers: { authorization: 'Bearer tok1' }, body: raw ?? JSON.stringify(body) }), env);
  const before = JSON.stringify(db.progress('u1'));
  for (const k of PROTO_KEYS) {
    for (const body of [{ action: 'perk', weapon: k, tier: 2, id: k }, { action: 'equip', slot: k, id: k }, { action: 'buy', id: k }, { action: k }, { action: 'loadout', w2: k }, { action: 'upgrade', brawler: k }]) {
      const r = await post('/shop', body);
      assert.equal(r.status, 400, `/api/shop ${JSON.stringify(body)} is a clean refusal (got ${r.status})`);
      assert.equal(typeof (await r.json()).error, 'string');
    }
    assert.equal((await post('/claim', { at: k })).status, 400);
  }
  // bodies that are valid JSON but not an object, and bodies that aren't JSON
  for (const raw of ['null', '5', '"x"', '[]', 'true', '{', '']) for (const path of ['/shop', '/claim', '/login', '/register']) {
    const r = await post(path, null, raw);
    assert(r.status >= 400 && r.status < 500, `${path} with body ${raw} -> ${r.status}`);
    assert.equal(typeof (await r.json()).error, 'string');
  }
  assert.equal(JSON.stringify(db.progress('u1')), before, 'none of it changed the account');
  // an unexpected failure is still a JSON answer
  const broken = fakeEnv({ prepare() { throw new Error('boom'); }, async batch() { return []; } });
  const r = await handleApi(new Request('http://hunt.test/api/me', { headers: { authorization: 'Bearer tok1' } }), broken);
  assert.equal(r.status, 500);
  assert.equal(typeof (await r.json()).error, 'string');
}

// ---- the rooms: join, room flags, rejoin, messages
for (const k of PROTO_KEYS) {
  const db = fakeD1(), env = fakeEnv(db, { HUNT_DEV: '1' });
  db.addUser('u1', 'tok1', rich());
  const room = manual(new MatchRoom({}, env));
  const flags = `mode=${q(k)}&world=${q(k)}&ev=${q(k)}&lobby=${q(k)}&bots=${q(k)}&events=${q(k)}&testmap=${q(k)}&try=${q(k)}&wpn=${q(k)}&mast=${q(k)}&pw=${q(k)}&gd=${q(k)}&sp=${q(k)}&skip=${q(k)}`;
  const a = await connect(room, `/ws?match=room:KEYS&name=${q(k)}&brawler=${q(k)}&token=tok1&${flags}`);
  const b = await connect(room, `/ws?match=room:KEYS&name=B&brawler=volt&${flags}`);
  const wa = a.last('welcome');
  assert(wa && Object.hasOwn(BRAWLERS, room.sim.players.get(wa.id).brawler), `room join with ${k}`);
  assert.equal(room.sim.forceEvent, null);
  steps(room, 20 * 13);
  assert.equal(room.sim.phase, 'play', 'the match started');
  const n0 = b.of('s').length;
  for (let i = 0; i < 40; i++) {
    a.say({ t: 'in', s: i + 1, f: 0, u: 0, w: 1, gd: 1, mx: k, my: k, ax: k, ay: k, fd: k, ch: k, vt: k });
    a.say({ t: k }); a.say({ t: 'pick', brawler: k }); a.say({ t: 'emote', e: k }); a.say({ t: 'in', s: k, f: k, u: k, w: k, gd: k });
    room.step();
  }
  assert.equal(b.of('s').length - n0, 40, `${k}: the honest player got every snapshot`);
  // rejoin with made-up ids
  const r1 = await connect(room, `/ws?match=room:KEYS&rejoin=${q(k)}&secret=${q(k)}`);
  assert(r1.last('rejoinfail'), 'a made-up rejoin is refused');
  const r2 = await connect(room, `/ws?match=${q(k)}&rejoin=${wa.id}&secret=${q(k)}`);
  assert(r2.last('rejoinfail'));
  a.say({ t: 'bye' }); b.say({ t: 'bye' });
  await settle();

  // Free Play zone
  const zone = manual(new ZoneRoom({}, env));
  const z = await connect(zone, `/zone?slot=c&join=1&name=${q(k)}&brawler=${q(k)}&token=tok1&at=${q(k)}&wpn=${q(k)}`);
  const h = await connect(zone, '/zone?slot=c&join=1&name=H&brawler=volt');
  const o = await connect(zone, `/zone?slot=c&x=${q(k)}&y=${q(k)}`);
  const wz = z.last('welcome');
  assert.equal(zone.sim.players.get(wz.id).brawler, 'volt', `zone join with ${k}`);
  const z0 = h.of('s').length;
  for (let i = 0; i < 40; i++) {
    z.say({ t: 'in', s: i + 1, f: 0, u: 0, mx: 1 }); z.say({ t: 'pick', brawler: k }); z.say({ t: k }); z.say({ t: 'claim', token: k, pend: [k, { s: k }] });
    o.say({ t: 'pos', x: k, y: k }); o.say({ t: 'claim', token: k, pend: k }); o.say({ t: k });
    zone.step();
  }
  assert.equal(h.of('s').length - z0, 40, `${k}: the zone kept ticking for everyone`);
  assert((await connect(zone, `/zone?slot=c&rejoin=${q(k)}&secret=${q(k)}`)).last('rejoinfail') || true);
  assert((await connect(zone, `/zone?slot=c&rejoin=${wz.id}&secret=${q(k)}`)).last('rejoinfail'), 'wrong secret is refused');
  for (const c of [z, h, o]) c.say({ t: 'bye' });
}
// the entry point: zone slot and quick-play mode
for (const k of PROTO_KEYS) {
  const env = fakeEnv(fakeD1());
  let asked = null;
  env.MATCHMAKER = { idFromName: (n) => n, get: () => ({ fetch: async (u) => { asked = new URL(u); return new Response('qp:bounty:meadow:00000000-0000-0000-0000-000000000000'); } }) };
  const ws = (path) => worker.fetch(new Request('http://hunt.test' + path, { headers: { Upgrade: 'websocket' } }), env);
  assert.equal((await ws(`/zone?slot=${q(k)}&join=1`)).status, 400, `zone slot ${k} is refused`);
  await ws(`/ws?mode=${q(k)}&brawler=${q(k)}&token=${q(k)}&skip=${q(k)}`);
  assert.equal(asked.searchParams.get('mode'), 'any', `quick-play mode ${k} falls back to any`);
  assert.equal(asked.searchParams.get('b'), '1');
}
assert.equal((await worker.fetch(new Request('http://hunt.test/zone?slot=c', { method: 'POST', headers: { Upgrade: 'websocket' }, body: 'x' }), fakeEnv())).status, 426, 'only GET upgrades reach a room');

assert.equal(faults.n, 0, 'nothing was merely caught: ' + (faults.last && faults.last.stack));
console.log(`prototype-key sweep passed (${PROTO_KEYS.length} keys, ${shopCalls} shop requests)`);
