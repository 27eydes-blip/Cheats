import { clipLength, clipStart } from "../studio/timeline";
import type { Project, Track } from "../types";

/**
 * The mix graph, shared by live playback (AudioContext) and export
 * (OfflineAudioContext) so both always sound identical.
 */

/** Fader gain after mute / solo. */
export function audibleGain(track: Track, project: Project): number {
  const anySolo = project.tracks.some((t) => t.solo);
  if (track.muted) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

export interface TrackStrip {
  input: AudioNode;
  update(track: Track, project: Project, immediate?: boolean): void;
  dispose(): void;
}

export function createTrackStrip(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Track,
  project: Project,
): TrackStrip {
  const input = ctx.createGain();
  const fader = ctx.createGain();
  input.connect(fader).connect(dest);

  const strip: TrackStrip = {
    input,
    update(t, p, immediate = false) {
      const g = audibleGain(t, p);
      if (immediate) fader.gain.value = g;
      else fader.gain.setTargetAtTime(g, ctx.currentTime, 0.015);
    },
    dispose() {
      input.disconnect();
      fader.disconnect();
    },
  };
  strip.update(track, project, true);
  return strip;
}

export interface MasterBus {
  input: AudioNode;
}

export function createMaster(ctx: BaseAudioContext): MasterBus {
  const input = ctx.createGain();
  input.connect(ctx.destination);
  return { input };
}

export interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Starts a track's audio so that timeline position `pos` is heard at context time `when`.
 * Returns null when the clip is already over at `pos`.
 */
export function startVoice(
  ctx: BaseAudioContext,
  strip: TrackStrip,
  buffer: AudioBuffer,
  track: Track,
  project: Project,
  when: number,
  pos: number,
  fadeIn = 0,
): Voice | null {
  const start = clipStart(track, project);
  const length = Math.min(clipLength(track), buffer.duration - track.trimStart);
  if (length <= 0 || pos >= start + length) return null;
  const into = Math.max(0, pos - start);
  const delay = Math.max(0, start - pos);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0, when + delay);
    gain.gain.linearRampToValueAtTime(1, when + delay + fadeIn);
  }
  src.connect(gain).connect(strip.input);
  src.start(when + delay, track.trimStart + into, length - into);
  return { src, gain };
}

export function stopVoice(ctx: BaseAudioContext, voice: Voice): void {
  const now = ctx.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.006);
    voice.src.stop(now + 0.04);
  } catch {
    /* already stopped */
  }
  voice.src.onended = () => {
    voice.src.disconnect();
    voice.gain.disconnect();
  };
}
