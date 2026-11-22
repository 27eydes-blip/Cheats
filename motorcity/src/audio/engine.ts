// Continuous engine voices: the player's big, slow-revving 1910s four-cylinder
// and a rougher "rival cars nearby" layer. All nodes are created once; update()
// only ramps AudioParams.

import { Core, ParamCache, biquad, clamp, gain, loopNoise, osc, shaper } from './core';

export interface EngineOpts {
  on: boolean;
  boost: boolean;
  offroad: boolean;
  spin: boolean;
}

/** Upper speedPct bound of each gear (gear g covers BANDS[g-1]..BANDS[g]). */
const BANDS = [0, 0.24, 0.48, 0.73, 1];

/** Pure gear/RPM model — works even before audio is initialised. */
export class GearBox {
  gear = 1;
  /** 0..~1 normalised RPM */
  rpm = 0.1;

  /** Returns +1 on upshift, -1 on downshift, 0 otherwise. */
  update(speedPct: number): number {
    const s = clamp(Number.isFinite(speedPct) ? speedPct : 0, 0, 1);
    let g = this.gear;
    while (g < 4 && s > BANDS[g] + 0.012) g++;
    while (g > 1 && s < BANDS[g - 1] - 0.035) g--;
    const dir = Math.sign(g - this.gear);
    this.gear = g;
    const lo = BANDS[g - 1];
    const hi = BANDS[g];
    const frac = clamp((s - lo) / (hi - lo), -0.2, 1.06);
    this.rpm = clamp(g === 1 ? 0.1 + 0.85 * frac : 0.36 + 0.6 * frac, 0.06, 1.05);
    return dir;
  }
}

/** Pulse-ish periodic wave for the "chuff" amplitude modulation. */
function pulseWave(ctx: BaseAudioContext): PeriodicWave {
  const n = 8;
  const real = new Array<number>(n).fill(0);
  const imag = new Array<number>(n).fill(0);
  for (let k = 1; k < n; k++) {
    // narrow pulse (duty ~30%) as cosine series
    real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.3) * (1 - k / (n + 1));
  }
  return ctx.createPeriodicWave(real, imag);
}

export class EngineVoice {
  private readonly core: Core;
  private readonly pc = new ParamCache(20);
  private readonly saw: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly saw2: OscillatorNode;
  private readonly lp: BiquadFilterNode;
  private readonly chug: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly lfoDepth: GainNode;
  private readonly clatBp: BiquadFilterNode;
  private readonly clatGain: GainNode;
  private readonly drive: GainNode;
  private readonly out: GainNode;
  private readonly rumble: GainNode;
  private readonly judder: OscillatorNode;
  private readonly judderDepth: GainNode;
  private dipUntil = 0;
  private spinT = 0;
  /** Current firing frequency (Hz) — used by the rival layer. */
  fire = 22;

  constructor(core: Core) {
    this.core = core;
    const { ctx, bank } = core;
    this.out = gain(ctx, 0, core.sfx);
    const post = gain(ctx, 0.55, this.out);
    const sh = shaper(ctx, bank.hard, post);
    this.drive = gain(ctx, 1.2, sh);
    this.chug = gain(ctx, 0.7, this.drive);
    this.lp = biquad(ctx, 'lowpass', 400, 1.8, this.chug);
    const mix = gain(ctx, 1, this.lp);

    this.saw = osc(ctx, 'sawtooth', 22, gain(ctx, 0.5, mix));
    this.sub = osc(ctx, 'square', 11, gain(ctx, 0.35, mix));
    this.saw2 = osc(ctx, 'sawtooth', 44, gain(ctx, 0.18, mix));

    this.lfo = ctx.createOscillator();
    this.lfo.setPeriodicWave(pulseWave(ctx));
    this.lfo.frequency.value = 11;
    this.lfoDepth = gain(ctx, 0.3, this.chug.gain);
    this.lfo.connect(this.lfoDepth);

    // mechanical clatter: valves, chains, tappets
    this.clatGain = gain(ctx, 0.05, this.chug);
    this.clatBp = biquad(ctx, 'bandpass', 1200, 1.2, this.clatGain);
    loopNoise(ctx, bank.white, this.clatBp);

    // offroad rumble + judder
    this.rumble = gain(ctx, 0, this.out);
    const rlp = biquad(ctx, 'lowpass', 320, 0.9, this.rumble);
    loopNoise(ctx, bank.brown, rlp);
    this.judder = osc(ctx, 'triangle', 11);
    this.judderDepth = gain(ctx, 0, this.out.gain);
    this.judder.connect(this.judderDepth);

    const t = ctx.currentTime;
    for (const o of [this.saw, this.sub, this.saw2, this.lfo, this.judder]) o.start(t);
  }

