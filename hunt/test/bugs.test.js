// Regression tests for the bug sweep (see BUG_LIST.md). One block per Critical/Major fix.
import { Sim } from '../src/sim.js';
import { generateArena } from '../public/shared.js';
import assert from 'node:assert';

const arena = (o = {}) => new Sim({ map: generateArena(11), mode: 'showdown', seed: 11, lobbyTime: 0.2, ...o });
const run = (sim, ticks) => { for (let i = 0; i < ticks; i++) sim.tick(); };

// M-bots: "Fill empty slots with bots" OFF must never add bots, even with one human
{
  const sim = arena({ fillBots: false });
  sim.join('Solo', 'volt');
  run(sim, 60);
  assert.equal(sim.phase, 'lobby', 'bots off + 1 human: keep waiting instead of starting with bots');
  assert.equal([...sim.players.values()].filter((p) => p.bot).length, 0, 'no bots were added');
  sim.join('Friend', 'brick');
  run(sim, 200);
  assert.equal(sim.phase, 'play', 'starts once a second human joins');
  assert.equal(sim.players.size, 2, 'exactly the two humans, no bots');
  assert.equal([...sim.players.values()].filter((p) => p.wasBot).length, 0);
}
{
  const sim = arena({ fillBots: true });
  sim.join('Solo', 'volt');
  run(sim, 20);
  assert.equal(sim.phase, 'play');
  assert.equal(sim.players.size, sim.maxPlayers, 'bots on: fills every slot');
}



// M-aim: tap-to-auto-aim picks the nearest enemy you can actually hit
{
  const { pickAimTarget } = await import('../public/aim.js');
  const { WALL, TILE } = await import('../public/shared.js');
  const map = generateArena(5); map.open = true;
  for (let i = 0; i < map.t.length; i++) map.t[i] = 0;
  // a wall column between me (x=400) and the close bot (x=700)
  for (let y = 5; y < 15; y++) map.t[y * map.gw + 11] = WALL;
  const me = { x: 400, y: 500 };
  const walled = { id: 1, x: 700, y: 500, fl: 0, team: 0 };
  const open = { id: 2, x: 400, y: 950, fl: 0, team: 0 };
  const mate = { id: 3, x: 450, y: 520, fl: 0, team: 1 };
  const prot = { id: 4, x: 420, y: 560, fl: 16, team: 0 };
  assert.equal(pickAimTarget(map, me, [walled, open, mate, prot], { reach: 700, team: 1 }).id, 2, 'skips wall, teammate, spawn-protected');
  assert.equal(pickAimTarget(map, me, [walled], { reach: 700 }), null, 'nobody hittable: keep facing');
  assert.equal(pickAimTarget(map, me, [walled], { reach: 700, super: true }).id, 1, 'area supers may target behind walls');
  assert.equal(TILE, 50);
}
// C-angle: a tampered aim angle (1e20) must not hang the server or leak out in snapshots
{
  const msgs = [];
  const sim = new Sim({ map: generateArena(9), mode: 'bounty', phase: 'play', fillBots: false, send: (id, m) => msgs.push(m) });
  const a = sim.addPlayer({ name: 'Cheat', brawler: 'flicker' }), b = sim.addPlayer({ name: 'B', brawler: 'volt', bot: true });
  b.x = a.x + 60; b.y = a.y;
  for (const f of [1e20, -1e300, 1e15 + 0.5]) {
    a.atkCd = 0; a.ammo = 3;
    sim.input(a.id, { t: 'in', s: ++a.lastSeq + 1, mx: 0, my: 0, ax: 0, ay: 0, f, u: f });
    const t0 = Date.now();
    sim.tick();
    assert(Date.now() - t0 < 500, 'tick finished');
    assert(Math.abs(a.facing) <= Math.PI + 1e-9, 'facing normalized: ' + a.facing);
  }
}

// M-regen: Free Play zones have separate clocks; a handoff must keep "time since combat", not a timestamp
{
  const { generateWorld, zoneBounds } = await import('../public/shared.js');
  const mk = (slot) => new Sim({ map: generateWorld(), mode: 'freeplay', zone: slot, bounds: zoneBounds(slot), hub: true, phase: 'play', botTarget: 0, fillBots: false });
  const A = mk('nw'), B = mk('ne');
  A.time = 5000; B.time = 10;
  const p = A.addPlayer({ name: 'Walker', brawler: 'brick' });
  p.lastCombat = A.time - 1; // fought one second ago
  const q = B.importPlayer(A.exportPlayer(p), 'Walker', true);
  assert(Math.abs((B.time - q.lastCombat) - 1) < 1e-9, 'still "one second since combat" in the new zone');
  const back = A.importPlayer(B.exportPlayer(q), 'Walker', true);
  assert(Math.abs((A.time - back.lastCombat) - 1) < 1e-9, 'and back again');
}

// M-observer: a Free Play observer can't move its (client-sent) view next to a bush to see who hides there
{
  const { generateWorld, zoneBounds, BUSH, TILE: TL } = await import('../public/shared.js');
  const msgs = [];
  const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'nw', bounds: zoneBounds('nw'), hub: true, phase: 'play', botTarget: 0, send: (k, m) => msgs.push([k, m]) });
  const hider = sim.addPlayer({ name: 'Hider', brawler: 'wisp' });
  const idx = sim.map.t.findIndex((t, i) => t === BUSH && sim.inBoundsIdx(i));
  assert(idx >= 0, 'a bush in the zone');
  hider.x = (idx % sim.map.gw) * TL + TL / 2; hider.y = Math.floor(idx / sim.map.gw) * TL + TL / 2;
  sim.observers.set('o:spy', { x: hider.x + 20, y: hider.y });
  for (let i = 0; i < 4; i++) sim.tick();
  const seen = msgs.filter(([k, m]) => k === 'o:spy' && m.t === 's').some(([, m]) => m.p.some((r) => r[0] === hider.id));
  assert.equal(seen, false, 'bush-hidden player not revealed to an observer parked next to them');
}

// M-leaver: leaving mid-match counts as a loss right away; the bot that takes the slot earns nothing
{
  const rows = [];
  const sim = arena({ fillBots: true, hooks: { finished: (r) => rows.push(...r) } });
  const id = sim.join('Quitter', 'volt');
  sim.join('Stayer', 'brick');
  run(sim, 120);
  assert.equal(sim.phase, 'play');
  sim.leave(id);
  const row = sim.abandon(id);
  assert(row, 'a result row for the leaver');
  assert.equal(row.rank, sim.players.size, 'counted as last place');
  assert.equal(sim.abandon(id), null, 'only once');
  while (sim.phase === 'play') sim.tick();
  assert(!rows.some((r) => r.p.id === id), 'final results do not credit the leaver again');
  assert(rows.some((r) => r.p.name === 'Stayer'));
}

// m-walls: Shifting Walls never touches spiked border walls or the shared zone-edge band (Free Play)
{
  const { generateWorld, zoneBounds, WALL: WL, TILE: TL } = await import('../public/shared.js');
  const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'nw', bounds: zoneBounds('nw'), hub: true, phase: 'play', botTarget: 0 });
  const b = sim.bounds, tx1 = b.x1 / TL - 1, ty1 = b.y1 / TL - 1;
  for (const idx of sim.tilesInBounds(WL, true)) {
    const x = idx % sim.map.gw, y = Math.floor(idx / sim.map.gw);
    assert(!sim.map.border[idx], 'no border wall');
    assert(x !== tx1 && y !== ty1 && x > 0 && y > 0, 'not on the zone edge');
  }
}

console.log('bug-sweep regression tests passed');
