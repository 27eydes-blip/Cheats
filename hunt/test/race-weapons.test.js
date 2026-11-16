// Oblivion GP weapons: the two slots, the 12 pickups and their levels, counters (missile lock-on +
// drift dodge, arming traps, swatting drones, shaking off sticky bombs, EMP vs ghosts and boosts),
// combos, big hits, hit protection, the wire format and the bots. All server-side (src/race/sim.js).
import assert from 'node:assert';
import { ITEMS, ITEM_IDS, itemStat, rollItem, MAX_LEVEL, COMBAT, HELD_BOOST } from '../public/race/items.js';
import { ENT, FLAG } from '../public/race/protocol.js';
import { RaceSim } from '../src/race/sim.js';
import { rng } from '../public/shared.js';
import { mkRace, ticks, startRace, toGo, place, drive, driver, collectEvents } from './race-helpers.js';
import { duel } from './race-itembalance.js';

const kinds = (ev, k) => ev.filter((e) => e[1] === k);
function setup(drivers = ['volt', 'volt']) {
  const sim = mkRace();
  const P = startRace(sim, drivers);
  toGo(sim);
  const ev = collectEvents(sim);
  return { sim, P, ev };
}
const give = (p, item, lv = 1) => { p.item = item; p.il = lv; };

// ---------------------------------------------------------------- the catalogue
{
  assert.deepStrictEqual(ITEM_IDS.slice(0, 7), ['missile', 'oil', 'shield', 'rockets', 'emp', 'turbo', 'spikes'], 'wire ids are append only');
  assert.deepStrictEqual(ITEM_IDS.slice(7), ['lightning', 'gravity', 'ghost', 'sticky', 'drone']);
  assert.strictEqual(ITEM_IDS.length, 12, 'twelve pickups');
  assert.deepStrictEqual(ENT.slice(0, 7), ['missile', 'rocket', 'oil', 'spikes', 'mine', 'turret', 'bolt'], 'entity ids are append only');
  // every item has three levels, each one stronger in a number that matters, and says what it adds
  const stronger = { missile: 'dmg', oil: 'r', shield: 't', rockets: 'n', emp: 'r', turbo: 't', spikes: 'half', lightning: 'jumps', gravity: 'pull', ghost: 't', sticky: 'dmg', drone: 'dmg' };
  for (const id of ITEM_IDS) {
    const k = stronger[id], [a, b, c] = [1, 2, 3].map((l) => itemStat(id, l));
    assert.ok(a[k] < b[k] && b[k] < c[k], `${id}: level 2 and 3 are stronger (${k})`);
    assert.ok(ITEMS[id].lv[1].up && ITEMS[id].lv[2].up, `${id}: the levels say what they add`);
    assert.ok(ITEMS[id].name && ITEMS[id].desc, `${id}: a name and a description`);
  }
  assert.strictEqual(itemStat('missile', 9), itemStat('missile', 3), 'levels cap at 3');
  // holding an item makes the same item likelier at the next box (the level-up)
  const R = rng(3), n = (held) => { let c = 0; for (let i = 0; i < 4000; i++) if (rollItem(5, 10, R(), false, held) === 'oil') c++; return c; };
  assert.ok(n('oil') > n(null) * (HELD_BOOST * 0.6), 'held item boosted');
}

// ---------------------------------------------------------------- level-ups at the boxes
{
  const { sim, P: [A], ev } = setup();
  sim.itemFor = () => 'missile';
  const box = (k) => { const b = sim.T.boxes[k]; A.car.x = b.x; A.car.y = b.y; A.car.vx = A.car.vy = 0; sim.tick(); place(sim, A, 300); sim.tick(); };
  box(0); assert.deepStrictEqual([A.item, A.il], ['missile', 1], 'an empty slot gets the item');
  box(1); assert.deepStrictEqual([A.item, A.il], ['missile', 2], 'the same item again: level 2');
  box(2); assert.strictEqual(A.il, 3, 'level 3');
  box(3); assert.strictEqual(A.il, MAX_LEVEL, 'capped at 3');
  sim.itemFor = () => 'oil';
  box(4); assert.deepStrictEqual([A.item, A.il], ['missile', 3], 'a different item: you keep yours');
  const bx = kinds(ev, 'box');
  assert.deepStrictEqual(bx.map((e) => [e[4], e[5], e[6]]), [[0, 1, 0], [0, 2, 1], [0, 3, 1], [-1, 0, 0], [-1, 0, 0]], 'box events: item, level, levelled up');
  const sent = [];
  sim.send = (id, m) => { if (id === A.id && m.t === 's') sent.push(m); };
  sim.tick();
  assert.strictEqual(sent.at(-1).me.il, 3, 'the HUD gets the level');
  drive(sim, A, { i: 1 }, 1);
  assert.ok(kinds(ev, 'use').some((e) => e[2] === A.id && e[4] === 3), 'use event carries the level');
  assert.strictEqual(A.il, 0);
  assert.strictEqual(sim.ents.filter((e) => e.kind === 'missile').length, 2, 'level 3 missile: twin missiles');
}

