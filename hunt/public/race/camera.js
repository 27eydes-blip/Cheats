// Oblivion GP race camera: the three views (Settings > Camera) and the maths they share. Pure
// functions and plain objects only (no DOM), so test/race-camera.test.js runs them in Node.
//
// CHASE (default): the world is drawn rotated so your car points up, a little below the middle of
//   the screen, and the world canvas is tilted back with a CSS 3D transform (perspective +
//   rotateX: the compositor does it, no per-pixel work for the page). It zooms out with speed,
//   swings into turns (the heading lags a little and the view leans toward the inside of the
//   bend), kicks back on boost, and shakes lightly on hits (never under Reduce Flashing).
// TOP-DOWN: the classic north-up view (no rotation, no tilt).
// COCKPIT: like Chase but low and close: your car sits at the bottom edge, a steeper tilt shows
//   the road ahead to the horizon, and the HUD draws your bonnet under the speedometer.
//
// The HUD, minimap, joystick and buttons are on their own un-tilted canvas above the world.
//
// STEERING with a rotating view: the joystick still sends `ha` in the WORLD frame (the server
// contract is unchanged). The stick's screen direction is turned into a world heading with the
// camera's current rotation, so "stick up" is always "where the car is pointing" in Chase and
// Cockpit, and "up the screen" in Top-down. The tilt foreshortens the ground vertically, so the
// stick's vertical part is stretched back by 1 / cos(tilt) first: a diagonal stick points along
// the diagonal you see on the road.
export const CAM_MODES = ['chase', 'top', 'cockpit'];
export const CAM_NAMES = { chase: 'CHASE', top: 'TOP-DOWN', cockpit: 'COCKPIT' };
const DEG = Math.PI / 180;
// tilt: rotateX angle; persp: CSS perspective distance (x screen height); anchorY: where the
// followed car sits on screen (0 top .. 1 bottom); cover: CSS scale so the tilted canvas still
// covers most of the screen (the rest is the theme's sky behind a fog band); zoom: x base zoom
export const CAM = {
  // top: ahead = how far the view runs ahead of your car (share of the screen, each axis): your car
  // sits back toward the edge you came from, so most of the screen is road you're driving into
  top: { rotate: false, tilt: 0, persp: 0, anchorY: 0.5, cover: 1, zoom: 1, speedZoom: 0.2, boostZoom: 0.07, kick: 0.03, ahead: 0.22 },
  chase: { rotate: true, tilt: 29 * DEG, persp: 1.75, anchorY: 0.64, cover: 1.14, zoom: 0.94, speedZoom: 0.2, boostZoom: 0.13, swing: 0.085, kick: 0.045, lag: 5.5 },
  cockpit: { rotate: true, tilt: 38 * DEG, persp: 2, anchorY: 0.92, cover: 1.25, zoom: 1, speedZoom: 0.16, boostZoom: 0.08, swing: 0.05, kick: 0.03, lag: 9 },
};
// THE BASE ZOOM for a W x H (CSS px) screen: a race camera, not a minimap. On a landscape phone
// (844 x 390) a car is ~63 px long (it was ~38), on a small phone (667 x 375) ~51 px, on a tablet
// or desktop ~80 px. The height counts double-ish: a short landscape screen still shows road.
// Speed then zooms out (up to speedZoom + boostZoom) for the rush and the extra road ahead.
export const baseZoomOf = (W, H) => clamp(Math.min(W, H * 2.1) / 740, 0.8, 1.35);
export const camMode = (v) => (CAM[v] ? v : 'top');
export const camCfg = (v) => CAM[camMode(v)];

const TAU = Math.PI * 2;
export const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// canvas angle = world angle + rot (rotating views put the camera heading straight up)
export const camRot = (cfg, heading) => (cfg.rotate ? -Math.PI / 2 - heading : 0);

// the joystick's screen angle -> world heading (`ha` on the wire)
export function stickToWorld(sa, cfg, heading) {
  if (!cfg.rotate) return sa;
  const gx = Math.cos(sa), gy = Math.sin(sa) / Math.cos(cfg.tilt); // undo the foreshortening
  return wrap(Math.atan2(gy, gx) - camRot(cfg, heading));
}
// a world heading -> the screen angle the stick has to point at (the inverse; the steering hint)
export function worldToStick(wa, cfg, heading) {
  if (!cfg.rotate) return wa;
  const ca = wa + camRot(cfg, heading);
  return wrap(Math.atan2(Math.sin(ca) * Math.cos(cfg.tilt), Math.cos(ca)));
}

