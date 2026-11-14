// Weapon balance gate: 300 bot duels per weapon on each of 3 seeds; every weapon's average
// pick-win rate must be 45-55%.
import assert from 'node:assert';
import { WEAPON_IDS } from '../public/weapons.js';
import { runWeaponBalance } from './weapons-balance.js';
const runs = [1, 2, 3].map((s) => runWeaponBalance(300, s));
const avg = Object.fromEntries(WEAPON_IDS.map((w) => [w, runs.reduce((t, r) => t + r.rates[w], 0) / runs.length]));
console.log('weapon pick-win (3 x 300): ' + WEAPON_IDS.map((w) => `${w} ${(avg[w] * 100).toFixed(1)}%`).join(', '));
for (const w of WEAPON_IDS) assert(avg[w] >= 0.45 && avg[w] <= 0.55, `${w} ${(avg[w] * 100).toFixed(1)}% outside 45-55%`);
console.log('WEAPON BALANCE OK');
