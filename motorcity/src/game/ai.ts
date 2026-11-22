/** Rival drivers: five named personalities, short boost bursts on straights, clean cornering,
 *  traffic dodging, and time-based rubber-banding that keeps every race close. */
import { clamp, approach, sign, wrap } from '../core/math';
import { Rng } from '../core/rng';
import { SEG_LEN, type Segment } from '../track/types';
import { MODELS, CAR_UPP, type CarModel } from '../art/cars';
import { MPH } from '../data/cars';
import { portals } from '../art/portals';

export type Personality = 'clean' | 'blocker' | 'steady' | 'reckless' | 'closer';

export interface RivalDef {
  name: string;
  model: keyof typeof MODELS;
  personality: Personality;
  /** Top speed relative to the field's pace (1 = the fastest, which matches the player's top speed). */
  pace: number;
  /** How much the driver lifts in hard corners (0 = flat out, 1 = cautious). */
  corner: number;
  /** Boost bursts per lap. */
  boosts: number;
  /** Chance per second of overcooking a hard corner and spinning. */
  crash: number;
  blurb: string;
}

export const ROSTER: RivalDef[] = [
  { name: 'Barney Oldham', model: 'stutz', personality: 'clean', pace: 1.0, corner: 0.1, boosts: 2, crash: 0, blurb: 'The fastest man in Detroit, and the tidiest.' },
  { name: 'Ralph De Palmer', model: 'mercer', personality: 'blocker', pace: 0.985, corner: 0.3, boosts: 2, crash: 0, blurb: 'Aggressive. Sits in your line and dares you to pass.' },
  { name: 'Louis Chevalier', model: 'buick', personality: 'steady', pace: 0.98, corner: 0.25, boosts: 1.5, crash: 0, blurb: 'Steady as a metronome. Never puts a wheel wrong.' },
  { name: 'Ray Harlan', model: 'modelT', personality: 'reckless', pace: 0.995, corner: 0, boosts: 2.5, crash: 0.05, blurb: 'Fast and fearless. Sometimes too fearless.' },
  { name: 'Cannonball Becker', model: 'packard', personality: 'closer', pace: 0.99, corner: 0.2, boosts: 1.5, crash: 0, blurb: 'Starts slow, finishes like a freight train.' },
];

/** What the difficulty setting changes. */
export interface Level {
  /** Field top speed as a fraction of the player's top speed (cap). */
  cap: number;
  /** Multiplier on the cup's base pace. */
  cup: number;
  /** A bot is never allowed to get more than this many seconds ahead of the player. */
  maxLead: number;
  /** Extra pace (fraction) when a bot is well behind the player. */
  catchUp: number;
  /** Multiplier on boost bursts per lap. */
  boostMul: number;
}

export interface RaceCtx {
  player: Mover & { total: number };
  t: number; started: boolean; raceT: number;
  /** Bots-only race (no player): no rubber band, no blocking. */
  spectate: boolean;
  /** Total race distance (laps × lap length). */
  raceLen: number;
  /** Median race distance of the rivals. */
  packTotal: number;
  level: Level;
}

