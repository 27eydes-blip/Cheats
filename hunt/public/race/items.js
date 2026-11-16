// Hunt Racers pickups and each driver's built-in weapon (definitions shared by server and client).
// The server (src/race/sim.js) applies the effects; the client uses names, icons and timings.

// Pickups from item boxes. Plain descriptive names (original, not branded).
export const ITEMS = {
  missile: { name: 'Homing Missile', desc: 'Locks on to the racer ahead.', dmg: 60, speed: 1350, turn: 3.4, life: 4, spin: 0.4 },
  oil: { name: 'Oil Slick', desc: 'Drop it behind you. Racers who hit it spin out.', r: 48, life: 20, spin: 0.9 },
  shield: { name: 'Shield', desc: 'Blocks the next hit for 5 seconds.', t: 5 },
  rockets: { name: 'Rocket Volley', desc: 'Three rockets straight ahead.', n: 3, spread: 0.07, speed: 1700, dmg: 26, life: 1.1 },
  emp: { name: 'EMP Blast', desc: 'Shuts down nearby racers\' items and weapons and slows them.', r: 460, t: 2.5, slow: 1.2 },
  turbo: { name: 'Turbo', desc: 'A big burst of speed.' },
  spikes: { name: 'Spike Strip', desc: 'A strip of spikes behind you. Hurts and slows.', half: 78, life: 15, dmg: 25, slow: 1.5, hits: 3 },
};
export const ITEM_IDS = Object.keys(ITEMS); // index = wire id (append only)

// Item odds by race position: weights at the front, middle and back of the pack (interpolated).
// Leaders get defensive items, the back of the pack gets the ones that catch you up.
export const ODDS = {
  //          missile oil shield rockets emp turbo spikes
  front: [0, 30, 25, 15, 0, 5, 25],
  mid: [18, 14, 14, 20, 8, 14, 12],
  back: [30, 3, 10, 15, 15, 25, 2],
  battle: [20, 12, 14, 22, 12, 6, 14],
};
// pick an item. place: 1-based race position, n: racers, r: a random number in [0, 1)
export function rollItem(place, n, r, battle = false) {
  let w;
  if (battle) w = ODDS.battle;
  else {
    const f = n > 1 ? (place - 1) / (n - 1) : 0; // 0 = leader, 1 = last
    const [a, b, t] = f < 0.5 ? [ODDS.front, ODDS.mid, f * 2] : [ODDS.mid, ODDS.back, (f - 0.5) * 2];
    w = a.map((v, i) => v + (b[i] - v) * t);
  }
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