// the CSS transform for the world canvas (W x H CSS px screen) and what the projection needs
export function tiltOf(cfg, W, H) {
  if (!cfg.tilt) return { css: '', origin: '', P: 0, ox: W / 2, oy: H / 2, s: 1, tilt: 0 };
  const P = Math.round(cfg.persp * H);
  return {
    css: `perspective(${P}px) rotateX(${(cfg.tilt / DEG).toFixed(2)}deg) scale(${cfg.cover})`,
    origin: `50% ${(cfg.anchorY * 100).toFixed(1)}%`,
    P, ox: W / 2, oy: H * cfg.anchorY, s: cfg.cover, tilt: cfg.tilt,
  };
}
// canvas CSS point (x, y) -> where it ends up on screen after the tilt (out: {x, y, k: scale there})
export function project(tl, x, y, out) {
  if (!tl.tilt) { out.x = x; out.y = y; out.k = 1; return out; }
  const u = (x - tl.ox) * tl.s, v = (y - tl.oy) * tl.s, w = 1 - (v * Math.sin(tl.tilt)) / tl.P;
  out.x = tl.ox + u / w; out.y = tl.oy + (v * Math.cos(tl.tilt)) / w; out.k = tl.s / w;
  return out;
}
// how much of the screen top the tilted canvas leaves to the sky (CSS px), for the fog band
export function skyGap(tl) { if (!tl.tilt) return 0; const o = project(tl, tl.ox, 0, {}); return Math.max(0, o.y); }

// ------------------------------------------------------------------ the moving camera
// newCam() state, stepped every frame by stepCam(cam, cfg, s, dt):
//   s = { a: car heading, spd, top: the car's top speed, boost: 0|1, spin: 0|1, snap: 1 = teleported,
//         reduce: Reduce Flashing }
// Out (all bounded): cam.h heading (radians), cam.sw sideways lean (-1..1 x cfg.swing of the screen
// width), cam.kick boost kick 0..1, cam.zk zoom multiplier, cam.yaw smoothed turn rate (rad/s)
export const newCam = () => ({ h: 0, init: false, sw: 0, kick: 0, zk: 1, yaw: 0, lastA: 0, boost: 0, lx: 0, ly: 0, lInit: false });
export const ZK_MIN = 0.7; // never zooms out more than this (cars stay readable)
export function stepCam(cam, cfg, s, dt) {
  if (!cam.init || s.snap) { cam.h = s.a; cam.lastA = s.a; cam.init = true; cam.yaw = 0; cam.sw = 0; }
  dt = clamp(dt, 0, 0.1);
  // turn rate of the car (rad/s), smoothed; spun out = ignored (no whirling view)
  const raw = dt > 0 ? wrap(s.a - cam.lastA) / dt : 0;
  cam.lastA = s.a;
  cam.yaw += ((s.spin ? 0 : clamp(raw, -6, 6)) - cam.yaw) * (1 - Math.exp(-dt * 8));
  if (cfg.rotate) {
    // the heading follows the car with a short lag (that lag is the swing into a bend); while spun
    // out it follows slowly, and never faster than 4.5 rad/s, so the world doesn't whirl around
    const k = s.spin ? 1.4 : cfg.lag, err = wrap(s.a - cam.h), step = err * (1 - Math.exp(-dt * k));
    cam.h = wrap(cam.h + clamp(step, -4.5 * dt, 4.5 * dt));
    if (Math.abs(wrap(s.a - cam.h)) > 1.2 && !s.spin) cam.h = wrap(s.a - Math.sign(wrap(s.a - cam.h)) * 1.2); // never more than ~70 degrees behind
    // lean toward the inside of the bend: the car slides toward the outside of the screen
    const want = clamp((-cam.yaw * Math.min(1, s.spd / 600)) / 2.2, -1, 1);
    cam.sw += (want - cam.sw) * (1 - Math.exp(-dt * 3));
  } else { cam.h = 0; cam.sw = 0; }
  // boost: a kick back (the car is pushed down the screen, the view widens), easing out
  if (s.boost && !cam.boost) cam.kick = 1;
  cam.boost = s.boost ? 1 : 0;
  cam.kick = Math.max(0, cam.kick - dt * 1.6);
  // zoom out with speed, more while boosting (the wider "FOV"); eased
  const sp = clamp((s.spd - 300) / Math.max(200, (s.top || 900) * 1.1 - 300), 0, 1);
  const tz = clamp(1 - cfg.speedZoom * sp - (s.boost ? cfg.boostZoom : 0) - (cfg.kick ? cam.kick * 0.04 : 0), ZK_MIN, 1);
  cam.zk += (tz - cam.zk) * (1 - Math.exp(-dt * (tz < cam.zk ? 2.2 : 1.2)));
  cam.zk = clamp(cam.zk, ZK_MIN, 1);
  cam.sw = clamp(cam.sw, -1, 1); cam.kick = clamp(cam.kick, 0, 1);
  return cam;
}
// TOP-DOWN look-ahead (world px): the view runs ahead of the car along its velocity, so it sits back
// toward the side it came from and you see the road coming. Capped per axis at cfg.ahead of the
// screen, plus a short extra push on a boost kick (render.js's safe box still holds the car). cam.lx/ly
// ease toward it (a drift's wobble doesn't shake the view). spd: your speed, top: top speed.
export function lookAhead(cam, cfg, vx, vy, top, W, H, z, dt, snap) {
  const mx = (W * cfg.ahead) / z, my = (H * cfg.ahead) / z;
  const spd = Math.hypot(vx, vy), k = clamp(spd / Math.max(300, (top || 900) * 0.75), 0, 1);
  // full look-ahead from ~75% of top speed; the kick shoves the view a little further ahead
  const push = 1 + cam.kick * 0.25, f = (k * Math.max(mx, my) * push) / Math.max(1, spd);
  const tx = clamp(vx * f, -mx * push, mx * push), ty = clamp(vy * f, -my * push, my * push);
  if (snap || !cam.lInit) { cam.lx = tx; cam.ly = ty; cam.lInit = true; }
  const e = 1 - Math.exp(-clamp(dt, 0, 0.1) * 3.2);
  cam.lx += (tx - cam.lx) * e; cam.ly += (ty - cam.ly) * e;
  return cam;
}
// where the followed car sits on the canvas (CSS px) for this camera state: bounded by the mode's
// anchor, swing and kick (the safe box in Chase: x 0.5 +- 0.085, y 0.64 .. 0.685)
export function anchorOf(cfg, cam, W, H, out) {
  out.x = W * (0.5 + (cfg.rotate ? cam.sw * cfg.swing : 0));
  out.y = H * (cfg.anchorY + (cfg.rotate && cfg.kick ? cam.kick * cfg.kick : 0));
  return out;
}