/** Distance from a vehicle's drawn position at which the one behind is visibly at its bumper. */
export const BUMPER = 400;

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
  /** Boost: charges accumulate through the lap; a burst lasts about a second. */
  boostT = 0;
  private boostCharge = 0.5;
  /** Set for one step when a burst starts (the race turns it into a backfire). */
  boosted = false;
  /** Base top speed before rubber band / personality curve. */
  base: number;
  /** Distance (in race metres) used for standings. */
  get total() { return this.laps * this.trackLen + this.z; }
  trackLen = 1;

  /** fieldTop = the field's top speed in mph (the fastest driver's); each driver runs at def.pace of it. */
  constructor(def: RivalDef, z: number, x: number, fieldTop: number, seed: number) {
    this.def = def;
    this.model = MODELS[def.model];
    this.z = z; this.x = x; this.tx = x;
    this.base = fieldTop * MPH * def.pace;
    this.top = this.base;
    this.accel = this.top * 0.45;
    this.rng = new Rng(seed);
  }

  update(dt: number, segs: Segment[], all: Mover[], ctx: RaceCtx) {
    const { player, t, started, raceT } = ctx;
    const N = segs.length;
    this.boosted = false;
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
    // Cannonball: slow early, fast late
    const progress = clamp(this.total / Math.max(1, ctx.raceLen), 0, 1);
    this.top = this.base * (pers === 'closer' ? 0.955 + 0.06 * progress : 1);

    // racing line
    let target = clamp(sign(c) * Math.min(1, Math.abs(c) / 3) * 0.55, -0.6, 0.6);
    if (pers === 'reckless') {
      this.laneT -= dt;
      if (this.laneT <= 0) { this.laneT = this.rng.range(1.5, 4); this.wobble = this.rng.range(-0.6, 0.6); }
      target = clamp(target * 0.5 + this.wobble, -0.8, 0.8);
    }
    // rubber band, measured in seconds: ease off when well ahead of the player, never more than
    // level.maxLead seconds ahead; push harder when behind so the player has to earn the win
    const gap = (this.total - player.total) / SEG_LEN; // + = ahead of player (segments)
    let band = 1;
    let leadCap = Infinity;
    if (!ctx.spectate && raceT > 6 && !this.finished) {
      const ref = Math.max(player.speed, this.base * 0.6);
      const gapT = (this.total - player.total) / ref;
      if (gapT > 2) band = 1 - Math.min(0.14, (gapT - 2) * 0.024);
      else if (gapT < -1.5) band = 1 + Math.min(ctx.level.catchUp, (-gapT - 1.5) * 0.02);
      if (gapT > ctx.level.maxLead - 1) leadCap = Math.max(player.speed * (gapT > ctx.level.maxLead - 0.3 ? 0.9 : 0.98), this.base * 0.35);
    }
    // pack cohesion (mild): a bot well clear of the field's median eases off, one well adrift pushes on,
    // so a traffic jam doesn't split the field for good
    if (raceT > 6 && !this.finished) {
      const packT = (this.total - ctx.packTotal) / this.base;
      if (packT > 1.5) band *= 1 - Math.min(0.08, (packT - 1.5) * 0.025);
      else if (packT < -1.5) band *= 1 + Math.min(0.07, (-packT - 1.5) * 0.025);
    }

    // blocker: when the player is close behind, move into their line
    if (!ctx.spectate && pers === 'blocker' && gap > 0 && gap < 9) target = clamp(player.x, -0.75, 0.75);

    // avoid slower things ahead
    let ahead: Mover | null = null, aheadD = 1e9;
    let block: Mover | null = null, blockD = 1e9;
    for (const o of all) {
      if (o === this) continue;
      const d = wrap(o.z - this.z, this.trackLen);
      // look well ahead (~1.3 s of closing speed) so lane changes around trolleys and carriages finish
      // before we reach them
      const look = 12 * SEG_LEN + Math.max(0, this.speed - o.speed) * 1.3;
      if (d > look) continue;
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
    const maxLatNow = 0.8 * (this.speed / (SEG_LEN * 60)) + 0.7; // enough to sidestep traffic even when slow
    const needShift = block ? block.half + this.half + 0.04 - Math.abs(block.x - this.x) : 0;
    const movingAway = block ? Math.sign(this.tx - this.x) === Math.sign(this.x - block.x) && Math.abs(this.tx - this.x) > 0.05 : false;
    const tClear = movingAway ? needShift / Math.max(0.15, maxLatNow * 0.8) : Infinity;
    // positions are where each vehicle is drawn (its rear); the bumper gap is the distance minus what
    // our own car covers on screen — the same geometry the player's collisions use
    const tHit = block ? Math.max(0, blockD - BUMPER) / Math.max(1, this.speed - block.speed) : Infinity;
    if (block && block.speed < this.speed && tHit < tClear * 1.3) {
      const room = Math.max(0, blockD - BUMPER - 60);
      const safe = Math.sqrt(block.speed * block.speed + 2 * 7000 * room);
      if (safe < this.speed + 50) { topNow = Math.min(topNow, safe); this.speed = Math.min(this.speed, Math.max(safe, this.speed - 7000 * dt)); }
    }
    // never steer into a car that is alongside; if that blocks the chosen passing side, try the other
    const besideClamp = (want: number) => {
      let tgt = want;
      for (const o of all) {
        if (o === this) continue;
        const d = wrap(o.z - this.z + this.trackLen / 2, this.trackLen) - this.trackLen / 2;
        if (d > BUMPER || d < -BUMPER * 0.8) continue; // only cars actually beside us
        const gap = o.half + this.half + 0.06;
        if (o.x < this.x && tgt < o.x + gap) tgt = Math.max(tgt, o.x + gap);
        if (o.x > this.x && tgt > o.x - gap) tgt = Math.min(tgt, o.x - gap);
      }
      return tgt;
    };
    const wanted = target;
    target = besideClamp(target);
    if (ahead && Math.abs(target - wanted) > 0.05 && Math.abs(target - ahead.x) < ahead.half + this.half) {
      const room = ahead.half + this.half + 0.16;
      const other = this.passSide < 0 ? ahead.x + room : ahead.x - room;
      if (Math.abs(other) < 0.9) {
        const alt = besideClamp(other);
        if (Math.abs(alt - other) < 0.05) { target = alt; this.passSide = -this.passSide || 1; this.passHold = 1.2; }
      }
    }
    target = clamp(target, -0.9, 0.9);
    // through portals stay central
    if (hazard > 0) target *= 1 - hazard * 0.7;
    // horn swerve
    if (this.swerveT > 0) { this.swerveT -= dt; target = clamp(this.x + this.swerveDir * 0.6, -0.9, 0.9); topNow *= 0.94; }

    // cornering speed: lift only in hard corners, by personality
    const ac = Math.abs(c);
    if (ac > 2.2) topNow *= 1 - (ac - 2.2) * 0.06 * this.def.corner;
    if (this.steamT > 0) topNow *= 0.92;

    // short boost bursts on clear straights
    this.boostCharge = Math.min(2, this.boostCharge + dt * (this.def.boosts * ctx.level.boostMul) / Math.max(20, this.trackLen / this.base));
    if (this.boostT > 0) this.boostT -= dt;
    else if (this.boostCharge >= 1 && raceT > 3 && !block && hazard === 0 && this.speed > this.top * 0.85) {
      let straight = 0;
      for (let i = 4; i < 34; i++) straight += Math.abs(segs[(si + i) % N].curve);
      if (straight / 30 < 0.5 && this.rng.chance(dt * 1.2)) { this.boostT = 1.0; this.boostCharge -= 1; this.boosted = true; }
    }
    if (this.boostT > 0) topNow *= 1.16;
    topNow = Math.min(topNow, leadCap);

    if (this.speed < topNow) this.speed += this.accel * (this.boostT > 0 ? 2.2 : 1) * dt * Math.max(0.1, 1 - (this.speed / topNow) ** 2);
    else { this.speed = approach(this.speed, topNow, dt * 4000); this.braking = this.speed - topNow > 300; }

    // lateral
    this.tx = approach(this.tx, target, dt * (ahead ? 3 : 0.6)); // decisive into a passing lane; ease back after
    const maxLat = 0.8 * (this.speed / (SEG_LEN * 60)) + 0.7;
    // critically damped lateral spring (gain 2, damping 8): lane changes glide in without overshoot
    const want = clamp((this.tx - this.x) * 2, -maxLat, maxLat);
    this.vx += (want - this.vx) * (1 - Math.exp(-dt * 8));
    this.x += this.vx * dt;
    this.steer = approach(this.steer, clamp(this.vx * 2.2, -1, 1), dt * 5);
    // reckless drivers occasionally overcook a hard corner
    if (this.def.crash > 0 && ac > 2.4 && this.speed > this.top * 0.9 && this.rng.chance(dt * this.def.crash)) this.spin(t);
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
    if (this.def.personality === 'clean' && this.rng.chance(0.3)) return false; // Barney doesn't flinch
    this.swerveT = 0.9;
    this.swerveDir = this.x >= px ? 1 : -1;
    if (Math.abs(this.x + this.swerveDir * 0.6) > 0.9) this.swerveDir = -this.swerveDir;
    return true;
  }
}
