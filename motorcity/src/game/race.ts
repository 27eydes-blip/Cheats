/** A race in progress: player, rivals, traffic, pedestrians, particles, laps and standings. */
import { buildTrack, type BuiltTrack } from '../track/builder';
import type { TrackDef } from '../track/types';
import { SEG_LEN } from '../track/types';
import { Player, MAX_V, CAR_HALF, CAR_HIT, WOBBLE, type SideLimits } from './player';
import { FACADE_X, TUNNEL_X, RAIL_X, WALL_GAP, PROP_X } from '../track/types';
import { portals } from '../art/portals';
import { Rival, ROSTER, type Mover } from './ai';
import { TrafficManager, type Traffic } from './traffic';
import { WEATHER, type WeatherId } from '../data/weather';
import { statsFor, MPH, type UpgradeKind } from '../data/cars';
import { MODELS, carSprite, CAR_UPP, type ModelId } from '../art/cars';
import { spr, hitBox } from '../art/registry';
import { PED_FRAMES, PED_VARIANTS } from '../art/people';
import type { Scene, DrawCar, Particle, PedDraw } from '../render/renderer';
import { clamp, wrap, approach, sign, gapAlong } from '../core/math';
import { Rng, hash } from '../core/rng';
import { audio } from '../audio/audio';

export type Mode = 'career' | 'trial' | 'quick' | 'attract';

export interface RaceOpts {
  track: TrackDef;
  weather: WeatherId;
  mode: Mode;
  car: ModelId;
  paint: string;
  upgrades: Partial<Record<UpgradeKind, number>>;
  rivals: number;
  difficulty: number;
  laps?: number;
  ghost?: GhostLap | null;
  traffic?: number;
  /** Rival race pace in mph; defaults from difficulty. */
  pace?: number;
}

export interface GhostLap { trackId: string; time: number; car: ModelId; paint: string; samples: number[] } // [z,x,yaw]*

interface PedState { kind: string; variant: number; frame: number; t: number; react: number; reactKind: number; dx: number; dy: number; seg: number; x: number }
interface Part extends Particle { vx: number; vy: number; vz: number; life: number; max: number; grow: number }

/** One collision, as logged in debug mode (D, or tap pause 5 times). */
export interface HitLog {
  t: number; lap: number;
  kind: 'prop' | 'rival' | 'traffic';
  id: string;
  /** Object position (world z, lateral x in road half-widths). */
  objZ: number; objX: number;
  /** Player position when it fired. */
  playerZ: number; playerX: number;
  /** Signed gap along the road (object minus player) and across it. */
  dz: number; dx: number;
  lane: string;
  effect: string;
  speedBefore: number; speedAfter: number;
  /** The thing that was hit (for checking against what was drawn). */
  ref: object;
}

/** How far along the road a vehicle or object counts as level with the player's car on screen
 *  (its base inside the car's sprite). Calibrated against the renderer's projection: beyond this the
 *  road between the two is visible. */
export const CONTACT_AHEAD = 240;
export const CONTACT_BEHIND = 160;
/** Seconds of immunity to the same object after hitting it. */
export const HIT_GRACE = 0.75;

export const laneName = (x: number) => (x < -1.07 ? 'left sidewalk' : x < -0.33 ? 'left lane' : x <= 0.33 ? 'centre' : x <= 1.07 ? 'right lane' : 'right sidewalk');

export interface Standing { name: string; player: boolean; total: number; finished: boolean; time: number; model: string }

export class Race {
  opts: RaceOpts;
  track: BuiltTrack;
  weather = WEATHER.clear;
  player: Player;
  rivals: Rival[] = [];
  traffic: TrafficManager;
  peds: PedState[] = [];
  parts: Part[] = [];
  t = 0;
  raceT = 0;
  countdown = 3.6;
  lastCount = 4;
  state: 'countdown' | 'racing' | 'finished' = 'countdown';
  lap = 1; laps: number;
  lapStart = 0; lapTimes: number[] = []; bestLap = 0;
  camX = 0; skyX = 0; shake = 0;
  hornCool = 0; readonly hornMax = 3.2;
  finishT = 0;
  place = 1;
  messages: { text: string; t: number; big?: boolean }[] = [];
  private rng = new Rng(7);
  private ghostRec: number[] = [];
  private ghostAcc = 0;
  ghost: GhostLap | null;
  newGhost: GhostLap | null = null;
  coinsEarned = 0;
  stats = { drifts: 0, boosts: 0, horns: 0, crashes: 0, overtakes: 0, topMph: 0, slipT: 0 };
  private prevPlace = 1;
  autopilot: boolean;
  /** Debug mode: collisions are logged here (and to the console). */
  debug = false;
  hits: HitLog[] = [];
  private pendingHits: HitLog[] = [];
  private logHit(kind: HitLog['kind'], ref: object, id: string, objZ: number, objX: number, effect: string) {
    const p = this.player, L = this.track.length;
    const dz = wrap(objZ - p.z + L / 2, L) - L / 2;
    const h: HitLog = { t: Math.round(this.t * 100) / 100, lap: this.lap, kind, id, objZ: Math.round(objZ), objX: Math.round(objX * 100) / 100, playerZ: Math.round(p.z), playerX: Math.round(p.x * 100) / 100, dz: Math.round(dz), dx: Math.round((objX - p.x) * 100) / 100, lane: laneName(objX), effect, speedBefore: Math.round(p.speed), speedAfter: 0, ref };
    this.pendingHits.push(h);
  }
  private engineOpts = { on: true, boost: false, offroad: false, spin: false };

