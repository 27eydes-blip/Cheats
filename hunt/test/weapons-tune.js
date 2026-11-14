// Damage tuner for test/weapons-balance.js: scales each weapon's damage toward a 50% pick-win
// rate over a few rounds and prints the multipliers (applied by hand to public/weapons.js).
// usage: node test/weapons-tune.js [rounds=8] [matchesPerRound=150]
import { WEAPONS, WEAPON_IDS } from '../public/weapons.js';
import { runWeaponBalance } from './weapons-balance.js';
import { clearWeaponCache } from '../src/sim.js';
const rounds = +(process.argv[2] || 8), N = +(process.argv[3] || 150);
const mult = Object.fromEntries(WEAPON_IDS.map((w) => [w, 1]));
const scale = (w, f) => { const x = WEAPONS[w]; x.damage *= f; if (x.maxDamage) x.maxDamage *= f; if (x.splash) x.splash *= f; if (x.poison) x.poison = { ...x.poison, dps: x.poison.dps * f }; mult[w] *= f; };
for (let r = 0; r < rounds; r++) {
  clearWeaponCache();
  const res = runWeaponBalance(N, 100 + r);
  console.log(`round ${r + 1}: ` + WEAPON_IDS.map((w) => `${w} ${(res.rates[w] * 100).toFixed(0)}`).join(' '));
  for (const w of WEAPON_IDS) { const rt = res.rates[w]; if (Math.abs(rt - 0.5) > 0.025) scale(w, Math.max(0.82, Math.min(1.22, Math.pow(0.5 / Math.max(0.03, rt), 0.45)))); }
}
console.log(JSON.stringify(Object.fromEntries(WEAPON_IDS.map((w) => [w, +mult[w].toFixed(3)]))));
