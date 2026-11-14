// Server benchmark: 20 bots fighting in a Big Hunt (5000x5000) for 60 simulated seconds.
// Reports server CPU per tick and the snapshot bandwidth per player.  usage: node test/bench.js [seconds]
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLER_IDS } from '../public/shared.js';

export function bench(seconds = 60, seed = 7) {
  // deterministic: bots and ids use Math.random, so seed it for the run
  let s2 = (seed ^ 0x9e3779b9) >>> 0;
  const realRandom = Math.random;
  Math.random = () => { s2 = (s2 + 0x6d2b79f5) >>> 0; let x = s2; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32; };
  try { return benchRun(seconds, seed); } finally { Math.random = realRandom; }
}
function benchRun(seconds, seed) {
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
  // this box shares its CPU: run each seed 3 times and keep the fastest (least disturbed) timing
  const runs = [1, 2, 3].map((seed) => { const r = [0, 1, 2].map(() => bench(s, seed)); return { ...r[0], msPerTick: Math.min(...r.map((x) => x.msPerTick)) }; });
  console.log(JSON.stringify(runs));
  const avg = (k) => +(runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(3);
  console.log(JSON.stringify({ msPerTick: avg('msPerTick'), bytesPerPlayerPerSec: avg('bytesPerPlayerPerSec') }));
}