  constructor(opts: RaceOpts) {
    this.opts = opts;
    this.track = buildTrack(opts.track);
    this.weather = WEATHER[opts.weather];
    this.laps = opts.laps ?? opts.track.laps;
    this.autopilot = opts.mode === 'attract';
    const stats = statsFor(opts.car, opts.upgrades);
    stats.grip *= 1;
    this.player = new Player(stats);
    const L = this.track.length;
    // grid: player starts at the back of a staggered grid
    const n = opts.rivals;
    const roster = [...ROSTER].sort(() => this.rng.next() - 0.5).slice(0, n);
    roster.forEach((def, i) => {
      const row = Math.floor(i / 2), col = i % 2;
      const pace = opts.pace ?? 56 + (opts.difficulty - 0.9) * 160;
      const r = new Rival(def, wrap(SEG_LEN * (6 + (n - i) * 5.5) - row, L), col ? 0.45 : -0.45, pace, 100 + i);
      r.trackLen = L;
      this.rivals.push(r);
    });
    this.player.z = wrap(SEG_LEN * 3, L);
    this.player.x = n % 2 ? 0.45 : -0.45;
    if (n === 0) this.player.x = 0;
    this.traffic = new TrafficManager(this.track.segs, L, opts.traffic ?? (opts.mode === 'trial' ? 0 : 7), opts.track.seed + 3);
    for (const d of this.track.peds) {
      const kinds = ['gent', 'lady', 'worker', 'newsboy', 'boy', 'police', 'parasol'];
      this.peds.push({ kind: kinds.includes(d.kind) ? d.kind : 'gent', variant: d.seed % PED_VARIANTS, frame: 0, t: (d.seed % 100) / 100, react: 0, reactKind: 0, dx: 0, dy: 0, seg: d.seg, x: d.x });
    }
    this.ghost = opts.ghost && opts.ghost.trackId === opts.track.id ? opts.ghost : null;
    if (this.autopilot) { this.countdown = 0; this.state = 'racing'; this.player.started = true; this.rivals.forEach((r) => (r.speed = r.top * 0.8)); this.player.speed = this.player.stats.top * 0.8; }
  }

  get totalP() { return (this.lap - 1) * this.track.length + this.player.z; }

  segAt(z: number) { const s = this.track.segs; return s[Math.floor(wrap(z, this.track.length) / SEG_LEN) % s.length]; }

  msg(text: string, big = false) { this.messages.push({ text, t: 0, big }); }

  /** Positions at the start of the latest step, for interpolated rendering between fixed steps. */
  private prev = { pz: 0, px: 0, camX: 0, skyX: 0, t: 0 };
  private prevPos = new WeakMap<object, [number, number]>();
  private snapshot() {
    const p = this.player;
    this.prev = { pz: p.z, px: p.x, camX: this.camX, skyX: this.skyX, t: this.t };
    for (const r of this.rivals) this.prevPos.set(r, [r.z, r.x]);
    for (const v of this.traffic.list) this.prevPos.set(v, [v.z, v.x]);
  }

