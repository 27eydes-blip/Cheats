// Oblivion GP race moments (presentation only: nothing here sends input or touches the
// prediction, so it can never desync the race; test/race-moments.test.js checks that):
//  - Recorder: a ring buffer of what was drawn (cars + flying items, ~30 frames a second, 7 s)
//  - crash clips: a big crash (you wrecked, your takedown, a wreck right next to you, a huge bump)
//    keeps the 3.4 s around it; the best one is replayed on the results screen
//  - slow-mo: you crossed the line just after passing someone -> the last moments replay at 40%
//    speed (the real race carries on underneath; you are on autopilot after the finish anyway)
//  - pass-by whooshes and the grid revs (pure helpers for the sound)
// No DOM here: it runs in Node for the tests.
import { ENT } from './protocol.js';

export const REC_HZ = 30, REC_SEC = 7, CF = 8, EF = 5; // car fields: id x y a f spd hp lap; ent fields: id kind x y a
export const SLOW_RATE = 0.4, SLOW_BACK = 1.5, SLOW_AFTER = 0.35, OVERTAKE_WINDOW = 1.6;
export const CLIP_BEFORE = 2.2, CLIP_AFTER = 1.2;
export const CUT_BEFORE = 3.2, CUT_AFTER = 0.6, CUT_SCORE = 9; // Elimination: the final cut beats any crash
const TAU = Math.PI * 2;

export class Recorder {
  constructor(maxCars = 12, maxEnts = 24, sec = REC_SEC) {
    this.cap = Math.ceil(sec * REC_HZ); this.mc = maxCars; this.me = maxEnts;
    this.t = new Float64Array(this.cap); this.nc = new Uint8Array(this.cap); this.ne = new Uint8Array(this.cap);
    this.cars = new Float32Array(this.cap * maxCars * CF); this.ents = new Float32Array(this.cap * maxEnts * EF);
    this.lead = new Int32Array(this.cap);
    this.hole = new Float32Array(this.cap); // Elimination: the black hole's race distance (NaN = none)
    this.head = 0; this.n = 0; this.lastT = -1e9;
  }
  // record a view (race time view.time, s); at most REC_HZ frames a second
  push(view) {
    const t = view.time;
    if (!(t > this.lastT + 1 / REC_HZ - 1e-3) && t >= this.lastT) return false;
    this.lastT = t;
    const i = this.head, cs = view.cars, es = view.ents || [];
    this.t[i] = t; this.lead[i] = view.leader || 0; this.hole[i] = view.hole == null ? NaN : view.hole;
    const nc = Math.min(cs.length, this.mc), ne = Math.min(es.length, this.me);
    let o = i * this.mc * CF;
    for (let k = 0; k < nc; k++, o += CF) { const c = cs[k]; this.cars[o] = c.id; this.cars[o + 1] = c.x; this.cars[o + 2] = c.y; this.cars[o + 3] = c.a; this.cars[o + 4] = c.f; this.cars[o + 5] = c.spd; this.cars[o + 6] = c.hp; this.cars[o + 7] = c.me ? 1 : 0; }
    o = i * this.me * EF;
    for (let k = 0; k < ne; k++, o += EF) { const e = es[k]; this.ents[o] = e.id; this.ents[o + 1] = Math.max(0, ENT.indexOf(e.kind)); this.ents[o + 2] = e.x; this.ents[o + 3] = e.y; this.ents[o + 4] = e.a; }
    this.nc[i] = nc; this.ne[i] = ne;
    this.head = (i + 1) % this.cap; this.n = Math.min(this.cap, this.n + 1);
    return true;
  }
  // frame index k = 0 oldest .. n-1 newest -> ring slot
  slot(k) { return (this.head - this.n + k + this.cap * 2) % this.cap; }
  first() { return this.n ? this.t[this.slot(0)] : 0; }
  last() { return this.n ? this.t[this.slot(this.n - 1)] : 0; }
  // copy the frames between race times t0 and t1 into a stand-alone clip
  clip(t0, t1, meta = {}) {
    const ks = [];
    for (let k = 0; k < this.n; k++) { const tt = this.t[this.slot(k)]; if (tt >= t0 && tt <= t1) ks.push(k); }
    const c = new Recorder(this.mc, this.me, Math.max(1, ks.length) / REC_HZ + 0.1);
    for (const k of ks) {
      const s = this.slot(k), d = c.head;
      c.t[d] = this.t[s]; c.nc[d] = this.nc[s]; c.ne[d] = this.ne[s]; c.lead[d] = this.lead[s]; c.hole[d] = this.hole[s];
      c.cars.set(this.cars.subarray(s * this.mc * CF, (s + 1) * this.mc * CF), d * this.mc * CF);
      c.ents.set(this.ents.subarray(s * this.me * EF, (s + 1) * this.me * EF), d * this.me * EF);
      c.head = (d + 1) % c.cap; c.n++;
    }
    c.lastT = ks.length ? c.t[c.slot(c.n - 1)] : 0;
    Object.assign(c, meta);
    return c;
  }
  // the view at race time t (cars interpolated between the two frames around it), written into out
  // (reused objects: no allocation once warm). Cars missing from either frame are taken as they are.
  viewAt(t, out) {
    out.cars.length = 0; out.ents.length = 0;
    if (!this.n) return out;
    let k1 = 0;
    while (k1 < this.n - 1 && this.t[this.slot(k1)] < t) k1++;
    const k0 = Math.max(0, k1 - 1), s0 = this.slot(k0), s1 = this.slot(k1), t0 = this.t[s0], t1 = this.t[s1];
    const f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 1;
    const pool = out.pool || (out.pool = []);
    const b0 = s0 * this.mc * CF, b1 = s1 * this.mc * CF, C = this.cars;
    for (let q = 0; q < this.nc[s1]; q++) {
      const o1 = b1 + q * CF, id = C[o1];
      let o0 = -1;
      for (let r = 0; r < this.nc[s0]; r++) if (C[b0 + r * CF] === id) { o0 = b0 + r * CF; break; }
      const c = pool[q] || (pool[q] = { id: 0, x: 0, y: 0, a: 0, f: 0, spd: 0, hp: 0, me: false, predicted: false });
      c.id = id; c.f = C[o1 + 4]; c.hp = C[o1 + 6]; c.me = C[o1 + 7] === 1; c.predicted = false;
      if (o0 >= 0 && Math.hypot(C[o1 + 1] - C[o0 + 1], C[o1 + 2] - C[o0 + 2]) < 300) { // (a respawn jump: no tween)
        let da = C[o1 + 3] - C[o0 + 3]; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
        c.x = C[o0 + 1] + (C[o1 + 1] - C[o0 + 1]) * f; c.y = C[o0 + 2] + (C[o1 + 2] - C[o0 + 2]) * f; c.a = C[o0 + 3] + da * f; c.spd = C[o0 + 5] + (C[o1 + 5] - C[o0 + 5]) * f;
      } else { c.x = C[o1 + 1]; c.y = C[o1 + 2]; c.a = C[o1 + 3]; c.spd = C[o1 + 5]; }
      out.cars.push(c);
    }
    const ep = out.epool || (out.epool = []), E = this.ents, be = s1 * this.me * EF;
    for (let q = 0; q < this.ne[s1]; q++) {
      const o = be + q * EF, e = ep[q] || (ep[q] = { id: 0, kind: '', x: 0, y: 0, a: 0, owner: 0, armed: 1 });
      e.id = E[o]; e.kind = ENT[E[o + 1]] || 'missile'; e.x = E[o + 2]; e.y = E[o + 3]; e.a = E[o + 4];
      out.ents.push(e);
    }
    out.time = t; out.leader = this.lead[s1];
    const h0 = this.hole[s0], h1 = this.hole[s1];
    out.hole = h1 !== h1 ? null : h0 !== h0 ? h1 : h0 + (h1 - h0) * f; // (NaN check without allocation)
    return out;
  }
}
// an empty replay view in the shape RaceClient.view() returns
export const replayView = () => ({ tick: 0, time: 0, countdown: 0, cars: [], ents: [], boxesOff: [], hazardsOn: 0, leader: 0, ranks: [], hud: {}, me: null, replay: true });