// ---------------------------------------------------------------- missile: lock-on warning, drift dodge
{
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 300); place(sim, B, 1250, 60); ticks(sim);
  give(A, 'missile');
  const sent = [];
  sim.send = (id, m) => { if (id === B.id && m.t === 's') sent.push(m); };
  drive(sim, A, { i: 1 }, 1);
  const lock = kinds(ev, 'lock')[0];
  assert.ok(lock && lock[2] === B.id && lock[3] === A.id && lock[5] === 'missile', 'the target is warned: lock event');
  const row = sent.at(-1).e.find((r) => ENT[r[1]] === 'missile');
  assert.strictEqual(row.length, 9, 'entity rows: id kind x y a owner armed level target');
  assert.strictEqual(row[8], B.id, 'the row names who it is locked on to');
  // B presses DRIFT once the missile is inside its dodge range: the lock breaks
  const dB = driver(sim, B), m = sim.ents.find((e) => e.kind === 'missile');
  let pressed = false;
  for (let i = 0; i < 60; i++) { const d = Math.hypot(m.x - B.car.x, m.y - B.car.y); const dr = !pressed && d < 300 ? 1 : 0; if (dr) pressed = true; dB({ dr }); sim.tick(); }
  assert.ok(pressed);
  assert.strictEqual(B.hp, B.maxHp, 'dodged: no damage');
  assert.ok(kinds(ev, 'dodge').some((e) => e[2] === B.id), 'dodge event');
  assert.strictEqual(B.dodges, 1);
}
{ // a drift pressed too early (or held all along) does not shake it
  const { sim, P: [A, B] } = setup();
  place(sim, A, 300); place(sim, B, 1250, 60); ticks(sim);
  const dB = driver(sim, B);
  for (let i = 0; i < 20; i++) { dB({ dr: 1 }); sim.tick(); } // pressed and held long before
  give(A, 'missile');
  const dA = driver(sim, A);
  for (let i = 0; i < 60; i++) { dB({ dr: 1 }); dA({ i: i === 0 ? 1 : 0 }); sim.tick(); }
  assert.strictEqual(B.hp, B.maxHp - ITEMS.missile.dmg, 'too early: hit');
}
{ // a shield eats it; level 2+ missiles are BIG hits: spin-out
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 300); place(sim, B, 1250, 60); ticks(sim);
  give(A, 'missile', 2);
  drive(sim, A, { i: 1 }, 1); drive(sim, A, {}, 45);
  assert.strictEqual(B.hp, B.maxHp - itemStat('missile', 2).dmg);
  const hit = kinds(ev, 'hit').find((e) => e[2] === B.id);
  assert.strictEqual(hit[6], 1, 'big hit flag');
  assert.ok(B.car.spinT > 0 || ev.some((e) => e[1] === 'hit'), 'spun out');
}

// ---------------------------------------------------------------- hit protection (2 s)
{
  const { sim, P: [A, B] } = setup();
  place(sim, B, 900); ticks(sim);
  assert.strictEqual(sim.damage(B, A, 10, 'test'), true);
  assert.ok(B.protT > 1.9 && sim.flags(B) & FLAG.PROT, 'protected (flag for the client)');
  assert.strictEqual(sim.damage(B, A, 10, 'test'), false, 'no rival hit lands while protected');
  assert.strictEqual(sim.damage(B, null, 5, 'lava', true), true, 'the track still hurts');
  ticks(sim, Math.round(COMBAT.protect * 30) - 2);
  assert.strictEqual(sim.damage(B, A, 10, 'test'), false, 'still protected just before 2 s');
  ticks(sim, 3);
  assert.strictEqual(sim.damage(B, A, 10, 'test'), true, 'hittable again after 2 s');
  assert.strictEqual(B.hp, B.maxHp - 25);
}