  update(dt: number, inp: { steer: number; brake: boolean; boost: boolean; horn: boolean }) {
    this.snapshot();
    this.t += dt;
    const p = this.player;
    const L = this.track.length;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastCount && c >= 0) {
        this.lastCount = c;
        if (c > 0 && c <= 3) { audio.countdown(false); this.msg(String(c), true); }
        if (c === 0) { audio.countdown(true); this.msg('GO!', true); this.state = 'racing'; p.started = true; this.lapStart = 0; audio.cheer(); }
      }
    }
    const racing = this.state !== 'countdown';
    if (racing) this.raceT += dt;

    // --- player
    let steer = inp.steer, brake = inp.brake, boost = inp.boost;
    if (this.autopilot || this.state === 'finished') {
      const ap = this.drive();
      steer = ap.steer; brake = ap.brake; boost = this.autopilot && p.boost >= 1 && Math.random() < 0.01;
    }
    const seg = this.segAt(p.z);
    p.update(dt, { steer, brake, boost }, seg, this.weather.grip, this.t, this.sideLimits(p.z));
    if (p.z >= L) {
      p.z -= L;
      if (this.state === 'racing' && this.opts.mode !== 'attract') this.completeLap();
    }

    // --- slipstream
    let slipping = false;
    for (const r of this.rivals) {
      const d = wrap(r.z - p.z, L);
      if (d > SEG_LEN * 0.8 && d < SEG_LEN * 9 && Math.abs(r.x - p.x) < 0.28 && p.pct > 0.5) { slipping = true; break; }
    }
    p.slip = slipping ? Math.min(1.5, p.slip + dt) : Math.max(0, p.slip - dt * 2);
    if (p.slip > 0.5) { p.boost = Math.min(3, p.boost + dt * 0.08); this.stats.slipT += dt; }

    // --- rivals + traffic
    const movers: Mover[] = [...this.rivals, ...this.traffic.list, { z: p.z, x: p.x, speed: p.speed, half: CAR_HALF, len: 760 }];
    const pm = { z: p.z, x: p.x, speed: p.speed, half: CAR_HALF, len: 760, total: this.totalP };
    for (const r of this.rivals) {
      const before = r.z;
      r.update(dt, this.track.segs, movers, pm, this.t, racing, this.raceT);
      if (r.z >= L) { r.z -= L; r.laps++; if (r.laps >= this.laps && !r.finished) { r.finished = true; r.finishTime = this.raceT; } }
      void before;
    }
    this.traffic.update(dt, p.z, this.t, racing);

    // --- horn
    if (this.hornCool > 0) this.hornCool -= dt;
    if (inp.horn && this.hornCool <= 0 && !this.autopilot) this.horn();

    // --- collisions
    this.collide(dt);
    for (const h of this.pendingHits) {
      h.speedAfter = Math.round(this.player.speed);
      this.hits.push(h);
      if (this.hits.length > 500) this.hits.shift();
      if (this.debug) console.info(`[hit] ${h.kind} ${h.id} at z=${h.objZ} x=${h.objX} (${h.lane}); player z=${h.playerZ} x=${h.playerX}; gap dz=${h.dz} dx=${h.dx}; ${h.effect}; speed ${h.speedBefore}→${h.speedAfter}`);
    }
    this.pendingHits.length = 0;

    // --- standings
    this.place = 1 + this.rivals.filter((r) => r.finished ? true : r.laps * L + r.z > this.totalP).length;
    if (this.state === 'racing' && this.raceT > 3 && this.place < this.prevPlace) { this.stats.overtakes += this.prevPlace - this.place; }
    this.prevPlace = this.place;

    // --- events -> audio/particles/messages
    for (const e of p.ev) this.onEvent(e);
    p.ev.length = 0;

    // --- peds
    this.updatePeds(dt);
    // --- particles
    this.emit(dt);
    for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.size += q.grow * dt; q.alpha = Math.max(0, (q.life / q.max)) * (q.kind === 'smoke' ? 0.5 : q.kind === 'steam' ? 0.6 : 1); }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < (m.big ? 1.0 : 2.2));

    // --- camera & background
    this.camX = approach(this.camX, p.x * 0.82, dt * 3);
    this.skyX += seg.curve * p.pct * dt * 60 * 1.6;
    this.shake *= Math.exp(-dt * 4.5);
    if (this.shake < 0.01) this.shake = 0;
    if (p.boostT > 0) this.shake = Math.max(this.shake, 0.2);
    this.stats.topMph = Math.max(this.stats.topMph, p.speed / MPH);

    // --- ghost recording (time trial)
    if (this.opts.mode === 'trial' && this.state === 'racing') {
      this.ghostAcc += dt;
      if (this.ghostAcc >= 0.1) { this.ghostAcc -= 0.1; this.ghostRec.push(Math.round(p.z), Math.round(p.x * 100) / 100, p.drifting ? p.driftDir : Math.abs(p.steer) > 0.35 ? sign(p.steer) : 0); }
    }

    if (this.state === 'finished') this.finishT += dt;

    // --- audio continuous layers
    const eo = this.engineOpts; eo.on = true; eo.boost = p.boostT > 0; eo.offroad = p.offroad; eo.spin = p.spinT > 0;
    audio.engine(p.pct, eo);
    // street ambience: hoof clops near carriages, the odd trolley bell
    for (const v of this.traffic.list) {
      const d = Math.abs(wrap(v.z - p.z + L / 2, L) - L / 2);
      if (d > SEG_LEN * 12) continue;
      if ((v.kind === 'carriage' || v.kind === 'wagon') && Math.random() < dt * 4 * (1 - d / (SEG_LEN * 12))) audio.clop();
      if (v.kind === 'trolley' && Math.random() < dt * 0.25) audio.trolleyBell();
    }
    audio.skid(p.drifting ? 0.8 : p.spinT > 0 ? 1 : 0);
    let near = 0;
    for (const r of this.rivals) { const d = Math.abs(wrap(r.z - p.z + L / 2, L) - L / 2); near = Math.max(near, 1 - d / (SEG_LEN * 14)); }
    audio.rivals(near);
    const crowdNear = seg.bunting ? 0.9 : 0.15;
    audio.crowd(this.autopilot ? 0 : crowdNear);
  }

  /** A competent robot driver (title-screen attract mode, the lap after the flag, tests). */
  private apLane = 0;
  drive(): { steer: number; brake: boolean } {
    const p = this.player, L = this.track.length;
    let c = 0;
    for (let i = 3; i < 14; i++) c += this.segAt(p.z + i * SEG_LEN).curve;
    c /= 11;
    let target = clamp(sign(c) * Math.min(1, Math.abs(c) / 3) * 0.5, -0.6, 0.6) + this.apLane;
    let brake = false;
    let blocked = false;
    for (const v of [...this.rivals, ...this.traffic.list]) {
      const d = wrap(v.z - p.z, L);
      if (d > SEG_LEN * 30 || d < 0) continue;
      if (Math.abs(v.x - target) < v.half + CAR_HALF + 0.12 && v.speed < p.speed + 300) {
        blocked = true;
        const left = v.x - (v.half + CAR_HALF + 0.2), right = v.x + (v.half + CAR_HALF + 0.2);
        target = Math.abs(left - p.x) < Math.abs(right - p.x) && left > -0.9 ? left : right < 0.9 ? right : left;
        if (d < SEG_LEN * 9 && Math.abs(v.x - p.x) < v.half + CAR_HALF + 0.05 && p.speed > v.speed + 500) brake = true;
        break;
      }
    }
    if (!blocked) this.apLane *= 0.98;
    for (let i = 0; i < 12; i++) { const s = this.segAt(p.z + i * SEG_LEN); if (s.portal || s.tunnel) { target *= 0.4; break; } }
    target = clamp(target, -0.85, 0.85);
    // corners too hard to hold at speed: lift via brake/drift
    const need = Math.abs(c) * 0.42 * p.pct;
    if (need > 0.85 && p.pct > 0.6) brake = true;
    const steer = clamp((target - p.x) * 3 + c * 0.32 * p.pct * 1.4, -1, 1);
    return { steer, brake };
  }

  private completeLap() {
    const time = this.raceT - this.lapStart;
    this.lapTimes.push(time);
    this.lapStart = this.raceT;
    const best = !this.bestLap || time < this.bestLap;
    if (best) this.bestLap = time;
    if (this.opts.mode === 'trial') {
      if (!this.ghost || time < this.ghost.time) {
        this.newGhost = { trackId: this.opts.track.id, time, car: this.opts.car, paint: this.opts.paint, samples: this.ghostRec };
        if (this.ghost) this.msg('NEW RECORD LAP!');
        this.ghost = this.newGhost;
      }
      this.ghostRec = [];
      this.ghostAcc = 0;
    }
    this.lap++;
    if (this.lap > this.laps) { this.state = 'finished'; this.finishT = 0; audio.cheer(); this.msg(this.opts.mode === 'trial' ? 'TIME!' : this.place === 1 ? 'VICTORY!' : 'FINISHED', true); }
    else { this.msg(this.lap === this.laps ? 'FINAL LAP!' : `LAP ${this.lap}`); if (this.lap === this.laps) audio.cheer(); }
  }

  horn() {
    const p = this.player;
    this.hornCool = this.hornMax;
    this.stats.horns++;
    audio.horn();
    const L = this.track.length;
    let swerved = 0;
    for (const r of this.rivals) {
      const d = wrap(r.z - p.z, L);
      if (d < SEG_LEN * 22 && Math.abs(r.x - p.x) < 0.9) { if (r.hornReact(p.x)) swerved++; }
    }
    for (const v of this.traffic.list) {
      const d = wrap(v.z - p.z, L);
      if (d < SEG_LEN * 26) {
        const r = v.horn(p.x, this.rng);
        if (r === 'bell') audio.trolleyBell(); else if (r === 'whinny') audio.whinny();
      }
    }
    // pedestrians ahead react
    const pi = Math.floor(p.z / SEG_LEN);
    const N = this.track.segs.length;
    for (const ped of this.peds) {
      const d = wrap(ped.seg - pi, N);
      if (d < 30 && ped.react <= 0) {
        const near = Math.abs(ped.x) < 1.35 && d < 12;
        ped.reactKind = near ? PED_FRAMES.jump : ped.kind === 'gent' || ped.kind === 'police' ? PED_FRAMES.tip : PED_FRAMES.wave;
        ped.react = 1.2 + hash(ped.seg) * 0.6;
      }
    }
    if (swerved) this.msg(swerved > 1 ? 'OUT OF THE WAY!' : 'BEEP BEEP!');
  }

  /** Furthest the car's centre may go on each side at z, looking ahead so walls narrow gradually
   *  (e.g. into a tunnel mouth or a bridge arch) instead of appearing as a sudden edge. */
  sideLimits(z: number): SideLimits {
    let l = 9, r = 9;
    for (let k = -1; k < 16; k++) {
      const s = this.segAt(z + k * SEG_LEN);
      const taper = Math.max(0, k - 1) * 0.045;
      // on streets the soft wall sits just before the lamp/pole line, so the sidewalk is pure run-off
      const hasProps = s.zone === 'city' || s.zone === 'plaza' || s.zone === 'industrial' || s.zone === 'park' || s.zone === 'river';
      let wall = hasProps ? PROP_X + WALL_GAP - CAR_HALF - 0.04 : FACADE_X;
      if (s.tunnel) wall = TUNNEL_X;
      if (s.portal) { const pt = portals()[s.portal.kind]; if (pt) wall = Math.min(wall, pt.open); }
      const wl = s.waterL ? Math.min(wall, RAIL_X) : wall;
      const wr = s.waterR ? Math.min(wall, RAIL_X) : wall;
      l = Math.min(l, wl - WALL_GAP + taper);
      r = Math.min(r, wr - WALL_GAP + taper);
      // and never close enough to touch street furniture: stop short of the nearest solid object's hitbox
      for (const o of s.sprites) {
        if (!o.hit) continue;
        const hb = hitBox(o.id, o.seed ?? 0, o.x, o.flip);
        if (!hb) continue;
        const reach = Math.abs(hb.cx) - hb.half - CAR_HALF - 0.04 + taper;
        if (hb.cx < 0) l = Math.min(l, reach); else r = Math.min(r, reach);
      }
    }
    return { l, r };
  }

  /** Per-object grace period after a hit: no further collisions with that same object for 0.75 s. */
  private immuneUntil = new WeakMap<object, number>();
  private immune(o: object) { return (this.immuneUntil.get(o) ?? -1) > this.t; }
  private grace(o: object) { this.immuneUntil.set(o, this.t + HIT_GRACE); }

  /**
   * Collisions use exactly what is drawn:
   *  - along the road, a thing touches the car only while its base (where its sprite meets the road) is
   *    level with the car on screen: from CONTACT_BEHIND behind our rear to CONTACT_AHEAD ahead of it;
   *  - across the road, hitboxes are the visible solid part of each sprite (shrunk 10%), mirrored with
   *    the sprite when it is drawn flipped;
   *  - distances use the same lap-wrapped measure (gapAlong) as the renderer.
   * Only solid, drawn sprites count: wires, banners, bunting, shadows and pedestrians never collide.
   * A hit costs at most ~40% of current speed, with a short wobble and a sidestep; never a dead stop.
   */
  private collide(dt: number) {
    const p = this.player;
    const speedIn = p.speed;
    this.collideAll(dt);
    // however many things were touched this step, never lose more than 40% of speed at once
    if (p.speed < speedIn * 0.6) p.speed = speedIn * 0.6;
  }

  private collideAll(dt: number) {
    const p = this.player;
    const L = this.track.length;
    const t = this.t;
    // roadside objects
    for (let k = -1; k <= 2; k++) {
      const s = this.segAt(p.z + k * SEG_LEN);
      const g = gapAlong(s.z1, p.z, L);
      if (g < -CONTACT_BEHIND || g > CONTACT_AHEAD) continue;
      for (const o of s.sprites) {
        if (!o.hit || this.immune(o)) continue;
        const hb = hitBox(o.id, o.seed ?? 0, o.x, o.flip);
        if (!hb || Math.abs(p.x - hb.cx) >= hb.half + CAR_HIT) continue;
        const away = Math.sign(p.x - hb.cx) || -Math.sign(p.x);
        const hard = p.pct > 0.25;
        this.logHit('prop', o, o.id, s.z1, hb.cx, hard ? 'crash (wobble, -38% speed)' : 'bump (-15% speed)');
        if (hard) { p.crash(t, away); this.shake = Math.max(this.shake, 0.7); }
        else { p.speed *= 0.85; p.vx = away * 0.8; audio.bump(); }
        this.grace(o);
      }
    }
    // other vehicles: only those level with us on screen; anything behind is the AI's job to avoid
    const contact = (o: Mover & { vx?: number; spin?: (t: number) => void }, isRival: boolean) => {
      if (this.immune(o)) return;
      const g = gapAlong(o.z, p.z, L);
      if (g <= -CONTACT_BEHIND || g >= CONTACT_AHEAD) return;
      if (Math.abs(o.x - p.x) >= o.half + CAR_HIT) return;
      const side = sign(p.x - o.x) || (p.x < 0 ? 1 : -1);
      const name = isRival ? (o as unknown as Rival).def.name : (o as unknown as Traffic).kind;
      const rel = p.speed - o.speed;
      if (g > CONTACT_AHEAD * 0.4 && rel > 0) {
        // we ran into its back
        if (rel > MAX_V * 0.3 && p.spinT <= 0) {
          this.logHit(isRival ? 'rival' : 'traffic', o, name, o.z, o.x, 'crash (wobble, -38% speed)');
          p.crash(t, side); this.shake = Math.max(this.shake, 0.8);
          o.spin?.(t);
          if (!isRival) audio.whinny();
        } else {
          const loss = Math.min(p.speed * 0.4, Math.max(p.speed * 0.08, rel * 0.6));
          this.logHit(isRival ? 'rival' : 'traffic', o, name, o.z, o.x, `rear bump (-${Math.round((loss / Math.max(1, p.speed)) * 100)}% speed)`);
          p.speed -= loss;
          p.bump(t, 0, 0);
        }
        p.vx = side * 1.1; // sidestep out from behind it rather than sitting in it
        if (isRival) o.speed = Math.min(o.speed + rel * 0.15, o.speed * 1.08);
      } else {
        // alongside: lean off each other
        this.logHit(isRival ? 'rival' : 'traffic', o, name, o.z, o.x, 'side rub (-6% speed)');
        p.vx = side * 1.1;
        p.speed *= 0.94;
        if (o.vx !== undefined) o.vx += (-side * 0.5 - o.vx) * 0.5; // a nudge, blended so it never snaps
        p.bump(t, 0, 0);
      }
      this.grace(o);
    };
    for (const r of this.rivals) contact(r, true);
    for (const v of this.traffic.list) contact(v, false);
    // rivals vs traffic and vs each other: spacing without overlap (same contact window, no teleports)
    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      const others: Mover[] = [...this.traffic.list, ...this.rivals.slice(i + 1)];
      for (const o of others) {
        // AI spacing is purely visual: keep a full car length between their sprites (no position jumps)
        const g = gapAlong(o.z, r.z, L);
        const space = (o.len + r.len) / 2;
        if (Math.abs(g) >= space || Math.abs(o.x - r.x) >= o.half + r.half) continue;
        const side = sign(r.x - o.x) || 1;
        const lead = g > 0 ? o : r, trail = g > 0 ? r : o;
        if (Math.abs(g) > space * 0.55) {
          trail.speed = Math.min(trail.speed, lead.speed);
          if (r.def.personality === 'reckless' && trail === r && r.speed - o.speed > MAX_V * 0.3) r.spin(this.t);
        }
        // ease apart sideways in proportion to the overlap
        const overlap = o.half + r.half - Math.abs(o.x - r.x);
        const nudge = Math.min(overlap, 0.9 * dt);
        const oIsRival = (o as Mover & { vx?: number }).vx !== undefined;
        r.x = clamp(r.x + side * nudge * (oIsRival ? 0.5 : 1), -0.92, 0.92);
        if (oIsRival) o.x = clamp(o.x - side * nudge * 0.5, -0.92, 0.92);
      }
    }
  }

  private onEvent(e: string) {
    const p = this.player;
    switch (e) {
      case 'boost':
        audio.backfire(); this.stats.boosts++; this.shake = Math.max(this.shake, 0.6); this.msg('BOOST!');
        for (let i = 0; i < 8; i++) this.spawn({ kind: 'spark', tone: i % 2 ? '#ffb040' : '#fff0a0', z: p.z - 200, x: p.x + 0.17, y: 90, vx: 0.4 + Math.random() * 0.3, vy: Math.random() * 300, vz: -1500 + Math.random() * 600, life: 0.25, size: 26, grow: 0 });
        break;
      case 'crash': audio.crash(); this.stats.crashes++; this.msg('CRASH!'); this.shake = Math.max(this.shake, 0.8); break;
      case 'bump': audio.bump(); this.shake = Math.max(this.shake, 0.3); break;
      case 'scrape': audio.scrape(); for (let i = 0; i < 6; i++) this.spawn({ kind: 'spark', tone: '#ffe080', z: p.z + 100, x: p.x + sign(p.x) * 0.2, y: 60, vx: -sign(p.x) * Math.random(), vy: 400 * Math.random(), vz: -500, life: 0.3, size: 18, grow: 0 }); break;
      case 'steam': audio.steam(); break;
      case 'driftEnd': this.stats.drifts++; if (p.driftT > 1.2) this.msg(p.driftT > 2.2 ? 'GRAND POWERSLIDE!' : 'POWERSLIDE!'); break;
    }
  }

  private spawn(q: Omit<Part, 'alpha' | 'max'>) {
    if (this.parts.length > 160) return;
    this.parts.push({ ...q, alpha: 1, max: q.life });
  }

  private emit(dt: number) {
    const p = this.player;
    // exhaust puffs
    if (p.started && Math.random() < dt * (6 + p.pct * 8)) this.spawn({ kind: 'smoke', tone: p.boostT > 0 ? '#3a3028' : '#cfc4b0', z: p.z - 120, x: p.x + 0.2, y: 50, vx: 0.15, vy: 260, vz: p.speed * 0.6, life: 0.7, size: 30, grow: 120 });
    // tyre smoke while drifting / spinning / offroad dust
    if ((p.drifting || p.spinT > 0) && Math.random() < dt * 40) {
      for (const s of [-1, 1]) this.spawn({ kind: 'smoke', tone: '#e8e0d0', z: p.z - 60, x: p.x + s * 0.18, y: 30, vx: (Math.random() - 0.5) * 0.4, vy: 150, vz: p.speed * 0.75, life: 0.8, size: 50, grow: 260 });
    }
    if (p.offroad && p.pct > 0.2 && Math.random() < dt * 25) this.spawn({ kind: 'smoke', tone: '#b8a890', z: p.z - 50, x: p.x + (Math.random() - 0.5) * 0.4, y: 20, vx: 0, vy: 80, vz: p.speed * 0.8, life: 0.6, size: 40, grow: 150 });
    // radiator steam after a crash
    if ((p.steamT > 0 || p.spinT > 0) && Math.random() < dt * 30) this.spawn({ kind: 'steam', tone: '#f4f0e8', z: p.z + 420, x: p.x + (Math.random() - 0.5) * 0.08, y: 330, vx: (Math.random() - 0.5) * 0.3, vy: 420, vz: p.speed * 0.9, life: 0.9, size: 26, grow: 160 });
    for (const r of this.rivals) if ((r.steamT > 0 || r.spinT > 0) && Math.random() < dt * 14) this.spawn({ kind: 'steam', tone: '#f4f0e8', z: r.z + 400, x: r.x, y: 330, vx: 0, vy: 380, vz: r.speed * 0.9, life: 0.9, size: 26, grow: 160 });
    // rain splashes off the wheels
    if (this.weather.wet && p.pct > 0.3 && Math.random() < dt * 30) for (const s of [-1, 1]) this.spawn({ kind: 'splash', tone: '#d8dcd8', z: p.z - 80, x: p.x + s * 0.24, y: 20, vx: s * 0.5, vy: 300, vz: p.speed * 0.7, life: 0.35, size: 16, grow: 40 });
  }

  private updatePeds(dt: number) {
    const p = this.player;
    const N = this.track.segs.length;
    const pi = Math.floor(p.z / SEG_LEN);
    for (const ped of this.peds) {
      const d = wrap(ped.seg - pi, N);
      if (d > 120 && d < N - 10) continue; // far away: skip
      ped.t += dt;
      if (ped.react > 0) {
        ped.react -= dt;
        ped.frame = ped.reactKind;
        if (ped.reactKind === PED_FRAMES.jump) { ped.dx = approach(ped.dx, sign(ped.x) * 0.18, dt * 1.2); ped.dy = Math.max(0, Math.sin((1.4 - ped.react) * 8) * 120); }
      } else {
        ped.dy = 0;
        ped.dx = approach(ped.dx, 0, dt * 0.2);
        // cheer as the player passes, jump back if they mount the kerb nearby
        if (d < 8 && Math.abs(p.x - ped.x) < 0.55 && p.pct > 0.3) { ped.reactKind = PED_FRAMES.jump; ped.react = 0.9; }
        else if (this.state !== 'countdown' && d < 5 && hash(ped.seg * 3 + Math.floor(this.t)) < 0.5 && ped.kind !== 'police') { ped.reactKind = PED_FRAMES.wave; ped.react = 0.8; }
        else ped.frame = ped.kind === 'police' ? (Math.floor(ped.t * 0.8) % 2 ? PED_FRAMES.point : PED_FRAMES.idle) : (Math.floor(ped.t * 1.3 + ped.seg) % 4 === 0 ? PED_FRAMES.idle2 : PED_FRAMES.idle);
      }
      if (this.state !== 'countdown' && this.segAt(ped.seg * SEG_LEN).bunting && ped.react <= 0 && hash(ped.seg + Math.floor(this.t * 2)) < 0.3) { ped.reactKind = PED_FRAMES.wave; ped.react = 0.5; }
    }
  }

  standings(): Standing[] {
    const L = this.track.length;
    const done = this.state === 'finished';
    const list: Standing[] = this.rivals.map((r) => {
      const dist = r.laps * L + r.z;
      // once the player has finished, project the others' finishing times from their pace
      const est = r.finished ? r.finishTime : done ? this.finishRaceTime() + Math.max(0, this.laps * L - dist) / Math.max(2000, r.top * 0.85) : 0;
      return { name: r.def.name, player: false, total: r.finished || done ? 1e12 - est : dist, finished: r.finished || done, time: est, model: r.model.name };
    });
    list.push({ name: 'You', player: true, total: this.state === 'finished' ? 1e12 - this.finishRaceTime() : this.totalP, finished: this.state === 'finished', time: this.finishRaceTime(), model: MODELS[this.opts.car]?.name ?? '' });
    return list.sort((a, b) => b.total - a.total);
  }
  private finishTimeCache = 0;
  finishRaceTime() { if (this.state === 'finished' && !this.finishTimeCache) this.finishTimeCache = this.lapTimes.reduce((a, b) => a + b, 0); return this.finishTimeCache; }

  // ---------- scene for the renderer ----------
  /** Builds the renderer's view, interpolated `alpha` (0..1) of the way from the previous step to this one. */
  scene(alpha = 1): Scene {
    const p = this.player;
    const w = this.weather;
    const L = this.track.length;
    const night = w.lamps;
    const lz = (a: number, b: number) => { let d = b - a; if (d < -L / 2) d += L; if (d > L / 2) d -= L; return wrap(a + d * alpha, L); };
    const lerpPos = (o: { z: number; x: number }) => { const pr = this.prevPos.get(o); return pr ? { z: lz(pr[0], o.z), x: pr[1] + (o.x - pr[1]) * alpha } : { z: o.z, x: o.x }; };
    const ti = this.prev.t + (this.t - this.prev.t) * alpha;
    const cars: DrawCar[] = [];
    for (const r of this.rivals) { const d = this.rivalDraw(r, ti); const q = lerpPos(r); d.z = q.z; d.x = q.x; d.hit = r.half; d.ref = r; cars.push(d); }
    for (const v of this.traffic.list) {
      const s = spr(`${v.kind}:${v.variant}`, Math.floor(v.wheel) % 2);
      const q = lerpPos(v);
      if (s) cars.push({ z: q.z, x: q.x, img: s.img, upp: s.upp, lift: Math.abs(v.bob) * 10, head: night, hit: v.half, ref: v });
    }
    if (this.ghost && this.state === 'racing' && this.opts.mode === 'trial') {
      const lapT = this.raceT - this.lapStart;
      const i = Math.floor(lapT / 0.1) * 3;
      const smp = this.ghost.samples;
      if (i + 5 < smp.length) {
        const f = (lapT % 0.1) / 0.1;
        let z0 = smp[i], z1 = smp[i + 3]; if (z1 < z0) z1 += L;
        const yaw = smp[i + 2] as -1 | 0 | 1;
        const img = carSprite(MODELS[this.ghost.car] ?? MODELS.runabout, 'rear', { yaw, wheel: Math.floor(lapT * 20), brake: false, scarf: 0, colour: true, paint: this.ghost.paint });
        cars.push({ z: wrap(z0 + (z1 - z0) * f, L), x: smp[i + 1] + (smp[i + 4] - smp[i + 1]) * f, img, upp: CAR_UPP, alpha: 0.45 });
      }
    }
    const model = MODELS[this.opts.car] ?? MODELS.runabout;
    let yaw: -1 | 0 | 1 = p.drifting ? (p.driftDir as -1 | 1) : p.steer > 0.3 ? 1 : p.steer < -0.3 ? -1 : 0;
    // a small lean into turns, a drift angle, and a short decaying wobble after a knock
    let rot = p.lean * 0.04 + (p.drifting ? -p.driftDir * 0.05 : 0);
    if (p.spinT > 0) {
      const k = p.spinT / WOBBLE;
      const wob = Math.sin((1 - k) * Math.PI * 3) * 0.3 * k * p.spinDir;
      rot += wob;
      yaw = wob > 0.08 ? 1 : wob < -0.08 ? -1 : 0;
    }
    const img = carSprite(model, 'rear', { yaw, wheel: Math.floor(p.wheel), brake: p.braking || (p.drifting && p.pct > 0.3), scarf: p.scarf, colour: true, paint: this.opts.paint });
    // smooth, speed-scaled road rumble (no per-frame randomness)
    const pct = p.started ? p.pct : 0;
    const rum = p.rumble;
    const lift = (Math.sin(ti * 38) * 0.5 + 0.5) * pct * 7 + rum * (Math.sin(ti * 61) * 0.5 + 0.5) * (6 + pct * 18);
    const camBob = Math.sin(ti * 31) * 3.5 * pct + rum * (Math.sin(ti * 47) * 0.6 + Math.sin(ti * 23) * 0.4) * (4 + pct * 12);
    const pz = lz(this.prev.pz, p.z);
    const player: DrawCar = { z: pz, x: this.prev.px + (p.x - this.prev.px) * alpha, img, upp: CAR_UPP, rot, lift, brake: p.braking, hit: CAR_HIT, ref: p };
    return {
      track: this.track,
      playerZ: pz,
      camX: this.prev.camX + (this.camX - this.prev.camX) * alpha,
      camBob,
      player,
      cars,
      particles: this.parts,
      pedSprite: (i) => this.pedSprite(i),
      weather: w,
      time: ti,
      skyX: this.prev.skyX + (this.skyX - this.prev.skyX) * alpha,
      shake: this.shake,
      headlamps: w.id === 'night' || w.id === 'fog' || this.segAt(p.z).tunnel,
    };
  }

  private rivalDraw(r: Rival, ti: number): DrawCar {
    let rot = r.steer * 0.03;
    let yaw: -1 | 0 | 1 = r.steer > 0.35 ? 1 : r.steer < -0.35 ? -1 : 0;
    if (r.spinT > 0) {
      const k = r.spinT / 0.9;
      const wob = Math.sin((1 - k) * Math.PI * 3) * 0.3 * k * r.spinDir;
      rot += wob; yaw = wob > 0.08 ? 1 : wob < -0.08 ? -1 : 0;
    }
    const img = carSprite(r.model, 'rear', { yaw, wheel: Math.floor(r.wheel), brake: r.braking, scarf: Math.floor(ti * 8) % 3, colour: false });
    return { z: r.z, x: r.x, img, upp: CAR_UPP, rot, brake: r.braking, lift: (Math.sin(ti * 36 + r.z * 0.001) * 0.5 + 0.5) * 6 * (r.speed / MAX_V) };
  }

  private pedSprite(i: number): PedDraw | null {
    const ped = this.peds[i];
    if (!ped) return null;
    const s = spr(`ped:${ped.kind}:${ped.variant}`, ped.frame);
    if (!s) return null;
    const img = ped.x < 0 ? s.img : s.flip ?? s.img;
    return { img, upp: s.upp, dx: ped.dx, dy: ped.dy };
  }

  hud() {
    const p = this.player;
    const dots: { z: number; player?: boolean; ghost?: boolean }[] = this.rivals.map((r) => ({ z: r.z }));
    dots.push({ z: p.z, player: true });
    return { mph: p.speed / MPH, maxMph: Math.max(60, p.stats.top / MPH), boost: p.boost, boosting: p.boostT > 0, slip: p.slip, track: this.track, dots };
  }
}
