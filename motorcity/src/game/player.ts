/** Player car physics: auto-throttle, speed-sensitive steering, brake, drift -> boost, slipstream,
 *  sidewalk run-off with a soft invisible wall, and short recoverable wobbles instead of hard stops. */
import { clamp, approach, sign } from '../core/math';
import { SEG_LEN, KERB, type Segment } from '../track/types';
import type { Stats } from '../data/cars';

export const MAX_V = SEG_LEN * 60;
/** Curve pull. Tuned so the hardest corners can just be held at full speed with full steering lock. */
export const CENTRIFUGAL = 0.27;
/** Visual half-width of the car (road units). */
export const CAR_HALF = 0.23;
/** Collision half-width: a little smaller than the art. */
export const CAR_HIT = 0.2;
/** Seconds of wobble after hitting something. */
export const WOBBLE = 0.75;

export interface PlayerInput { steer: number; brake: boolean; boost: boolean }
/** Furthest the car's centre may go on each side (soft invisible walls). */
export interface SideLimits { l: number; r: number }

export class Player {
  z = 0; x = 0; speed = 0;
  steer = 0;
  /** Smoothed steering for the visual lean. */
  lean = 0;
  stats: Stats;
  drifting = false; driftDir = 0; driftT = 0; private driftExit = 0;
  boost = 0; boostT = 0;
  slip = 0;
  /** Wobble timer after a crash (kept as spinT for the race/audio code). */
  spinT = 0; spinDir = 1; steamT = 0;
  braking = false;
  offroad = false;
  /** 0..1 how hard the car is rumbling (kerb, sidewalk, scraping a wall). */
  rumble = 0;
  scrapeT = 0;
  /** Lateral velocity from bumps (road units / s), decays smoothly. */
  vx = 0;
  wheel = 0; scarf = 0; private scarfT = 0;
  ev: string[] = [];
  started = false;
  lastHit = -10;
  lastCrash = -10;

  constructor(stats: Stats) { this.stats = stats; }

  get pct() { return this.speed / MAX_V; }
  get top() { return this.stats.top * (this.boostT > 0 ? 1.3 : 1) * (this.slip > 0.5 ? 1.07 : 1); }

