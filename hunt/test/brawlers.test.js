import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLERS, moveStats } from '../public/shared.js';
import { runBalance } from './balance.js';

const open = () => { const m = generateArena(3, 'meadow'); for (let y = 15; y < 25; y++) for (let x = 5; x < 35; x++) m.t[y * 40 + x] = 0; return m; };
const duel = (a, b) => {
  const sim = new Sim({ map: open(), mode: 'showdown', phase: 'play', events: false, fillBots: false });
  const A = sim.addPlayer({ name: 'A', brawler: a }), B = sim.addPlayer({ name: 'B', brawler: b });
  A.x = 600; A.y = 1000; B.x = 900; B.y = 1000;
  return { sim, A, B };
};
const fire = (sim, p, ang, extra = {}) => sim.input(p.id, { t: 'in', s: ++p.lastSeq + 1, mx: 0, my: 0, ax: 1, ay: 0, f: ang, ...extra });
const ticks = (sim, n) => { for (let i = 0; i < n; i++) sim.tick(); };

// Dune: wave slows
{ const { sim, A, B } = duel('dune', 'volt'); fire(sim, A, 0); ticks(sim, 15);
  assert(B.slowT > 0 && B.hp < B.maxHp, 'dune wave hits + slows');
  assert(moveStats('volt', B.hp, B.maxHp, 0, B.slowT).speed < moveStats('volt', B.hp, B.maxHp, 0, 0).speed); }
// Dune super: worm erupts after its delay under the target
{ const { sim, A, B } = duel('dune', 'brick'); A.superC = 1;
  sim.input(A.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, u: 0 }); ticks(sim, 2);
  const hp0 = B.hp; ticks(sim, 6); assert.equal(B.hp, hp0, 'no damage before eruption'); ticks(sim, 10);
  assert(B.hp < hp0 && B.stun > -1, 'worm erupted under target'); }
// Rook: mine lands, arms after 1s, then triggers
{ const { sim, A, B } = duel('rook', 'volt'); B.x = 2000; fire(sim, A, 0, { fd: 0.5 }); ticks(sim, 12);
  assert.equal(sim.mines.length, 1); const m = sim.mines[0]; assert(m.arm > 0, 'not armed yet');
  B.x = m.x; B.y = m.y; ticks(sim, 1); assert.equal(sim.mines.length, 1, 'unarmed mine does not trigger');
  ticks(sim, 20); assert.equal(sim.mines.length, 0); assert(B.hp < B.maxHp, 'armed mine exploded'); }
// Rook super: cage traps for 2s
{ const { sim, A, B } = duel('rook', 'volt'); A.superC = 1; sim.input(A.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, u: 0 }); ticks(sim, 8);
  assert(B.cageT > 1.5 && B.stun > 1.5, 'caged'); const x0 = B.x;
  sim.input(B.id, { t: 'in', s: 1, mx: 1, my: 0, ax: 1, ay: 0 }); ticks(sim, 5); assert.equal(B.x, x0, 'cannot move while caged'); }
// Flicker: double slash in melee, nothing at range; blink lands behind target
{ const { sim, A, B } = duel('flicker', 'brick'); B.x = 700; fire(sim, A, 0); ticks(sim, 5);
  assert.equal(B.hp, B.maxHp - 2 * BRAWLERS.flicker.attack.damage, 'two slashes');
  const far = duel('flicker', 'brick'); fire(far.sim, far.A, 0); ticks(far.sim, 5); assert.equal(far.B.hp, far.B.maxHp, 'out of reach');
  const bl = duel('flicker', 'volt'); bl.A.superC = 1; bl.sim.input(bl.A.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, u: 0 }); ticks(bl.sim, 1);
  assert(bl.A.x > bl.B.x && Math.hypot(bl.A.x - bl.B.x, bl.A.y - bl.B.y) < 90, 'blinked behind the target'); }
assert(BRAWLERS.flicker.speed > Math.max(...Object.entries(BRAWLERS).filter(([k]) => k !== 'flicker').map(([, b]) => b.speed)), 'flicker fastest');
assert.equal(BRAWLERS.flicker.hp, 3000);

// Balance: large sample must sit inside 45-55% for every brawler
const r = runBalance(1800, 4242);
for (const [b, v] of Object.entries(r.rates)) assert(v >= 0.45 && v <= 0.55, `${b} win rate ${(v * 100).toFixed(1)}%`);
console.log('balance (1800 duels):', Object.entries(r.rates).map(([b, v]) => `${b} ${(v * 100).toFixed(1)}%`).join(', '));
console.log('BRAWLERS OK');