  /** Brief rev dip on gear changes. */
  dip(): void {
    this.dipUntil = this.core.ctx.currentTime + 0.14;
  }

  update(rpmIn: number, o: EngineOpts): void {
    const ctx = this.core.ctx;
    const t = ctx.currentTime;
    const pc = this.pc;
    let rpm = rpmIn;
    let tc = 0.06;
    if (o.spin) {
      this.spinT += 0.21;
      rpm = Math.max(rpm, 0.86 + 0.1 * Math.sin(this.spinT));
      tc = 0.03;
    }
    if (t < this.dipUntil) rpm *= 0.86;
    rpm = clamp(rpm, 0.04, 1.08);

    const fire = (20 + rpm * 68) * (o.boost ? 1.12 : 1);
    this.fire = fire;
    pc.set(0, this.saw.frequency, fire, t, tc);
    pc.set(1, this.sub.frequency, fire * 0.5, t, tc);
    pc.set(2, this.saw2.frequency, fire * 2.012, t, tc);
    pc.set(3, this.lfo.frequency, fire * 0.5, t, tc);
    pc.set(4, this.lp.frequency, 260 + rpm * 1900 + (o.boost ? 700 : 0), t, 0.05);

    const d = clamp(0.78 - rpm * 0.6, 0.12, 0.8);
    pc.set(5, this.chug.gain, 1 - d * 0.5, t, 0.05);
    pc.set(6, this.lfoDepth.gain, d * 0.5, t, 0.05);

    pc.set(7, this.clatBp.frequency, 900 + rpm * 2600, t, 0.08);
    pc.set(8, this.clatGain.gain, 0.04 + rpm * 0.09 + (o.offroad ? 0.06 : 0), t, 0.08);
    pc.set(9, this.drive.gain, 1.1 + rpm * 1.4 + (o.boost ? 2.6 : 0), t, 0.06);

    const vol = o.on ? 0.24 + rpm * 0.14 + (o.boost ? 0.05 : 0) : 0;
    pc.set(10, this.out.gain, vol, t, o.on ? 0.05 : 0.08);
    pc.set(11, this.rumble.gain, o.on && o.offroad ? 0.55 : 0, t, 0.08);
    pc.set(12, this.judderDepth.gain, o.on && o.offroad ? vol * 0.4 : 0, t, 0.06);
    pc.set(13, this.judder.frequency, 9 + rpm * 7, t, 0.1);
  }
}

/** A second, rougher, slightly-out-of-tune engine bed for nearby rivals. */
export class RivalVoice {
  private readonly core: Core;
  private readonly pc = new ParamCache(6);
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly lp: BiquadFilterNode;
  private readonly out: GainNode;

  constructor(core: Core) {
    this.core = core;
    const { ctx, bank } = core;
    this.out = gain(ctx, 0, core.sfx);
    const post = gain(ctx, 0.45, this.out);
    const sh = shaper(ctx, bank.fuzz, post);
    const chug = gain(ctx, 0.6, gain(ctx, 1.6, sh));
    this.lp = biquad(ctx, 'lowpass', 800, 3, chug);
    this.a = osc(ctx, 'sawtooth', 40, gain(ctx, 0.5, this.lp));
    this.b = osc(ctx, 'square', 27, gain(ctx, 0.35, this.lp));
    // two unsynced chuff LFOs -> irregular, multi-car lumpiness
    const l1 = osc(ctx, 'triangle', 7.3, gain(ctx, 0.22, chug.gain));
    const l2 = osc(ctx, 'triangle', 10.7, gain(ctx, 0.18, chug.gain));
    // slow pitch wander
    const w = osc(ctx, 'sine', 0.21);
    w.connect(gain(ctx, 45, this.a.detune));
    w.connect(gain(ctx, -60, this.b.detune));
    const t = ctx.currentTime;
    for (const o of [this.a, this.b, l1, l2, w]) o.start(t);
  }

  update(near: number, playerFire: number): void {
    const t = this.core.ctx.currentTime;
    const n = clamp(Number.isFinite(near) ? near : 0, 0, 1);
    const f = Math.max(30, playerFire * 0.9 + 7);
    this.pc.set(0, this.out.gain, n * n * 0.22 + n * 0.06, t, 0.15);
    this.pc.set(1, this.a.frequency, f, t, 0.35);
    this.pc.set(2, this.b.frequency, f * 0.66, t, 0.35);
    this.pc.set(3, this.lp.frequency, 500 + n * 900, t, 0.2);
  }
}
