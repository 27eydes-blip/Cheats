import * as THREE from 'three';

// The living face: emotion presets over the 34 expression units, procedural
// lip-sync from the spoken text, blinks (single, double, half), saccades and
// gaze on a target, lids that follow the eyes, pupils that react to light,
// small micro-expressions, and slow idle drift so no face is ever frozen.
export const EMOTIONS = {
  calm: {},
  worried: { 'eyebrows-left-inner-up': 0.55, 'eyebrows-right-inner-up': 0.55, 'mouth-depression': 0.2, 'mouth-compression': 0.15 },
  angry: { 'eyebrows-left-down': 0.6, 'eyebrows-right-down': 0.6, 'mouth-compression': 0.45, 'nose-left-elevation': 0.25, 'nose-right-elevation': 0.25, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25 },
  amused: { 'mouth-corner-puller': 0.55, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3, 'eyebrows-left-extern-up': 0.2, 'eyebrows-right-extern-up': 0.15, 'mouth-upward-retraction': 0.1 },
  tired: { 'eye-left-slit': 0.22, 'eye-right-slit': 0.2, 'eyebrows-left-down': 0.15, 'eyebrows-right-down': 0.12, 'mouth-depression': 0.18 },
  suspicious: { 'eyebrows-left-down': 0.5, 'eyebrows-right-up': 0.25, 'eye-left-slit': 0.35, 'eye-right-slit': 0.2, 'mouth-compression': 0.3, 'mouth-retraction': 0.1 },
  sad: { 'eyebrows-left-inner-up': 0.7, 'eyebrows-right-inner-up': 0.7, 'mouth-depression': 0.45, 'eye-left-slit': 0.15, 'eye-right-slit': 0.15 },
};
const VISEME = {
  A: { 'mouth-open': 0.5, 'mouth-parling': 0.25 },
  E: { 'mouth-open': 0.22, 'mouth-retraction': 0.45, 'mouth-corner-puller': 0.1 },
  I: { 'mouth-open': 0.15, 'mouth-retraction': 0.55 },
  O: { 'mouth-open': 0.32, 'mouth-pursing': 0.5, 'mouth-protusion': 0.25 },
  U: { 'mouth-open': 0.1, 'mouth-pursing': 0.7, 'mouth-protusion': 0.45 },
  M: { 'mouth-compression': 0.55 },
  F: { 'mouth-open': 0.08, 'mouth-depression': 0.3, 'mouth-eversion': 0.25 },
  L: { 'mouth-open': 0.25, 'mouth-retraction': 0.15 },
  S: { 'mouth-open': 0.1, 'mouth-retraction': 0.35 },
  _: {},
};
function visemesFor(text) {
  const out = [];
  for (const ch of text.toLowerCase()) {
    if ('a'.includes(ch)) out.push(['A', 1.2]);
    else if ('e'.includes(ch)) out.push(['E', 1]);
    else if ('iy'.includes(ch)) out.push(['I', 0.9]);
    else if ('o'.includes(ch)) out.push(['O', 1.2]);
    else if ('uw'.includes(ch)) out.push(['U', 1]);
    else if ('mbp'.includes(ch)) out.push(['M', 0.8]);
    else if ('fv'.includes(ch)) out.push(['F', 0.8]);
    else if ('lntdr'.includes(ch)) out.push(['L', 0.6]);
    else if ('sczjxkgqh'.includes(ch)) out.push(['S', 0.6]);
    else if (' '.includes(ch)) out.push(['_', 0.4]);
    else if (',;:'.includes(ch)) out.push(['_', 2.2]);
    else if ('.!?—'.includes(ch)) out.push(['_', 3.5]);
  }
  return out;
}

export class Face {
  constructor(human, p) {
    this.h = human;
    const names = human.kit.exprNames;
    this.index = Object.fromEntries(names.map((n, i) => [n, i]));
    this.w = new Float32Array(names.length);
    this.emotion = p.emotion || 'calm';
    this.emo = { ...EMOTIONS[this.emotion] };
    this.emoT = new Float32Array(names.length);
    let s = (p.seed || 1) * 9301 + 49297; this.rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    this.blinkT = 1 + this.rnd() * 3; this.blink = 0; this.blinkPhase = -1;
    this.sacT = 0; this.sac = new THREE.Vector2();
    this.gaze = new THREE.Vector2(); this.gazeTarget = null;
    this.speech = null;
    this.micro = null; this.microT = 3 + this.rnd() * 4;
    this.t = this.rnd() * 100;
    // asymmetry: nobody's face rests perfectly even
    this.rest = { 'mouth-corner-puller': (this.rnd() - 0.5) * 0.04, 'eyebrows-left-up': this.rnd() * 0.06, 'eye-right-slit': this.rnd() * 0.08 };
    this.pupil = 0.5;
  }
  setEmotion(name, amount = 1) {
    this.emotion = name;
    this.emo = {};
    for (const [k, v] of Object.entries(EMOTIONS[name] || {})) this.emo[k] = v * amount;
  }
  // start lip-sync for a line lasting `duration` seconds
  say(text, duration) {
    const seq = visemesFor(text);
    const total = seq.reduce((a, x) => a + x[1], 0) || 1;
    let t = 0;
    this.speech = { seq: seq.map(([v, d]) => { const e = { v, t0: t, t1: t + (d / total) * duration }; t = e.t1; return e; }), t: 0, dur: duration };
  }
  look(target) { this.gazeTarget = target; }

