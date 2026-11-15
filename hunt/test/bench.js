// Server benchmark: 20 bots fighting in a Big Hunt (5000x5000) for 60 simulated seconds.
// Reports server CPU per tick (mean AND the tail: p50/p95/p99/max, warm-up excluded) and the
// snapshot bandwidth per player: raw JSON bytes, and an estimate of what really crosses the
// network (the game's sockets use permessage-deflate).  usage: node test/bench.js [seconds]
import { deflateRawSync, constants } from 'node:zlib';
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLER_IDS } from '../public/shared.js';

export function bench(seconds = 60, seed = 7) {
  // deterministic: bots and ids use Math.random, so seed it for the run
  let s2 = (seed ^ 0x9e3779b9) >>> 0;
  const realRandom = Math.random;
  Math.random = () => { s2 = (s2 + 0x6d2b79f5) >>> 0; let x = s2; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32; };
  try { return benchRun(seconds, seed); } finally { Math.random = realRandom; }
}
const WARMUP = 100; // ticks left out of the percentiles (JIT warm-up, first full snapshots)
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
function benchRun(seconds, seed) {
  let bytes = 0, msgs = 0;
  const sentTo = new Map(); // a sample of 4 players: every snapshot they were sent (for the wire-size estimate)
  const sim = new Sim({ map: generateArena(seed, 'meadow', 20), mode: 'bighunt', phase: 'play', seed, fillBots: false, events: false,
    send: (id, m) => { if (m.t !== 's') return; const s = JSON.stringify(m); bytes += s.length; msgs++; const l = sentTo.get(id); if (l) l.push(s); } });
  const sp = sim.map.spawns;
  for (let i = 0; i < 20; i++) {
    const p = sim.addPlayer({ name: 'B' + i, brawler: BRAWLER_IDS[i % BRAWLER_IDS.length], bot: true });
    p.connected = true; // count their snapshots (bots ignore them)
    p.botLevel = 'hard';
    if (i % 5 === 0) sentTo.set(p.id, []);
    // pack them in so everyone is fighting at once
    p.x = sim.center.x + (sp[i].x - sim.center.x) * 0.35; p.y = sim.center.y + (sp[i].y - sim.center.y) * 0.35;
  }
  const ticks = seconds * 20, times = [];
  let shots = 0, done = 0, total = 0;
  for (let k = 0; k < ticks && sim.phase === 'play'; k++) {
    // nobody dies, so all 20 keep fighting the whole time, but with REAL HP numbers on the wire
    // (an 8-digit HP in every player row would inflate the snapshot size)
    for (const p of sim.players.values()) if (p.hp < p.maxHp * 0.8) p.hp = p.maxHp;
    const before = sim.nextEnt, t0 = process.hrtime.bigint();
    sim.tick();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    total += ms; if (k >= WARMUP) times.push(ms);
    shots += sim.nextEnt - before; done++;
  }
  times.sort((a, b) => a - b);
  // WIRE SIZE: browsers negotiate permessage-deflate, so what crosses the network is each client's
  // snapshots as one deflate stream (the earlier messages are the dictionary for the next one)
  let wire = 0, wmsgs = 0;
  for (const list of sentTo.values()) {
    let dict = Buffer.alloc(0);
    for (const s of list) {
      const b = Buffer.from(s);
      wire += deflateRawSync(b, { finishFlush: constants.Z_SYNC_FLUSH, ...(dict.length ? { dictionary: dict } : {}) }).length; wmsgs++;
      dict = Buffer.concat([dict, b]); if (dict.length > 32768) dict = dict.subarray(dict.length - 32768);
    }
  }
  const r3 = (v) => +v.toFixed(3);
  return {
    msPerTick: r3(total / done), p50: r3(pct(times, 0.5) ?? 0), p95: r3(pct(times, 0.95) ?? 0), p99: r3(pct(times, 0.99) ?? 0), max: r3(times[times.length - 1] ?? 0),
    bytesPerPlayerPerSec: Math.round((bytes / Math.max(1, msgs)) * 20), wireBytesPerPlayerPerSec: Math.round((wire / Math.max(1, wmsgs)) * 20),
    entities: shots, alive: sim.aliveCount(),
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = +(process.argv[2] || 60);
  // this box shares its CPU: run each seed 3 times and keep the fastest (least disturbed) timing
  const TIMES = ['msPerTick', 'p50', 'p95', 'p99', 'max'];
  const runs = [1, 2, 3].map((seed) => { const r = [0, 1, 2].map(() => bench(s, seed)); return { ...r[0], ...Object.fromEntries(TIMES.map((k) => [k, Math.min(...r.map((x) => x[k]))])) }; });
  console.log(JSON.stringify(runs));
  const avg = (k) => +(runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(3);
  console.log(JSON.stringify({ ...Object.fromEntries(TIMES.map((k) => [k, avg(k)])), bytesPerPlayerPerSec: avg('bytesPerPlayerPerSec'), wireBytesPerPlayerPerSec: avg('wireBytesPerPlayerPerSec') }));
}
