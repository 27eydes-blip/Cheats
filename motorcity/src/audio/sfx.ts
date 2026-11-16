// One-shot sound effects. Each call builds a short-lived node graph that is
// scheduled to stop itself; nodes are released by the browser afterwards.

import { Core, Dest, biquad, gain, osc, rnd, shaper } from './core';

const MAX_ACTIVE = 14;

export class Sfx {
  private readonly c: Core;
  private readonly ctx: AudioContext;
  private active: number[] = [];
  private last = new Map<string, number>();

  constructor(core: Core) {
    this.c = core;
    this.ctx = core.ctx;
  }

  /**
   * Returns the start time, or -1 if the effect should be skipped (too many
   * overlapping effects, or the same effect retriggered within `gap`s).
   */
  private admit(name: string, dur: number, gap: number, prio = false): number {
    const now = this.ctx.currentTime;
    const prev = this.last.get(name);
    if (prev !== undefined && now - prev < gap) return -1;
    if (this.active.length >= MAX_ACTIVE) this.active = this.active.filter((e) => e > now);
    if (!prio && this.active.length >= MAX_ACTIVE) return -1;
    this.last.set(name, now);
    this.active.push(now + dur);
    return now + 0.005;
  }

  // ---- building blocks ----------------------------------------------------

  private env(p: AudioParam, t: number, a: number, peak: number, d: number): void {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    p.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private out(v = 1): GainNode {
    return gain(this.ctx, v, this.c.sfx);
  }

  private tone(type: OscillatorType, f: number, t: number, dur: number, dest?: Dest): OscillatorNode {
    const o = osc(this.ctx, type, f, dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(buf: AudioBuffer, t: number, dur: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(t, Math.random() * (buf.duration - 0.1));
    s.stop(t + dur + 0.05);
    return s;
  }

  /** Percussive pitched hit with downward pitch sweep (thumps, knocks). */
  private hit(t: number, f0: number, f1: number, sweep: number, peak: number, decay: number, dest: AudioNode, type: OscillatorType = 'sine'): void {
    const g = gain(this.ctx, 0, dest);
    const o = this.tone(type, f0, t, decay + 0.02, g);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + sweep);
    this.env(g.gain, t, 0.002, peak, decay);
  }

  /** Filtered noise burst. */
  private burst(t: number, buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, peak: number, a: number, decay: number, dest: AudioNode): BiquadFilterNode {
    const g = gain(this.ctx, 0, dest);
    const flt = biquad(this.ctx, type, f, q, g);
    this.noise(buf, t, a + decay, flt);
    this.env(g.gain, t, a, peak, decay);
    return flt;
  }

  /** Sine ping (glass, bell partial). */
  private ping(t: number, f: number, peak: number, decay: number, dest: AudioNode): void {
    const g = gain(this.ctx, 0, dest);
    this.tone('sine', f, t, decay * 1.2, g);
    this.env(g.gain, t, 0.002, peak, decay);
  }

  /** Inharmonic bell strike. */
  private bell(t: number, base: number, ratios: number[], amps: number[], decays: number[], peak: number, dest: AudioNode): void {
    for (let i = 0; i < ratios.length; i++) this.ping(t, base * ratios[i] * rnd(0.998, 1.002), peak * amps[i], decays[i], dest);
  }

  // ---- effects -------------------------------------------------------------

  horn(): void {
    const t = this.admit('horn', 1.25, 0.25, true);
    if (t < 0) return;
    const { ctx } = this;
    const bank = this.c.bank;
    const end = t + 1.14;
    const out = this.out(0);
    const g = out.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.34, t + 0.05);
    g.linearRampToValueAtTime(0.4, t + 0.38);
    g.setValueAtTime(0.4, t + 0.64);
    g.linearRampToValueAtTime(0.12, t + 0.7); // the "g" of "gah"
    g.linearRampToValueAtTime(0.42, t + 0.76);
    g.setValueAtTime(0.42, t + 0.98);
    g.linearRampToValueAtTime(0, end);

    const lp = biquad(ctx, 'lowpass', 4200, 0.7, out);
    // two vowel formants that move "ah" -> "oo" -> "ah"
    const f1 = biquad(ctx, 'bandpass', 760, 4, gain(ctx, 1.1, lp));
    const f2 = biquad(ctx, 'bandpass', 1300, 5, gain(ctx, 0.7, lp));
    const buzz = biquad(ctx, 'highpass', 1800, 0.7, gain(ctx, 0.18, lp));
    const body = biquad(ctx, 'bandpass', 400, 1.2, gain(ctx, 0.5, lp));
    const sh = shaper(ctx, bank.hard);
    sh.connect(f1);
    sh.connect(f2);
    sh.connect(buzz);
    sh.connect(body);
    const pre = gain(ctx, 1.7, sh);
    // diaphragm rattle: fast AM before the clipper gives the raspy "zzz"
    const rattle = this.tone('square', 47, t, 1.15, gain(ctx, 0.7, pre.gain));
    rattle.detune.value = rnd(-30, 30);

    const a = this.tone('sawtooth', 220, t, 1.15, gain(ctx, 0.55, pre));
    const b = this.tone('square', 220, t, 1.15, gain(ctx, 0.35, pre));
    b.detune.value = 9;
    const vibAmt = gain(ctx, 0);
    this.tone('sine', 6.2, t, 1.15, vibAmt);
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(7, t + 0.5);
    vibAmt.gain.linearRampToValueAtTime(3, t + 0.8);
    for (const o of [a, b]) {
      vibAmt.connect(o.frequency);
      const f = o.frequency;
      f.setValueAtTime(220, t);
      f.exponentialRampToValueAtTime(250, t + 0.09); // "ah"
      f.exponentialRampToValueAtTime(520, t + 0.4); // swoop up to "OO"
      f.linearRampToValueAtTime(500, t + 0.66);
      f.exponentialRampToValueAtTime(300, t + 0.75); // drop to "gah"
      f.linearRampToValueAtTime(288, t + 1.0);
      f.exponentialRampToValueAtTime(240, end);
    }
    const ff1 = f1.frequency;
    ff1.setValueAtTime(780, t);
    ff1.exponentialRampToValueAtTime(430, t + 0.42);
    ff1.setValueAtTime(430, t + 0.66);
    ff1.exponentialRampToValueAtTime(820, t + 0.78);
    const ff2 = f2.frequency;
    ff2.setValueAtTime(1300, t);
    ff2.exponentialRampToValueAtTime(950, t + 0.42);
    ff2.setValueAtTime(950, t + 0.66);
    ff2.exponentialRampToValueAtTime(1450, t + 0.78);
  }

  backfire(): void {
    const t = this.admit('backfire', 0.6, 0.12, true);
    if (t < 0) return;
    const bank = this.c.bank;
    const out = this.out(1);
    this.hit(t, 120, 38, 0.18, 0.9, 0.35, out);
    this.hit(t, 240, 70, 0.08, 0.35, 0.12, out, 'triangle');
    this.burst(t, bank.brown, 'lowpass', 900, 0.7, 0.9, 0.003, 0.28, out);
    const crackOut = gain(this.ctx, 1, out);
    const sh = shaper(this.ctx, bank.hard, crackOut);
    this.burst(t, bank.white, 'highpass', 700, 0.7, 0.75, 0.001, 0.07, sh);
    this.burst(t + 0.085, bank.white, 'bandpass', 1500, 0.7, 0.4, 0.001, 0.05, sh);
    if (Math.random() < 0.6) this.burst(t + 0.16, bank.white, 'bandpass', 1100, 0.8, 0.25, 0.001, 0.04, sh);
  }

  crash(): void {
    const t = this.admit('crash', 1.2, 0.15, true);
    if (t < 0) return;
    const { ctx } = this;
    const bank = this.c.bank;
    const out = this.out(0.9);
    this.hit(t, 95, 40, 0.25, 0.85, 0.32, out);
    this.burst(t, bank.brown, 'lowpass', 700, 0.7, 0.7, 0.003, 0.3, out);
    // crunch: several distorted noise bursts
    const crunch = shaper(ctx, bank.hard, gain(ctx, 0.6, out));
    let tt = t;
    for (let i = 0; i < 6; i++) {
      this.burst(tt, bank.white, 'bandpass', rnd(500, 2800), rnd(1.5, 5), rnd(0.4, 0.8), 0.002, rnd(0.05, 0.14), crunch);
      tt += rnd(0.02, 0.07);
    }
    // bent metal ringing
    for (let i = 0; i < 3; i++) {
      const f = rnd(280, 900);
      const g = gain(ctx, 0, out);
      const bp = biquad(ctx, 'bandpass', f * 3.1, 10, g);
      this.tone('square', f, t, 0.6, bp);
      this.env(g.gain, t + i * 0.03, 0.004, 0.18, rnd(0.3, 0.55));
    }
    // glass tinkle
    for (let i = 0; i < 9; i++) {
      this.ping(t + 0.06 + Math.pow(Math.random(), 1.5) * 0.7, rnd(2600, 6800), rnd(0.04, 0.11), rnd(0.05, 0.18), out);
    }
    this.burst(t + 0.05, bank.white, 'highpass', 5000, 0.7, 0.12, 0.003, 0.25, out);
  }

  bump(): void {
    const t = this.admit('bump', 0.2, 0.08);
    if (t < 0) return;
    const out = this.out(1);
    const v = rnd(0.85, 1.1);
    this.hit(t, 150 * v, 70, 0.08, 0.5, 0.12, out);
    this.burst(t, this.c.bank.brown, 'lowpass', 700, 0.7, 0.35, 0.002, 0.08, out);
    this.hit(t, 820 * v, 500, 0.03, 0.06, 0.08, out, 'square');
  }

  scrape(): void {
    const t = this.admit('scrape', 0.5, 0.12);
    if (t < 0) return;
    const { ctx } = this;
    const out = this.out(0);
    const d = rnd(0.32, 0.45);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.5, t + 0.02);
    out.gain.setValueAtTime(0.45, t + d * 0.6);
    out.gain.exponentialRampToValueAtTime(0.001, t + d);
    const grind = gain(ctx, 0.6, out);
    this.tone('sawtooth', rnd(28, 38), t, d, gain(ctx, 0.4, grind.gain));
    const bp = biquad(ctx, 'bandpass', 2600, 5, grind);
    bp.frequency.setValueAtTime(2700, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + d);
    this.noise(this.c.bank.white, t, d, bp);
    const ring = biquad(ctx, 'bandpass', 1900, 14, gain(ctx, 0.25, out));
    this.tone('square', rnd(600, 680), t, d, ring);
  }

