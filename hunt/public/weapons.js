// WEAPONS: every brawler keeps its signature attack and can carry ONE secondary from the armory.
// 15 original weapons in 7 classes. Shared by the server (authoritative) and the client (prediction,
// bullet simulation, armory stats). Numbers tuned with test/weapons-balance.js (bot duels, 45-55%).
import { TILE, WALL, CRATE, DT, own } from './shared.js';

// kind: how it fires
//   shot    projectile(s): pellets > 1 = a spread blast; burst = rounds per trigger pull
//   charge  hold to charge (sniper): damage grows with hold time
//   grenade bouncing projectile that explodes when its fuse runs out
//   rocket  slow projectile that explodes on impact (splash)
//   melee   instant arc in front of you; lunge = a short dash forward
// auto: keeps firing while the aim stick is held
export const WEAPON_CLASSES = { rifle: 'Rifle', shotgun: 'Shotgun', sniper: 'Sniper', smg: 'SMG', launcher: 'Launcher', melee: 'Melee', special: 'Special' };
export const WEAPONS = {
  stormline: { name: 'Stormline', cls: 'rifle', desc: 'Steady 3-round burst.', kind: 'shot', burst: 3, interval: 0.08, damage: 190, cooldown: 0.5, ammo: 3, reload: 1.4, range: 620, speed: 1250, spread: 0.035, radius: 9, unlock: 1, rarity: 'common' },
  ratchet: { name: 'Ratchet', cls: 'rifle', desc: 'Fast full-auto, wild spread.', kind: 'shot', auto: true, damage: 190, cooldown: 0.11, ammo: 12, reload: 0.22, range: 560, speed: 1150, spread: 0.2, radius: 8, unlock: 6, rarity: 'common' },
  breaker: { name: 'Breaker', cls: 'shotgun', desc: 'Wide 6-pellet blast.', kind: 'shot', pellets: 6, arc: 0.72, damage: 190, cooldown: 0.6, ammo: 3, reload: 1.6, range: 360, speed: 950, spread: 0, radius: 8, unlock: 1, rarity: 'common' },
  slugger: { name: 'Slugger', cls: 'shotgun', desc: 'One heavy slug. Brutal up close (critical hit point-blank).', kind: 'shot', damage: 525, cooldown: 0.75, ammo: 2, reload: 1.8, range: 380, speed: 1000, spread: 0.02, radius: 14, crit: 'close', unlock: 9, rarity: 'rare' },
  longshot: { name: 'Longshot', cls: 'sniper', desc: 'Hold to charge: more damage the longer you hold (full charge = critical).', kind: 'charge', damage: 440, maxDamage: 1160, charge: 1.2, cooldown: 0.6, ammo: 2, reload: 2.2, range: 1050, speed: 1900, spread: 0, radius: 9, unlock: 12, rarity: 'rare' },
  needle: { name: 'Needle', cls: 'sniper', desc: 'Fast light shots that pierce one enemy.', kind: 'shot', damage: 555, cooldown: 0.32, ammo: 4, reload: 1.05, range: 900, speed: 1800, spread: 0, radius: 7, pierce: 1, unlock: 4, rarity: 'common' },
  hornet: { name: 'Hornet', cls: 'smg', desc: 'Super-fast fire, low damage.', kind: 'shot', auto: true, damage: 95, cooldown: 0.07, ammo: 16, reload: 0.15, range: 480, speed: 1050, spread: 0.13, radius: 7, unlock: 1, rarity: 'common' },
  viper: { name: 'Viper', cls: 'smg', desc: 'Poison darts: damage over time.', kind: 'shot', auto: true, damage: 120, cooldown: 0.16, ammo: 10, reload: 0.22, range: 520, speed: 1100, spread: 0.08, radius: 7, poison: { dps: 175, time: 2 }, unlock: 15, rarity: 'rare' },
  thumper: { name: 'Thumper', cls: 'launcher', desc: 'Bouncing grenade, 1.5s fuse.', kind: 'grenade', damage: 950, blast: 125, fuse: 1.5, cooldown: 0.9, ammo: 2, reload: 2.0, range: 650, speed: 720, spread: 0, radius: 12, unlock: 18, rarity: 'rare' },
  rocketeer: { name: 'Rocketeer', cls: 'launcher', desc: 'Slow rocket with splash damage.', kind: 'rocket', damage: 740, splash: 815, blast: 130, cooldown: 1.0, ammo: 2, reload: 2.2, range: 820, speed: 540, spread: 0, radius: 13, unlock: 22, rarity: 'epic' },
  cleaver: { name: 'Cleaver', cls: 'melee', desc: 'A wide swing (critical from behind).', kind: 'melee', damage: 435, arc: 2.2, range: 145, cooldown: 0.55, ammo: 3, reload: 1.2, spread: 0, crit: 'behind', unlock: 26, rarity: 'common' },
  spear: { name: 'Spear', cls: 'melee', desc: 'A long poke with a lunge.', kind: 'melee', damage: 720, arc: 0.5, range: 235, lunge: 130, cooldown: 0.7, ammo: 2, reload: 1.4, spread: 0, unlock: 30, rarity: 'rare' },
  arcgun: { name: 'Arc Gun', cls: 'special', desc: 'Lightning that chains to 3 nearby enemies.', kind: 'shot', damage: 535, cooldown: 0.45, ammo: 3, reload: 1.5, range: 520, speed: 1400, spread: 0.02, radius: 9, chain: { n: 2, range: 260, mul: 0.7 }, unlock: 33, rarity: 'epic' },
  frost: { name: 'Frost Cannon', cls: 'special', desc: 'Freezing shots that slow enemies.', kind: 'shot', damage: 575, cooldown: 0.7, ammo: 3, reload: 1.6, range: 560, speed: 820, spread: 0.02, radius: 18, slow: 1.6, unlock: 36, rarity: 'rare' },
  flare: { name: 'Flare Gun', cls: 'special', desc: 'Lights up an area and reveals hidden players for 3s.', kind: 'shot', damage: 675, cooldown: 0.7, ammo: 3, reload: 1.7, range: 700, speed: 900, spread: 0, radius: 10, flare: { r: 380, time: 3 }, unlock: 40, rarity: 'epic' },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const STARTER_WEAPONS = WEAPON_IDS.filter((k) => WEAPONS[k].unlock <= 1); // stormline, breaker, hornet
export const SWAP_TIME = 0.4;
export const MAX_SHOTS_PER_SEC = 16; // server anti-cheat cap on trigger pulls
export const AIM_ASSIST = 6 * Math.PI / 180; // bullets nudge toward an enemy within 6 degrees (never snipers)
export const LAG_COMP_TICKS = 3; // the server rewinds targets up to 150ms (3 ticks) for hit checks
export const weaponIndex = (id) => WEAPON_IDS.indexOf(id);
// projectile kind ids sent to clients: 0..5 brawler signatures, 20 cage, 32+ weapons
export const WKIND = 32; // (20 is the cage from Rook's super)
export const weaponOfKind = (k) => (k >= WKIND ? WEAPON_IDS[k - WKIND] : null);

// stats shown in the armory (0..1 bars + readable numbers)
export function weaponStats(id) {
  const w = WEAPONS[id];
  const perShot = w.kind === 'charge' ? w.maxDamage : w.damage * (w.pellets || 1) * (w.burst || 1) + (w.splash || 0) + (w.poison ? w.poison.dps * w.poison.time : 0);
  const rate = 1 / w.cooldown; // trigger pulls per second
  return {
    damage: perShot, fireRate: rate, range: w.range, reload: w.reload, spread: w.pellets ? w.arc : w.spread,
    bars: { damage: Math.min(1, perShot / 2000), fireRate: Math.min(1, rate / 14), range: Math.min(1, w.range / 1050), reload: Math.min(1, 0.4 / w.reload + 0.05), spread: Math.min(1, (w.pellets ? w.arc : w.spread) / 0.75) },
  };
}

// deterministic spread: both the server and the shooter's client get the same jitter for a shot
export function jitter(seq, i) {
  let h = ((seq | 0) * 2654435761 + i * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
  return h / 4294967296 - 0.5;
}
// all projectile angles for one trigger pull
export function shotAngles(w, ang, seq) {
  if (w.pellets > 1) { const out = []; for (let i = 0; i < w.pellets; i++) out.push(ang - w.arc / 2 + (w.arc * i) / (w.pellets - 1) + jitter(seq, i) * 0.04); return out; }
  return [ang + jitter(seq, 0) * w.spread];
}

// ---------------------------------------------------------------- shared projectile stepping
// One server tick of movement for a projectile. Same code on server and client so clients can
// simulate bullets from a single "fired" event. `hit(b)` (server only) is called after each
// sub-step and returns true to stop the projectile. Returns why it stopped, or null.
//   b: { x, y, vx, vy, dist, range, bounce?, fuse? }
export function stepShot(map, b, mods, hit) {
  const bw = (mods && mods.bulletWind) || 0;
  if (bw) {
    const wl = Math.hypot(mods.wx || 0, mods.wy || 0) || 1;
    b.vx += ((mods.wx || 0) / wl) * bw * DT; b.vy += ((mods.wy || 0) / wl) * bw * DT;
  }
  if (b.fuse != null) { b.fuse -= DT; b.vx *= 0.93; b.vy *= 0.93; } // grenades roll to a stop
  const step = Math.hypot(b.vx, b.vy) * DT, n = Math.max(1, Math.ceil(step / 16));
  for (let i = 0; i < n; i++) {
    const ox = b.x, oy = b.y;
    b.x += (b.vx * DT) / n; b.y += (b.vy * DT) / n; b.dist += step / n;
    const t = tileAtXY(map, b.x, b.y);
    if (t === WALL || t === CRATE) {
      if (b.bounce) { // reflect off whichever axis hit the wall
        if (tileAtXY(map, b.x, oy) === WALL || tileAtXY(map, b.x, oy) === CRATE) b.vx = -b.vx;
        if (tileAtXY(map, ox, b.y) === WALL || tileAtXY(map, ox, b.y) === CRATE) b.vy = -b.vy;
        b.x = ox; b.y = oy;
        continue;
      }
      return t === CRATE ? 'crate' : 'wall';
    }
    if (hit && hit(b)) return 'hit';
    if (b.fuse == null && b.dist >= b.range) return 'range';
  }
  if (b.fuse != null && b.fuse <= 0) return 'fuse';
  return null;
}
function tileAtXY(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.gw || ty >= map.gh) return WALL;
  return map.t[ty * map.gw + tx];
}

// ---------------------------------------------------------------- mastery + perks
export const MASTERY_MAX = 10;
export const masteryNeed = (lvl) => 120 * lvl; // XP from level lvl to lvl+1
export function masteryInfo(xp = 0) {
  let lvl = 1, left = xp;
  while (lvl < MASTERY_MAX && left >= masteryNeed(lvl)) { left -= masteryNeed(lvl); lvl++; }
  return { level: lvl, into: left, need: lvl >= MASTERY_MAX ? 0 : masteryNeed(lvl) };
}
// mastery XP for a match: damage dealt and kills with the weapon
export const masteryXp = (dmg, kills) => Math.round(dmg / 120 + kills * 20);
// weapon skins (by mastery level) and the badge shown next to your name
export const MASTERY_SKINS = [
  { lvl: 3, id: 'bronze', name: 'Bronze', col: '#c07a3a', hi: '#f0b070' },
  { lvl: 6, id: 'silver', name: 'Silver', col: '#a9b2c4', hi: '#eef3ff' },
  { lvl: 9, id: 'gold', name: 'Gold', col: '#e0a92a', hi: '#fff0a0' },
  { lvl: 10, id: 'bane', name: "Hunter's Bane", col: '#3a0f2a', hi: '#ff2d6a', animated: true },
];
export const masteryBadge = (lvl) => [...MASTERY_SKINS].reverse().find((s) => lvl >= s.lvl)?.id || null;
// mastery 7 unlocks the class kill effect (see catalog KILL_FX)
export const CLASS_FX = { rifle: 'tracer', shotgun: 'shrapnel', sniper: 'crosshair', smg: 'swarm', launcher: 'crater', melee: 'cleave', special: 'arcburst' };
// PERKS: at mastery 2, 5 and 8 you pick ONE of two, per weapon. Small (about 10% or less), so
// mastery never decides a fight on its own. Tier 5 is each weapon's own pair (Stormline: faster
// reload OR +1 round per burst); tiers 2 and 8 come from the weapon's class.
// fx: multipliers (reload, range, damage, spread, cooldown, charge, fuse, blast, lunge, arc, speed,
// swap, slow, flareTime, flareR, chainRange, poisonTime) or additions (burst, ammo, pellets)
const P = (id, name, desc, fx) => ({ id, name, desc, fx });
const QUICK = P('quickhands', 'Quick Hands', 'Swap to it 40% faster.', { swap: 0.6 });
const CLASS_PERKS = {
  rifle: { 2: [P('steadygrip', 'Steady Grip', '20% less spread.', { spread: 0.8 }), QUICK], 8: [P('hollowpoint', 'Hollow Point', '+7% damage.', { damage: 1.07 }), P('hairtrigger', 'Hair Trigger', 'Fires 8% faster.', { cooldown: 0.92 })] },
  shotgun: { 2: [P('choke', 'Tight Choke', '12% narrower blast.', { arc: 0.88, spread: 0.85 }), QUICK], 8: [P('buckshot', 'Heavy Buckshot', '+7% damage.', { damage: 1.07 }), P('slamfire', 'Slam Fire', 'Fires 8% faster.', { cooldown: 0.92 })] },
  sniper: { 2: [P('lightframe', 'Light Frame', 'Swap to it 40% faster.', { swap: 0.6 }), P('longbarrel', 'Long Barrel', '+8% range.', { range: 1.08 })], 8: [P('hollowpoint', 'Hollow Point', '+7% damage.', { damage: 1.07 }), P('boltoil', 'Oiled Bolt', 'Fires 8% faster.', { cooldown: 0.92 })] },
  smg: { 2: [QUICK, P('deeppockets', 'Deep Pockets', '+2 rounds per magazine.', { ammo: 2 })], 8: [P('hotrounds', 'Hot Rounds', '+7% damage.', { damage: 1.07 }), P('steadygrip', 'Steady Grip', '20% less spread.', { spread: 0.8 })] },
  launcher: { 2: [QUICK, P('lightshell', 'Light Shell', 'Flies 10% faster.', { speed: 1.1 })], 8: [P('bigbang', 'Big Bang', '+10% blast radius.', { blast: 1.1 }), P('autoloader', 'Autoloader', 'Reloads 10% faster.', { reload: 0.9 })] },
  melee: { 2: [QUICK, P('lightfeet', 'Light Feet', 'Lunges 15% further.', { lunge: 1.15 })], 8: [P('keenedge', 'Keen Edge', '+7% damage.', { damage: 1.07 }), P('fasthands', 'Fast Hands', 'Swings 8% faster.', { cooldown: 0.92 })] },
  special: { 2: [QUICK, P('longbarrel', 'Long Barrel', '+8% range.', { range: 1.08 })], 8: [P('overcharge', 'Overcharge', '+7% damage.', { damage: 1.07 }), P('quickcells', 'Quick Cells', 'Reloads 10% faster.', { reload: 0.9 })] },
};
const FAST = P('fastreload', 'Fast Reload', 'Reloads 10% faster.', { reload: 0.9 });
const OWN_PERKS = {
  stormline: [FAST, P('extraround', 'Extra Round', '+1 round per burst.', { burst: 1 })],
  ratchet: [P('tightspread', 'Tight Spread', '15% less spread.', { spread: 0.85 }), P('bigmag', 'Big Magazine', '+2 rounds per magazine.', { ammo: 2 })],
  breaker: [P('extrapellet', 'Extra Pellet', '+1 pellet per blast.', { pellets: 1 }), FAST],
  slugger: [P('heavyslug', 'Heavy Slug', '+6% damage.', { damage: 1.06 }), P('longslug', 'Long Slug', '+10% range.', { range: 1.1 })],
  longshot: [P('quickcharge', 'Quick Charge', 'Charges 10% faster.', { charge: 0.9 }), FAST],
  needle: [FAST, P('speedrounds', 'Speed Rounds', 'Shots fly 10% faster.', { speed: 1.1 })],
  hornet: [P('bigmag', 'Big Magazine', '+2 rounds per magazine.', { ammo: 2 }), P('tightspread', 'Tight Spread', '15% less spread.', { spread: 0.85 })],
  viper: [P('lingering', 'Lingering Toxin', 'Poison lasts 10% longer.', { poisonTime: 1.1 }), FAST],
  thumper: [P('shortfuse', 'Short Fuse', '15% shorter fuse.', { fuse: 0.85 }), P('wideblast', 'Wide Blast', '+10% blast radius.', { blast: 1.1 })],
  rocketeer: [P('fastrocket', 'Fast Rocket', 'Flies 10% faster.', { speed: 1.1 }), P('wideblast', 'Wide Blast', '+10% blast radius.', { blast: 1.1 })],
  cleaver: [P('wideswing', 'Wide Swing', '10% wider swing.', { arc: 1.1 }), FAST],
  spear: [P('longlunge', 'Long Lunge', 'Lunges 15% further.', { lunge: 1.15 }), P('longreach', 'Long Reach', '+8% reach.', { range: 1.08 })],
  arcgun: [P('longchain', 'Long Chain', 'Lightning jumps 15% further.', { chainRange: 1.15 }), FAST],
  frost: [P('deepfreeze', 'Deep Freeze', 'Slows 10% longer.', { slow: 1.1 }), FAST],
  flare: [P('longburn', 'Long Burn', 'Reveals 10% longer.', { flareTime: 1.1 }), P('widelight', 'Wide Light', '10% bigger light.', { flareR: 1.1 })],
};
export function perksFor(id) {
  const w = own(WEAPONS, id);
  if (!w) return {};
  const c = CLASS_PERKS[w.cls];
  return { 2: c[2], 5: OWN_PERKS[id], 8: c[8] };
}
// (kept for older callers: the class pairs, by tier)
export const PERKS = { 2: CLASS_PERKS.rifle[2], 5: OWN_PERKS.stormline, 8: CLASS_PERKS.rifle[8] };
// a weapon with its perks applied (server: authoritative; client: armory preview + prediction)
export function withPerks(id, perks = []) {
  const w = { ...WEAPONS[id] };
  w.swap = SWAP_TIME;
  if (!perks.length) return w;
  const table = perksFor(id), fx = {};
  for (const tier of [2, 5, 8]) for (const p of table[tier] || []) if (perks.includes(p.id)) Object.assign(fx, p.fx);
  const mul = (k, f) => { if (w[k] != null && f) w[k] *= f; };
  mul('reload', fx.reload); mul('range', fx.range); mul('cooldown', fx.cooldown); mul('charge', fx.charge); mul('fuse', fx.fuse);
  mul('blast', fx.blast); mul('lunge', fx.lunge); mul('speed', fx.speed); mul('swap', fx.swap);
  if (fx.damage) { w.damage *= fx.damage; if (w.maxDamage) w.maxDamage *= fx.damage; if (w.splash) w.splash *= fx.damage; }
  if (fx.spread) w.spread *= fx.spread;
  if (fx.arc && w.arc) w.arc *= fx.arc;
  if (fx.burst) w.burst = (w.burst || 1) + fx.burst;
  if (fx.ammo) w.ammo += fx.ammo;
  if (fx.pellets) w.pellets = (w.pellets || 1) + fx.pellets;
  if (fx.slow && w.slow) w.slow *= fx.slow;
  if (fx.poisonTime && w.poison) w.poison = { ...w.poison, time: w.poison.time * fx.poisonTime };
  if (fx.chainRange && w.chain) w.chain = { ...w.chain, range: w.chain.range * fx.chainRange };
  if (w.flare && (fx.flareTime || fx.flareR)) w.flare = { r: w.flare.r * (fx.flareR || 1), time: w.flare.time * (fx.flareTime || 1) };
  return w;
}
