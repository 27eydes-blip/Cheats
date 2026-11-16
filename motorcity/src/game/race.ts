/** A race in progress: player, rivals, traffic, pedestrians, particles, laps and standings. */
import { buildTrack, type BuiltTrack } from '../track/builder';
import type { TrackDef } from '../track/types';
import { SEG_LEN } from '../track/types';
import { Player, MAX_V, CAR_HALF } from './player';
import { Rival, ROSTER, type Mover } from './ai';
import { TrafficManager } from './traffic';
import { WEATHER, type WeatherId } from '../data/weather';
import { statsFor, MPH, type UpgradeKind } from '../data/cars';
import { MODELS, carSprite, CAR_UPP, type ModelId } from '../art/cars';
import { spr } from '../art/registry';
import { PED_FRAMES, PED_VARIANTS } from '../art/people';
import type { Scene, DrawCar, Particle, PedDraw } from '../render/renderer';
import { clamp, wrap, approach, sign } from '../core/math';
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

  update(dt: number, inp: { steer: number; brake: boolean; boost: boolean; horn: boolean }) {
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
    p.update(dt, { steer, brake, boost }, seg, this.weather.grip, this.t);
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
    this.collide();

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
    this.shake = Math.max(0, this.shake - dt * 2);
    if (p.boostT > 0) this.shake = Math.max(this.shake, 0.25);
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

  private collide() {
    const p = this.player;
    const L = this.track.length;
    const t = this.t;
    // roadside objects
    if (p.spinT <= 0 && Math.abs(p.x) > 0.95) {
      for (const dz of [0, 1]) {
        const s = this.segAt(p.z + dz * SEG_LEN);
        for (const o of s.sprites) {
          if (!o.hit) continue;
          if (Math.abs(p.x - o.x) < o.hit + CAR_HALF * 0.8) {
            if (p.pct > 0.35) { p.crash(t, sign(p.x - o.x)); this.shake = 1; }
            else { p.speed *= 0.4; p.x += sign(p.x - o.x) * 0.05; audio.bump(); }
            break;
          }
        }
      }
    }
    // cars
    const hit = (o: Mover, onHit: (rel: number) => void) => {
      let dz = wrap(o.z - p.z + L / 2, L) - L / 2;
      if (Math.abs(dz) < (o.len + 760) / 2 && Math.abs(o.x - p.x) < o.half + CAR_HALF) onHit(dz);
    };
    for (const r of this.rivals) {
      if (r.spinT > 0) continue;
      hit(r, (dz) => {
        const rel = p.speed - r.speed;
        const side = sign(p.x - r.x) || 1;
        if (dz > 0 && rel > 0) {
          // rear-ended a rival
          if (rel > MAX_V * 0.28) { p.crash(t, side); r.spin(t); this.shake = 1; }
          else { p.speed = r.speed * 0.92; r.speed += rel * 0.3; p.bump(t, side * 0.8, 0); }
          this.pushBack(dz - (r.len + 760) / 2 - 2);
        } else if (dz < 0 && rel < 0) {
          r.speed = Math.min(r.speed, p.speed * 0.95);
          p.bump(t, side * 0.5, 120);
        } else {
          p.bump(t, side * 1.1, -80); r.x -= side * 0.08;
        }
      });
    }
    for (const v of this.traffic.list) {
      hit(v, (dz) => {
        const rel = p.speed - v.speed;
        const side = sign(p.x - v.x) || 1;
        if (dz > 0 && rel > MAX_V * 0.32) { p.crash(t, side); this.shake = 1; p.speed = v.speed; this.pushBack(dz - (v.len + 760) / 2 - 2); if (v.kind === 'carriage' || v.kind === 'wagon') audio.whinny(); }
        else { p.bump(t, side * 1.2, dz > 0 ? -Math.max(0, rel) * 0.6 : 0); if (dz > 0) this.pushBack(dz - (v.len + 760) / 2 - 2); }
      });
    }
    // rivals vs traffic (so AI isn't a ghost)
    for (const r of this.rivals) {
      for (const v of this.traffic.list) {
        let dz = wrap(v.z - r.z + L / 2, L) - L / 2;
        if (dz > 0 && dz < (v.len + r.len) / 2 && Math.abs(v.x - r.x) < v.half + r.half) {
          if (r.speed - v.speed > MAX_V * 0.3 && r.def.personality === 'reckless') r.spin(t);
          r.speed = Math.min(r.speed, v.speed); r.x += sign(r.x - v.x) * 0.02;
        }
      }
    }
  }

  /** Moves the player back along the road (negative amount) without ever crossing the start line backwards. */
  private pushBack(amount: number) {
    if (amount >= 0) return;
    this.player.z = Math.max(0, this.player.z + amount);
  }

  private onEvent(e: string) {
    const p = this.player;
    switch (e) {
      case 'boost':
        audio.backfire(); this.stats.boosts++; this.shake = 0.8; this.msg('BOOST!');
        for (let i = 0; i < 8; i++) this.spawn({ kind: 'spark', tone: i % 2 ? '#ffb040' : '#fff0a0', z: p.z - 200, x: p.x + 0.17, y: 90, vx: 0.4 + Math.random() * 0.3, vy: Math.random() * 300, vz: -1500 + Math.random() * 600, life: 0.25, size: 26, grow: 0 });
        break;
      case 'crash': audio.crash(); this.stats.crashes++; this.msg('CRASH!'); this.shake = 1; break;
      case 'bump': audio.bump(); this.shake = Math.max(this.shake, 0.4); break;
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
  scene(): Scene {
    const p = this.player;
    const w = this.weather;
    const night = w.lamps;
    const cars: DrawCar[] = [];
    for (const r of this.rivals) cars.push(this.rivalDraw(r));
    for (const v of this.traffic.list) {
      const s = spr(`${v.kind}:${v.variant}`, Math.floor(v.wheel) % 2);
      if (s) cars.push({ z: v.z, x: v.x, img: s.img, upp: s.upp, lift: Math.abs(v.bob) * 10, head: night });
    }
    if (this.ghost && this.state === 'racing' && this.opts.mode === 'trial') {
      const lapT = this.raceT - this.lapStart;
      const i = Math.floor(lapT / 0.1) * 3;
      const smp = this.ghost.samples;
      if (i + 5 < smp.length) {
        const f = (lapT % 0.1) / 0.1;
        let z0 = smp[i], z1 = smp[i + 3]; if (z1 < z0) z1 += this.track.length;
        const yaw = smp[i + 2] as -1 | 0 | 1;
        const img = carSprite(MODELS[this.ghost.car] ?? MODELS.runabout, 'rear', { yaw, wheel: Math.floor(lapT * 20), brake: false, scarf: 0, colour: true, paint: this.ghost.paint });
        cars.push({ z: wrap(z0 + (z1 - z0) * f, this.track.length), x: smp[i + 1] + (smp[i + 4] - smp[i + 1]) * f, img, upp: CAR_UPP, alpha: 0.45 });
      }
    }
    const model = MODELS[this.opts.car] ?? MODELS.runabout;
    let view: 'rear' | 'side' | 'front' = 'rear';
    let rot = 0;
    let yaw: -1 | 0 | 1 = p.drifting ? (p.driftDir as -1 | 1) : p.steer > 0.3 ? 1 : p.steer < -0.3 ? -1 : 0;
    let flipSide = false;
    if (p.spinT > 0) {
      const a = ((1.5 - p.spinT) / 1.5) * Math.PI * 4 * p.spinDir;
      const ph = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const q = Math.round(ph / (Math.PI / 2)) % 4;
      view = q === 0 ? 'rear' : q === 2 ? 'front' : 'side';
      flipSide = q === 3;
      rot = Math.sin(a * 2) * 0.08;
      yaw = 0;
    } else if (p.drifting) rot = -p.driftDir * 0.06;
    let img = carSprite(model, view, { yaw, wheel: Math.floor(p.wheel), brake: p.braking || (p.drifting && p.pct > 0.3), scarf: p.scarf, colour: true, paint: this.opts.paint });
    if (flipSide) img = flipped(img);
    const bump = p.started ? (Math.sin(this.t * 38) * 0.5 + 0.5) * p.pct * 14 + (p.offroad ? Math.random() * 30 * p.pct : 0) : 0;
    const player: DrawCar = { z: p.z, x: p.x, img, upp: CAR_UPP, rot, lift: bump, brake: p.braking };
    return {
      track: this.track,
      playerZ: p.z,
      camX: this.camX,
      camBob: Math.sin(this.t * 31) * 5 * p.pct + (p.offroad ? (Math.random() - 0.5) * 30 * p.pct : 0),
      player,
      cars,
      particles: this.parts,
      pedSprite: (i) => this.pedSprite(i),
      weather: w,
      time: this.t,
      skyX: this.skyX,
      shake: this.shake,
      headlamps: w.id === 'night' || w.id === 'fog' || this.segAt(p.z).tunnel,
    };
  }

  private rivalDraw(r: Rival): DrawCar {
    let view: 'rear' | 'side' | 'front' = 'rear', rot = 0;
    let flip = false;
    if (r.spinT > 0) {
      const a = ((1.3 - r.spinT) / 1.3) * Math.PI * 4 * r.spinDir;
      const ph = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const q = Math.round(ph / (Math.PI / 2)) % 4;
      view = q === 0 ? 'rear' : q === 2 ? 'front' : 'side'; flip = q === 3; rot = Math.sin(a * 2) * 0.08;
    }
    const yaw: -1 | 0 | 1 = r.steer > 0.35 ? 1 : r.steer < -0.35 ? -1 : 0;
    let img = carSprite(r.model, view, { yaw: view === 'rear' ? yaw : 0, wheel: Math.floor(r.wheel), brake: r.braking, scarf: Math.floor(this.t * 8) % 3, colour: false });
    if (flip) img = flipped(img);
    return { z: r.z, x: r.x, img, upp: CAR_UPP, rot, brake: r.braking, lift: (Math.sin(this.t * 36 + r.z) * 0.5 + 0.5) * 10 };
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

const flipCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function flipped(c: HTMLCanvasElement) {
  let f = flipCache.get(c);
  if (!f) {
    f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    const x = f.getContext('2d')!; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
    flipCache.set(c, f);
  }
  return f;
}
