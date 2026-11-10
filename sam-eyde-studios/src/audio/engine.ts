import { clipStart, projectDuration } from "../studio/timeline";
import type { Project, Track } from "../types";
import {
  createMaster,
  createTrackStrip,
  type MasterBus,
  startVoice,
  stopVoice,
  type TrackStrip,
  type Voice,
} from "./graph";
import { Metronome } from "./metronome";

interface TrackNodes {
  strip: TrackStrip;
  voice: Voice | null;
  /** What the current voice was started with — used to detect when it must restart. */
  playing: { buffer: AudioBuffer; start: number; trimStart: number; trimEnd: number } | null;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/**
 * Live playback engine: owns the AudioContext, the per-track strips,
 * the transport clock and the metronome scheduler.
 */
export class Engine {
  ctx: AudioContext | null = null;
  /** Decoded source audio, by audioId. */
  readonly buffers = new Map<string, AudioBuffer>();
  /** Autotuned replacement audio, by track id. */
  private tuned = new Map<string, AudioBuffer>();
  private master: MasterBus | null = null;
  private metronome: Metronome | null = null;
  private nodes = new Map<string, TrackNodes>();
  private project: Project | null = null;

  playing = false;
  private startCtxTime = 0;
  private startPos = 0;
  private pausedPos = 0;
  private nextBeat = 0;
  private beatBpm = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Creates / resumes the AudioContext. Must be called from a user tap (iOS). */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.master = createMaster(this.ctx);
      this.metronome = new Metronome(this.ctx);
      this.setSession("playback");
      if (this.project) this.sync(this.project);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
    return this.ctx;
  }

  /** iOS 17+: "playback" ignores the silent switch; "play-and-record" enables the mic. */
  setSession(type: "playback" | "play-and-record"): void {
    try {
      const session = (navigator as AudioSessionNavigator).audioSession;
      if (session) session.type = type;
    } catch {
      /* not supported */
    }
  }

  position(): number {
    if (!this.playing || !this.ctx) return this.pausedPos;
    return this.startPos + Math.max(0, this.ctx.currentTime - this.startCtxTime);
  }

  duration(): number {
    return projectDuration(this.project);
  }

  /** The audio a track should play right now (tuned if available). */
  bufferFor(track: Track): AudioBuffer | undefined {
    if (track.kind === "vocal" && track.autotune) {
      const t = this.tuned.get(track.id);
      if (t) return t;
    }
    return this.buffers.get(track.audioId);
  }

  setTuned(trackId: string, buffer: AudioBuffer | null): void {
    if (buffer) this.tuned.set(trackId, buffer);
    else this.tuned.delete(trackId);
    if (this.project) this.sync(this.project);
  }

  /** Bring the audio graph in line with the project. Safe to call on every change. */
  sync(project: Project | null): void {
    this.project = project;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const tracks = project?.tracks ?? [];
    const alive = new Set(tracks.map((t) => t.id));

    for (const [id, n] of this.nodes) {
      if (alive.has(id)) continue;
      if (n.voice) stopVoice(ctx, n.voice);
      const strip = n.strip;
      setTimeout(() => strip.dispose(), 200);
      this.nodes.delete(id);
      this.tuned.delete(id);
    }
    if (!project) return;

    for (const track of tracks) {
      let n = this.nodes.get(track.id);
      if (!n) {
        n = {
          strip: createTrackStrip(ctx, this.master.input, track, project),
          voice: null,
          playing: null,
        };
        this.nodes.set(track.id, n);
      } else {
        n.strip.update(track, project);
      }
      if (this.playing) this.refreshVoice(track, n, project);
    }

    if (this.playing && this.beatBpm !== project.bpm) this.resetBeat();
  }

  /** Restart one track's audio mid-playback if its audio or placement changed. */
  private refreshVoice(track: Track, n: TrackNodes, project: Project): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const buffer = this.bufferFor(track);
    const start = clipStart(track, project);
    const p = n.playing;
    if (
      p &&
      p.buffer === buffer &&
      Math.abs(p.start - start) < 1e-6 &&
      p.trimStart === track.trimStart &&
      p.trimEnd === track.trimEnd
    ) {
      return;
    }
    if (n.voice) stopVoice(ctx, n.voice);
    n.voice = null;
    n.playing = null;
    if (!buffer) return;
    const when = Math.max(ctx.currentTime + 0.02, this.startCtxTime);
    const pos = this.startPos + (when - this.startCtxTime);
    n.voice = startVoice(ctx, n.strip, buffer, track, project, when, pos, 0.02);
    n.playing = { buffer, start, trimStart: track.trimStart, trimEnd: track.trimEnd };
  }

  /**
   * Start playback from `from`. `when` (context time) lets recording
   * line playback up after a count-in. Returns the context start time.
   */
  play(from?: number, when?: number): number {
    const ctx = this.ensure();
    const project = this.project;
    if (this.playing) this.pause();
    const pos = Math.max(0, from ?? this.pausedPos);
    const t0 = Math.max(when ?? 0, ctx.currentTime + 0.06);
    this.startPos = pos;
    this.startCtxTime = t0;
    this.playing = true;
    if (project) {
      for (const track of project.tracks) {
        const n = this.nodes.get(track.id);
        const buffer = this.bufferFor(track);
        if (!n || !buffer) continue;
        n.voice = startVoice(ctx, n.strip, buffer, track, project, t0, pos);
        n.playing = {
          buffer,
          start: clipStart(track, project),
          trimStart: track.trimStart,
          trimEnd: track.trimEnd,
        };
      }
    }
    this.resetBeat();
    this.timer = setInterval(() => this.scheduleBeats(), 25);
    this.scheduleBeats();
    return t0;
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedPos = this.position();
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    for (const n of this.nodes.values()) {
      if (n.voice && ctx) stopVoice(ctx, n.voice);
      n.voice = null;
      n.playing = null;
    }
  }

  seek(pos: number): void {
    const p = Math.max(0, pos);
    if (this.playing) this.play(p);
    else this.pausedPos = p;
  }

  /** Schedule `beats` count-in clicks starting at context time `when`. */
  countIn(when: number, beats: number, bpm: number): void {
    const spb = 60 / bpm;
    for (let i = 0; i < beats; i++) this.metronome?.click(when + i * spb, i === 0);
  }

  private resetBeat(): void {
    const bpm = this.project?.bpm ?? 120;
    this.beatBpm = bpm;
    const now = this.ctx ? this.ctx.currentTime : 0;
    const pos = this.startPos + Math.max(0, now - this.startCtxTime);
    this.nextBeat = Math.ceil((pos * bpm) / 60 - 1e-4);
  }

  private scheduleBeats(): void {
    const ctx = this.ctx;
    const project = this.project;
    if (!ctx || !project || !this.playing) return;
    const spb = 60 / project.bpm;
    const horizon = ctx.currentTime + 0.12;
    for (;;) {
      const t = this.startCtxTime + (this.nextBeat * spb - this.startPos);
      if (t > horizon) break;
      if (project.metronome && t >= ctx.currentTime - 0.01) {
        this.metronome?.click(t, this.nextBeat % 4 === 0);
      }
      this.nextBeat++;
    }
  }

  /** Forget everything about the current project (used when switching projects). */
  reset(): void {
    this.pause();
    this.pausedPos = 0;
    this.sync(null);
    this.buffers.clear();
    this.tuned.clear();
  }
}

export const engine = new Engine();
