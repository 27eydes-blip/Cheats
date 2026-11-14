// Headless simulation tests (Node, no Workers runtime needed).
import { Sim } from '../src/sim.js';
import { QUICK_MODES } from '../src/modes.js';
import { generateArena, generateWorld, zoneBounds, WORLDS, HUB, DT } from '../public/shared.js';
import { EVENTS } from '../public/events/index.js';
import assert from 'node:assert';

const seenEvents = new Set();
function runArena(mode, world, seed) {
  const msgs = [];
  const sim = new Sim({ map: generateArena(seed, world), mode, seed, lobbyTime: 0.2, send: (id, m) => msgs.push(m) });
  const id = sim.join('Alice', 'volt');
  while (sim.phase === 'lobby') sim.tick();
  assert.equal(sim.players.size, 10);
  sim.leave(id); // bot takes over
  let t = 0;
  while (sim.phase === 'play' && t < 20 * 400) {
    sim.tick(); t++;
    if (sim.event) seenEvents.add(sim.event.id);
  }
  assert.equal(sim.phase, 'end', `${mode}/${world} did not end`);
  const kills = msgs.filter((m) => m.t === 'kill').length;
  const top = [...sim.players.values()].sort((a, b) => b.bountyEarned - a.bountyEarned)[0];
  return `${mode.padEnd(9)} ${world.padEnd(7)} ${(t / 20).toFixed(0).padStart(4)}s  kills ${String(kills).padStart(3)}  top bounty earned ${top.name}:${top.bountyEarned}`;
}

let seed = 1;
for (const mode of QUICK_MODES) for (const w of WORLDS) console.log(runArena(mode, w.key, seed++ * 7919));
console.log('events seen:', [...seenEvents].join(', '));
assert(seenEvents.size >= 6, 'expected most events to fire');

// Bounty steal + shrink & speed unit checks
{
  const sim = new Sim({ map: generateArena(3), mode: 'bounty', phase: 'play', fillBots: false });
  const a = sim.addPlayer({ name: 'A', brawler: 'wisp' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' });
  b.bounty = 4;
  b.hp = 100; sim.damage(a, b, 500, true);
  assert.equal(a.bounty, 5, 'killer steals whole bounty + 1');
  assert.equal(b.bounty, 0);
  const full = sim.stats(a); a.hp = a.maxHp * 0.2; const low = sim.stats(a);
  assert(low.r < full.r && low.speed > full.speed, 'low HP = smaller and faster');
  assert(sim.dmgMult(a) > 1.14, 'comeback damage buff');
  console.log('bounty steal / shrink & speed: OK');
}

// Free play zone: handoff when a human walks across the border
{
  const map = generateWorld();
  const handoffs = [];
  const sim = new Sim({ map, mode: 'freeplay', zone: 'nw', bounds: zoneBounds('nw'), hub: true, phase: 'play', botTarget: 4, hooks: { handoff: (p, s) => handoffs.push(s) } });
  const p = sim.addPlayer({ name: 'Walker', brawler: 'volt' });
  sim.respawn(p);
  assert(sim.isSafe(p.x, p.y), 'respawn in hub');
  for (let i = 0; i < 400 && !handoffs.length; i++) { sim.input(p.id, { t: 'in', s: i + 1, mx: 1, my: -0.15, ax: 0, ay: 0 }); sim.tick(); }
  assert.equal(handoffs.length, 1, 'player handed off');
  assert(handoffs[0].x >= 2000, 'crossed east into ne');
  assert(!sim.players.has(p.id));
  for (let i = 0; i < 20 * 120; i++) sim.tick();
  const bots = [...sim.players.values()].filter((q) => q.bot);
  assert(bots.length >= 3 && bots.every((q) => sim.inBounds(q.x, q.y)), 'bots stay in their zone');
  console.log('free play handoff + zone bots: OK');
}
// Cross-zone combat: a bullet fired in NW flies into NE, kills there; bounty is credited back to NW.
{
  const map = generateWorld();
  const zones = {};
  const mk = (slot) => new Sim({ map, mode: 'freeplay', zone: slot, bounds: zoneBounds(slot), hub: true, phase: 'play', botTarget: 0, events: false,
    hooks: { bulletsOut: (l) => { for (const b of l) zones[b.x < 2000 ? 'nw' : 'ne']?.addBullets([b]); }, credit: (slot, c) => zones[slot].credit(c), handoff: () => {} } });
  zones.nw = mk('nw'); zones.ne = mk('ne');
  for (const s of Object.values(zones)) s.map = { ...map, t: map.t.slice() };
  // clear a firing lane along y=1000
  for (const s of Object.values(zones)) for (let x = 30; x < 50; x++) for (const y of [19, 20, 21]) s.map.t[y * 80 + x] = 0;
  const a = zones.nw.addPlayer({ name: 'Sniper', brawler: 'wisp' }); a.x = 1700; a.y = 1025;
  const b = zones.ne.addPlayer({ name: 'Target', brawler: 'wisp' }); b.x = 2400; b.y = 1025; b.bounty = 3; b.hp = 1000;
  zones.nw.input(a.id, { t: 'in', s: 1, mx: 0, my: 0, ax: 1, ay: 0, f: 0 });
  for (let i = 0; i < 30; i++) { zones.nw.tick(); zones.ne.tick(); }
  assert(!b.alive, 'target in the other zone was hit and killed');
  assert.equal(a.bounty, 4, 'bounty credited back across zones');
  assert.equal(a.kills, 1);
  console.log('cross-zone bullet + bounty credit: OK');
}
console.log('ALL OK');
