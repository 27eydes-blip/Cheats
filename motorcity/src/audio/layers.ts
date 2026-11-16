// Continuous ambience/effect beds: tyre skid, crowd, rain. Created once at init.

import { Core, ParamCache, biquad, clamp, gain, loopNoise, osc } from './core';

const safe = (v: number): number => clamp(Number.isFinite(v) ? v : 0, 0, 1);

export class SkidLayer {
  private readonly core: Core;
  private readonly pc = new ParamCache(6);
  private readonly out: GainNode;
  private readonly squealBp: BiquadFilterNode;
  private readonly tone: OscillatorNode;
  private readonly toneGain: GainNode;

  constructor(core: Core) {
    this.core = core;
    const { ctx, bank } = core;
    this.out = gain(ctx, 0, core.sfx);
    // high, narrow squeal
    this.squealBp = biquad(ctx, 'bandpass', 1900, 9, gain(ctx, 0.9, this.out));
    loopNoise(ctx, bank.white, this.squealBp);
    // tonal part of the squeal, with wobble
    this.toneGain = gain(ctx, 0.0, this.out);
    this.tone = osc(ctx, 'triangle', 1750, this.toneGain);
    const vib = osc(ctx, 'sine', 7.5);
    vib.connect(gain(ctx, 40, this.tone.frequency));
    // cobblestone scrub: low-mid noise chattered by a square LFO
    const scrub = gain(ctx, 0.5, this.out);
    const chatter = osc(ctx, 'square', 21, gain(ctx, 0.4, scrub.gain));
    loopNoise(ctx, bank.white, biquad(ctx, 'bandpass', 650, 0.8, scrub));
    const t = ctx.currentTime;
    this.tone.start(t);
    vib.start(t);
    chatter.start(t);
  }

  update(intensity: number): void {
    const t = this.core.ctx.currentTime;
    const i = safe(intensity);
    this.pc.set(0, this.out.gain, i * 0.32, t, i > 0 ? 0.03 : 0.07);
    this.pc.set(1, this.squealBp.frequency, 1700 + i * 800, t, 0.1);
    this.pc.set(2, this.toneGain.gain, i > 0.45 ? (i - 0.45) * 0.12 : 0, t, 0.06);
    this.pc.set(3, this.tone.frequency, 1600 + i * 450, t, 0.1);
  }
}

export class CrowdLayer {
  private readonly core: Core;
  private readonly pc = new ParamCache(6);
  private readonly out: GainNode;
  private readonly f: BiquadFilterNode[] = [];

  constructor(core: Core) {
    this.core = core;
    const { ctx, bank } = core;
    this.out = gain(ctx, 0, core.sfx);
    const src = gain(ctx, 1);
    loopNoise(ctx, bank.pink, src);
    const formants: Array<[number, number, number, number]> = [
      // freq, Q, gain, lfo rate (Hz)
      [450, 2.2, 0.9, 0.31],
      [1050, 3, 0.7, 0.47],
      [2400, 3.5, 0.35, 0.73],
    ];
    const t = ctx.currentTime;
    for (const [fr, q, g, r] of formants) {
      const vg = gain(ctx, g * 0.75, this.out);
      const bp = biquad(ctx, 'bandpass', fr, q, vg);
      src.connect(bp);
      const l = osc(ctx, 'sine', r, gain(ctx, g * 0.25, vg.gain));
      l.start(t);
      this.f.push(bp);
    }
  }

  update(intensity: number): void {
    const t = this.core.ctx.currentTime;
    const i = safe(intensity);
    this.pc.set(0, this.out.gain, i * 0.5, t, 0.25);
    const bright = 1 + Math.max(0, i - 0.5) * 0.5;
    this.pc.set(1, this.f[0].frequency, 450 * bright, t, 0.3);
    this.pc.set(2, this.f[1].frequency, 1050 * bright, t, 0.3);
    this.pc.set(3, this.f[2].frequency, 2400 * bright, t, 0.3);
  }
}

export class RainLayer {
  private readonly core: Core;
  private readonly out: GainNode;
  private on = false;

  constructor(core: Core) {
    this.core = core;
    const { ctx, bank } = core;
    this.out = gain(ctx, 0, core.sfx);
    const lp = biquad(ctx, 'lowpass', 7000, 0.5, this.out);
    loopNoise(ctx, bank.pink, biquad(ctx, 'highpass', 900, 0.6, lp));
    // a second, patterned layer: drips on tin roofs and puddles
    const drip = gain(ctx, 0.35, this.out);
    const dl = osc(ctx, 'sawtooth', 13.7, gain(ctx, 0.3, drip.gain));
    loopNoise(ctx, bank.white, biquad(ctx, 'bandpass', 3200, 1.5, drip));
    dl.start(ctx.currentTime);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    const g = this.out.gain;
    const t = this.core.ctx.currentTime;
    g.setTargetAtTime(on ? 0.22 : 0, t, on ? 0.8 : 0.5);
  }
}
