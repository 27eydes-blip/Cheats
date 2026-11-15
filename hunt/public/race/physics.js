// Hunt Racers car physics, shared by the authoritative server sim and the client's own-car
// prediction. stepCar() is a pure function of (car state, input, driver stats, track, dt): run the
// same inputs from the same state and you get the same car, so the client can replay its unacked
// inputs on top of every server snapshot (same netcode idea as the shooter).
//
// Model: arcade top-down car. Velocity is split into forward and sideways parts; grip bleeds off
// the sideways part (low grip = slide). Drifting cuts grip and biases the turn; holding it charges
// three spark tiers and letting go fires a mini-turbo. Boosts raise the speed cap for a while.
// Ramps launch the car (airborne: no steering, no ground effects). Walls push out and bounce.

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
  volt: { name: 'Volt', car: 'Static Comet', role: 'All-rounder', top: 800, accel: 640, handling: 3.05, grip: 8.2, armor: 100, mass: 1.0, rough: 1, color: '#ffd23f', accent: '#3a86ff' },
  brick: { name: 'Brick', car: 'Iron Mule', role: 'Heavy', top: 790, accel: 580, handling: 2.85, grip: 8.8, armor: 150, mass: 1.55, rough: 0.85, color: '#ff7b39', accent: '#6b4226' },
  wisp: { name: 'Wisp', car: 'Ghostline', role: 'Speed', top: 840, accel: 590, handling: 2.98, grip: 7.8, armor: 80, mass: 0.8, rough: 1.1, color: '#5ef2c6', accent: '#8f5cff' },
  dune: { name: 'Dune', car: 'Dust Strider', role: 'Off-road', top: 795, accel: 610, handling: 2.95, grip: 8.4, armor: 110, mass: 1.05, rough: 0.5, color: '#e8b04a', accent: '#2a9d8f' },
  rook: { name: 'Rook', car: 'Bastion', role: 'Defender', top: 792, accel: 585, handling: 2.95, grip: 8.4, armor: 130, mass: 1.3, rough: 0.9, color: '#7fa34a', accent: '#ff8c1a' },
  flicker: { name: 'Flicker', car: 'Quickstitch', role: 'Handling', top: 805, accel: 700, handling: 3.35, grip: 7.6, armor: 85, mass: 0.85, rough: 1, color: '#c04dff', accent: '#ff5fa2' },
};
export const DRIVER_IDS = Object.keys(DRIVERS);

// drifting
export const DRIFT_MIN_SPEED = 330; // need this much speed to start a drift
export const DRIFT_KEEP_SPEED = 220; // a drift ends (no reward) below this
export const DRIFT_TIERS = [0.7, 1.4, 2.2]; // seconds of charge for blue / orange / purple sparks
export const MINI_TURBO = [null, { t: 0.45, p: 1.2 }, { t: 0.8, p: 1.27 }, { t: 1.25, p: 1.34 }];
export const BOOSTS = { pad: { t: 0.9, p: 1.32 }, turbo: { t: 1.6, p: 1.45 }, bounty: { t: 1.2, p: 1.36 } };
export const SLOW_MUL = 0.62;
export const BOOST_ACCEL = 1500;
export const AIR_PER_SPEED = 1 / 1150; // ramp air time = speed * this (s): jump length grows with speed^2
const BRAKE = 1500, COAST = 140, REVERSE_TOP = 0.32, WALL_E = 0.35;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => (a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a);

export function newCar(x = 0, y = 0, a = 0) {
  return { x, y, a, vx: 0, vy: 0, drift: 0, dc: 0, boostT: 0, boostP: 1, airT: 0, spinT: 0, spinDir: 1, slowT: 0, surf: 'road', pc: -1, ps: 0, pd: 0 };
}
export const driftTier = (dc) => (dc >= DRIFT_TIERS[2] ? 3 : dc >= DRIFT_TIERS[1] ? 2 : dc >= DRIFT_TIERS[0] ? 1 : 0);

// stack a boost: the longer and the stronger of the two win
export function addBoost(car, b) {
  car.boostP = car.boostT > 0 ? Math.max(car.boostP, b.p) : b.p;
  car.boostT = Math.max(car.boostT, b.t);
}

