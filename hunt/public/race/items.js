// Hunt Racers pickups and each driver's built-in weapon (definitions shared by server and client).
// The server (src/race/sim.js) applies the effects; the client uses names, icons and timings.
// Two slots per racer: the driver's built-in WEAPON (FIRE, recharges on a cooldown) and one PICKUP
// from the item boxes (ITEM). See COMBAT.md "Oblivion GP weapons" for every item's counter.

// Pickups from item boxes. Plain descriptive names (original, not branded).
// The top-level numbers are level 1; `lv[1]` / `lv[2]` override them for levels 2 and 3 (grab the
// same item again while holding it: it levels up, up to 3). `up` says what each level adds.
export const ITEMS = {
  missile: { name: 'Homing Missile', desc: 'Locks on to the racer ahead. Drift at the last moment to shake it.', dmg: 24, speed: 1350, turn: 3.4, life: 4, spin: 0, dodgeR: 330, n: 1,
    lv: [null, { dmg: 33, turn: 3.9, spin: 0.1, up: 'Hits harder, turns tighter, spins them' }, { dmg: 40, turn: 4.4, spin: 0.25, dodgeR: 250, n: 2, up: 'Twin missiles, harder to shake' }] },
  oil: { name: 'Oil Slick', desc: 'Drop it behind you. Racers who hit it spin out.', r: 48, life: 20, spin: 0.5, arm: 0.45,
    lv: [null, { r: 60, spin: 0.58, up: 'Wider slick' }, { r: 72, spin: 0.66, up: 'Huge slick, longer spin' }] },
  shield: { name: 'Shield', desc: 'Blocks the next hit.', t: 2.5, hits: 1,
    lv: [null, { t: 3.5, up: 'Lasts longer' }, { t: 4.5, hits: 2, up: 'Blocks two hits' }] },
  rockets: { name: 'Rocket Volley', desc: 'Three rockets straight ahead.', n: 3, spread: 0.07, speed: 1700, dmg: 28, life: 1.1,
    lv: [null, { n: 4, dmg: 32, spread: 0.075, up: 'Four rockets' }, { n: 5, dmg: 36, spread: 0.08, up: 'Five rockets, more damage' }] },
  emp: { name: 'EMP Blast', desc: 'Shuts down nearby racers\' items and weapons, cuts their boost and slows them.', r: 460, t: 2.5, slow: 0.5,
    lv: [null, { r: 560, t: 3, slow: 0.75, up: 'Bigger blast' }, { r: 660, t: 3.5, slow: 0.9, up: 'Huge blast, longer shutdown' }] },
  turbo: { name: 'Turbo', desc: 'A big burst of speed.', t: 0.7, p: 1.3,
    lv: [null, { t: 0.9, p: 1.33, up: 'Longer burst' }, { t: 1.1, p: 1.36, up: 'Longest, fastest burst' }] },
  spikes: { name: 'Spike Strip', desc: 'A strip of spikes behind you. Hurts and slows.', half: 78, life: 15, dmg: 20, slow: 1.3, hits: 3, arm: 0.45,
    lv: [null, { half: 98, dmg: 26, slow: 1.6, hits: 4, up: 'Wider strip' }, { half: 118, dmg: 30, slow: 1.9, hits: 5, up: 'Widest strip, longer slow' }] },
  lightning: { name: 'Chain Lightning', desc: 'Zaps the nearest racer, then jumps to the racers near them.', range: 560, chain: 420, jumps: 2, dmg: 18, fall: 0.8, slow: 0.25,
    lv: [null, { range: 640, jumps: 3, dmg: 21, slow: 0.3, up: 'Longer reach, one more jump' }, { range: 720, jumps: 4, dmg: 24, slow: 0.4, up: 'Longest reach, four jumps' }] },
  gravity: { name: 'Gravity Well', desc: 'Throws a well ahead that pulls nearby racers to its centre.', r: 300, life: 3, pull: 650, drag: 1, throwT: 0.4, throwV: 900, reach: 900, crush: 0,
    lv: [null, { r: 360, pull: 700, life: 3.5, up: 'Bigger pull' }, { r: 420, pull: 800, life: 4, crush: 22, up: 'Crushes racers at the centre' }] },
  ghost: { name: 'Ghost Mode', desc: 'Pass through racers and hits for 3 seconds, a little lighter and faster (no attacking while ghosted).', t: 3,
    lv: [null, { t: 3.6, up: 'Lasts longer' }, { t: 4.2, up: 'Lasts longest' }] },
  sticky: { name: 'Sticky Bomb', desc: 'Sticks to a racer. Bump someone to pass it on before it blows.', fuse: 4, dmg: 50, spin: 0.8, splash: 0, speed: 1150, fly: 1.1, ground: 8, pass: 0.6,
    lv: [null, { fuse: 3.6, dmg: 55, splash: 150, up: 'Bigger blast' }, { fuse: 3.2, dmg: 62, splash: 210, up: 'Shorter fuse, huge blast' }] },
  drone: { name: 'Hunter Drone', desc: 'A drone that chases the racer ahead. Fire your weapon at it to swat it.', life: 6, speed: 790, turn: 4.5, dmg: 48, slow: 1.4, strikes: 1, swat: 230,
    lv: [null, { life: 7, speed: 850, dmg: 52, up: 'Faster drone' }, { life: 8, speed: 900, dmg: 56, strikes: 2, up: 'Strikes twice' }] },
};
export const ITEM_IDS = Object.keys(ITEMS); // index = wire id (append only)
export const MAX_LEVEL = 3;
// an item's numbers at a level (1..3): the base values with that level's overrides (built once)
const LV_CACHE = new Map();
export function itemStat(id, lvl = 1) {
  const l = Math.max(1, Math.min(MAX_LEVEL, lvl | 0 || 1)), k = id + l;
  let s = LV_CACHE.get(k);
  if (!s) {
    const I = ITEMS[id];
    s = { ...I };
    for (let i = 1; i < l; i++) if (I.lv[i]) Object.assign(s, I.lv[i]);
    delete s.lv;
    LV_CACHE.set(k, s);
  }
  return s;
}
// the HUD's short name for a held item at its level (e.g. 'Homing Missile II')
export const itemLabel = (id, lvl = 1) => (ITEMS[id] ? ITEMS[id].name + ['', '', ' II', ' III'][lvl] : '');

