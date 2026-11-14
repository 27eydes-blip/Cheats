// Interest management: a player's snapshot size must not grow with the map or with far-away action.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena } from '../public/shared.js';

function measure(extraFar) {
  const sizes = [];
  const sim = new Sim({ map: generateArena(5, 'meadow', 20), mode: 'bighunt', phase: 'play', fillBots: false, events: false, send: (id, m) => { if (m.t === 's' && id === me.id) sizes.push(JSON.stringify(m).length); } });
  const me = sim.addPlayer({ name: 'Me', brawler: 'volt' });
  me.x = 600; me.y = 600;
  for (let i = 0; i < 19; i++) { const b = sim.addPlayer({ name: 'B' + i, brawler: 'volt', bot: true }); b.x = 3500 + (i % 5) * 200; b.y = 3500 + Math.floor(i / 5) * 200; }
  for (let k = 0; k < 40; k++) {
    for (let i = 0; i < extraFar; i++) sim.bullets.push({ id: sim.nextEnt++, owner: 0, kind: 0, x: 4000 + i, y: 4000, vx: 0, vy: 0, dist: 0, range: 1e9, dmg: 0, r: 5, team: 0 });
    for (let i = 0; i < extraFar; i++) sim.fx.push(['dmg', 4200, 4200, 10, 0]);
    sim.tick();
    sim.bullets.length = 0;
  }
  return sizes.reduce((a, b) => a + b, 0) / sizes.length;
}
const quiet = measure(0), busy = measure(200);
console.log(`snapshot bytes: quiet ${quiet.toFixed(0)}, 200 far-away bullets + effects per tick ${busy.toFixed(0)}`);
assert(busy < quiet * 1.15, 'far-away action must not bloat a player\'s snapshot');
console.log('INTEREST OK');

// Free Play: a player's snapshot is the same size in a busy zone as in a quiet one (bots far away)
{
  const { generateWorld, zoneBounds } = await import('../public/shared.js');
  const measureZone = (bots) => {
    const sizes = [];
    const b = zoneBounds('se');
    const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'se', bounds: b, hub: true, phase: 'play', botTarget: 0, events: false, now: () => 0, send: (id, m) => { if (m.t === 's' && id === me.id) sizes.push(JSON.stringify(m).length); } });
    const me = sim.addPlayer({ name: 'Me', brawler: 'volt' }); me.x = b.x0 + 800; me.y = b.y0 + 800;
    for (let i = 0; i < bots; i++) { const q = sim.addPlayer({ name: 'B' + i, brawler: 'volt', bot: true }); q.x = b.x0 + 4000 + (i % 8) * 200; q.y = b.y0 + 4000 + Math.floor(i / 8) * 200; }
    for (let k = 0; k < 30; k++) sim.tick();
    return sizes.reduce((a, c) => a + c, 0) / sizes.length;
  };
  const quiet = measureZone(0), busy = measureZone(40);
  console.log(`free play snapshot bytes: empty zone ${quiet.toFixed(0)}, 40 far-away bots ${busy.toFixed(0)}`);
  assert(busy < quiet * 1.25, 'bandwidth per player does not grow with the zone population far away');
}