// ---------------------------------------------------------------- shield levels
{
  const { sim, P: [A, B] } = setup();
  give(A, 'shield', 3); drive(sim, A, { i: 1 }, 1);
  assert.strictEqual(sim.damage(A, B, 20, 'test'), false);
  assert.strictEqual(sim.damage(A, B, 20, 'test'), false, 'level 3 blocks two hits');
  assert.strictEqual(sim.damage(A, B, 20, 'test'), true, 'then it is gone');
  give(B, 'shield', 1); drive(sim, B, { i: 1 }, 1);
  assert.strictEqual(sim.damage(B, A, 20, 'test'), false);
  assert.strictEqual(B.shieldT, 0, 'level 1 blocks one');
}

// ---------------------------------------------------------------- traps flash before they arm
{
  const { sim, P: [A, B] } = setup();
  place(sim, A, 1200); ticks(sim);
  give(A, 'spikes'); drive(sim, A, { i: 1 }, 1);
  const e = sim.ents.find((q) => q.kind === 'spikes');
  assert.strictEqual(sim.armed(e), false, 'arming');
  B.car.x = e.x; B.car.y = e.y; B.car.vx = B.car.vy = 0; ticks(sim, 2);
  assert.strictEqual(B.hp, B.maxHp, 'harmless while arming');
  ticks(sim, Math.ceil(ITEMS.spikes.arm * 30));
  assert.strictEqual(sim.armed(e) || !sim.ents.includes(e), true);
  assert.strictEqual(B.hp, B.maxHp - ITEMS.spikes.dmg, 'armed: it bites');
}

// ---------------------------------------------------------------- combos
{ // EMP + missile = bonus damage
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 300); place(sim, B, 1250, 60); ticks(sim);
  B.empT = 3;
  give(A, 'missile'); drive(sim, A, { i: 1 }, 1); drive(sim, A, {}, 45);
  assert.strictEqual(B.hp, B.maxHp - ITEMS.missile.dmg * COMBAT.empMissile, 'EMP-ed: extra missile damage');
  assert.ok(kinds(ev, 'combo').some((e) => e[3] === 'emp' && e[4] === B.id));
}
{ // oil + spikes on top of each other = one bigger trap
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 1200); ticks(sim);
  give(A, 'oil'); drive(sim, A, { i: 1 }, 1);
  give(A, 'spikes'); drive(sim, A, { i: 1 }, 1);
  const trap = sim.ents.find((e) => e.kind === 'trap');
  assert.ok(trap && !sim.ents.some((e) => e.kind === 'oil' || e.kind === 'spikes'), 'merged into a trap');
  assert.ok(trap.r > ITEMS.oil.r * 1.5, 'bigger');
  assert.ok(kinds(ev, 'combo').some((e) => e[3] === 'trap'));
  ticks(sim, 15);
  place(sim, B, 900, 0, 500);
  const dB = driver(sim, B);
  for (let i = 0; i < 40; i++) { dB({ th: 1 }); sim.tick(); }
  assert.strictEqual(B.hp, B.maxHp - COMBAT.trapDmg, 'trap damage');
  assert.ok(kinds(ev, 'hit').some((e) => e[2] === B.id && e[4] === 'trap' && e[6] === 1), 'a big hit (spin-out)');
}

