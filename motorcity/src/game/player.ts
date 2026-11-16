/** Player car physics: auto-throttle, steer, brake, drift -> boost, slipstream, spin-outs. */
import { clamp, approach, sign } from '../core/math';
import { SEG_LEN, FACADE_X, type Segment } from '../track/types';
import type { Stats } from '../data/cars';
import { portals } from '../art/portals';

export const MAX_V = SEG_LEN * 60;
export const CENTRIFUGAL = 0.42;
export const CAR_HALF = 0.23; // road units

export interface PlayerInput { steer: number; brake: boolean; boost: boolean }

export class Player {
  z = 0; x = 0; speed = 0;
  steer = 0;
  stats: Stats;
  drifting = false; driftDir = 0; driftT = 0; private driftExit = 0;
  boost = 0; boostT = 0;
  slip = 0;
  spinT = 0; spinDir = 1; steamT = 0;
  braking = false;
  offroad = false;
  scrapeT = 0;
  /** Lateral velocity for bumps (road units / s). */
  vx = 0;
  wheel = 0; scarf = 0; private scarfT = 0;
  /** Events consumed by the race (audio/particles). */
  ev: string[] = [];
  started = false;
  lastHit = 0;
  lastCrash = -10;

  constructor(stats: Stats) { this.stats = stats; }

  get pct() { return this.speed / MAX_V; }
  get top() { return this.stats.top * (this.boostT > 0 ? 1.3 : 1) * (this.slip > 0.5 ? 1.07 : 1); }

  update(dt: number, inp: PlayerInput, seg: Segment, grip: number, t: number) {
    const pct = this.pct;
    this.braking = false;
    if (!this.started) { this.speed = 0; return; }
    if (this.spinT > 0) {
      this.spinT -= dt;
      this.speed = approach(this.speed, this.stats.top * 0.22, dt * MAX_V * 0.9);
      this.x += this.vx * dt; this.vx *= 0.9;
      this.x -= dt * 2 * pct * seg.curve * CENTRIFUGAL * 0.6;
      this.drifting = false;
      if (this.spinT <= 0) { this.steamT = 3.5; this.ev.push('steam'); }
    } else {
      // steering with a little weight
      const target = clamp(inp.steer, -1, 1);
      const rate = target === 0 ? 10 : sign(target) !== sign(this.steer) && this.steer !== 0 ? 14 : 7 * this.stats.handling;
      this.steer = approach(this.steer, target, dt * rate);

      // drift entry/exit
      if (!this.drifting && inp.brake && Math.abs(this.steer) > 0.45 && pct > 0.42) {
        this.drifting = true; this.driftDir = sign(this.steer); this.driftT = 0; this.driftExit = 0;
        this.ev.push('driftStart');
      }
      if (this.drifting) {
        this.driftT += dt;
        if (sign(this.steer) !== this.driftDir || Math.abs(this.steer) < 0.25) this.driftExit += dt; else this.driftExit = 0;
        if (this.driftExit > 0.12 || pct < 0.3) { this.drifting = false; this.ev.push(this.driftT > 0.6 ? 'driftEnd' : 'driftCancel'); }
      }
      const dx = dt * 2 * pct;
      const steerAuth = (this.drifting ? 1.3 : 1) * (0.75 + 0.25 * this.stats.handling);
      this.x += this.steer * dx * steerAuth * (this.drifting ? 1 : clamp(1.4 - pct * 0.5, 0.9, 1.2));
      const cent = CENTRIFUGAL * (this.drifting ? 0.42 : 1) / (this.stats.grip * grip);
      this.x -= dx * pct * seg.curve * cent;
      this.x += this.vx * dt; this.vx *= Math.pow(0.02, dt);

      // speed
      let top = this.top;
      this.offroad = Math.abs(this.x) > 1.02;
      if (this.offroad) top *= 0.62;
      if (seg.tunnel) top *= 1;
      if (this.steamT > 0) top *= 0.94;
      if (this.drifting) {
        this.speed -= this.speed * 0.05 * dt;
        const gain = dt * 0.32 * pct * (0.5 + Math.min(1.5, Math.abs(seg.curve) * 0.5)) * (0.7 + 0.3 * this.stats.handling);
        this.boost = Math.min(3, this.boost + gain);
      } else if (inp.brake) {
        this.braking = true;
        this.speed -= MAX_V * 0.95 * dt;
      } else {
        const a = this.stats.accel * this.stats.top * (this.boostT > 0 ? 1.4 : 0.36);
        if (this.speed < top) this.speed += a * dt * Math.max(0.08, 1 - (this.speed / top) ** 2);
      }
      if (this.speed > top) this.speed = approach(this.speed, top, dt * MAX_V * (this.offroad ? 1.2 : 0.35));
      if (this.speed < 0) this.speed = 0;

      // boost
      if (inp.boost && this.boostT <= 0 && this.boost >= 1) {
        this.boost -= 1; this.boostT = 1.7; this.ev.push('boost');
        this.speed = Math.max(this.speed, this.stats.top * 0.8);
      }
    }
    if (this.boostT > 0) this.boostT -= dt;
    if (this.steamT > 0) this.steamT -= dt;
    if (this.scrapeT > 0) this.scrapeT -= dt;

    // walls: facades / tunnel / portals
    this.walls(seg, t);

    this.z += this.speed * dt;
    // cosmetic
    this.wheel += this.speed * dt * 0.004;
    this.scarfT += dt * (2 + pct * 14);
    if (this.scarfT > 1) { this.scarfT = 0; this.scarf = (this.scarf + 1) % 3; }
  }

  private walls(seg: Segment, t: number) {
    let lim = FACADE_X - CAR_HALF;
    if (seg.tunnel) lim = 1.36 - CAR_HALF;
    if (seg.portal) {
      const p = portals()[seg.portal.kind];
      if (p) lim = Math.min(lim, p.open - CAR_HALF);
    }
    if (!seg.wallL && !seg.wallR && !seg.tunnel && !seg.portal && !seg.waterL && !seg.waterR) lim = 2.6;
    if (seg.waterL || seg.waterR) lim = Math.min(lim, 1.3 - CAR_HALF);
    if (Math.abs(this.x) > lim) {
      const hard = this.pct > 0.55 && Math.abs(this.x) - lim > 0.04 && seg.portal;
      this.x = sign(this.x) * lim;
      this.vx = -sign(this.x) * 0.6;
      if (hard) this.crash(t, -sign(this.x));
      else if (this.scrapeT <= 0) { this.scrapeT = 0.3; this.speed *= 0.93; this.ev.push('scrape'); }
      else this.speed *= 0.995;
    }
  }

  crash(t: number, dir: number) {
    if (this.spinT > 0 || t - this.lastCrash < 1.6) return;
    this.lastCrash = t;
    this.spinT = 1.5; this.spinDir = dir || 1;
    this.drifting = false; this.boostT = 0;
    this.ev.push('crash');
  }

  bump(t: number, dvx: number, dv: number) {
    this.vx += dvx;
    this.speed = Math.max(0, this.speed + dv);
    if (t - this.lastHit > 0.3) { this.lastHit = t; this.ev.push('bump'); }
  }
}