// how big a crash is (0 = not worth a replay)
export function crashScore(e, meId, near) {
  const k = e[0];
  if (k === 'ko') return e[1] === meId ? 3 : e[2] === meId ? 3 : near ? 2 : 0;
  if (k === 'bump') return (e[1] === meId || e[2] === meId) && e[3] > 650 ? 1 : 0;
  return 0;
}

export class Moments {
  constructor({ record = true } = {}) {
    this.record = record;
    this.rec = new Recorder();
    this.best = null; // the clip to replay on the results screen
    this.pending = null; // { t0, t1, score, focus }
    this.rk = 0; this.gainT = -1e9; // last time your place got better (race time)
    this.slow = null; // { t, from, to } slow-mo playback (race time)
    this.rv = replayView();
    this.booms = []; // recent explosions {t, x, y} (the replay sets them off again)
  }
  // every frame with the live view (race time view.time)
  frame(view) {
    if (!this.record) return;
    this.rec.push(view);
    const P = this.pending;
    if (P && view.time >= P.t1) { this.keep(this.rec.clip(P.t0, P.t1, { score: P.score, focus: P.focus, label: P.label, cut: P.cut || 0, booms: this.booms.filter((b) => b.t >= P.t0 && b.t <= P.t1) })); this.pending = null; }
  }
  // your race place now (1 = first): remember when it got better
  place(rk, t) { if (rk && this.rk && rk < this.rk) this.gainT = t; if (rk) this.rk = rk; }
  // a race event at race time t; near: it happened right by you; at: where (for explosions)
  event(e, meId, t, near, at = null) {
    if (!this.record) return;
    if (at && (e[0] === 'ko' || e[0] === 'boom' || e[0] === 'elim')) { this.booms.push({ t, x: at.x, y: at.y, big: e[0] === 'ko' ? 1.2 : 0.7, cut: e[0] === 'elim' ? 1 : 0 }); if (this.booms.length > 24) this.booms.shift(); }
    const sc = crashScore(e, meId, near);
    if (!sc) return;
    const focus = e[0] === 'ko' ? e[1] : meId, label = e[0] === 'ko' ? (e[1] === meId ? 'YOUR WRECK' : e[2] === meId ? 'YOUR TAKEDOWN' : 'BIG CRASH') : 'BIG HIT';
    if (this.pending) { if (sc >= this.pending.score) Object.assign(this.pending, { score: sc, focus, label, t1: t + CLIP_AFTER }); return; }
    if (this.best && this.best.score > sc) return;
    this.pending = { t0: t - CLIP_BEFORE, t1: t + CLIP_AFTER, score: sc, focus, label };
  }
  // ELIMINATION: the final cut (the knock-out that decides the race), kept for the results replay
  // over any crash; focus = the car that was cut
  markCut(t, focus) { if (this.record) this.pending = { t0: t - CUT_BEFORE, t1: t + CUT_AFTER, score: CUT_SCORE, focus, label: 'FINAL CUT', cut: 1 }; }
  // the race ended before a clip's tail was recorded (the final cut ends it): keep what there is
  flush() {
    const P = this.pending;
    if (!P || !this.rec.n) return;
    this.keep(this.rec.clip(P.t0, Math.min(P.t1, this.rec.last()), { score: P.score, focus: P.focus, label: P.label, cut: P.cut || 0, booms: this.booms.filter((b) => b.t >= P.t0 && b.t <= P.t1) }));
    this.pending = null;
  }
  keep(c) { if (c.n > REC_HZ && (!this.best || c.score >= this.best.score)) this.best = c; }
  // you crossed the line at race time t: slow-mo if you had just passed someone
  // (back / after: how much before and after t to replay, e.g. shorter for a racer still driving)
  finish(t, force = false, back = SLOW_BACK, after = SLOW_AFTER) {
    if (!force && !(t - this.gainT < OVERTAKE_WINDOW)) return false;
    this.slow = { t: t - back, from: t - back, to: t + after };
    return true;
  }
  // the slow-mo view for this frame (dt: real seconds), or null when there is none (any more)
  slowView(dt) {
    const S = this.slow;
    if (!S) return null;
    S.t += dt * SLOW_RATE; S.real = (S.real || 0) + dt;
    if (S.t >= S.to || S.real > (S.to - S.from) / SLOW_RATE + 1) { this.slow = null; return null; }
    return this.rec.viewAt(Math.min(S.t, this.rec.last()), this.rv);
  }
  stop() { this.slow = null; }
}

