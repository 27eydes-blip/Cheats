// Iteratively scales each brawler's damage (attack + super) toward a 50% duel win rate.
import { BRAWLERS, BRAWLER_IDS } from '../public/shared.js';
import { runBalance } from './balance.js';
const base = Object.fromEntries(BRAWLER_IDS.map((b) => [b, { a: BRAWLERS[b].attack.damage, s: BRAWLERS[b].super.damage }]));
const mul = Object.fromEntries(BRAWLER_IDS.map((b) => [b, 1]));
if (process.argv[3]) Object.assign(mul, JSON.parse(process.argv[3]));
const apply = () => { for (const b of BRAWLER_IDS) { BRAWLERS[b].attack.damage = Math.round(base[b].a * mul[b] / 10) * 10; if (base[b].s) BRAWLERS[b].super.damage = Math.round(base[b].s * mul[b] / 10) * 10; } };
for (let round = 0; round < +(process.argv[2] || 8); round++) {
  apply();
  const r = runBalance(1500, 1000 + round);
  console.log(`round ${round}: ` + BRAWLER_IDS.map((b) => `${b} ${(r.rates[b] * 100).toFixed(0)}% x${mul[b].toFixed(2)}`).join('  '));
  for (const b of BRAWLER_IDS) mul[b] *= 1 + 0.9 * (0.5 - r.rates[b]);
}
apply();
console.log(JSON.stringify(Object.fromEntries(BRAWLER_IDS.map((b) => [b, { attack: BRAWLERS[b].attack.damage, super: BRAWLERS[b].super.damage }]))));