  update(dt, ctx) {
    this.t += dt;
    const W = this.w; W.fill(0);
    const add = (map, k = 1) => { for (const [n, v] of Object.entries(map)) { const i = this.index[n]; if (i !== undefined) W[i] += v * k; } };
    // emotion eases in/out
    for (const [n, i] of Object.entries(this.index)) { const target = this.emo[n] || 0; this.emoT[i] += (target - this.emoT[i]) * Math.min(1, dt * 2.5); W[i] += this.emoT[i]; }
    add(this.rest);
    // idle drift: brows and mouth corners never quite still
    add({ 'eyebrows-left-inner-up': (Math.sin(this.t * 0.37) * 0.5 + 0.5) * 0.04, 'eyebrows-right-inner-up': (Math.sin(this.t * 0.33 + 1) * 0.5 + 0.5) * 0.04, 'mouth-corner-puller': Math.sin(this.t * 0.21) * 0.025 });
    // micro-expressions
    this.microT -= dt;
    if (this.microT < 0 && !this.micro) {
      const pick = [{ 'eyebrows-left-inner-up': 0.25, 'eyebrows-right-inner-up': 0.25 }, { 'mouth-corner-puller': 0.18 }, { 'nose-compression': 0.2 }, { 'mouth-compression': 0.2 }, { 'eyebrows-left-up': 0.22 }][Math.floor(this.rnd() * 5)];
      this.micro = { map: pick, t: 0 };
      this.microT = 3 + this.rnd() * 6;
    }
    if (this.micro) { this.micro.t += dt; const k = Math.sin(Math.min(1, this.micro.t / 0.6) * Math.PI); add(this.micro.map, k); if (this.micro.t > 0.6) this.micro = null; }
    // speech
    if (this.speech) {
      const sp = this.speech; sp.t += dt;
      if (sp.t > sp.dur + 0.2) this.speech = null;
      else {
        // blend the current and next viseme with a little co-articulation
        const i = sp.seq.findIndex((e) => sp.t < e.t1);
        const cur = sp.seq[Math.max(0, i)], nxt = sp.seq[Math.min(sp.seq.length - 1, i + 1)];
        if (cur) {
          const f = THREE.MathUtils.smoothstep(sp.t, cur.t0 + (cur.t1 - cur.t0) * 0.5, cur.t1);
          add(VISEME[cur.v], 1 - f * 0.6); add(VISEME[nxt.v] || {}, f * 0.6);
          add({ 'eyebrows-left-up': 0.08 * Math.max(0, Math.sin(sp.t * 2.1)), 'eyebrows-right-up': 0.07 * Math.max(0, Math.sin(sp.t * 2.1 + 0.3)) });
        }
      }
    }
    // blinks: ~every 2–6 s, sometimes a double blink, a little more often while talking
    this.blinkT -= dt;
    if (this.blinkPhase < 0 && this.blinkT < 0) { this.blinkPhase = 0; this.blinkT = (this.speech ? 1.6 : 2) + this.rnd() * 4; this.double = this.double === undefined ? false : this.rnd() < 0.15; }
    if (this.blinkPhase >= 0) {
      const p = (this.blinkPhase += dt);
      this.blink = p < 0.07 ? p / 0.07 : p < 0.11 ? 1 : p < 0.24 ? 1 - (p - 0.11) / 0.13 : 0;
      if (p > 0.24) { this.blinkPhase = -1; if (this.double) { this.double = false; this.blinkT = 0.12; } }
    } else this.blink = 0;
    // saccades: small jumps of gaze, held for a beat
    this.sacT -= dt;
    if (this.sacT < 0) { this.sac.set((this.rnd() - 0.5) * 0.12, (this.rnd() - 0.5) * 0.06); this.sacT = 0.35 + this.rnd() * (this.gazeTarget ? 1.4 : 2.6); }
    // gaze: toward the target (in head space), else forward-ish
    const head = this.h.bone.head;
    let gx = 0, gy = 0;
    if (this.gazeTarget && head) {
      const hp = head.getWorldPosition(_v);
      const dir = _d.copy(this.gazeTarget).sub(hp);
      const inv = _q.copy(head.getWorldQuaternion(_q2)).invert();
      dir.applyQuaternion(inv).normalize();
      gx = Math.atan2(dir.x, dir.z); gy = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      if (Math.abs(gx) > 0.9) { gx = 0; gy = 0; }
    }
    this.gaze.x += (THREE.MathUtils.clamp(gx, -0.45, 0.45) + this.sac.x - this.gaze.x) * Math.min(1, dt * 18);
    this.gaze.y += (THREE.MathUtils.clamp(gy, -0.3, 0.25) + this.sac.y - this.gaze.y) * Math.min(1, dt * 18);
    for (const side of ['eye.L', 'eye.R']) { const b = this.h.bone[side]; if (b) b.rotation.set(-this.gaze.y, this.gaze.x, 0); }
    // lids follow the eyes; blinks close them
    const down = Math.max(0, -this.gaze.y) * 1.3, up = Math.max(0, this.gaze.y) * 1.6;
    add({ 'eye-left-closure': this.blink * 0.98 + down * 0.25, 'eye-right-closure': this.blink * 0.98 + down * 0.25, 'eye-left-opened-up': up, 'eye-right-opened-up': up });
    // pupils follow the light
    const light = ctx?.lightLevel ?? 0.6;
    this.pupil += (THREE.MathUtils.clamp(1 - light, 0.1, 0.95) - this.pupil) * Math.min(1, dt * 1.5);
    const eu = this.h.eyeMat?.userData.u; if (eu) eu.uPupil.value = this.pupil;
    // push to every mesh that carries expression deltas
    for (let i = 0; i < W.length; i++) W[i] = THREE.MathUtils.clamp(W[i], -0.2, 1);
    for (const arr of this.h.exprSets) arr.set(W);
  }
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
