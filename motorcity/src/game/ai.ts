/** Rival drivers with personalities and mild rubber-banding. */
import { clamp, approach, sign, wrap } from '../core/math';
import { Rng } from '../core/rng';
import { SEG_LEN, type Segment } from '../track/types';
import { MODELS, CAR_UPP, type CarModel } from '../art/cars';
import { MPH } from '../data/cars';
import { portals } from '../art/portals';

export type Personality = 'blocker' | 'clean' | 'reckless';

export interface RivalDef { name: string; model: keyof typeof MODELS; personality: Personality; skill: number }

export const ROSTER: RivalDef[] = [
  { name: 'Barney "Cigar" Oldham', model: 'stutz', personality: 'blocker', skill: 1.0 },
  { name: 'Louis Chevalier', model: 'buick', personality: 'reckless', skill: 1.04 },
  { name: 'Ralph De Palmer', model: 'mercer', personality: 'clean', skill: 1.01 },
  { name: 'Tin Lizzie Tess', model: 'modelT', personality: 'reckless', skill: 0.92 },
  { name: 'Col. J. W. Packwood', model: 'packard', personality: 'blocker', skill: 0.97 },
  { name: 'Spider Huff', model: 'mercer', personality: 'clean', skill: 0.98 },
  { name: 'Bob Burman Jr.', model: 'buick', personality: 'clean', skill: 1.0 },
];

export interface Mover { z: number; x: number; speed: number; half: number; len: number }

export class Rival implements Mover {
  def: RivalDef;
  model: CarModel;
  z: number; x: number; speed = 0;
  tx: number; steer = 0;
  top: number; accel: number;
  half = ((64 * CAR_UPP) / 2 / 1000) * 0.9; len = 760;
  laps = 0; finished = false; finishTime = 0;
  spinT = 0; spinDir = 1; steamT = 0;
  swerveT = 0; swerveDir = 0;
  wheel = 0;
  braking = false;
  private rng: Rng;
  private wobble = 0;
  private laneT = 0;
  angry = 0;
  /** Lateral velocity (road units/s): lane changes accelerate and settle smoothly. */
  vx = 0;
  private passSide = 0;
  private passHold = 0;
  /** Distance (in race metres) used for standings. */
  get total() { return this.laps * this.trackLen + this.z; }
  trackLen = 1;

  /** pace = race pace in mph for this event; each driver varies around it by skill. */
  constructor(def: RivalDef, z: number, x: number, pace: number, seed: number) {
    this.def = def;
    this.model = MODELS[def.model];
    this.z = z; this.x = x; this.tx = x;
    this.top = pace * MPH * def.skill * (def.personality === 'reckless' ? 1.03 : 1);
    this.accel = this.top * 0.3;
    this.rng = new Rng(seed);
  }