// sanitize a client input (untrusted) into {st, th, dr}
export function cleanInput(m) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, -1, 1) : 0);
  return { st: n(m.st), th: n(m.th), dr: m.dr ? 1 : 0 };
}

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
  const S = SURF[PR.surf] || SURF.road;
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
    // STEERING: none at a standstill, a bit less at high speed
    const turn = st.handling * clamp(spd / 240, 0, 1) * (1 - 0.3 * clamp((spd - 450) / 450, 0, 1)) * S.turn;
    // DRIFT: start by holding drift while steering at speed; release fires the mini-turbo
    if (car.drift === 0 && inp.dr && Math.abs(inp.st) > 0.35 && vf > DRIFT_MIN_SPEED) { car.drift = inp.st > 0 ? 1 : -1; car.dc = 0; }
    if (car.drift !== 0) {
      if (!inp.dr || vf < DRIFT_KEEP_SPEED) {
        const tier = vf >= DRIFT_KEEP_SPEED ? driftTier(car.dc) : 0;
        if (tier) { addBoost(car, MINI_TURBO[tier]); if (ev) ev.turbo = tier; }
        car.drift = 0; car.dc = 0;
      } else {
        // steering into the drift tightens it, against it widens it
        car.a = wrap(car.a + car.drift * turn * (0.62 + 0.5 * inp.st * car.drift) * dt);
        car.dc += dt * (0.75 + 0.5 * Math.abs(inp.st));
        grip *= 0.6; drag = 0.12;
      }
    }
    if (car.drift === 0) car.a = wrap(car.a + inp.st * turn * dt * (vf < -5 ? -1 : 1));
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
  if (vf > max) vf = max + (vf - max) * Math.exp(-2.5 * dt); // over the cap (boost ended, rough ground)
  vl *= Math.exp(-grip * dt);
  car.vx = vf * hx - vl * hy;
  car.vy = vf * hy + vl * hx;
  move(car, T, dt, ev);
  // ground effects of where we ended up
  if (car.airT <= 0) {
    if (PR.pad) { addBoost(car, BOOSTS.pad); if (ev) ev.pad = 1; }
    if (PR.ramp) {
      const fv = car.vx * hx + car.vy * hy;
      if (fv > 200) { car.airT = clamp(fv * AIR_PER_SPEED * (PR.ramp.pow || 1), 0.25, 1.4); if (ev) ev.launch = 1; }
    }
  }
  return car;
}

// move with substeps so a fast car never tunnels through a wall; bounce off what it hits
function move(car, T, dt, ev) {
  const dx = car.vx * dt, dy = car.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (CAR_R * 0.7)));
  for (let k = 0; k < steps; k++) {
    car.x += dx / steps; car.y += dy / steps;
    for (let it = 0; it < 3; it++) {
      T.probe(car.x, car.y, CAR_R, PR);
      if (PR.pen <= 0) break;
      car.x += PR.nx * PR.pen; car.y += PR.ny * PR.pen;
      const vn = car.vx * PR.nx + car.vy * PR.ny;
      if (vn < 0) {
        car.vx -= (1 + WALL_E) * vn * PR.nx; car.vy -= (1 + WALL_E) * vn * PR.ny;
        if (-vn > 100) { car.vx *= 0.92; car.vy *= 0.92; }
        if (-vn > 320) { car.drift = 0; car.dc = 0; }
        if (ev && -vn > (ev.wall || 0)) ev.wall = -vn;
      }
    }
  }
  T.probe(car.x, car.y, CAR_R, PR);
  car.surf = PR.surf; car.pc = PR.c; car.ps = PR.s; car.pd = PR.d;
}

// car-to-car bump: push apart by mass, bounce along the contact normal. Returns impact speed.
export function collideCars(a, b, ma, mb) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, R = CAR_R * 2;
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
export const STATE_KEYS = ['x', 'y', 'a', 'vx', 'vy', 'drift', 'dc', 'boostT', 'boostP', 'airT', 'spinT', 'spinDir', 'slowT'];
const SCALE = [100, 100, 10000, 100, 100, 1, 1000, 1000, 1000, 1000, 1000, 1, 1000];
export function packState(car) { return STATE_KEYS.map((k, i) => Math.round(car[k] * SCALE[i]) / SCALE[i]); }
export function unpackState(arr, car = newCar()) { STATE_KEYS.forEach((k, i) => { car[k] = arr[i]; }); return car; }
export const speedOf = (car) => Math.hypot(car.vx, car.vy);
