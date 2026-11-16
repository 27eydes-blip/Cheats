// Hunt Racers car physics, shared by the authoritative server sim and the client's own-car
// prediction. stepCar() is a pure function of (car state, input, driver stats, track, dt): run the
// same inputs from the same state and you get the same car, so the client can replay its unacked
// inputs on top of every server snapshot (same netcode idea as the shooter).
//
// Model: arcade top-down car. Velocity is split into forward and sideways parts; grip bleeds off
// the sideways part (low grip = slide). Drifting cuts grip and biases the turn; holding it charges
// three spark tiers and letting go fires a mini-turbo. Boosts raise the speed cap for a while.
// Ramps launch the car (airborne: no steering, no ground effects). Walls take away the speed into
// the wall and keep the speed along it (the car slides along), turning a car that hit nose-first
// toward the wall's direction so it can drive on.
//
// Steering comes two ways: `st` (-1..1, keys / gamepad / bots: a turn rate) or a target heading
// `ha` (radians, world frame) with stick magnitude `hm` (0..1) from the touch joystick: the nose
// turns toward ha at a rate proportional to the error (never past it), capped by hm, the speed
// based turn rate and the player's sensitivity `sens` (0.5..1.5).

export const TICK_RATE = 30; // see PROTOCOL.md: 30 Hz halves per-tick travel at racing speed vs 20 Hz
export const DT = 1 / TICK_RATE;
export const CAR_R = 22; // collision radius (cars are ~48 x 28 px)

// Surfaces: multipliers on grip / acceleration / top speed / steering.
// dmg = damage per second while grounded on it; fall = grounded = destroyed.
export const SURF = {
  road: { grip: 1, accel: 1, top: 1, turn: 1 },
  offroad: { grip: 0.85, accel: 0.55, top: 0.55, turn: 0.9, rough: 1 },
  sand: { grip: 0.75, accel: 0.68, top: 0.7, turn: 0.9, rough: 1 },
  snow: { grip: 0.7, accel: 0.6, top: 0.62, turn: 0.85, rough: 1 },
  ice: { grip: 0.13, accel: 0.55, top: 1, turn: 0.72 },
  lava: { grip: 0.9, accel: 0.85, top: 0.85, turn: 1, dmg: 240 },
  pit: { grip: 1, accel: 0, top: 0.3, turn: 0, fall: 1 },
};

// The six drivers and their vehicles. Points budget: top speed, acceleration, handling and armor
// trade off so lap times stay within a few percent (test/race-physics.test.js checks this).
//   top: px/s   accel: px/s^2   handling: rad/s at speed   grip: sideways bleed /s   armor: HP
//   mass: car-to-car shove weight   rough: off-road penalty scale (1 = normal, lower = shrugs it off)
export const DRIVERS = {
  volt: { name: 'Volt', car: 'Static Comet', role: 'All-rounder', top: 812, accel: 640, handling: 3.05, grip: 8.2, armor: 100, mass: 1.0, rough: 1, color: '#ffd23f', accent: '#3a86ff' },
  brick: { name: 'Brick', car: 'Iron Mule', role: 'Heavy', top: 805, accel: 580, handling: 2.85, grip: 8.8, armor: 150, mass: 1.55, rough: 0.85, color: '#ff7b39', accent: '#6b4226' },
  wisp: { name: 'Wisp', car: 'Ghostline', role: 'Speed', top: 807, accel: 590, handling: 2.98, grip: 7.8, armor: 80, mass: 0.8, rough: 1.1, color: '#5ef2c6', accent: '#8f5cff' },
  dune: { name: 'Dune', car: 'Dust Strider', role: 'Off-road', top: 816, accel: 610, handling: 2.95, grip: 8.4, armor: 110, mass: 1.05, rough: 0.5, color: '#e8b04a', accent: '#2a9d8f' },
  rook: { name: 'Rook', car: 'Bastion', role: 'Defender', top: 827, accel: 585, handling: 2.95, grip: 8.4, armor: 130, mass: 1.3, rough: 0.9, color: '#7fa34a', accent: '#ff8c1a' },
  flicker: { name: 'Flicker', car: 'Quickstitch', role: 'Handling', top: 828, accel: 700, handling: 3.35, grip: 7.6, armor: 85, mass: 0.85, rough: 1, color: '#c04dff', accent: '#ff5fa2' },
};
export const DRIVER_IDS = Object.keys(DRIVERS); // the six starter cars (bots drive these)

