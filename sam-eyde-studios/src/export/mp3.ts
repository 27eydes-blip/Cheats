import type { Mp3Request, Mp3Response } from "./mp3.worker";
import { STUDIO_NAME } from "./wav";

/** Minimal ID3v2.3 tag (UTF-16 text frames). */
export function id3Tag(frames: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const [id, text] of Object.entries(frames)) {
    const body = new Uint8Array(1 + 2 + text.length * 2);
    body[0] = 1; // UTF-16 with BOM
    body[1] = 0xff;
    body[2] = 0xfe;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      body[3 + i * 2] = code & 0xff;
      body[4 + i * 2] = code >> 8;
    }
    const frame = new Uint8Array(10 + body.length);
    for (let i = 0; i < 4; i++) frame[i] = id.charCodeAt(i);
    new DataView(frame.buffer).setUint32(4, body.length, false);
    frame.set(body, 10);
    chunks.push(frame);
    size += frame.length;
  }
  const tag = new Uint8Array(10 + size);
  tag.set([0x49, 0x44, 0x33, 3, 0, 0]); // "ID3", v2.3
  // 28-bit sync-safe size
  tag[6] = (size >> 21) & 0x7f;
  tag[7] = (size >> 14) & 0x7f;
  tag[8] = (size >> 7) & 0x7f;
  tag[9] = size & 0x7f;
  let o = 10;
  for (const c of chunks) {
    tag.set(c, o);
    o += c.length;
  }
  return tag;
}

function to16(src: Float32Array): Int16Array {
  const out = new Int16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = Math.round(src[i] * 32767);
    out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return out;
}

/** Encodes a stereo render to MP3 in a worker (the UI stays responsive). */
export function encodeMp3(
  buffer: AudioBuffer,
  title: string,
  onProgress?: (fraction: number) => void,
  kbps = 256,
): Promise<Blob> {
  const left = to16(buffer.getChannelData(0));
  const right = to16(buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0));
  const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<Mp3Response>) => {
      const msg = e.data;
      if ("progress" in msg) onProgress?.(msg.progress);
      else if ("done" in msg) {
        const tag = id3Tag({
          TIT2: title,
          TPUB: STUDIO_NAME,
          TENC: STUDIO_NAME,
          TSSE: STUDIO_NAME,
        });
        resolve(new Blob([tag.buffer as ArrayBuffer, msg.done.buffer as ArrayBuffer], { type: "audio/mpeg" }));
      } else reject(new Error(msg.error));
    };
    worker.onerror = (e) => reject(new Error(e.message || "MP3 encoder failed"));
    const req: Mp3Request = { left, right, sampleRate: buffer.sampleRate, kbps };
    worker.postMessage(req, [left.buffer, right.buffer]);
  }).finally(() => worker.terminate());
}
