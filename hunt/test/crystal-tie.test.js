// Crystal Grab: when two players are tied on 10+ crystals the current holder keeps the countdown
// (it used to jump to whoever joined the match first).
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, DT } from '../public/shared.js';

for (const holderFirst of [true, false]) {
  const sim = new Sim({ map: generateArena(6), mode: 'crystals', phase: 'play', fillBots: false, events: false, seed: 6 });
  const first = sim.addPlayer({ name: 'First', brawler: 'volt' }), second = sim.addPlayer({ name: 'Second', brawler: 'brick' });
  first.x = 600; first.y = 600; second.x = 2200; second.y = 2200;
  const holder = holderFirst ? first : second, other = holderFirst ? second : first;
  const tick = (n) => { for (let i = 0; i < n; i++) { sim.crystals.length = 0; sim.crystalT = 99; sim.tick(); } };
  holder.crystals = 10; tick(1 + 5 / DT);
  assert.equal(sim.holdId, holder.id);
  assert(Math.abs(sim.holdT - 5) < 0.06, 'half way through the countdown');
  other.crystals = 10; tick(20); // a tie
  assert.equal(sim.holdId, holder.id, `a tie keeps the current holder (holder joined ${holderFirst ? 'first' : 'second'})`);
  assert(Math.abs(sim.holdT - 4) < 0.06, 'and the countdown carries on (' + sim.holdT.toFixed(2) + 's left)');
  other.crystals = 11; tick(1); // strictly more does take over
  assert.equal(sim.holdId, other.id); assert.equal(sim.holdT, 10);
  other.crystals = 10; holder.crystals = 10; tick(10 / DT + 2);
  assert.equal(sim.phase, 'end'); assert.equal(sim.crystalWinner, other.id, 'the holder at the end of the countdown wins');
}
console.log('crystal grab tie: OK');
