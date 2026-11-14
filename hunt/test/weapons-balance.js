// WEAPON BALANCE: bot 1v1 duels where both sides fight with their SECONDARY weapon (same brawler on
// both sides, so only the weapon differs). Every ordered weapon pairing is played in turn, on random
// arenas and spawns, until each weapon has played at least N matches. Target: every weapon wins
// 45-55% of the matches it's picked in.
// usage: node test/weapons-balance.js [matchesPerWeapon=300] [seed=1]
import { Sim } from '../src/sim.js';
import { BRAWLER_IDS, WORLDS, arenaSpawns, generateArena } from '../public/shared.js';
import { WEAPON_IDS } from '../public/weapons.js';
const SPAWNS = arenaSpawns(2000, 10);

export function runWeaponBalance(N = 300, seed0 = 1, ids = WEAPON_IDS) {
  const wins = Object.fromEntries(ids.map((w) => [w, 0])), games = Object.fromEntries(ids.map((w) => [w, 0]));
  let s = seed0;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
  const pool = WORLDS.filter((w) => w.arena).map((w) => w.key);
  const pairs = []; for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b]);
  const total = Math.ceil((N * ids.length) / 2 / pairs.length) * pairs.length;
  let s2 = (seed0 ^ 0x9e3779b9) >>> 0, timeouts = 0;
  const realRandom = Math.random;
  Math.random = () => { s2 = (s2 + 0x6d2b79f5) >>> 0; let x = s2; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32; };
  try {
    for (let i = 0; i < total; i++) {
      const [wa, wb] = pairs[i % pairs.length];
      const br = BRAWLER_IDS[Math.floor(i / pairs.length) % BRAWLER_IDS.length];
      const seed = Math.floor(rnd() * 2 ** 31);
      const sim = new Sim({ map: generateArena(seed, pool[Math.floor(rnd() * pool.length)], 2), mode: 'showdown', phase: 'play', seed, events: false, fillBots: false });
      const A = sim.addPlayer({ name: 'A', brawler: br, bot: true }), B = sim.addPlayer({ name: 'B', brawler: br, bot: true });
      sim.setWeapon(A, wa); sim.setWeapon(B, wb);
      A.slot = B.slot = 1; A.forceSlot = B.forceSlot = 1;
      const k = Math.floor(rnd() * SPAWNS.length);
      Object.assign(A, SPAWNS[k]); Object.assign(B, SPAWNS[(k + 5) % SPAWNS.length]);
      let t = 0;
      while (A.alive && B.alive && t < 20 * 200) { sim.tick(); t++; }
      games[wa]++; games[wb]++;
      let w = A.alive && !B.alive ? wa : B.alive && !A.alive ? wb : null;
      if (!w) { timeouts++; w = A.hp / A.maxHp >= B.hp / B.maxHp ? wa : wb; }
      wins[w]++;
    }
  } finally { Math.random = realRandom; }
  return { rates: Object.fromEntries(ids.map((w) => [w, wins[w] / games[w]])), wins, games, timeouts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const r = runWeaponBalance(+(process.argv[2] || 300), +(process.argv[3] || 1));
  for (const w of WEAPON_IDS) console.log(`${w.padEnd(10)} ${(r.rates[w] * 100).toFixed(1).padStart(5)}%  (${r.wins[w]}/${r.games[w]})`);
  console.log('timeouts', r.timeouts, 'in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