// The 8 unlockable cars (Oblivion GP Part 4, unlocks: public/race/unlocks.js). Same stat budget as
// the six above (head-to-head 1v1 bot races, every car 45-55%: test/race-cars-balance.test.js),
// each with ONE small passive perk, read by stepCar (here) or the sim:
//   dcMul     drift sparks charge this much faster (VOIDRUNNER)
//   boostLen  every boost (pads, mini-turbos, Turbo, bursts) lasts this much longer (SOLAR FANG)
//   iceGrip   ice drives like road and oil never spins it (FROSTBYTE)
//   magnet    item boxes within this many px fly to the car (GRAVITON)
//   phase     once per race, the first rival hit passes straight through (PHANTOM VX)
//   wcdMul    the built-in weapon recharges this much faster (HELIX: 0.75 = 25% faster)
//   REDLINE ZERO: the top speed leader that turns wide; OBLIVION PRIME: the best all-round stats.
// hit: the hitbox as a capsule along the car, total length l x width w (px), sized to the art
// (the six starters are the old round 2 x CAR_R). Walls use CAR_R for every car (soft guard walls).
export const NEW_DRIVERS = {
  void: { name: 'Voidrunner', car: 'Voidrunner', role: 'Drifter', top: 783, accel: 630, handling: 3.12, grip: 7.9, armor: 88, mass: 0.9, rough: 1, color: '#8a3dff', accent: '#dcbcff', perk: 'drift', dcMul: 1.2, hit: { l: 54, w: 36 } },
  fang: { name: 'Solar Fang', car: 'Solar Fang', role: 'Booster', top: 803, accel: 620, handling: 3.0, grip: 8.2, armor: 100, mass: 1.0, rough: 1, color: '#ff8c14', accent: '#ffe27a', perk: 'boost', boostLen: 1.25, hit: { l: 54, w: 40 } },
  frost: { name: 'Frostbyte', car: 'Frostbyte', role: 'Sure-footed', top: 810, accel: 615, handling: 3.0, grip: 8.4, armor: 105, mass: 1.05, rough: 0.9, color: '#56d6ff', accent: '#eafcff', perk: 'grip', iceGrip: 1, hit: { l: 52, w: 34 } },
  grav: { name: 'Graviton', car: 'Graviton', role: 'Collector', top: 825, accel: 612, handling: 3.05, grip: 8.0, armor: 108, mass: 1.1, rough: 0.6, color: '#2bffb0', accent: '#d0fff0', perk: 'magnet', magnet: 120, hit: { l: 46, w: 46 } },
  vx: { name: 'Phantom VX', car: 'Phantom VX', role: 'Phantom', top: 814, accel: 628, handling: 3.05, grip: 8.0, armor: 84, mass: 0.85, rough: 1, color: '#a9b6ff', accent: '#ffffff', perk: 'phase', phase: 1, hit: { l: 56, w: 36 } },
  redline: { name: 'Redline Zero', car: 'Redline Zero', role: 'Top speed', top: 846, accel: 500, handling: 2.1, grip: 7.6, armor: 90, mass: 0.95, rough: 1.05, color: '#ff2438', accent: '#ffffff', perk: 'redline', hit: { l: 70, w: 28 } },
  helix: { name: 'Helix', car: 'Helix', role: 'Gunner', top: 794, accel: 620, handling: 3.04, grip: 8.2, armor: 104, mass: 1.05, rough: 1, color: '#ff4fd8', accent: '#46f4ff', perk: 'recharge', wcdMul: 0.75, hit: { l: 52, w: 42 } },
  prime: { name: 'Oblivion Prime', car: 'Oblivion Prime', role: 'All-rounder+', top: 826, accel: 690, handling: 3.3, grip: 7.8, armor: 64, mass: 0.8, rough: 1, color: '#e6e2ff', accent: '#ff5ad1', perk: 'prime', hit: { l: 54, w: 40 } },
};
export const NEW_DRIVER_IDS = Object.keys(NEW_DRIVERS);
Object.assign(DRIVERS, NEW_DRIVERS);
export const ALL_DRIVER_IDS = [...DRIVER_IDS, ...NEW_DRIVER_IDS]; // every car, starters first
// hitbox capsule per driver: hr = radius, hs = half the straight part (0 = a circle of CAR_R)
for (const d of ALL_DRIVER_IDS) {
  const D = DRIVERS[d], h = D.hit;
  D.hr = h ? h.w / 2 : CAR_R; D.hs = h ? Math.max(0, h.l / 2 - h.w / 2) : 0;
}

