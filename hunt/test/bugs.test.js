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

console.log('bug-sweep regression tests passed');
