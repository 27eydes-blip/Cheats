/// <reference lib="webworker" />
import type { PitchTrack } from "./pitch";
import { analyze, type TuneSettings, tuneAll } from "./tune";

export interface TuneRequest {
  jobId: number;
  audioId: string;
  /** Mono samples — only sent the first time the worker sees this audioId. */
  samples?: Float32Array;
  sampleRate: number;
  settings: TuneSettings;
}

export type TuneResponse =
  | { jobId: number; ok: true; /** tuned lead, then one channel per layer */ channels: Float32Array[] }
  | { jobId: number; ok: false; error: string };

const audio = new Map<string, { samples: Float32Array; pitch: PitchTrack | null }>();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<TuneRequest | { forget: string }>) => {
  const msg = e.data;
  if ("forget" in msg) {
    audio.delete(msg.forget);
    return;
  }
  try {
    let entry = audio.get(msg.audioId);
    if (!entry) {
      if (!msg.samples) throw new Error("missing audio");
      entry = { samples: msg.samples, pitch: null };
      audio.set(msg.audioId, entry);
    }
    if (!entry.pitch) entry.pitch = analyze(entry.samples, msg.sampleRate);
    const channels = tuneAll(entry.samples, msg.sampleRate, entry.pitch, msg.settings);
    const res: TuneResponse = { jobId: msg.jobId, ok: true, channels };
    scope.postMessage(
      res,
      channels.map((c) => c.buffer),
    );
  } catch (err) {
    const res: TuneResponse = { jobId: msg.jobId, ok: false, error: String(err) };
    scope.postMessage(res);
  }
};
