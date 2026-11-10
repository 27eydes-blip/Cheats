export const STUDIO_NAME = "Sam Eyde Studios";

function infoChunk(tags: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let size = 4; // "INFO"
  for (const [id, text] of Object.entries(tags)) {
    const body = enc.encode(`${text}\0`);
    const padded = body.length + (body.length & 1);
    const chunk = new Uint8Array(8 + padded);
    chunk.set(enc.encode(id), 0);
    new DataView(chunk.buffer).setUint32(4, body.length, true);
    chunk.set(body, 8);
    parts.push(chunk);
    size += chunk.length;
  }
  const out = new Uint8Array(8 + size);
  out.set(enc.encode("LIST"), 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set(enc.encode("INFO"), 8);
  let o = 12;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Interleaved 16-bit PCM with a little dither. */
export function toInt16(channels: Float32Array[]): Int16Array {
  const n = channels[0]?.length ?? 0;
  const c = channels.length;
  const out = new Int16Array(n * c);
  for (let ch = 0; ch < c; ch++) {
    const src = channels[ch];
    for (let i = 0; i < n; i++) {
      const dither = (Math.random() - Math.random()) * 0.5;
      const v = Math.round(src[i] * 32767 + dither);
      out[i * c + ch] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
  }
  return out;
}

/**
 * 16-bit PCM WAV. `title` (and the studio name) are written to a LIST/INFO
 * chunk, which is where WAV files carry metadata.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number, title?: string): Blob {
  const pcm = toInt16(channels);
  const c = channels.length;
  const info = title
    ? infoChunk({ INAM: title, ISFT: STUDIO_NAME, ICMT: `Made in ${STUDIO_NAME}` })
    : new Uint8Array(0);
  const dataBytes = pcm.length * 2;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const text = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + dataBytes + info.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, c, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * c * 2, true);
  v.setUint16(32, c * 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, dataBytes, true);
  // Metadata goes after the audio so every player can still find the data chunk first.
  return new Blob([header, pcm.buffer as ArrayBuffer, info.buffer as ArrayBuffer], { type: "audio/wav" });
}

export function bufferChannels(buffer: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) out.push(buffer.getChannelData(ch));
  return out;
}
