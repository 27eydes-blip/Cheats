// Tiny dependency-free beat tracker: onset envelope -> tempo (autocorrelation) -> phase -> beat grid.
// Good enough for the game's procedural music, which is steady-tempo and percussive.
import { decodeMono } from "./ffmpeg.mjs";

const RATE = 11025;
const WIN = 1024;
const HOP = 256;
const ENV_RATE = RATE / HOP; // ~43 frames per second

function onsetEnvelope(pcm) {
  const n = Math.max(0, Math.floor((pcm.length - WIN) / HOP));
  const env = new Float32Array(n);
  let prevLo = 0;
  let prevHi = 0;
  for (let f = 0; f < n; f++) {
    let lo = 0;
    let hi = 0;
    const o = f * HOP;
    for (let i = 1; i < WIN; i++) {
      const s = pcm[o + i];
      lo += s * s;
      const d = s - pcm[o + i - 1]; // first difference ~ high-pass, catches hats/snares
      hi += d * d;
    }
    lo = Math.log1p(1000 * lo);
    hi = Math.log1p(1000 * hi);
    env[f] = Math.max(0, lo - prevLo) + Math.max(0, hi - prevHi);
    prevLo = lo;
    prevHi = hi;
  }
  // subtract a moving average so only peaks remain
  const out = new Float32Array(n);
  const R = 8;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) {
      s += env[j];
      c++;
    }
    out[i] = Math.max(0, env[i] - s / c);
  }
  return out;
}

function estimateTempo(env, minBpm = 70, maxBpm = 190) {
  const minLag = Math.floor((60 / maxBpm) * ENV_RATE);
  const maxLag = Math.ceil((60 / minBpm) * ENV_RATE);
  let best = { lag: 0, score: -1 };
  let total = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    s /= env.length - lag;
    // mild preference for ~120 bpm so we don't lock onto half/double time
    const bpm = (60 * ENV_RATE) / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = s * w;
    total += score;
    count++;
    if (score > best.score) best = { lag, score };
  }
  // parabolic refinement for a fractional lag
  const ac = (lag) => {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    return s / (env.length - lag);
  };
  const a = ac(best.lag - 1);
  const b = ac(best.lag);
  const c = ac(best.lag + 1);
  const denom = a - 2 * b + c;
  const lag = denom ? best.lag + (0.5 * (a - c)) / denom : best.lag;
  return { lag, confidence: count ? best.score / (total / count) : 0 };
}

/**
 * Returns { bpm, period, beats: [seconds...], confidence } for `file` (optionally a window).
 * confidence < ~1.6 means "no clear beat" (e.g. silence, speech) and callers should not snap.
 */
export async function detectBeats(file, { start = 0, dur } = {}) {
  const pcm = await decodeMono(file, { rate: RATE, start: start || undefined, dur });
  const env = onsetEnvelope(pcm);
  if (env.length < ENV_RATE * 3) return { bpm: 0, period: 0, beats: [], confidence: 0 };
  const { lag, confidence } = estimateTempo(env);
  // phase: which offset collects the most onset energy along the grid
  let bestPhase = 0;
  let bestScore = -1;
  for (let p = 0; p < lag; p += 0.25) {
    let s = 0;
    for (let t = p; t < env.length; t += lag) s += env[Math.round(t)] || 0;
    if (s > bestScore) {
      bestScore = s;
      bestPhase = p;
    }
  }
  const beats = [];
  for (let t = bestPhase; t < env.length; t += lag) {
    // nudge each beat to the local onset peak (±2 frames ≈ ±46ms) to absorb swing/jitter
    let k = Math.round(t);
    let m = env[k] || 0;
    for (let j = k - 2; j <= k + 2; j++) if ((env[j] || 0) > m) [m, k] = [env[j], j];
    beats.push(start + (k * HOP + WIN / 2) / RATE);
  }
  return { bpm: (60 * ENV_RATE) / lag, period: lag / ENV_RATE, beats, confidence };
}

/** Nearest beat to `t` within `maxShift` seconds, else `t`. */
export function snap(t, grid, maxShift = 0.25) {
  if (!grid?.beats?.length) return t;
  let best = t;
  let d = Infinity;
  for (const b of grid.beats) {
    const dd = Math.abs(b - t);
    if (dd < d) [d, best] = [dd, b];
  }
  return d <= maxShift ? best : t;
}
