import { decodeAudio, toMono } from "../audio/decode";
import { engine } from "../audio/engine";
import { computePeaks, type Peaks } from "../audio/peaks";
import { MicRecorder } from "../audio/recorder";
import { syncAutotune } from "../autotune/manager";
import { addTrack, getState, removeTrack, setUi, subscribe, toast } from "../state/store";
import type { Project, Track, TrackKind } from "../types";
import { stripExtension, uid } from "../util";
import { computeView, projectDuration } from "./timeline";

/** Waveform data by audioId (kept out of React state — it is large). */
export const peaks = new Map<string, Peaks>();

const mic = new MicRecorder();
let take: { pos: number; playStart: number; recStart: number } | null = null;
let countInTimer: ReturnType<typeof setTimeout> | undefined;
let busy = false;

// Keep the audio graph in sync with every project change.
let lastProject: Project | null = null;
subscribe(() => {
  const p = getState().project;
  if (p !== lastProject) {
    lastProject = p;
    engine.sync(p);
    syncAutotune();
  }
});

/** Must run inside a tap handler: iOS only lets audio start from a user gesture. */
export function startAudio(): AudioContext {
  const ctx = engine.ensure();
  if (!getState().ui.audioStarted) setUi({ audioStarted: true });
  return ctx;
}

export function registerAudio(audioId: string, buffer: AudioBuffer): void {
  engine.buffers.set(audioId, buffer);
  peaks.set(audioId, computePeaks(buffer));
  setUi({ audioReady: { ...getState().ui.audioReady, [audioId]: true } });
  engine.sync(getState().project);
  syncAutotune();
}

export function makeTrack(kind: TrackKind, name: string, audioId: string, duration: number): Track {
  return {
    id: uid(),
    kind,
    name,
    audioId,
    startSec: 0,
    trimStart: 0,
    trimEnd: 0,
    duration,
    volume: kind === "beat" ? 0.8 : 1,
    muted: false,
    solo: false,
    latencyComp: false,
    autotune: false,
    retune: 0.6,
    preset: "clean",
    fxAmount: 1,
  };
}

export async function importFile(file: File, kind: TrackKind): Promise<void> {
  const ctx = startAudio();
  setUi({ loading: true });
  try {
    const data = await file.arrayBuffer();
    const buffer = await decodeAudio(ctx, data);
    const audioId = uid();
    registerAudio(audioId, buffer);
    const fallback = kind === "beat" ? "Beat" : "Vocal";
    addTrack(makeTrack(kind, stripExtension(file.name) || fallback, audioId, buffer.duration));
  } catch (err) {
    console.error(err);
    toast("Couldn't open that file. Try an MP3, WAV or M4A.");
  } finally {
    setUi({ loading: false });
  }
}

export function deleteTrack(id: string): void {
  removeTrack(id);
}

export function position(): number {
  return engine.position();
}

export function togglePlay(): void {
  startAudio();
  const { ui, project } = getState();
  if (ui.recording) {
    void stopRecording();
    return;
  }
  if (engine.playing) {
    engine.pause();
    setUi({ playing: false });
    return;
  }
  const dur = projectDuration(project);
  const from = dur > 0 && engine.position() >= dur - 0.02 ? 0 : engine.position();
  engine.play(from);
  setUi({ playing: true });
}

export function toStart(): void {
  if (getState().ui.recording) return;
  engine.seek(0);
  setUi({ scrollSec: 0 });
}

export function seek(pos: number): void {
  if (getState().ui.recording) return;
  engine.seek(pos);
}

export function micLevel(): number {
  return mic.level();
}

export function toggleRecord(): void {
  if (busy) return;
  if (getState().ui.recording) void stopRecording();
  else void startRecording();
}