// drifting
export const DRIFT_MIN_SPEED = 330; // need this much speed to start a drift
export const DRIFT_KEEP_SPEED = 220; // a drift ends (no reward) below this
export const DRIFT_TIERS = [0.7, 1.4, 2.2]; // seconds of charge for blue / orange / purple sparks
export const MINI_TURBO = [null, { t: 0.45, p: 1.2 }, { t: 0.8, p: 1.27 }, { t: 1.25, p: 1.34 }];
export const BOOSTS = { pad: { t: 0.9, p: 1.32 }, turbo: { t: 1.6, p: 1.45 }, bounty: { t: 1.2, p: 1.36 } };
export const SLOW_MUL = 0.62;
export const BOOST_ACCEL = 1500;
export const AIR_PER_SPEED = 1 / 1150; // ramp air time = speed * this (s): jump length grows with speed^2
export const DRIFT_RAMP = 0.2; // the slide builds in over this long (no snap into a drift)
export const DRIFT_GRACE = 0.3; // early in a drift: the direction follows a corrected stick, a speed dip doesn't end it
const DRIFT_TIGHT = 1.1, DRIFT_BASE = 0.7, DRIFT_WIDE = 0.4; // drift turn rate (x turn): full in / neutral / full against
const DRIFT_CARRY = 0.35; // share of the slide speed grip takes off that a drift carries forward (drifts keep their pace)
export const HM_DEAD = 0.15; // stick magnitude below this: no heading steering
export const HEAD_K = 8; // heading steering: turn rate per radian of error (/s); HEAD_K * DT < 1 = no overshoot
export const WALL_LOSS = 0.12; // speed lost along the wall on a full-on hit (less on a graze), once per hit
const WALL_REHIT = 0.3; // s free of the wall before a touch counts as a new hit (scraping costs nothing more)
const WALL_ALIGN = 4; // rad/s: how fast a car pressed nose-first into a wall turns along it
const BRAKE = 1500, COAST = 140, REVERSE_TOP = 0.32;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => (a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a);

export function newCar(x = 0, y = 0, a = 0) {
  // dg: drift age (s), wh: time since the last wall touch (s, capped), wall: touching a wall this step
  return { x, y, a, vx: 0, vy: 0, drift: 0, dc: 0, boostT: 0, boostP: 1, airT: 0, spinT: 0, spinDir: 1, slowT: 0, dg: 0, wh: 1, surf: 'road', pc: -1, ps: 0, pd: 0, wall: 0 };
}
export const driftTier = (dc) => (dc >= DRIFT_TIERS[2] ? 3 : dc >= DRIFT_TIERS[1] ? 2 : dc >= DRIFT_TIERS[0] ? 1 : 0);

// stack a boost: the longer and the stronger of the two win
// (st: the driver: SOLAR FANG's boosts last st.boostLen times as long)
export function addBoost(car, b, st = null) {
  car.boostP = car.boostT > 0 ? Math.max(car.boostP, b.p) : b.p;
  car.boostT = Math.max(car.boostT, b.t * ((st && st.boostLen) || 1));
}

// sanitize a client input (untrusted) into {st, th, dr, ha, hm}; ha null = no heading steering
export function cleanInput(m) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, -1, 1) : 0);
  const ha = typeof m.ha === 'number' && Number.isFinite(m.ha) && Math.abs(m.ha) < 100 ? wrap(Math.atan2(Math.sin(m.ha), Math.cos(m.ha))) : null;
  return { st: n(m.st), th: n(m.th), dr: m.dr ? 1 : 0, ha, hm: ha == null ? 0 : clamp(n(m.hm), 0, 1) };
}
export const cleanSens = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0.5, 1.5) : 1);