// ---------------------------------------------------------------- the new pickups
{ // chain lightning jumps between racers close together
  for (const [lv, want] of [[1, 2], [2, 3]]) {
    const { sim, P, ev } = setup(['volt', 'brick', 'brick', 'brick']);
    const [A, B, C, D] = P;
    place(sim, A, 600); place(sim, B, 950, 30); place(sim, C, 1300, -30); place(sim, D, 1650, 0); ticks(sim);
    give(A, 'lightning', lv); drive(sim, A, { i: 1 }, 1);
    const ch = kinds(ev, 'chain')[0];
    assert.strictEqual(ch.length - 3, want, `level ${lv}: ${want} racers zapped`);
    assert.deepStrictEqual(ch.slice(3, 3 + want), [B.id, C.id, D.id].slice(0, want), 'nearest first, then jump by jump');
    const I = itemStat('lightning', lv);
    assert.strictEqual(B.hp, B.maxHp - I.dmg);
    assert.ok(Math.abs(C.hp - (C.maxHp - I.dmg * I.fall)) < 1e-9, 'each jump a bit weaker');
  }
}
{ // gravity well: lobbed onto the racer ahead, pulls them to its centre
  const { sim, P: [A, B] } = setup(['volt', 'brick']);
  place(sim, A, 600); place(sim, B, 1150, 40); ticks(sim);
  give(A, 'gravity'); drive(sim, A, { i: 1 }, 1);
  ticks(sim, Math.ceil(ITEMS.gravity.throwT * 30) + 1);
  const w = sim.ents.find((e) => e.kind === 'well');
  assert.ok(sim.armed(w), 'landed');
  const d0 = Math.hypot(w.x - B.car.x, w.y - B.car.y);
  assert.ok(d0 < ITEMS.gravity.r, 'B is inside it');
  ticks(sim, 20);
  assert.ok(Math.hypot(w.x - B.car.x, w.y - B.car.y) < d0 - 15, 'pulled toward the centre');
  assert.ok(Math.hypot(A.car.x - 0, 1) && A.hp === A.maxHp);
}
{ // ghost mode: pass through hits and racers, no attacking; EMP knocks you out of it
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 900); place(sim, B, 650); ticks(sim);
  give(A, 'ghost'); drive(sim, A, { i: 1 }, 1);
  assert.ok(A.phaseT > 2.9 && sim.flags(A) & FLAG.PHASE && sim.flags(A) & FLAG.GHOST);
  assert.strictEqual(sim.damage(A, B, 30, 'arc'), false, 'hits pass through');
  B.car.x = A.car.x + 10; B.car.y = A.car.y; ticks(sim);
  assert.ok(!kinds(ev, 'bump').length, 'racers pass through');
  give(A, 'turbo'); drive(sim, A, { i: 1, f: 1 }, 1);
  assert.strictEqual(A.item, 'turbo', 'no items while ghosted');
  assert.strictEqual(A.wcd, 0, 'no weapon while ghosted');
  place(sim, B, 700); give(B, 'emp'); drive(sim, B, { i: 1 }, 1);
  assert.strictEqual(A.phaseT, 0, 'EMP ends Ghost Mode');
  assert.ok(kinds(ev, 'unghost').some((e) => e[2] === A.id));
  assert.ok(A.empT > 0, 'and shuts them down');
}
{ // sticky bomb: sticks, passes on contact, blows up on whoever carries it
  const { sim, P, ev } = setup(['volt', 'brick', 'rook']);
  const [A, B, C] = P;
  sim.unstick = () => {}; // parked cars: no automatic reset during the fuse
  place(sim, A, 500); place(sim, B, 900); place(sim, C, 3000); ticks(sim);
  give(A, 'sticky'); drive(sim, A, { i: 1 }, 1);
  ticks(sim, 20);
  const b = sim.ents.find((e) => e.kind === 'sticky');
  assert.ok(b && b.mode === 'stuck' && b.carrier === B.id, 'stuck to B');
  assert.ok(kinds(ev, 'stick').some((e) => e[2] === B.id));
  ticks(sim, 20); // past the pass cooldown
  C.car.x = B.car.x + 40; C.car.y = B.car.y; C.car.vx = C.car.vy = 0; ticks(sim);
  assert.strictEqual(b.carrier, C.id, 'bumped: passed to C');
  assert.ok(kinds(ev, 'pass').some((e) => e[2] === B.id && e[3] === C.id));
  place(sim, B, 4000); ticks(sim);
  ticks(sim, Math.ceil(ITEMS.sticky.fuse * 30));
  assert.ok(!sim.ents.includes(b), 'blew up');
  assert.strictEqual(C.hp, C.maxHp - ITEMS.sticky.dmg, 'the carrier takes the blast');
  const hit = kinds(ev, 'hit').find((e) => e[2] === C.id);
  assert.strictEqual(hit[3], B.id, 'credited to whoever passed it');
  assert.strictEqual(hit[6], 1, 'big hit');
}
{ // ...and Ghost Mode shakes it off
  const { sim, P: [A, B], ev } = setup();
  sim.unstick = () => {};
  place(sim, A, 500); place(sim, B, 900); ticks(sim);
  give(A, 'sticky'); drive(sim, A, { i: 1 }, 1); ticks(sim, 20);
  assert.strictEqual(sim.ents.find((e) => e.kind === 'sticky')?.carrier, B.id);
  give(B, 'ghost'); drive(sim, B, { i: 1 }, 1); ticks(sim);
  assert.ok(!sim.ents.some((e) => e.kind === 'sticky'), 'gone');
  assert.ok(kinds(ev, 'fizzle').length);
  ticks(sim, 150);
  assert.strictEqual(B.hp, B.maxHp);
}
{ // hunter drone: chases the racer ahead and hits; firing your weapon swats it
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 300); place(sim, B, 1300, 40); ticks(sim);
  give(A, 'drone'); drive(sim, A, { i: 1 }, 1);
  assert.ok(kinds(ev, 'lock').some((e) => e[2] === B.id && e[5] === 'drone'), 'lock-on warning');
  ticks(sim, 90);
  assert.strictEqual(B.hp, B.maxHp - ITEMS.drone.dmg, 'drone hit');
  assert.ok(B.car.slowT > 0 || kinds(ev, 'hit').some((e) => e[4] === 'drone'));
}
{
  const { sim, P: [A, B], ev } = setup();
  place(sim, A, 300); place(sim, B, 1300, 40); ticks(sim);
  give(A, 'drone'); drive(sim, A, { i: 1 }, 1);
  const d = sim.ents.find((e) => e.kind === 'drone'), dB = driver(sim, B);
  for (let i = 0; i < 90 && sim.ents.includes(d); i++) { const near = Math.hypot(d.x - B.car.x, d.y - B.car.y) < 180; dB({ f: near ? 1 : 0 }); sim.tick(); }
  assert.ok(kinds(ev, 'swat').some((e) => e[2] === B.id), 'swatted');
  assert.strictEqual(B.hp, B.maxHp, 'no damage');
}
{ // EMP cuts a boost (the counter to Turbo)
  const { sim, P: [A, B] } = setup();
  place(sim, A, 600); place(sim, B, 900, 40); ticks(sim);
  B.car.boostT = 1.5; B.car.boostP = 1.4;
  give(A, 'emp'); drive(sim, A, { i: 1 }, 1);
  assert.strictEqual(B.car.boostT, 0);
}
{ // turbo levels
  const { sim, P: [A] } = setup();
  give(A, 'turbo', 3); drive(sim, A, { i: 1, th: 1 }, 1);
  assert.ok(A.car.boostT > itemStat('turbo', 2).t && A.car.boostP === itemStat('turbo', 3).p);
}

