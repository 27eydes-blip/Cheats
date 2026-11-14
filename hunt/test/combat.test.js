// Combat upgrade: weapons, swap, lag compensation, aim assist, rate cap, hit markers, bullet events.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, BUSH, TILE } from '../public/shared.js';
import { WEAPONS, WEAPON_IDS, stepShot, SWAP_TIME, MAX_SHOTS_PER_SEC, STARTER_WEAPONS } from '../public/weapons.js';

const openMap = () => { const m = generateArena(3, 'meadow', 2); for (let i = 0; i < m.t.length; i++) if (!m.border[i]) m.t[i] = 0; return m; };
const mk = (o = {}) => new Sim({ map: openMap(), mode: 'bounty', phase: 'play', fillBots: false, events: false, ...o });
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.tick(); };
const duo = (wid, dist = 300, o = {}) => {
  const sim = mk(o);
  const a = sim.addPlayer({ name: 'A', brawler: 'brick' }), b = sim.addPlayer({ name: 'B', brawler: 'brick' });
  a.x = 600; a.y = 1000; b.x = 600 + dist; b.y = 1000; b.hp = b.maxHp = 20000;
  if (wid) { sim.setWeapon(a, wid); a.slot = 1; }
  return { sim, a, b };
};
const fire = (sim, p, ang = 0, extra = {}) => sim.input(p.id, { t: 'in', s: ++p.lastSeq + 1, mx: 0, my: 0, ax: 1, ay: 0, f: ang, ...extra });

assert.equal(WEAPON_IDS.length, 15, '15 weapons');
assert.deepEqual(STARTER_WEAPONS.sort(), ['breaker', 'hornet', 'stormline'], '3 starters');
for (const id of WEAPON_IDS) { const w = WEAPONS[id]; for (const k of ['damage', 'cooldown', 'ammo', 'reload', 'range']) assert(w[k] > 0, `${id}.${k}`); }

// every weapon fires and damages a target in range
for (const id of WEAPON_IDS) {
  const w = WEAPONS[id];
  const { sim, a, b } = duo(id, Math.min(w.range * 0.5, id === 'thumper' ? 250 : 400));
  const hp0 = b.hp; let low = hp0; // (regen heals between volleys: track the lowest HP)
  for (let i = 0; i < 6; i++) { fire(sim, a, 0, { ch: 2, fd: Math.min(1, Math.min(w.range * 0.5, id === 'thumper' ? 250 : 400) / w.range) }); for (let k = 0; k < 12; k++) { sim.tick(); low = Math.min(low, b.hp); } }
  for (let k = 0; k < 40; k++) { sim.tick(); low = Math.min(low, b.hp); }
  assert(low < hp0, `${id} damages (${hp0 - low})`);
  assert(a.wstat[id] && a.wstat[id].d > 0, `${id} damage counted for mastery`);
}
console.log('every weapon fires + hits: OK');

