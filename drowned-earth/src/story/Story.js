import * as THREE from 'three';
import { G } from '../world/WorldShader.js';

// Story director: flags, logs (journal), objectives, data-driven triggers,
// and the stage-1 finale at the Sounding.
export class Story {
  constructor(ctx) {
    this.ctx = ctx;
    this.flags = ctx.state.flags;
    this.fired = new Set();
    this.cooldowns = {};
    this.pending = [];
    this.finale = null;
  }
  get logs() { return this.ctx.data.logs.logs || {}; }
  flag(f) { return !!this.flags[f]; }
  setFlag(f, v = true) {
    if (this.flags[f] === v) return;
    this.flags[f] = v;
    this.ctx.events.emit('flag', { f, v });
    this.checkObjectives();
  }
  hasLog(id) { return this.ctx.state.logs.has(id); }
  openLog(id) {
    const log = this.logs[id];
    if (!log) return;
    const first = !this.hasLog(id);
    this.ctx.state.logs.add(id);
    if (log.sets) this.setFlag(log.sets);
    this.ctx.ui.showLog(id, log, first);
    if (first) this.ctx.events.emit('log:read', id);
    this.checkObjectives();
  }
  objectives() {
    const list = this.ctx.data.story.objectives || [];
    return list.filter((o) => !o.after || this.flag(o.after)).map((o) => ({ ...o, done: this.isDone(o) }));
  }
  isDone(o) {
    const w = o.doneWhen || {};
    if (w.flags && !w.flags.every((f) => this.flag(f))) return false;
    if (w.logs && !w.logs.every((l) => this.hasLog(l))) return false;
    return true;
  }
  checkObjectives() {
    for (const o of this.objectives()) {
      const key = 'obj:' + o.id;
      if (o.done && !this.flags[key]) { this.flags[key] = true; this.ctx.events.emit('objective:done', o); }
    }
    const cur = this.objectives().find((o) => !o.done);
    if (cur && this.current !== cur.id) { this.current = cur.id; this.ctx.ui?.note?.(cur.text); }
  }
  update(dt) {
    const ctx = this.ctx;
    const pp = ctx.player.position;
    for (const t of ctx.data.story.triggers || []) {
      if (t.once && this.fired.has(t.id)) continue;
      if (!t.once && (this.cooldowns[t.id] || 0) > ctx.state.playTime) continue;
      const w = t.when;
      if (w.playTime !== undefined && ctx.state.playTime < w.playTime) continue;
      if (w.near && Math.hypot(pp.x - w.near[0], pp.z - w.near[1]) > w.near[2]) continue;
      if (w.hourFrom !== undefined && !(ctx.time.hour >= w.hourFrom || ctx.time.hour < 5)) continue;
      if (w.night && ctx.time.out.night < 0.6) continue;
      if (w.flags && !w.flags.every((f) => this.flag(f))) continue;
      if (w.chance && Math.random() > w.chance) continue;
      this.fired.add(t.id);
      if (t.cooldown) this.cooldowns[t.id] = ctx.state.playTime + t.cooldown;
      for (const a of t.do) this.pending.push({ ...a, at: ctx.state.playTime + (a.delay || 0) });
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const a = this.pending[i];
      if (a.at > ctx.state.playTime) continue;
      this.pending.splice(i, 1);
      if (a.whisper) ctx.ui.whisper(a.whisper);
      if (a.audio) ctx.audio?.play(a.audio);
      if (a.event) ctx.events.emit(a.event);
      if (a.flag) this.setFlag(a.flag);
    }
    if (this.finale) this.updateFinale(dt);
  }

  // --- Finale: the deep structure lights up and a low tone shakes the water ---
  startFinale() {
    if (this.finale || this.flag('finale_done')) return;
    const ctx = this.ctx;
    this.finale = { t: 0 };
    ctx.events.emit('gulls:silence');
    ctx.ui.whisper('You lower the hydrophone into the black water. The cable runs out and keeps going.');
    ctx.audio?.play('hydrophone');
  }
  updateFinale(dt) {
    const f = this.finale, ctx = this.ctx;
    f.t += dt;
    const t = f.t;
    if (t > 4 && !f.a) { f.a = true; ctx.ui.whisper('Clicks. Slow. Evenly spaced. Getting closer together.'); }
    if (t > 9 && !f.b) { f.b = true; ctx.audio?.play('deepTone'); ctx.events.emit('shake', 0.6); }
    if (t > 9) {
      G.uGlow.value = Math.min(1, (t - 9) / 5);
      ctx.water.uniforms.uGlowPos.value.set(96, 0, -128);
      ctx.events.emit('shake', dt * 0.4);
      ctx.waves.amp = ctx.waves.amp; // waves flatten in the tone
    }
    if (t > 12 && !f.c) { f.c = true; ctx.ui.whisper('Far below, rings of green light open one inside the other.'); }
    if (t > 20 && !f.d) { f.d = true; ctx.ui.whisper('The tone stops. The water is perfectly still. On the horizon, the Highmark lighthouse has stopped turning.'); ctx.state.flags.lighthouseStopped = true; }
    if (t > 29 && !f.e) {
      f.e = true;
      this.setFlag('finale_done');
      ctx.ui.endCard();
      ctx.save?.save('finale');
    }
    if (t > 40) { G.uGlow.value = Math.max(0.15, G.uGlow.value - dt * 0.05); }
  }
  toJSON() { return { fired: [...this.fired] }; }
  load(o) { this.fired = new Set(o?.fired || []); }
}
