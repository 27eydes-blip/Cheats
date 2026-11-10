/**
 * Generated reverb impulse responses: decaying stereo noise whose top end
 * dies away faster than the lows (set by `toneHz`), like a real room.
 */
const cache = new Map<string, AudioBuffer>();

export function reverbImpulse(sampleRate: number, seconds: number, toneHz: number): AudioBuffer {
  const key = `${sampleRate}|${seconds}|${toneHz}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const length = Math.max(1, Math.round(sampleRate * seconds));
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  // Deterministic noise so playback and export get the exact same reverb.
  let seed = 0x9e3779b9 ^ Math.round(seconds * 1000) ^ (Math.round(toneHz) << 8);
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  const fadeIn = Math.round(sampleRate * 0.004);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // -60 dB at the end of the tail.
      const env = Math.exp(-6.9 * t) * (i < fadeIn ? i / fadeIn : 1);
      // The low-pass closes as the tail decays.
      const cutoff = Math.max(400, toneHz * (1 - 0.75 * t));
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      lp += a * (rand() - lp);
      data[i] = lp * env;
    }
  }
  cache.set(key, buffer);
  return buffer;
}
