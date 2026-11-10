import { engine } from "../audio/engine";
import { markLayered } from "../audio/graph";
import { PRESETS } from "../effects/presets";
import { getState, setUi } from "../state/store";
import type { Project, Track } from "../types";
import { type TuneSettings, tuneKey } from "./tune";
import type { TuneRequest, TuneResponse } from "./worker";

/**
 * Runs autotune in a Web Worker and keeps each track's tuned audio current.
 * Results are cached per audio + key + scale + retune speed, so flipping back
 * to a setting you already tried is instant.
 */

const MAX_CACHE_SAMPLES = 40_000_000;
const DEBOUNCE_MS = 220;

let worker: Worker | null = null;
let nextJob = 1;
const cache = new Map<string, AudioBuffer>();
/** audioIds the worker already holds. */
const sent = new Set<string>();
/** Cache key currently applied to each track. */
const active = new Map<string, string>();
const pending = new Map<string, { key: string; jobId: number }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const jobs = new Map<number, { key: string; sampleRate: number }>();
let idleWaiters: Array<() => void> = [];

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<TuneResponse>) => onResult(e.data);
    worker.onerror = (e) => console.error("autotune worker error", e.message);
  }
  return worker;
}

function settingsFor(project: Project, track: Track): TuneSettings {
  const t = PRESETS[track.preset]?.tune;
  return {
    key: project.key,
    scale: project.scale,
    retune: track.retune,
    hysteresis: t?.hysteresis,
    formant: t?.formant,
    layers: t?.layers,
  };
}

function setTuning(trackId: string, on: boolean): void {
  const cur = getState().ui.tuning;
  if (!!cur[trackId] === on) return;
  const next = { ...cur };
  if (on) next[trackId] = true;
  else delete next[trackId];
  setUi({ tuning: next });
}

function monoSamples(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  const n = buffer.numberOfChannels;
  for (let ch = 0; ch < n; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < out.length; i++) out[i] += d[i] / n;
  }
  return out;
}

function request(trackId: string): void {
  timers.delete(trackId);
  const project = getState().project;
  const track = project?.tracks.find((t) => t.id === trackId);
  if (!project || !track || !track.autotune) return;
  const buffer = engine.buffers.get(track.audioId);
  if (!buffer) return;
  const settings = settingsFor(project, track);
  const key = tuneKey(track.audioId, settings);
  if (cache.has(key)) {
    syncAutotune();
    return;
  }
  const jobId = nextJob++;
  pending.set(trackId, { key, jobId });
  jobs.set(jobId, { key, sampleRate: buffer.sampleRate });
  const msg: TuneRequest = { jobId, audioId: track.audioId, sampleRate: buffer.sampleRate, settings };
  if (!sent.has(track.audioId)) {
    msg.samples = monoSamples(buffer);
    sent.add(track.audioId);
    getWorker().postMessage(msg, [msg.samples.buffer]);
  } else {
    getWorker().postMessage(msg);
  }
}

function onResult(res: TuneResponse): void {
  const job = jobs.get(res.jobId);
  jobs.delete(res.jobId);
  if (job && res.ok && engine.ctx) {
    const buf = engine.ctx.createBuffer(res.channels.length, res.channels[0].length, job.sampleRate);
    res.channels.forEach((c, i) => buf.getChannelData(i).set(c));
    // Channel 0 is the lead; any further channels are generated layers, not stereo.
    markLayered(buf);
    cache.set(job.key, buf);
    trimCache();
  } else if (!res.ok) {
    console.error("autotune failed:", res.error);
  }
  for (const [trackId, p] of pending) {
    if (p.jobId === res.jobId) {
      pending.delete(trackId);
      if (!res.ok) setTuning(trackId, false);
    }
  }
  syncAutotune();
}

function trimCache(): void {
  let total = 0;
  for (const b of cache.values()) total += b.length * b.numberOfChannels;
  if (total <= MAX_CACHE_SAMPLES) return;
  const inUse = new Set(active.values());
  for (const [key, b] of cache) {
    if (total <= MAX_CACHE_SAMPLES) break;
    if (inUse.has(key)) continue;
    cache.delete(key);
    total -= b.length * b.numberOfChannels;
  }
}

/** Bring every track's tuned audio in line with the project. Cheap; call on any change. */
export function syncAutotune(): void {
  const project = getState().project;
  const alive = new Set<string>();
  for (const track of project?.tracks ?? []) {
    alive.add(track.id);
    if (!project || track.kind !== "vocal" || !track.autotune) {
      if (active.delete(track.id)) engine.setTuned(track.id, null);
      pending.delete(track.id);
      clearTimeout(timers.get(track.id));
      timers.delete(track.id);
      setTuning(track.id, false);
      continue;
    }
    if (!engine.buffers.has(track.audioId) || !engine.ctx) continue;
    const key = tuneKey(track.audioId, settingsFor(project, track));
    if (active.get(track.id) === key) {
      if (!pending.has(track.id) && !timers.has(track.id)) setTuning(track.id, false);
      continue;
    }
    const hit = cache.get(key);
    if (hit) {
      // Refresh LRU position, apply, done.
      cache.delete(key);
      cache.set(key, hit);
      active.set(track.id, key);
      pending.delete(track.id);
      clearTimeout(timers.get(track.id));
      timers.delete(track.id);
      engine.setTuned(track.id, hit);
      setTuning(track.id, false);
      continue;
    }
    if (pending.get(track.id)?.key === key) continue;
    // Settings changed: (re)start the debounce so slider drags don't spam the worker.
    pending.delete(track.id);
    clearTimeout(timers.get(track.id));
    const id = track.id;
    timers.set(
      id,
      setTimeout(() => request(id), DEBOUNCE_MS),
    );
    setTuning(track.id, true);
  }
  for (const id of [...active.keys()]) if (!alive.has(id)) active.delete(id);
  for (const id of [...pending.keys()]) if (!alive.has(id)) pending.delete(id);

  if (pending.size === 0 && timers.size === 0 && idleWaiters.length) {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  }
}

/** Resolves once no tuning is in flight (used before exporting). */
export function autotuneIdle(): Promise<void> {
  syncAutotune();
  if (pending.size === 0 && timers.size === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

/** The tuned audio currently applied to a track, if any. */
export function tunedBuffer(trackId: string): AudioBuffer | undefined {
  const key = active.get(trackId);
  return key ? cache.get(key) : undefined;
}

/** Drop everything (when switching projects). */
export function resetAutotune(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  pending.clear();
  active.clear();
  cache.clear();
  jobs.clear();
  for (const id of sent) worker?.postMessage({ forget: id });
  sent.clear();
  setUi({ tuning: {} });
}
