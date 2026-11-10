/// <reference lib="webworker" />
import type { PitchTrack } from "./pitch";
import { analyze, tune, type TuneSettings } from "./tune";

export interface TuneRequest {
  jobId: number;
  audioId: string;
  /** Mono samples — only sent the first time the worker sees this audioId. */
  samples?: Float32Array;
  sampleRate: number;
  settings: TuneSettings;
}

export type TuneResponse =
  | { jobId: number; ok: true; samples: Float32Array }
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
    const samples = tune(entry.samples, msg.sampleRate, entry.pitch, msg.settings);
    const res: TuneResponse = { jobId: msg.jobId, ok: true, samples };
    scope.postMessage(res, [samples.buffer]);
  } catch (err) {
    const res: TuneResponse = { jobId: msg.jobId, ok: false, error: String(err) };
    scope.postMessage(res);
  }
};
