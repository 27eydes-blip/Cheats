import type { PitchTrack } from "./pitch";

/**
 * TD-PSOLA pitch shifting. The voice is cut into pitch-synchronous,
 * two-period grains that are re-spaced at the target pitch. Each grain keeps
 * its original shape, so formants (the tone of the voice) stay put — no
 * chipmunk effect. Unvoiced parts (breaths, consonants) pass through untouched.
 */
export interface PsolaOptions {
  /**
   * Formant shift in semitones. Each grain is read slightly faster (or slower),
   * which moves the vocal tract resonances — the "size" of the voice — without
   * touching the pitch, which is set only by how far apart the grains are placed.
   */
  formant?: number;
  /** Added to every voiced frame's pitch shift (e.g. +12 for an octave-up layer). */
  extraSemitones?: number;
  /** Leave unvoiced audio (breaths, consonants, silence) out of the result. */
  voicedOnly?: boolean;
}

export function psola(
  x: Float32Array,
  sampleRate: number,
  pitch: PitchTrack,
  shiftSemitones: Float32Array,
  options: PsolaOptions = {},
): Float32Array {
  const formantRatio = 2 ** ((options.formant ?? 0) / 12);
  const extra = options.extraSemitones ?? 0;
  const voicedOnly = options.voicedOnly ?? false;
  const reshape = formantRatio !== 1 || extra !== 0;
  const N = x.length;
  const out = new Float32Array(N);
  const frames = pitch.f0.length;
  if (N === 0 || frames === 0) {
    out.set(x);
    return out;
  }
  const f0 = pitch.f0;
  const frameAt = (sample: number) => {
    const i = Math.round((sample / sampleRate - pitch.t0) / pitch.hop);
    return i < 0 ? 0 : i >= frames ? frames - 1 : i;
  };

  // Glottal pulses usually point one way; follow the stronger polarity.
  let skew = 0;
  for (let i = 0; i < N; i += 7) skew += x[i] * x[i] * x[i];
  const pol = skew < 0 ? -1 : 1;

  // 1. Analysis pitch marks: one per period, locked to waveform peaks.
  const unvoicedStep = Math.round(sampleRate * 0.005);
  const marks: number[] = [0];
  let last = 0;
  let wasVoiced = false;
  for (;;) {
    const f = f0[frameAt(last)];
    let m: number;
    if (f > 0) {
      const T = sampleRate / f;
      const centre = last + T;
      const half = (wasVoiced ? 0.2 : 0.5) * T;
      const lo = Math.max(last + 1, Math.round(centre - half));
      const hi = Math.min(N - 1, Math.round(centre + half));
      m = Math.round(centre);
      let peak = -Infinity;
      for (let i = lo; i <= hi; i++) {
        const v = x[i] * pol;
        if (v > peak) {
          peak = v;
          m = i;
        }
      }
      wasVoiced = true;
    } else {
      m = last + unvoicedStep;
      wasVoiced = false;
    }
    if (m >= N) break;
    marks.push(m);
    last = m;
  }
  const M = marks.length;
  if (M < 3) {
    out.set(x);
    return out;
  }

  // 2. Synthesis: overlap-add grains at the corrected pitch period.
  const wsum = new Float32Array(N);
  let ts = 0;
  let ai = 0;
  while (ts < N) {
    while (ai + 1 < M && Math.abs(marks[ai + 1] - ts) <= Math.abs(marks[ai] - ts)) ai++;
    const m = marks[ai];
    const right = ai + 1 < M ? marks[ai + 1] - m : m - marks[ai - 1];
    const left = ai > 0 ? m - marks[ai - 1] : right;
    const fi = frameAt(m);
    const f = f0[fi];
    const shift = shiftSemitones[fi] + (f > 0 ? extra : 0);
    const tuned = f > 0 && (reshape || Math.abs(shift) > 1e-3);
    if (voicedOnly && f <= 0) {
      ts = m + right;
      continue;
    }

    let centre: number;
    let frac = 0;
    if (tuned) {
      centre = Math.round(ts);
      frac = ts - centre;
    } else {
      // Nothing to change here: put the grain exactly where it came from.
      centre = m;
      ts = m;
    }

    for (let k = -left + 1; k < right; k++) {
      const o = centre + k;
      if (o < 0 || o >= N) continue;
      const w = k < 0 ? 0.5 * (1 + Math.cos((Math.PI * k) / left)) : 0.5 * (1 + Math.cos((Math.PI * k) / right));
      let v: number;
      if (frac === 0 && (!tuned || formantRatio === 1)) {
        v = x[m + k];
      } else {
        // Sub-sample placement keeps the tuned pitch exact; reading the grain at a
        // different speed is what shifts the formants.
        const p = tuned ? m + (k - frac) * formantRatio : m + k;
        const i0 = Math.floor(p);
        if (i0 < 0 || i0 + 1 >= N) continue;
        const t = p - i0;
        v = x[i0] * (1 - t) + x[i0 + 1] * t;
      }
      out[o] += v * w;
      wsum[o] += w;
    }

    if (tuned) {
      const ratio = Math.min(2.6, Math.max(0.4, 2 ** (shift / 12)));
      ts += sampleRate / (f * ratio);
    } else {
      ts += right;
    }
  }

  // Grains overlap more when pitch goes up — normalise so loudness stays put.
  for (let i = 0; i < N; i++) if (wsum[i] > 1) out[i] /= wsum[i];
  return out;
}
