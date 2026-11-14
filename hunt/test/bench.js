// Server benchmark: 20 bots fighting in a Big Hunt (5000x5000) for 60 simulated seconds.
// Reports server CPU per tick and the snapshot bandwidth per player.  usage: node test/bench.js [seconds]
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLER_IDS } from '../public/shared.js';

export function bench(seconds = 60, seed = 7) {
  let bytes = 0, msgs = 0;
  const sim = new Sim({ map: generateArena(seed, 'meadow', 20), mode: 'bighunt', phase: 'play', seed, fillBots: false, events: false,
    send: (id, m) => { if (m.t === 's') { bytes += JSON.stringify(m).length; msgs++; } } });
  const sp = sim.map.spawns;
  for (let i = 0; i < 20; i++) {
    const p = sim.addPlayer({ name: 'B' + i, brawler: BRAWLER_IDS[i % BRAWLER_IDS.length], bot: true });
    p.connected = true; // count their snapshots (bots ignore them)
    p.botLevel = 'hard';
    p.hp = p.maxHp = 1e7; // nobody dies: all 20 keep fighting the whole time
    // pack them in so everyone is fighting at once
    p.x = sim.center.x + (sp[i].x - sim.center.x) * 0.35; p.y = sim.center.y + (sp[i].y - sim.center.y) * 0.35;
  }
  const ticks = seconds * 20;
  let shots = 0, done = 0;
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < ticks && sim.phase === 'play'; k++) { const before = sim.nextEnt; sim.tick(); shots += sim.nextEnt - before; done++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { msPerTick: +(ms / done).toFixed(3), bytesPerPlayerPerSec: Math.round((bytes / Math.max(1, msgs)) * 20), entities: shots, alive: sim.aliveCount() };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = +(process.argv[2] || 60);
  const runs = [1, 2, 3].map((seed) => bench(s, seed));
  console.log(JSON.stringify(runs));
  const avg = (k) => +(runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(3);
  console.log(JSON.stringify({ msPerTick: avg('msPerTick'), bytesPerPlayerPerSec: avg('bytesPerPlayerPerSec') }));
}