// ------------------------------------------------------------------ pass-by whooshes
// Each frame, for every other car close by: which side of you it is along your heading. When that
// flips at speed (it passed you, or you passed it) it is a pass-by. Fills out with { id, v (0..1),
// rv (closing speed), lat (signed sideways offset, + = your right) }. seen: Map id -> {s, t}.
export function passBys(me, cars, seen, now, out) {
  out.length = 0;
  if (!me) return out;
  const ca = Math.cos(me.a), sa = Math.sin(me.a), mvx = ca * me.spd, mvy = sa * me.spd;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.me || c.f & 32) continue; // (DEAD)
    const dx = c.x - me.x, dy = c.y - me.y, d2 = dx * dx + dy * dy;
    let r = seen.get(c.id);
    if (d2 > 320 * 320) { if (r) r.s = 0; continue; }
    const side = dx * ca + dy * sa >= 0 ? 1 : -1;
    if (!r) { seen.set(c.id, (r = { s: side, t: -9 })); continue; }
    if (r.s && side !== r.s && now - r.t > 0.6) {
      const rv = Math.hypot(Math.cos(c.a) * c.spd - mvx, Math.sin(c.a) * c.spd - mvy), d = Math.sqrt(d2);
      if (rv > 180 && d < 240) { out.push({ id: c.id, v: Math.min(1, (rv / 700) * (1 - d / 300) + 0.2), rv, lat: -dx * sa + dy * ca }); r.t = now; }
    }
    r.s = side;
  }
  return out;
}

// ------------------------------------------------------------------ grid revs
// the engine "speed" (0..1) for the countdown: a blip of revs on every count, held high through
// the last second (cd = seconds left)
export function revCurve(cd) {
  if (!(cd > 0)) return 0;
  const f = cd - Math.floor(cd); // 1 -> 0 through each second
  if (cd < 1) return 0.35 + (1 - cd) * 0.45;
  const blip = f > 0.3 ? Math.sin(((1 - f) / 0.7) * Math.PI) : 0;
  return 0.12 + Math.max(0, blip) * 0.42;
}