  cheer(): void {
    const t = this.admit('cheer', 2.3, 0.4, true);
    if (t < 0) return;
    const { ctx } = this;
    const bank = this.c.bank;
    const out = this.out(0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.9, t + 0.15);
    out.gain.setValueAtTime(0.9, t + 1.0);
    out.gain.linearRampToValueAtTime(0, t + 2.2);

    // "hu-RAH": voices through a moving formant bank
    const fb = gain(ctx, 1);
    const fm: Array<[number, number, number, number]> = [
      [480, 860, 5, 1],
      [1100, 1350, 6, 0.6],
      [2600, 2700, 6, 0.25],
    ];
    for (const [a, b, q, gv] of fm) {
      const bp = biquad(ctx, 'bandpass', a, q, gain(ctx, gv, out));
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.exponentialRampToValueAtTime(b, t + 0.28);
      fb.connect(bp);
    }
    const vibAmt = gain(ctx, 35);
    this.tone('sine', 5.3, t, 2.2, vibAmt);
    for (let i = 0; i < 7; i++) {
      const f = rnd(165, 390);
      const st = t + rnd(0, 0.18);
      const vg = gain(ctx, 0, fb);
      const o = this.tone('sawtooth', f, st, 2.1, vg);
      vibAmt.connect(o.detune);
      o.frequency.setValueAtTime(f * 0.9, st);
      o.frequency.exponentialRampToValueAtTime(f * 1.15, st + 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 0.95, st + 1.8);
      vg.gain.setValueAtTime(0, st);
      vg.gain.linearRampToValueAtTime(0.07, st + 0.12);
      vg.gain.setTargetAtTime(0, st + rnd(0.7, 1.3), 0.3);
    }
    // crowd roar
    this.burst(t, bank.pink, 'bandpass', 1200, 0.8, 0.45, 0.15, 1.9, out);
    // claps: one noise source, many scheduled blips
    const cg = gain(ctx, 0, out);
    this.noise(bank.white, t, 2.1, biquad(ctx, 'bandpass', 1700, 1.1, cg));
    let ct = t + 0.15;
    while (ct < t + 2.0) {
      cg.gain.setValueAtTime(rnd(0.2, 0.55), ct);
      cg.gain.setTargetAtTime(0, ct + 0.002, 0.01);
      ct += rnd(0.04, 0.11);
    }
  }