// ---------------------------------------------------------------- bots use every item and dodge sometimes
{
  const used = new Set(), cnt = { dodge: 0, missile: 0, swat: 0, pass: 0 };
  for (const [k, track] of ['desert', 'frozen', 'ashlands', 'neon'].entries()) {
    const sim = new RaceSim({ mode: k === 3 ? 'battle' : 'grand', track, seed: 21 + k, lobbyTime: 0, fillBots: true, botLevel: 'hard' });
    sim.join('H', 'volt'); sim.players.get(1).bot = true;
    const ev = collectEvents(sim);
    let n = 0;
    while (sim.phase !== 'end' && n++ < 30 * 200) sim.tick();
    for (const e of ev) {
      if (e[1] === 'use') { used.add(ITEM_IDS[e[3]]); if (ITEM_IDS[e[3]] === 'missile') cnt.missile++; }
      if (cnt[e[1]] != null && e[1] !== 'missile') cnt[e[1]]++;
    }
  }
  assert.deepStrictEqual([...used].sort(), [...ITEM_IDS].sort(), 'bots use all 12 items');
  assert.ok(cnt.dodge > 0 && cnt.dodge < cnt.missile, `bots dodge some missiles, not all (${cnt.dodge}/${cnt.missile})`);
  console.log('bots:', cnt);
}

// ---------------------------------------------------------------- deterministic
{
  const a = duel('sticky', 3, 1), b = duel('sticky', 3, 1);
  assert.deepStrictEqual(a, b, 'same seed, same race');
}
console.log('race-weapons: ok');