// SWAP takes 0.4s: no shots during it
{
  const { sim, a, b } = duo('stormline', 300);
  a.slot = 0; sim.input(a.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, w: 1 }); run(sim, 1);
  assert.equal(a.slot, 1); assert(a.swapT > 0 && a.swapT <= SWAP_TIME);
  const before = sim.nextEnt; fire(sim, a); run(sim, 1);
  assert.equal(sim.nextEnt, before, 'no shot while swapping');
  run(sim, 8); fire(sim, a); run(sim, 1);
  assert(sim.nextEnt > before, 'fires after the swap');
  void b;
}
// RATE CAP: never more than MAX_SHOTS_PER_SEC trigger pulls a second, even with cooldowns zeroed
{
  const { sim, a } = duo('hornet', 300);
  let pulls = 0;
  for (let i = 0; i < 20; i++) { a.w2.cd = 0; a.w2.ammo = 99; const n0 = sim.nextEnt; sim.tryWeapon(a, 0, { ch: 0 }, i); if (sim.nextEnt > n0) pulls++; }
  assert.equal(pulls, MAX_SHOTS_PER_SEC, 'rate cap holds');
}
// LAG COMPENSATION: the shooter saw the target 3 ticks ago (150ms); the target has since stepped out
// of the line of fire. The server checks where it WAS on the shooter's screen, so the hit counts.
{
  const shot = (rewind) => {
    const { sim, a, b } = duo('needle', 220);
    run(sim, 5); // history: B standing in the line of fire
    b.y = 1090; // B dodges right now (the shooter hasn't seen that yet)
    const hp = b.hp;
    fire(sim, a, 0, rewind ? { vt: sim.tickN - 3 } : {});
    for (let k = 0; k < 6; k++) { sim.tick(); b.y = 1090; }
    return hp - b.hp;
  };
  assert(shot(true) > 0, 'rewound hit counts (it looked like a hit on the shooter screen)');
  assert.equal(shot(false), 0, 'without rewind the same shot misses');
}
// AIM ASSIST: a human shot 4 degrees off still lands; 12 degrees off doesn't; never for snipers
{
  const shoot = (wid, deg) => { const { sim, a, b } = duo(wid, 450); const hp = b.hp; fire(sim, a, deg * Math.PI / 180); run(sim, 20); return b.hp < hp; };
  assert(shoot('stormline', 4), 'assist nudges a near-miss');
  assert(!shoot('stormline', 12), 'no lock-on');
  assert(!shoot('needle', 4.5), 'snipers get no assist');
}
// LONGSHOT charge: more damage the longer you hold; full charge is a critical hit
{
  const dmg = (ch) => { const { sim, a, b } = duo('longshot', 500); a.w2.lastFire = -99; const hp = b.hp; fire(sim, a, 0, { ch }); run(sim, 10); return hp - b.hp; };
  assert(dmg(1.2) > dmg(0.2) * 2, 'charged shot hits much harder');
}
// NEEDLE pierces one enemy (hits two, not three)
{
  const { sim, a, b } = duo('needle', 300);
  const c = sim.addPlayer({ name: 'C', brawler: 'brick' }), d = sim.addPlayer({ name: 'D', brawler: 'brick' });
  for (const [p, x] of [[c, 1000], [d, 1200]]) { p.x = x; p.y = 1000; p.hp = p.maxHp = 20000; }
  fire(sim, a); run(sim, 20);
  assert(b.hp < 20000 && c.hp < 20000 && d.hp === 20000, 'pierces exactly one');
}
// ARC GUN chains to 3 enemies in total
{
  const { sim, a, b } = duo('arcgun', 300);
  const c = sim.addPlayer({ name: 'C', brawler: 'brick' }), d = sim.addPlayer({ name: 'D', brawler: 'brick' }), e = sim.addPlayer({ name: 'E', brawler: 'brick' });
  for (const [p, x, y] of [[c, 1000, 1100], [d, 1100, 1180], [e, 1600, 1600]]) { p.x = x; p.y = y; p.hp = p.maxHp = 20000; } // a hop each, the last one far away
  fire(sim, a); run(sim, 10);
  assert([b, c, d].every((p) => p.hp < 20000) && e.hp === 20000, 'chains to 3 nearby, not the far one');
}
// FROST slows, VIPER poisons over time, FLARE reveals a bush hider
{
  const f = duo('frost', 300); fire(f.sim, f.a); run(f.sim, 10); assert(f.b.slowT > 0, 'frost slows');
  const v = duo('viper', 300); fire(v.sim, v.a); run(v.sim, 8); const hp = v.b.hp; assert(v.b.poison, 'poisoned'); run(v.sim, 20); assert(v.b.hp < hp, 'poison ticks');
  const fl = duo('flare', 400);
  for (let y = 18; y < 23; y++) for (let x = 18; x < 23; x++) fl.sim.map.t[y * fl.sim.map.gw + x] = BUSH;
  fl.b.x = 1025; fl.b.y = 1025; fl.b.reveal = 0;
  const watcher = fl.sim.addPlayer({ name: 'W', brawler: 'volt' }); watcher.x = 1025; watcher.y = 1500;
  assert(!fl.sim.canSee(watcher, fl.b), 'hidden in the bush');
  fire(fl.sim, fl.a, Math.atan2(1025 - fl.a.y, 1025 - fl.a.x)); run(fl.sim, 20);
  assert(fl.sim.canSee(watcher, fl.b), 'the flare reveals them');
}
// THUMPER: the grenade explodes after its fuse, not on contact; ROCKETEER splashes
{
  const t = duo('thumper', 200); const hp = t.b.hp; fire(t.sim, t.a, 0, { fd: 200 / 650 }); run(t.sim, 20); assert.equal(t.b.hp, hp, 'not yet'); run(t.sim, 15); assert(t.b.hp < hp, 'boom after the fuse');
  const r = duo('rocketeer', 400); const c = r.sim.addPlayer({ name: 'C', brawler: 'brick' }); c.x = 1000; c.y = 1080; c.hp = c.maxHp = 20000;
  fire(r.sim, r.a); run(r.sim, 30); assert(r.b.hp < 20000 && c.hp < 20000, 'splash hits the neighbour too');
}
// HIT MARKERS, ASSISTS and bounty STEALS
{
  const sends = [];
  const { sim, a, b } = duo('stormline', 300, { send: (id, m) => { if (m.t === 's' && m.hm) sends.push([id, m.hm]); } });
  a.connected = true;
  const c = sim.addPlayer({ name: 'C', brawler: 'volt' }); c.x = 600; c.y = 1100;
  b.hp = 900; b.bounty = 3;
  sim.damage(c, b, 100, true);
  fire(sim, a); run(sim, 15);
  assert(!b.alive, 'killed');
  assert(sends.some(([id, hm]) => id === a.id && hm & 1) && sends.some(([id, hm]) => id === a.id && hm & 2), 'hit + kill markers');
  assert.equal(c.assists, 1, 'assist for the earlier damage'); assert.equal(a.steals, 1, 'bounty steal counted');
}
// BULLET EVENTS: a client simulating the "fired" row with stepShot lands where the server's bullet is
{
  const rows = [];
  const sim = mk({ send: (id, m) => { if (m.t === 's') for (const r of m.bn || []) rows.push(r); } });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' }); a.x = 400; a.y = 1000; a.connected = true;
  sim.mods = { bulletWind: 220, wx: 0, wy: 95 }; // wind bends shots: the client must match that too
  sim.setWeapon(a, 'thumper'); a.slot = 1;
  fire(sim, a, 0.3); sim.tick();
  const sb = sim.bullets[0], r = rows[0];
  const cb = { x: r[1], y: r[2], vx: r[3], vy: r[4], dist: 0, range: r[5], ...(r[9] ? { bounce: 1, fuse: r[9] } : {}) };
  for (let k = 0; k < 20 && sim.bullets.includes(sb); k++) {
    stepShot(sim.map, cb, sim.mods);
    assert(Math.hypot(cb.x - sb.x, cb.y - sb.y) < 1.5, `client sim matches the server (tick ${k}: ${cb.x | 0},${cb.y | 0} vs ${sb.x | 0},${sb.y | 0})`);
    sim.tick();
  }
}
console.log('COMBAT OK');
void TILE;