  whinny(): void {
    const t = this.admit('whinny', 1.8, 0.6, true);
    if (t < 0) return;
    const { ctx } = this;
    const bank = this.c.bank;
    const end = t + 1.3;
    const out = this.out(0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.32, t + 0.06);
    out.gain.setValueAtTime(0.32, t + 0.8);
    out.gain.linearRampToValueAtTime(0, end);

    const lp = biquad(ctx, 'lowpass', 4500, 0.7, out);
    const voice = gain(ctx, 1);
    for (const [f, q, gv] of [[1000, 4, 1], [2300, 5, 0.6], [520, 2, 0.4]]) {
      voice.connect(biquad(ctx, 'bandpass', f, q, gain(ctx, gv, lp)));
    }
    // tremolo tied to the wobble
    const am = gain(ctx, 0.8, voice);
    const car = this.tone('sawtooth', 520, t, 1.3, am);
    const k = rnd(0.92, 1.08);
    const f = car.frequency;
    f.setValueAtTime(520 * k, t);
    f.exponentialRampToValueAtTime(1150 * k, t + 0.12);
    f.exponentialRampToValueAtTime(1000 * k, t + 0.35);
    f.exponentialRampToValueAtTime(820 * k, t + 0.7);
    f.exponentialRampToValueAtTime(560 * k, t + 1.05);
    f.exponentialRampToValueAtTime(380 * k, end);
    // descending wobble: vibrato that speeds up and deepens
    const depth = gain(ctx, 0);
    const wob = this.tone('sine', 9, t, 1.3, depth);
    wob.frequency.setValueAtTime(9, t);
    wob.frequency.linearRampToValueAtTime(13, end);
    depth.connect(f);
    depth.gain.setValueAtTime(20, t);
    depth.gain.linearRampToValueAtTime(150, t + 1.1);
    wob.connect(gain(ctx, 0.25, am.gain));
    // FM grit (nasal/raspy)
    this.tone('sine', 230, t, 1.3, gain(ctx, 160, f));
    // breath
    this.burst(t, bank.pink, 'bandpass', 1800, 1, 0.12, 0.05, 1.2, out);
    // snort + hoof clops
    this.burst(end + 0.02, bank.pink, 'bandpass', 700, 1.5, 0.25, 0.02, 0.18, this.c.sfx);
    this.clopAt(end + 0.12);
    this.clopAt(end + 0.3);
  }

