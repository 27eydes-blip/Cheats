/** decodeAudioData wrapped so it works with both the promise and callback forms (older iOS). */
export function decodeAudio(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const copy = data.slice(0); // decodeAudioData detaches its input
    const p = ctx.decodeAudioData(copy, resolve, (err) =>
      reject(err ?? new Error("This audio file could not be decoded")),
    );
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

/** Mono mix of a buffer, optionally skipping `skipSec` from the start. */
export function toMono(ctx: BaseAudioContext, buffer: AudioBuffer, skipSec = 0): AudioBuffer {
  const skip = Math.min(buffer.length, Math.max(0, Math.round(skipSec * buffer.sampleRate)));
  const length = Math.max(1, buffer.length - skip);
  const out = ctx.createBuffer(1, length, buffer.sampleRate);
  const dst = out.getChannelData(0);
  const n = buffer.numberOfChannels;
  for (let ch = 0; ch < n; ch++) {
    const src = buffer.getChannelData(ch);
    for (let i = 0; i < length && i + skip < src.length; i++) dst[i] += src[i + skip] / n;
  }
  return out;
}
