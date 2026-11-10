/// <reference lib="webworker" />
import { Mp3Encoder } from "@breezystack/lamejs";

export interface Mp3Request {
  left: Int16Array;
  right: Int16Array;
  sampleRate: number;
  kbps: number;
}
export type Mp3Response = { progress: number } | { done: Uint8Array } | { error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<Mp3Request>) => {
  try {
    const { left, right, sampleRate, kbps } = e.data;
    const encoder = new Mp3Encoder(2, sampleRate, kbps);
    const parts: Uint8Array[] = [];
    const BLOCK = 1152 * 20;
    let total = 0;
    for (let i = 0; i < left.length; i += BLOCK) {
      const out = encoder.encodeBuffer(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK));
      if (out.length) {
        parts.push(new Uint8Array(out));
        total += out.length;
      }
      if ((i / BLOCK) % 20 === 0) scope.postMessage({ progress: i / left.length } satisfies Mp3Response);
    }
    const end = encoder.flush();
    if (end.length) {
      parts.push(new Uint8Array(end));
      total += end.length;
    }
    const done = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      done.set(p, o);
      o += p.length;
    }
    scope.postMessage({ done } satisfies Mp3Response, [done.buffer]);
  } catch (err) {
    scope.postMessage({ error: String(err) } satisfies Mp3Response);
  }
};