// ------------------------------------------------------------------ shake
// SHAKE = trauma + a punch. Trauma (0..1.4, fades in ~0.5 s) drives a smooth jitter (a sum of sines,
// not white noise: it reads as a jolt, not a blur); the punch is a stiff, slightly bouncy spring
// kicked along the force on your car (a wall pushes you back, a missile along its flight, a rival
// away from them), so a hit shoves the whole view one way and it settles with one small rebound.
// Out: sh.x, sh.y = how far the world image moves on screen (CSS px, bounded by SHAKE_MAX).
// It runs on the real clock, so it keeps moving through a hit-stop freeze.
export const SHAKE_MAX = 18;
const SPRING_K = 520, SPRING_C = 22; // ~3.6 Hz, damping ratio ~0.5: one overshoot
export const newShake = () => ({ tr: 0, t: 0, px: 0, py: 0, vx: 0, vy: 0, x: 0, y: 0 });
export function shakeKick(sh, k, dx = 0, dy = 0) {
  if (!(k > 0)) return sh;
  sh.tr = Math.min(1.4, sh.tr + k);
  const m = Math.hypot(dx, dy);
  if (m > 1e-6) { const p = Math.min(1, k) * 560; sh.vx += (dx / m) * p; sh.vy += (dy / m) * p; }
  return sh;
}
export function stepShake(sh, dt) {
  dt = clamp(dt, 0, 0.1);
  sh.t += dt; sh.tr = Math.max(0, sh.tr - dt * 2.4);
  // the spring, in fixed small steps (stable at any frame time)
  for (let left = dt; left > 1e-6; left -= 1 / 240) {
    const h = Math.min(left, 1 / 240);
    sh.vx += (-SPRING_K * sh.px - SPRING_C * sh.vx) * h; sh.vy += (-SPRING_K * sh.py - SPRING_C * sh.vy) * h;
    sh.px += sh.vx * h; sh.py += sh.vy * h;
  }
  sh.px = clamp(sh.px, -SHAKE_MAX * 0.75, SHAKE_MAX * 0.75); sh.py = clamp(sh.py, -SHAKE_MAX * 0.75, SHAKE_MAX * 0.75);
  if (Math.abs(sh.px) + Math.abs(sh.py) + Math.abs(sh.vx) + Math.abs(sh.vy) < 0.02) sh.px = sh.py = sh.vx = sh.vy = 0;
  const a = sh.tr * sh.tr * 5.5, t = sh.t;
  sh.x = clamp(sh.px + a * (Math.sin(t * 43) + 0.6 * Math.sin(t * 71 + 1.3)), -SHAKE_MAX, SHAKE_MAX);
  sh.y = clamp(sh.py + a * (Math.sin(t * 37 + 2.1) + 0.6 * Math.sin(t * 89 + 0.4)), -SHAKE_MAX, SHAKE_MAX);
  return sh;
}