const PR = {};
// Advance one car by dt. ev (optional) collects what happened: wall impact speed, ramp launch,
// landing, pad, mini-turbo tier fired.
export function stepCar(car, inp, st, T, dt = DT, ev = null) {
  let hx = Math.cos(car.a), hy = Math.sin(car.a);
  let vf = car.vx * hx + car.vy * hy;
  if (car.boostT > 0) car.boostT = Math.max(0, car.boostT - dt);
  if (car.slowT > 0) car.slowT = Math.max(0, car.slowT - dt);
  if (car.airT > 0) {
    // AIRBORNE: no steering, no throttle, no grip; keep flying
    car.airT -= dt;
    if (car.airT <= 0) { car.airT = 0; if (ev) ev.land = 1; }
    move(car, T, dt, ev);
    return car;
  }
  T.probe(car.x, car.y, CAR_R, PR); // the surface under us right now (no hidden state)
  let S = SURF[PR.surf] || SURF.road;
  if (S === SURF.ice && st.iceGrip) S = SURF.road; // FROSTBYTE: ice drives like road
  const rough = S.rough ? st.rough : 1; // off-road penalty scaled by the driver
  const topMul = 1 - (1 - S.top) * rough, accMul = 1 - (1 - S.accel) * rough;
  let max = st.top * topMul * (car.slowT > 0 ? SLOW_MUL : 1);
  if (car.boostT > 0) max *= car.boostP;
  const spd = Math.abs(vf);
  let grip = st.grip * S.grip, drag = 0;

  if (car.spinT > 0) {
    // SPUN OUT (oil): no control, the car twirls and loses speed
    car.spinT = Math.max(0, car.spinT - dt);
    car.a = wrap(car.a + car.spinDir * 9 * dt);
    grip *= 0.25; drag = 1.6;
    car.drift = 0; car.dc = 0;
  } else {
    // STEERING: none at a standstill, a bit less at high speed (tighter circles slow, wider fast)
    const turn = st.handling * clamp(spd / 240, 0, 1) * (1 - 0.3 * clamp((spd - 450) / 450, 0, 1)) * S.turn;
    // heading steering (joystick): s is the equivalent steer, from the error to the target heading
    const head = inp.ha != null && inp.hm > HM_DEAD;
    let s = inp.st, err = 0, cap = 1;
    if (head) {
      err = wrap(inp.ha - car.a);
      cap = (0.35 + 0.65 * clamp((inp.hm - HM_DEAD) / 0.6, 0, 1)) * cleanSens(inp.sens);
      s = clamp((err * HEAD_K) / Math.max(turn, 0.5), -cap, cap);
    }
    // DRIFT: start by holding drift while steering at speed; release fires the mini-turbo
    if (car.drift === 0 && inp.dr && Math.abs(s) > 0.35 && vf > DRIFT_MIN_SPEED) { car.drift = s > 0 ? 1 : -1; car.dc = 0; car.dg = 0; }
    if (car.drift !== 0) {
      const early = car.dg < DRIFT_GRACE;
      if (!inp.dr || (vf < DRIFT_KEEP_SPEED && !early)) {
        const tier = vf >= DRIFT_KEEP_SPEED ? driftTier(car.dc) : 0;
        if (tier) { addBoost(car, MINI_TURBO[tier], st); if (ev) ev.turbo = tier; }
        car.drift = 0; car.dc = 0; car.dg = 0;
      } else {
        // grace: a stick corrected hard the other way right after the start flips the drift
        if (early && s * car.drift < -0.5) car.drift = -car.drift;
        car.dg = Math.min(1, car.dg + dt);
        const ramp = clamp(car.dg / DRIFT_RAMP, 0, 1), sd = clamp(s * car.drift, -1, 1); // + into the drift, - against
        let rel; // turn rate in the drift's direction
        if (head) rel = clamp(err * car.drift * HEAD_K, -DRIFT_WIDE * turn, DRIFT_TIGHT * turn * Math.min(1, cap)); // the nose follows the stick, never past it
        else rel = turn * (sd >= 0 ? DRIFT_BASE + (DRIFT_TIGHT - DRIFT_BASE) * sd : DRIFT_BASE + (DRIFT_BASE - DRIFT_WIDE) * sd);
        // the slide blends in from normal steering
        car.a = wrap(car.a + (car.drift * rel * ramp + s * turn * (1 - ramp)) * dt);
        car.dc += dt * (0.75 + 0.5 * (head ? Math.min(1, inp.hm) : Math.abs(sd))) * (st.dcMul || 1);
        grip *= 1 - 0.4 * ramp; drag = 0.12 * ramp;
      }
    }
    if (car.drift === 0) car.a = wrap(car.a + s * turn * dt * (vf < -5 && !head ? -1 : 1));
  }
  // the velocity stays put while the nose turns: split it in the NEW heading's frame, so the
  // sideways part (the slide) is what grip bleeds off
  hx = Math.cos(car.a); hy = Math.sin(car.a);
  vf = car.vx * hx + car.vy * hy;
  let vl = car.vx * -hy + car.vy * hx;
  if (car.spinT <= 0) {
    // THROTTLE / BRAKE / REVERSE
    const th = inp.th;
    if (th > 0) {
      if (vf < max) vf = Math.min(max, vf + st.accel * accMul * (1 - 0.55 * clamp(vf / max, 0, 1)) * th * dt + (car.boostT > 0 ? BOOST_ACCEL * dt : 0));
    } else if (th < 0) {
      if (vf > 30) vf = Math.max(0, vf + BRAKE * th * dt);
      else vf = Math.max(-st.top * REVERSE_TOP, vf + st.accel * 0.6 * th * dt);
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), COAST * dt);
      if (car.boostT > 0 && vf < max) vf = Math.min(max, vf + BOOST_ACCEL * dt);
    }
  }
  if (drag) vf *= Math.exp(-drag * dt);
  const vl0 = vl;
  if (car.wh < 0.07) grip *= 0.35; // against a wall: slide along it, grip would only steer the speed into it
  vl *= Math.exp(-grip * dt);
  if (car.drift && vf > 0) vf = Math.min(Math.max(vf, max), vf + (Math.abs(vl0) - Math.abs(vl)) * DRIFT_CARRY * clamp(car.dg / DRIFT_RAMP, 0, 1));
  if (vf > max) vf = max + (vf - max) * Math.exp(-2.5 * dt); // over the cap (boost ended, rough ground)
  car.vx = vf * hx - vl * hy;
  car.vy = vf * hy + vl * hx;
  move(car, T, dt, ev);
  // nose-first into a wall: turn along it (the way the car already leans, else the way the track
  // goes) so throttle drives the car on instead of pinning it
  if (car.wall && car.spinT <= 0) {
    hx = Math.cos(car.a); hy = Math.sin(car.a);
    const into = -(hx * WN.nx + hy * WN.ny); // 1 = straight at the wall
    if (into > -0.04 && car.vx * hx + car.vy * hy > -5) {
      let tx = -WN.ny, ty = WN.nx, side = hx * tx + hy * ty;
      if (Math.abs(side) < 0.15) side = WN.fx * tx + WN.fy * ty || 1; // head-on: the track's direction
      if (side < 0) { tx = -tx; ty = -ty; }
      // aim a touch away from the wall so the car leaves it instead of scraping forever
      const da = wrap(Math.atan2(ty + WN.ny * 0.1, tx + WN.nx * 0.1) - car.a), r = WALL_ALIGN * Math.max(into, 0.35) * dt;
      car.a = wrap(car.a + clamp(da, -r, r));
    }
  }
  // ground effects of where we ended up
  if (car.airT <= 0) {
    if (PR.pad) { addBoost(car, BOOSTS.pad, st); if (ev) ev.pad = 1; }
    if (PR.ramp) {
      const fv = car.vx * hx + car.vy * hy;
      if (fv > 200) { car.airT = clamp(fv * AIR_PER_SPEED * (PR.ramp.pow || 1), 0.25, 1.4); if (ev) ev.launch = 1; }
    }
  }
  return car;
}