  update(dt: number, inp: PlayerInput, seg: Segment, grip: number, t: number, lim: SideLimits) {
    const pct = this.pct;
    this.braking = false;
    if (!this.started) { this.speed = 0; return; }
    const wobbling = this.spinT > 0;
    if (wobbling) { this.spinT -= dt; if (this.spinT <= 0) { this.spinT = 0; this.steamT = 2.5; this.ev.push('steam'); } }

    // --- steering: ramps in over ~0.15 s, returns a little quicker, reverses briskly
    const target = clamp(inp.steer, -1, 1) * (wobbling ? 0.5 : 1);
    const rate = target === 0 ? 1 / 0.1 : sign(target) !== sign(this.steer) && this.steer !== 0 ? 1 / 0.12 : 1 / 0.15;
    this.steer = approach(this.steer, target, dt * rate);
    this.lean = approach(this.lean, this.steer * (this.drifting ? 1.3 : 1), dt * 5);

    // --- drift entry/exit
    if (!wobbling && !this.drifting && inp.brake && Math.abs(this.steer) > 0.45 && pct > 0.42) {
      this.drifting = true; this.driftDir = sign(this.steer); this.driftT = 0; this.driftExit = 0;
      this.ev.push('driftStart');
    }
    if (this.drifting) {
      this.driftT += dt;
      if (sign(this.steer) !== this.driftDir || Math.abs(this.steer) < 0.25) this.driftExit += dt; else this.driftExit = 0;
      if (this.driftExit > 0.12 || pct < 0.3 || wobbling) { this.drifting = false; this.ev.push(this.driftT > 0.6 ? 'driftEnd' : 'driftCancel'); }
    }

    // --- lateral: speed-sensitive (sharper at low speed, calmer at high speed)
    const moving = this.speed > 300;
    const lat = moving ? 2 * Math.max(pct, 0.14) : 0;
    const sens = (1.35 - 0.4 * pct) * (0.8 + 0.2 * this.stats.handling) * (this.drifting ? 1.2 : 1);
    this.x += this.steer * lat * sens * dt;
    const cent = (CENTRIFUGAL * (this.drifting ? 0.45 : 1)) / (this.stats.grip * grip);
    this.x -= 2 * pct * pct * seg.curve * cent * dt;
    this.x += this.vx * dt;
    this.vx *= Math.exp(-dt * 4);

    // --- sidewalk: slows a little, rumbles, and a gentle assist eases you back toward the road
    const ax = Math.abs(this.x);
    this.offroad = ax > KERB;
    let rumble = ax > 0.98 ? Math.min(1, (ax - 0.98) * 6) * 0.5 : 0;
    if (this.offroad) {
      rumble = 1;
      const pushingOut = sign(this.steer) === sign(this.x) && Math.abs(this.steer) > 0.5;
      if (!pushingOut) this.x -= sign(this.x) * dt * 0.5 * (0.4 + pct);
    }

    // --- soft invisible walls before buildings, railings, tunnel walls and portals
    const L = this.x < 0 ? lim.l : lim.r;
    const soft = L - 0.2;
    if (Math.abs(this.x) > soft) {
      const pen = Math.abs(this.x) - soft;
      this.x -= sign(this.x) * pen * 7 * dt;
      if (sign(this.vx) === sign(this.x)) this.vx *= Math.exp(-dt * 12);
      rumble = 1;
    }
    if (Math.abs(this.x) > L) {
      this.x = sign(this.x) * L;
      if (sign(this.vx) === sign(this.x)) this.vx = 0;
      if (this.speed > this.top * 0.75) this.speed *= 1 - 0.12 * dt;
      if (this.scrapeT <= 0 && pct > 0.15) { this.scrapeT = 0.45; this.ev.push('scrape'); }
    }
    this.rumble = approach(this.rumble, rumble, dt * 6);

    // --- speed
    let top = this.top;
    if (this.offroad) top *= 0.88;
    if (this.steamT > 0) top *= 0.95;
    if (this.drifting) {
      this.speed -= this.speed * 0.05 * dt;
      const gain = dt * 0.32 * pct * (0.5 + Math.min(1.5, Math.abs(seg.curve) * 0.5)) * (0.7 + 0.3 * this.stats.handling);
      this.boost = Math.min(3, this.boost + gain);
    } else if (inp.brake && !wobbling) {
      this.braking = true;
      this.speed -= MAX_V * 0.9 * dt;
    } else {
      const a = this.stats.accel * this.stats.top * (this.boostT > 0 ? 1.4 : 0.36) * (wobbling ? 0.5 : 1);
      if (this.speed < top) this.speed += a * dt * Math.max(0.08, 1 - (this.speed / top) ** 2);
    }
    // ease (never snap) down to a lower limit, e.g. on the sidewalk
    if (this.speed > top) this.speed = approach(this.speed, top, dt * MAX_V * 0.3);
    if (this.speed < 0) this.speed = 0;

    if (!wobbling && inp.boost && this.boostT <= 0 && this.boost >= 1) {
      this.boost -= 1; this.boostT = 1.7; this.ev.push('boost');
      this.speed = Math.max(this.speed, this.stats.top * 0.8);
    }
    if (this.boostT > 0) this.boostT -= dt;
    if (this.steamT > 0) this.steamT -= dt;
    if (this.scrapeT > 0) this.scrapeT -= dt;

    this.z += this.speed * dt;
    this.wheel += this.speed * dt * 0.004;
    this.scarfT += dt * (2 + pct * 14);
    if (this.scarfT > 1) { this.scarfT = 0; this.scarf = (this.scarf + 1) % 3; }
    void t;
  }

  /** Hit something solid: a short wobble, some speed lost, a nudge away. Never a dead stop. */
  crash(t: number, dir: number) {
    if (this.spinT > 0 || t - this.lastCrash < WOBBLE) return;
    this.lastCrash = t;
    this.spinT = WOBBLE; this.spinDir = dir || 1;
    this.drifting = false; this.boostT = 0;
    this.speed *= 0.62;
    this.vx = (dir || 1) * 0.9;
    this.ev.push('crash');
  }

  bump(t: number, dvx: number, dv: number) {
    this.vx = clamp(this.vx + dvx, -1.5, 1.5);
    this.speed = Math.max(0, this.speed + dv);
    if (t - this.lastHit > 0.3) { this.lastHit = t; this.ev.push('bump'); }
  }
}
