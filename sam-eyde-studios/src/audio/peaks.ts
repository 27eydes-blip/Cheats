export interface Peaks {
  /** peaks per second */
  rate: number;
  min: Float32Array;
  max: Float32Array;
}

export const PEAK_RATE = 100;

export function computePeaks(buffer: AudioBuffer, rate = PEAK_RATE): Peaks {
  const block = Math.max(1, Math.floor(buffer.sampleRate / rate));
  const count = Math.ceil(buffer.length / block);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < count; i++) {
      let lo = 0;
      let hi = 0;
      const end = Math.min(data.length, (i + 1) * block);
      for (let j = i * block; j < end; j++) {
        const v = data[j];
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
      if (ch === 0 || lo < min[i]) min[i] = lo;
      if (ch === 0 || hi > max[i]) max[i] = hi;
    }
  }
  return { rate: buffer.sampleRate / block, min, max };
}
