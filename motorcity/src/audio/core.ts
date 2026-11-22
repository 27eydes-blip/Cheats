// Shared Web Audio plumbing: context constructor lookup, cached buffers/curves,
// small node helpers and a per-frame AudioParam smoothing cache.

export type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;
export type Curve = Float32Array<ArrayBuffer>;

export function getAudioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

export interface Bank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  crackle: AudioBuffer;
  hammer: AudioBuffer;
  /** gentle saturation */
  soft: Curve;
  /** hard, slightly asymmetric clipping (rasp/grit) */
  hard: Curve;
  /** very heavy fuzz */
  fuzz: Curve;
}

export interface Core {
  ctx: AudioContext;
  sfx: GainNode;
  music: GainNode;
  bank: Bank;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function makeBuffer(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array, sr: number) => void): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * seconds));
  const b = ctx.createBuffer(1, n, sr);
  fill(b.getChannelData(0), sr);
  return b;
}

export function makeCurve(k: number, asym = 0, n = 1024): Curve {
  const c = new Float32Array(n);
  const norm = Math.tanh(k * (1 + Math.abs(asym)));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * (x + asym * x * x)) / norm;
  }
  return c;
}

export function makeBank(ctx: BaseAudioContext): Bank {
  const white = makeBuffer(ctx, 2, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const pink = makeBuffer(ctx, 3, (d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  const brown = makeBuffer(ctx, 3, (d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  });
  // Gramophone surface noise: sparse clicks/pops plus a faint, dull hiss.
  const crackle = makeBuffer(ctx, 4, (d, sr) => {
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.08;
      d[i] = lp * 0.05;
    }
    const pops = Math.floor(d.length / sr * 18);
    for (let p = 0; p < pops; p++) {
      const at = Math.floor(Math.random() * (d.length - 40));
      const amp = (Math.random() < 0.15 ? 0.9 : 0.35) * (Math.random() < 0.5 ? -1 : 1) * Math.random();
      const len = 4 + Math.floor(Math.random() * 24);
      for (let j = 0; j < len; j++) d[at + j] += amp * Math.exp(-j / (len * 0.25)) * (j % 2 ? -0.6 : 1);
    }
  });
  // Piano hammer/felt thump: ~25 ms of decaying, low-passed noise.
  const hammer = makeBuffer(ctx, 0.03, (d, sr) => {
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      lp += ((Math.random() * 2 - 1) - lp) * 0.35;
      d[i] = lp * Math.exp(-t / 0.005) * 0.9;
    }
  });
  return {
    white, pink, brown, crackle, hammer,
    soft: makeCurve(1.5),
    hard: makeCurve(4, 0.15),
    fuzz: makeCurve(9, 0.25),
  };
}

// ---- node helpers --------------------------------------------------------

export type Dest = AudioNode | AudioParam;
function link(n: AudioNode, dest: Dest): void {
  if (dest instanceof AudioParam) n.connect(dest);
  else n.connect(dest);
}

export function gain(ctx: BaseAudioContext, v: number, dest?: Dest): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) link(g, dest);
  return g;
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, dest?: Dest): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  if (dest) link(o, dest);
  return o;
}

export function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number, dest?: Dest): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (dest) link(b, dest);
  return b;
}

export function shaper(ctx: BaseAudioContext, curve: Curve, dest?: AudioNode): WaveShaperNode {
  const s = ctx.createWaveShaper();
  s.curve = curve;
  s.oversample = 'none';
  if (dest) s.connect(dest);
  return s;
}

/** Looping noise source started immediately at a random offset. */
export function loopNoise(ctx: BaseAudioContext, buf: AudioBuffer, dest: AudioNode): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.connect(dest);
  s.start(0, Math.random() * buf.duration);
  return s;
}

/**
 * Remembers the last target sent to each AudioParam so per-frame calls only
 * schedule automation when the value actually changes noticeably.
 */
export class ParamCache {
  private v: Float64Array;
  constructor(n: number) {
    this.v = new Float64Array(n).fill(Number.NaN);
  }
  set(i: number, p: AudioParam, val: number, t: number, tc: number): void {
    const o = this.v[i];
    if (!Number.isNaN(o) && Math.abs(o - val) <= 1e-4 + Math.abs(val) * 0.004) return;
    this.v[i] = val;
    p.setTargetAtTime(val, t, tc);
  }
  reset(): void {
    this.v.fill(Number.NaN);
  }
}
