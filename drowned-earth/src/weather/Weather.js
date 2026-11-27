import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// Weather state machine. Follows a scripted opening schedule from data, then
// picks weighted-random states. Exposes blended parameters every frame.
const KEYS = ['cloud', 'fog', 'farFog', 'wind', 'waves', 'rain', 'lightning', 'warmth', 'cloudDark'];

export class Weather {
  constructor(ctx, def) {
    this.ctx = ctx;
    this.def = def;
    this.rng = new RNG(ctx.worldMap.seed + 99);
    this.from = { ...def.states.mist };
    this.to = { ...def.states.mist };
    this.state = 'mist';
    this.blend = 1;
    this.transition = def.transitionHours;
    this.hoursLeft = def.schedule[0].hours;
    this.scheduleIdx = 0;
    this.cur = { ...def.states.mist };
    this.windDir = 0.7;
    this.flash = 0;
    this.nextStrike = 1;
    this.locked = false;
  }
  set(state, instant = false) {
    if (!this.def.states[state]) return;
    this.from = { ...this.cur };
    this.to = { ...this.def.states[state] };
    this.state = state;
    this.blend = instant ? 1 : 0;
    if (instant) Object.assign(this.cur, this.to);
    this.ctx.events.emit('weather', state);
  }
  pickNext() {
    this.scheduleIdx++;
    const s = this.def.schedule[this.scheduleIdx];
    if (s) { this.hoursLeft = s.hours; return s.state; }
    const entries = Object.entries(this.def.states).filter(([k]) => k !== this.state).map(([k, v]) => ({ w: v.weight, v: k }));
    this.hoursLeft = this.rng.range(1.5, 4);
    return this.rng.weighted(entries);
  }
  update(dt, gameHours) {
    if (!this.locked) {
      this.hoursLeft -= gameHours;
      if (this.hoursLeft <= 0) this.set(this.pickNext());
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + gameHours / this.transition);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of KEYS) this.cur[k] = this.from[k] + (this.to[k] - this.from[k]) * t;
    }
    this.windDir += Math.sin(performance.now() * 0.00003) * dt * 0.01;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.cur.lightning > 0.05) {
      this.nextStrike -= dt * this.cur.lightning / 60;
      if (this.nextStrike <= 0) {
        this.nextStrike = this.rng.range(0.3, 1.7);
        this.flash = 1;
        const dist = this.rng.range(400, 4000);
        this.ctx.events.emit('lightning', { dist, dir: this.rng.range(0, Math.PI * 2) });
      }
    }
  }
  get windVec() { return new THREE.Vector2(Math.cos(this.windDir), Math.sin(this.windDir)); }
}
