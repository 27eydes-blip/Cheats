/**
 * Pitch detection: YIN on a downsampled copy of the signal, with an energy
 * gate for silence and a median filter that removes octave jumps.
 */

export interface PitchTrack {
  /** Fundamental frequency per frame in Hz; 0 = unvoiced / silent. */
  f0: Float32Array;
  /** Seconds between frames. */
  hop: number;
  /** Time (seconds) of the centre of frame 0. */
  t0: number;
}

const MIN_HZ = 70;
const MAX_HZ = 1000;
const TARGET_RATE = 12000;
const YIN_THRESHOLD = 0.15;
const YIN_MAX_APERIODICITY = 0.35;

/** Low-pass (windowed sinc) and decimate by an integer factor. */
export function downsample(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const half = 4 * factor;
  const taps = new Float32Array(2 * half + 1);
  const fc = 0.45 / factor;
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const sinc = i === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * i) / (Math.PI * i);
    const win = 0.5 + 0.5 * Math.cos((Math.PI * i) / (half + 1));
    taps[i + half] = sinc * win;
    sum += sinc * win;
  }
  for (let i = 0; i < taps.length; i++) taps[i] /= sum;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = i * factor;
    let acc = 0;
    const lo = Math.max(0, c - half);
    const hi = Math.min(x.length - 1, c + half);
    for (let j = lo; j <= hi; j++) acc += x[j] * taps[j - c + half];
    out[i] = acc;
  }
  return out;
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

export function detectPitch(samples: Float32Array, sampleRate: number): PitchTrack {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const x = downsample(samples, factor);
  const fs = sampleRate / factor;
  const tauMin = Math.max(2, Math.floor(fs / MAX_HZ));
  const tauMax = Math.ceil(fs / MIN_HZ);
  const W = Math.round(fs * 0.0215);
  const frameLen = W + tauMax;
  const hopN = Math.max(1, Math.round(fs * 0.005));
  const frames = Math.max(0, Math.floor((x.length - frameLen) / hopN) + 1);
  const f0 = new Float32Array(frames);
  const track: PitchTrack = { f0, hop: hopN / fs, t0: frameLen / 2 / fs };
  if (frames === 0) return track;

  // Energy gate, relative to the loud parts of this take.
  const rms = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let e = 0;
    const s = i * hopN;
    for (let j = 0; j < frameLen; j += 2) e += x[s + j] * x[s + j];
    rms[i] = Math.sqrt(e / (frameLen / 2));
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  const gate = Math.max(loud * 0.03, 2e-4);

  const d = new Float32Array(tauMax + 2);
  for (let i = 0; i < frames; i++) {
    if (rms[i] < gate) continue;
    const s = i * hopN;
    // YIN difference function + cumulative mean normalisation.
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let acc = 0;
      for (let j = 0; j < W; j++) {
        const diff = x[s + j] - x[s + j + tau];
        acc += diff * diff;
      }
      running += acc;
      d[tau] = running > 0 ? (acc * tau) / running : 1;
    }
    let best = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (d[tau] < YIN_THRESHOLD) {
        while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
    }
    if (best < 0) {
      let lo = tauMin;
      for (let tau = tauMin + 1; tau <= tauMax; tau++) if (d[tau] < d[lo]) lo = tau;
      if (d[lo] < YIN_MAX_APERIODICITY) best = lo;
    }
    if (best < 0) continue;
    // Parabolic interpolation for sub-sample accuracy.
    const a = d[best - 1];
    const b = d[best];
    const c = d[best + 1];
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    const tau = best + (Math.abs(shift) < 1 ? shift : 0);
    f0[i] = fs / tau;
  }

  smoothTrack(f0);
  return track;
}

/** Median filter (kills octave jumps), bridge tiny gaps, drop tiny voiced blips. */
export function smoothTrack(f0: Float32Array): void {
  const n = f0.length;
  const src = Float32Array.from(f0);
  const R = 3;
  for (let i = 0; i < n; i++) {
    if (src[i] <= 0) continue;
    const near: number[] = [];
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) {
      if (src[j] > 0) near.push(Math.log2(src[j]));
    }
    if (near.length >= 3) {
      const med = median(near);
      // Only replace clear outliers so real vibrato and slides are untouched.
      if (Math.abs(Math.log2(src[i]) - med) > 0.35) f0[i] = 2 ** med;
    }
  }
  // Bridge gaps of 1–2 frames inside a note.
  for (let i = 1; i < n - 1; i++) {
    if (f0[i] > 0 || f0[i - 1] <= 0) continue;
    let j = i;
    while (j < n && f0[j] <= 0) j++;
    if (j < n && j - i <= 2) {
      for (let k = i; k < j; k++) {
        const t = (k - i + 1) / (j - i + 1);
        f0[k] = f0[i - 1] * (f0[j] / f0[i - 1]) ** t;
      }
    }
    i = j;
  }
  // Remove voiced runs shorter than 4 frames (~20 ms): noise, not notes.
  for (let i = 0; i < n; ) {
    if (f0[i] <= 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && f0[j] > 0) j++;
    if (j - i < 4) for (let k = i; k < j; k++) f0[k] = 0;
    i = j;
  }
}