// contact of the last wall touch in move(): normal (out of the wall) and the track's forward direction there
const WN = { nx: 0, ny: 0, fx: 0, fy: 0 };
// move with substeps (each well under a car radius) so a fast car never tunnels through a wall or
// a pillar. A wall takes the speed into it (no bounce: a rebound would only carry the car off the
// wall before it turns along it) and keeps the speed along it; a new hit (not every tick of a
// scrape) costs up to WALL_LOSS of that.
function move(car, T, dt, ev) {
  car.wall = 0;
  car.wh = Math.min(1, car.wh + dt);
  for (let k = 0, steps = 1; k < steps; k++) {
    // velocity can change on a hit: re-plan the rest of the move from the remaining time
    const rem = dt * (1 - k / steps), dx = car.vx * rem, dy = car.vy * rem;
    if (k === 0) steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (CAR_R * 0.6)));
    const left = steps - k;
    car.x += dx / left; car.y += dy / left;
    for (let it = 0; it < 4; it++) {
      T.probe(car.x, car.y, CAR_R, PR);
      if (PR.pen <= 0) break;
      car.x += PR.nx * PR.pen; car.y += PR.ny * PR.pen;
      car.wall = 1;
      WN.nx = PR.nx; WN.ny = PR.ny;
      if (PR.c >= 0) { const c = T.corridors[PR.c]; WN.fx = c.tx[PR.i]; WN.fy = c.ty[PR.i]; } else if (T.box) { WN.fx = (T.box.x1 + T.box.x0) / 2 - car.x; WN.fy = (T.box.y1 + T.box.y0) / 2 - car.y; } else { WN.fx = WN.fy = 0; }
      const vn = car.vx * PR.nx + car.vy * PR.ny;
      if (vn < 0) {
        car.vx -= vn * PR.nx; car.vy -= vn * PR.ny;
        if (car.wh >= WALL_REHIT) { const keep = 1 - WALL_LOSS * clamp(-vn / 400, 0.15, 1); car.vx *= keep; car.vy *= keep; }
        if (-vn > 320) { car.drift = 0; car.dc = 0; car.dg = 0; }
        if (ev && -vn > (ev.wall || 0)) ev.wall = -vn;
      }
      car.wh = 0;
    }
  }
  T.probe(car.x, car.y, CAR_R, PR);
  car.surf = PR.surf; car.pc = PR.c; car.ps = PR.s; car.pd = PR.d;
}