  update(dt: number, segs: Segment[], all: Mover[], player: Mover & { total: number }, t: number, started: boolean, raceT: number) {
    const N = segs.length;
    const si = Math.floor(this.z / SEG_LEN) % N;
    const seg = segs[si];
    this.braking = false;
    if (!started) return;
    if (this.spinT > 0) {
      this.spinT -= dt;
      this.speed = approach(this.speed, this.top * 0.5, dt * 6000);
      this.z += this.speed * dt;
      if (this.spinT <= 0) this.steamT = 3;
      return;
    }
    if (this.steamT > 0) this.steamT -= dt;

    // look ahead at the road
    let c = 0;
    for (let i = 4; i < 16; i++) c += segs[(si + i) % N].curve;
    c /= 12;
    let hazard = 0;
    for (let i = 0; i < 20; i++) { const s = segs[(si + i) % N]; if (s.portal) { const p = portals()[s.portal.kind]; if (p) hazard = Math.max(hazard, 1 - i / 20); } }
    const pers = this.def.personality;

    // racing line
    let target = clamp(sign(c) * Math.min(1, Math.abs(c) / 3) * 0.55, -0.6, 0.6);
    if (pers === 'reckless') {
      this.laneT -= dt;
      if (this.laneT <= 0) { this.laneT = this.rng.range(1.5, 4); this.wobble = this.rng.range(-0.6, 0.6); }
      target = clamp(target * 0.5 + this.wobble, -0.8, 0.8);
    }
    // rubber band (mild), after the start
    const gap = (this.total - player.total) / SEG_LEN; // + = ahead of player
    let band = 1;
    if (raceT > 8) band = clamp(1 - gap * 0.0012, 0.92, 1.08);

    // blocker: when the player is close behind, move into their line
    if (pers === 'blocker' && gap > 0 && gap < 9) target = clamp(player.x + (this.angry > 0 ? 0 : 0), -0.75, 0.75);

    // avoid slower things ahead
    let ahead: Mover | null = null, aheadD = 1e9;
    let block: Mover | null = null, blockD = 1e9;
    for (const o of all) {
      if (o === this) continue;
      const d = wrap(o.z - this.z, this.trackLen);
      if (d > 8 * SEG_LEN) continue;
      const gapX = Math.abs(o.x - target);
      if (gapX < o.half + this.half + 0.12 && d < aheadD && o.speed < this.speed + 300) { ahead = o; aheadD = d; }
      if (Math.abs(o.x - this.x) < o.half + this.half + 0.04 && d < blockD) { block = o; blockD = d; }
    }
    let topNow = this.top * band;
    if (this.passHold > 0) this.passHold -= dt;
    if (ahead) {
      const room = ahead.half + this.half + 0.16;
      const left = ahead.x - room, right = ahead.x + room;
      const okL = left > -0.9, okR = right < 0.9;
      // commit to a passing side for a moment so the car doesn't twitch between lanes
      let side = this.passHold > 0 && this.passSide ? this.passSide : okL && (!okR || Math.abs(left - this.x) <= Math.abs(right - this.x)) ? -1 : 1;
      if ((side < 0 && !okL) || (side > 0 && !okR)) side = -side;
      if (side !== this.passSide) { this.passSide = side; this.passHold = 1.2; }
      target = clamp(side < 0 ? left : right, -0.88, 0.88);
    } else if (this.passHold <= 0) this.passSide = 0;
    // something directly ahead: brake early enough to never run into it (v² = 2·a·d, a ≈ 7000 u/s²)
    // ...unless it will have changed lanes first: compare time to impact with time to get clear sideways
    const maxLatNow = 1.0 * (this.speed / (SEG_LEN * 60)) + 0.3;
    const needShift = block ? block.half + this.half + 0.04 - Math.abs(block.x - this.x) : 0;
    const movingAway = block ? Math.sign(this.tx - this.x) === Math.sign(this.x - block.x) && Math.abs(this.tx - this.x) > 0.05 : false;
    const tClear = movingAway ? needShift / Math.max(0.15, maxLatNow * 0.8) : Infinity;
    const tHit = block ? Math.max(0, blockD - (block.len + this.len) / 2) / Math.max(1, this.speed - block.speed) : Infinity;
    if (block && block.speed < this.speed && tHit < tClear * 1.3) {
      const room = Math.max(0, blockD - (block.len + this.len) / 2 - 60);
      const safe = Math.sqrt(block.speed * block.speed + 2 * 7000 * room);
      if (safe < this.speed + 50) { topNow = Math.min(topNow, safe); this.speed = Math.min(this.speed, Math.max(safe, this.speed - 7000 * dt)); }
    }
    // never steer into a car that is alongside
    for (const o of all) {
      if (o === this) continue;
      const d = wrap(o.z - this.z + this.trackLen / 2, this.trackLen) - this.trackLen / 2;
      if (Math.abs(d) > (o.len + this.len) * 0.6) continue;
      const gap = o.half + this.half + 0.06;
      if (o.x < this.x && target < o.x + gap) target = Math.max(target, o.x + gap);
      if (o.x > this.x && target > o.x - gap) target = Math.min(target, o.x - gap);
    }
    target = clamp(target, -0.9, 0.9);
    // through portals stay central
    if (hazard > 0) target *= 1 - hazard * 0.7;
    // horn swerve
    if (this.swerveT > 0) { this.swerveT -= dt; target = clamp(this.x + this.swerveDir * 0.6, -0.9, 0.9); topNow *= 0.94; }

    // cornering speed
    const ac = Math.abs(c);
    if (pers !== 'reckless' && ac > 2) topNow *= 1 - (ac - 2) * 0.05;
    if (this.steamT > 0) topNow *= 0.92;

    if (this.speed < topNow) this.speed += this.accel * dt * Math.max(0.1, 1 - (this.speed / topNow) ** 2);
    else { this.speed = approach(this.speed, topNow, dt * 4000); this.braking = this.speed - topNow > 300; }

    // lateral
    this.tx = approach(this.tx, target, dt * (ahead ? 1.8 : 0.6)); // ease back to the racing line after a pass
    const maxLat = 1.0 * (this.speed / (SEG_LEN * 60)) + 0.3;
    // critically damped lateral spring (gain 2, damping 8): lane changes glide in without overshoot
    const want = clamp((this.tx - this.x) * 2, -maxLat, maxLat);
    this.vx += (want - this.vx) * (1 - Math.exp(-dt * 8));
    this.x += this.vx * dt;
    this.steer = approach(this.steer, clamp(this.vx * 2.2, -1, 1), dt * 5);
    // reckless drivers occasionally overcook a hard corner
    if (pers === 'reckless' && ac > 3 && this.rng.chance(dt * 0.06)) this.spin(t);
    // hard limits
    const lim = seg.tunnel ? 1.05 : seg.portal ? (portals()[seg.portal.kind]?.open ?? 1.2) - this.half : 0.92;
    if (Math.abs(this.x) > lim) { this.x = clamp(this.x, -lim, lim); this.vx = 0; }
    this.z += this.speed * dt;
    this.wheel += this.speed * dt * 0.004;
    if (this.angry > 0) this.angry -= dt;
  }

  spin(t: number) { if (this.spinT <= 0) { this.spinT = 0.9; this.spinDir = this.rng.chance(0.5) ? 1 : -1; } void t; }

  hornReact(px: number) {
    if (this.def.personality === 'blocker' && this.rng.chance(0.45)) { this.angry = 1.5; return false; }
    this.swerveT = 0.9;
    this.swerveDir = this.x >= px ? 1 : -1;
    if (Math.abs(this.x + this.swerveDir * 0.6) > 0.9) this.swerveDir = -this.swerveDir;
    return true;
  }
}