async function startRecording(): Promise<void> {
  const project = getState().project;
  if (!project) return;
  const ctx = startAudio();
  busy = true;
  try {
    if (engine.playing) {
      engine.pause();
      setUi({ playing: false });
    }
    engine.setSession("play-and-record");
    await mic.open(ctx);
    if (ctx.state !== "running") await ctx.resume();
    const pos = engine.position();
    await mic.start();
    const recStart = ctx.currentTime;
    const beats = project.countIn ? 4 : 0;
    const t0 = ctx.currentTime + 0.12;
    if (beats) engine.countIn(t0, beats, project.bpm);
    const playStart = engine.play(pos, t0 + (beats * 60) / project.bpm);
    take = { pos, playStart, recStart };
    setUi({ recording: true, playing: true, countingIn: beats > 0 });
    clearTimeout(countInTimer);
    if (beats) {
      countInTimer = setTimeout(
        () => setUi({ countingIn: false }),
        (playStart - ctx.currentTime) * 1000,
      );
    }
  } catch (err) {
    console.error(err);
    mic.close();
    engine.setSession("playback");
    const denied = err instanceof DOMException && err.name === "NotAllowedError";
    toast(
      denied
        ? "Microphone access was blocked. Allow it in Settings to record."
        : err instanceof Error
          ? err.message
          : "Couldn't start recording.",
      5000,
    );
  } finally {
    busy = false;
  }
}

async function stopRecording(): Promise<void> {
  const ctx = engine.ctx;
  const info = take;
  if (!ctx || !info) return;
  busy = true;
  take = null;
  clearTimeout(countInTimer);
  const stopTime = ctx.currentTime;
  engine.pause();
  setUi({ recording: false, playing: false, countingIn: false, loading: true });
  try {
    const blob = await mic.stop();
    mic.close();
    engine.setSession("playback");
    if (stopTime < info.playStart + 0.2) {
      engine.seek(info.pos);
      toast("Recording cancelled");
      return;
    }
    const decoded = await decodeAudio(ctx, await blob.arrayBuffer());
    // The recorder started before playback (count-in) — drop that lead-in.
    const mono = toMono(ctx, decoded, info.playStart - info.recStart);
    const audioId = uid();
    registerAudio(audioId, mono);
    const project = getState().project;
    const n = (project?.tracks.filter((t) => t.latencyComp).length ?? 0) + 1;
    const track = makeTrack("vocal", `Take ${n}`, audioId, mono.duration);
    track.startSec = info.pos;
    track.latencyComp = true;
    // A new take starts with the same sound as your last vocal.
    const prev = project?.tracks.filter((t) => t.kind === "vocal").at(-1);
    if (prev) {
      track.preset = prev.preset;
      track.autotune = prev.autotune;
      track.retune = prev.retune;
      track.fxAmount = prev.fxAmount;
    }
    addTrack(track);
    await onTakeRecorded(track, mono);
  } catch (err) {
    console.error(err);
    toast("That take couldn't be saved. Please try again.", 5000);
  } finally {
    setUi({ loading: false });
    busy = false;
  }
}

/** Hook for persistence (set by the storage layer). */
let takeListener: (track: Track, buffer: AudioBuffer) => Promise<void> | void = () => {};
export function setTakeListener(fn: typeof takeListener): void {
  takeListener = fn;
}
async function onTakeRecorded(track: Track, buffer: AudioBuffer): Promise<void> {
  await takeListener(track, buffer);
}

/**
 * Called once per animation frame by the UI. Handles auto-stop at the end of the
 * song and keeps the playhead on screen. Returns the current position.
 */
export function tick(): number {
  const pos = engine.position();
  const { ui, project } = getState();
  if (!engine.playing) return pos;
  const dur = projectDuration(project);
  if (!ui.recording && dur > 0 && pos >= dur) {
    engine.pause();
    setUi({ playing: false });
    return engine.position();
  }
  if (ui.recording && pos + 4 > Math.max(dur * 1.04, ui.minViewSec, 20)) {
    setUi({ minViewSec: pos + 20 });
  }
  if (ui.zoom > 1) {
    const view = computeView(dur, ui.minViewSec, ui.laneWidth, ui.zoom, ui.scrollSec);
    if (pos > view.scroll + view.span * 0.92 || pos < view.scroll) {
      setUi({ scrollSec: Math.max(0, pos - view.span * 0.1) });
    }
  }
  return pos;
}
