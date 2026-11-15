// Match flow: an eliminated hunter's result is reported at elimination (no-respawn modes), exactly once,
// with the same place the final results give them.
import { Sim } from '../src/sim.js';
import { generateArena } from '../public/shared.js';
import assert from 'node:assert';

const mk = (mode, hooks) => new Sim({ map: generateArena(4), mode, phase: 'play', fillBots: false, hooks });

// Showdown: reported on the tick they are eliminated, with their final place
{
  const early = [], fin = [];
  const sim = mk('showdown', { eliminated: (r) => early.push(...r), finished: (r) => fin.push(...r) });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' }), c = sim.addPlayer({ name: 'C', brawler: 'volt' }), d = sim.addPlayer({ name: 'D', brawler: 'volt' });
  sim.tick();
  assert.equal(early.length, 0, 'nobody reported while everyone is alive');
  sim.tickN++; sim.kill(d, a, 'x'); sim.tickN--; // (a kill made during the next tick)
  sim.tick();
  assert.deepEqual(early.map((r) => [r.p.name, r.rank, r.players]), [['D', 4, 4]], 'reported right away as 4th of 4');
  sim.tick(); sim.tick();
  assert.equal(early.length, 1, 'reported once, not every tick');
  // two hunters eliminated on the same tick share a place: both rows carry the settled (tied) rank
  sim.tickN++; sim.kill(c, a, 'x'); sim.kill(b, a, 'x'); sim.tickN--;
  sim.tick();
  assert.deepEqual(early.slice(1).map((r) => [r.p.name, r.rank]).sort(), [['B', 2], ['C', 2]], 'same-tick eliminations share 2nd');
  assert.equal(sim.phase, 'end', 'one hunter left: the match ended');
  for (const r of early) assert.equal(fin.find((f) => f.p === r.p).rank, r.rank, `${r.p.name}: same place at elimination and in the final results`);
  assert.equal(fin.find((f) => f.p === a).rank, 1);
}

// a hunter who already quit (their slot is a bot now) is not reported again when the bot is eliminated
{
  const early = [];
  const sim = mk('showdown', { eliminated: (r) => early.push(...r) });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' });
  sim.addPlayer({ name: 'C', brawler: 'volt' });
  sim.tick();
  assert(sim.abandon(b.id), 'the quit itself is the result');
  sim.tickN++; sim.kill(b, a, 'x'); sim.tickN--;
  sim.tick();
  assert.equal(early.length, 0);
}

// respawn modes: dying is not final, nothing is reported early
{
  const early = [];
  const sim = mk('bounty', { eliminated: (r) => early.push(...r) });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), b = sim.addPlayer({ name: 'B', brawler: 'volt' });
  sim.tick();
  sim.tickN++; sim.kill(b, a, 'x'); sim.tickN--;
  sim.tick();
  assert.equal(early.length, 0);
}
console.log('matchflow tests passed');