// Item odds by race position: weights at the front, middle and back of the pack (interpolated).
// Leaders get the weaker, defensive items; the back of the pack gets the ones that catch you up.
export const ODDS = {
  //       missile oil shield rockets emp turbo spikes lightning gravity ghost sticky drone
  front: [0, 22, 20, 12, 0, 4, 20, 4, 6, 8, 4, 0],
  mid: [12, 10, 10, 13, 6, 10, 9, 8, 6, 6, 6, 4],
  back: [18, 2, 6, 10, 10, 18, 2, 8, 6, 5, 6, 9],
  battle: [14, 8, 10, 14, 9, 4, 9, 9, 7, 5, 6, 5],
};
// holding an item and driving through a box: the item you hold is this many times as likely
// (the same item again = it levels up), so level-ups come round often enough to plan for
export const HELD_BOOST = 5;
// pick an item. place: 1-based race position, n: racers, r: a random number in [0, 1),
// held: the item already held (its weight is boosted; the sim levels it up when it comes again)
export function rollItem(place, n, r, battle = false, held = null) {
  let w;
  if (battle) w = ODDS.battle.slice();
  else {
    const f = n > 1 ? (place - 1) / (n - 1) : 0; // 0 = leader, 1 = last
    const [a, b, t] = f < 0.5 ? [ODDS.front, ODDS.mid, f * 2] : [ODDS.mid, ODDS.back, (f - 0.5) * 2];
    w = a.map((v, i) => v + (b[i] - v) * t);
  }
  const hi = held ? ITEM_IDS.indexOf(held) : -1;
  if (hi >= 0) w[hi] *= HELD_BOOST;
  const tot = w.reduce((s, v) => s + v, 0);
  let x = r * tot;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return ITEM_IDS[i]; }
  return ITEM_IDS[w.length - 1];
}

// Built-in weapons, one per driver, on a cooldown (seconds). Fire = the FIRE button.
export const WEAPONS = {
  volt: { name: 'Tesla Arc', desc: 'Zaps the nearest racer in front: damage and a short slow.', cd: 4, range: 340, cone: 0.75, dmg: 35, slow: 0.8 },
  brick: { name: 'Shock Bumper', desc: 'A shockwave that shoves and hurts everyone close.', cd: 6, r: 190, dmg: 30, knock: 520 },
  wisp: { name: 'Rail Lance', desc: 'A long-range beam straight ahead.', cd: 6, range: 1150, width: 26, dmg: 55 },
  dune: { name: 'Sand Mines', desc: 'Drops a mine behind you (up to 3).', cd: 4.5, dmg: 40, slow: 1.3, max: 3, life: 25, r: 40, arm: 0.6 },
  rook: { name: 'Sentry Turret', desc: 'Drops a turret that fires at racers near it.', cd: 9, life: 4, range: 420, rate: 0.8, dmg: 16, speed: 1100 },
  flicker: { name: 'Blink Slash', desc: 'Blinks forward, slicing anyone in the way.', cd: 6, dist: 260, width: 46, dmg: 40 },
};

// Combat rules shared by the server and the client (timings the HUD shows).
export const COMBAT = {
  protect: 2, // s: after a rival's hit (damage or a spin-out), no rival can damage or spin you
  bigSpin: 0.5, // s of spin-out on a BIG hit (missile II+, sticky bomb, trap, crush) when the item names none
  empMissile: 1.5, // COMBO: a missile on an EMP-ed racer does this much more damage
  dodgeWin: 0.45, // s: a drift started this recently, with the missile inside its dodge range, shakes it
  trapR: 1.7, trapLife: 18, trapDmg: 34, trapSpin: 1.1, trapSlow: 1.8, trapHits: 4, // COMBO: oil + spikes overlapping
};
