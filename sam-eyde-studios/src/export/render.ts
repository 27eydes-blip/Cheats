import { engine } from "../audio/engine";
import { createMaster, createTrackStrip, startVoice } from "../audio/graph";
import { autotuneIdle } from "../autotune/manager";
import { clipEnd, projectDuration } from "../studio/timeline";
import type { Project } from "../types";

/** Extra seconds rendered after the last clip so reverb and delay tails ring out. */
export const TAIL_SECONDS = 3;

/**
 * Renders the mix offline through exactly the same graph that live playback
 * uses (track strips, effect chains, master bus).
 * Pass `trackId` to render one track by itself.
 */
export async function renderMix(project: Project, trackId?: string): Promise<AudioBuffer> {
  await autotuneIdle();
  let mix = project;
  if (trackId) {
    const only = project.tracks.find((t) => t.id === trackId);
    if (!only) throw new Error("Track not found");
    // On its own, a track is heard even if it was muted in the mix.
    mix = { ...project, tracks: [{ ...only, muted: false, solo: false }] };
  }
  const sampleRate = engine.ctx?.sampleRate ?? 44100;
  const content = trackId ? Math.max(0, clipEnd(mix.tracks[0], mix)) : projectDuration(mix);
  if (content <= 0) throw new Error("Nothing to export yet");
  const length = Math.ceil((content + TAIL_SECONDS) * sampleRate);
  const Offline =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const ctx = new Offline(2, length, sampleRate);
  const master = createMaster(ctx);
  for (const track of mix.tracks) {
    const buffer = engine.bufferFor(track);
    if (!buffer) continue;
    const strip = createTrackStrip(ctx, master.input, track, mix);
    startVoice(ctx, strip, buffer, track, mix, 0, 0);
  }
  return ctx.startRendering();
}
