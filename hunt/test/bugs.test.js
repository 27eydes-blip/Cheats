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

console.log('bug-sweep regression tests passed');