  clop(): void {
    const t = this.admit('clop', 0.1, 0.045);
    if (t < 0) return;
    this.clopAt(t);
  }

  private clopAt(t: number): void {
    const out = this.out(1);
    const v = rnd(0.88, 1.12);
    this.hit(t, 640 * v, 380 * v, 0.035, 0.32, 0.06, out);
    this.hit(t, 190 * v, 120, 0.04, 0.22, 0.05, out, 'triangle');
    this.burst(t, this.c.bank.white, 'bandpass', 2400 * v, 3, 0.25, 0.001, 0.025, out);
  }

  trolleyBell(): void {
    const t = this.admit('bell', 2, 0.5, true);
    if (t < 0) return;
    const out = this.out(0.5);
    const base = rnd(690, 720);
    const ratios = [1, 2.02, 2.76, 4.07, 5.43, 6.8];
    const amps = [1, 0.65, 0.55, 0.35, 0.25, 0.15];
    const decays = [1.5, 1.0, 0.75, 0.45, 0.32, 0.22];
    for (const dt of [0, 0.27]) {
      this.bell(t + dt, base, ratios, amps, decays, 0.22, out);
      this.burst(t + dt, this.c.bank.white, 'highpass', 3500, 0.7, 0.18, 0.001, 0.012, out);
    }
  }