// closest points of two car hitbox capsules (axis segments): writes CP = {ax, ay, bx, by}
const CP = { ax: 0, ay: 0, bx: 0, by: 0 };
export function capsulePoints(a, ha, b, hb, out = CP) {
  const ux = Math.cos(a.a) * ha, uy = Math.sin(a.a) * ha, vx = Math.cos(b.a) * hb, vy = Math.sin(b.a) * hb;
  // segments a + s*u, b + t*v with s, t in [-1, 1]
  const rx = a.x - b.x, ry = a.y - b.y, A = ux * ux + uy * uy, E = vx * vx + vy * vy, F = vx * rx + vy * ry;
  let s = 0, t = 0;
  if (A < 1e-9 && E < 1e-9) { s = t = 0; } else if (A < 1e-9) { t = clamp(F / E, -1, 1); } else {
    const C = ux * rx + uy * ry;
    if (E < 1e-9) s = clamp(-C / A, -1, 1);
    else {
      const B = ux * vx + uy * vy, den = A * E - B * B;
      s = den > 1e-9 ? clamp((B * F - C * E) / den, -1, 1) : 0;
      t = clamp((B * s + F) / E, -1, 1);
      s = clamp((B * t - C) / A, -1, 1);
    }
  }
  out.ax = a.x + ux * s; out.ay = a.y + uy * s; out.bx = b.x + vx * t; out.by = b.y + vy * t;
  return out;
}
// car-to-car bump: push apart by mass, bounce along the contact normal. Returns impact speed.
// sa / sb: the drivers (hitbox capsules hr, hs); without them both are circles of CAR_R.
export function collideCars(a, b, ma, mb, sa = null, sb = null) {
  const ha = sa ? sa.hs : 0, hb = sb ? sb.hs : 0, R = (sa ? sa.hr : CAR_R) + (sb ? sb.hr : CAR_R);
  let dx = b.x - a.x, dy = b.y - a.y;
  if (ha || hb) { const P = capsulePoints(a, ha, b, hb); dx = P.bx - P.ax; dy = P.by - P.ay; }
  const d2 = dx * dx + dy * dy;
  if (d2 >= R * R || d2 < 1e-9) return 0;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = R - d, wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * pen * wa; a.y -= ny * pen * wa; b.x += nx * pen * wb; b.y += ny * pen * wb;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return 0;
  const j = (-(1 + 0.5) * rv) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny; b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
  return -rv;
}

// ---- wire format for the own-car state (prediction needs all of it)
export const STATE_KEYS = ['x', 'y', 'a', 'vx', 'vy', 'drift', 'dc', 'boostT', 'boostP', 'airT', 'spinT', 'spinDir', 'slowT', 'dg', 'wh'];
const SCALE = [100, 100, 10000, 100, 100, 1, 1000, 1000, 1000, 1000, 1000, 1, 1000, 1000, 1000];
export function packState(car) { return STATE_KEYS.map((k, i) => Math.round(car[k] * SCALE[i]) / SCALE[i]); }
export function unpackState(arr, car = newCar()) { STATE_KEYS.forEach((k, i) => { car[k] = arr[i]; }); return car; }
export const speedOf = (car) => Math.hypot(car.vx, car.vy);
