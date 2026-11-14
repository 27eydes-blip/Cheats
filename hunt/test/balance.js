// Bot balance harness: N 1v1 duels between random pairs of different brawlers on random arenas.
// usage: node test/balance.js [matches=300] [seed]
import { Sim } from '../src/sim.js';
import { BRAWLER_IDS, WORLDS, SPAWNS, generateArena } from '../public/shared.js';

export function runBalance(N = 300, seed0 = 1) {
  const wins = {}, games = {}, pair = {};
  for (const b of BRAWLER_IDS) { wins[b] = 0; games[b] = 0; }
  let s = seed0;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
  const pool = WORLDS.filter((w) => w.arena).map((w) => w.key);
  let timeouts = 0;
  for (let i = 0; i < N; i++) {
    // balanced schedule: cycle through every ordered pair, with random arenas/spawns
    const ids = BRAWLER_IDS;
    const pairs = []; for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b]);
    const [ba, bb] = pairs[i % pairs.length];
    const seed = Math.floor(rnd() * 2 ** 31);
    const sim = new Sim({ map: generateArena(seed, pool[Math.floor(rnd() * pool.length)]), mode: 'showdown', phase: 'play', seed, events: false, fillBots: false });
    const A = sim.addPlayer({ name: 'A', brawler: ba, bot: true }), B = sim.addPlayer({ name: 'B', brawler: bb, bot: true });
    const k = Math.floor(rnd() * SPAWNS.length);
    Object.assign(A, SPAWNS[k]); Object.assign(B, SPAWNS[(k + 5) % SPAWNS.length]);
    let t = 0;
    while (A.alive && B.alive && t < 20 * 200) { sim.tick(); t++; }
    games[ba]++; games[bb]++;
    let w = A.alive && !B.alive ? ba : B.alive && !A.alive ? bb : null;
    if (!w) { timeouts++; w = A.hp / A.maxHp >= B.hp / B.maxHp ? ba : bb; } // tiebreak on HP%
    wins[w]++;
    const key = [ba, bb].sort().join('-'); pair[key] ||= {}; pair[key][w] = (pair[key][w] || 0) + 1;
  }
  const rates = Object.fromEntries(BRAWLER_IDS.map((b) => [b, wins[b] / games[b]]));
  return { rates, games, wins, pair, timeouts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = +(process.argv[2] || 300);
  const r = runBalance(N, +(process.argv[3] || 1));
  for (const b of BRAWLER_IDS) console.log(`${b.padEnd(8)} ${(r.rates[b] * 100).toFixed(1).padStart(5)}%  (${r.wins[b]}/${r.games[b]})`);
  console.log('timeouts', r.timeouts);
  console.log(JSON.stringify(r.pair));
}