  steam(): void {
    const t = this.admit('steam', 1.6, 0.3);
    if (t < 0) return;
    const { ctx } = this;
    const bank = this.c.bank;
    const out = this.out(0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.4, t + 0.05);
    out.gain.setValueAtTime(0.36, t + 0.8);
    out.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    const sputter = gain(ctx, 0.8, out);
    this.tone('square', 17, t, 1.5, gain(ctx, 0.2, sputter.gain));
    const bp = biquad(ctx, 'bandpass', 5500, 0.8, sputter);
    bp.frequency.setValueAtTime(5500, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 1.5);
    this.noise(bank.white, t, 1.5, biquad(ctx, 'highpass', 2000, 0.7, bp));
    this.noise(bank.pink, t, 1.5, biquad(ctx, 'highpass', 800, 0.7, gain(ctx, 0.3, out)));
  }

  countdown(final: boolean): void {
    const t = this.admit(final ? 'go' : 'tick', final ? 1.2 : 0.3, 0.15, true);
    if (t < 0) return;
    const bank = this.c.bank;
    const out = this.out(1);
    if (!final) {
      const g = gain(this.ctx, 0, out);
      this.tone('square', 880, t, 0.18, biquad(this.ctx, 'lowpass', 2800, 0.7, g));
      this.env(g.gain, t, 0.003, 0.22, 0.16);
      this.hit(t, 1800, 900, 0.02, 0.12, 0.03, out);
      return;
    }
    // starter's pistol + bright bell
    const sh = shaper(this.ctx, bank.hard, gain(this.ctx, 0.9, out));
    this.burst(t, bank.white, 'highpass', 500, 0.7, 0.85, 0.001, 0.07, sh);
    this.hit(t, 170, 50, 0.1, 0.7, 0.2, out);
    this.burst(t, bank.brown, 'lowpass', 1200, 0.7, 0.5, 0.002, 0.3, out);
    this.bell(t + 0.04, 1320, [1, 2.0, 3.01, 4.2], [1, 0.5, 0.3, 0.18], [0.9, 0.6, 0.4, 0.25], 0.2, out);
  }

  click(): void {
    const t = this.admit('click', 0.05, 0.03);
    if (t < 0) return;
    const out = this.out(1);
    this.hit(t, 1400, 700, 0.02, 0.16, 0.035, out);
    this.burst(t, this.c.bank.white, 'bandpass', 3000, 2, 0.07, 0.001, 0.012, out);
  }

  coin(): void {
    const t = this.admit('coin', 0.9, 0.08);
    if (t < 0) return;
    const out = this.out(1);
    const bank = this.c.bank;
    // "ka": drawer/lever thunk
    this.burst(t, bank.white, 'bandpass', 900, 1.5, 0.3, 0.001, 0.04, out);
    this.hit(t, 140, 80, 0.03, 0.25, 0.04, out, 'square');
    // "ching"
    this.bell(t + 0.07, 2093, [1, 2.4, 3.1, 4.9], [1, 0.5, 0.4, 0.2], [0.7, 0.5, 0.4, 0.25], 0.13, out);
    this.bell(t + 0.12, 2637, [1, 2.4, 3.1], [1, 0.45, 0.3], [0.6, 0.4, 0.3], 0.1, out);
  }

  gearShift(): void {
    const t = this.admit('shift', 0.12, 0.1);
    if (t < 0) return;
    const out = this.out(1);
    const bank = this.c.bank;
    this.burst(t, bank.brown, 'lowpass', 500, 0.7, 0.4, 0.002, 0.06, out);
    this.hit(t, 160, 70, 0.05, 0.3, 0.07, out);
    this.burst(t + 0.01, bank.white, 'bandpass', 1500, 2, 0.1, 0.001, 0.015, out);
  }
}
