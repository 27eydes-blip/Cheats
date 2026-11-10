import type { Project, Track } from "../types";

/** Timeline second where the clip actually starts (after latency compensation). */
export function clipStart(track: Track, project: Project): number {
  return track.startSec - (track.latencyComp ? project.latencyMs / 1000 : 0);
}

export function clipLength(track: Track): number {
  return Math.max(0, track.duration - track.trimStart - track.trimEnd);
}

export function clipEnd(track: Track, project: Project): number {
  return clipStart(track, project) + clipLength(track);
}

export function projectDuration(project: Project | null): number {
  if (!project) return 0;
  let end = 0;
  for (const t of project.tracks) end = Math.max(end, clipEnd(t, project));
  return end;
}

export interface View {
  /** pixels per second */
  pps: number;
  /** left edge in seconds */
  scroll: number;
  /** seconds visible */
  span: number;
}

export function computeView(
  duration: number,
  minViewSec: number,
  laneWidth: number,
  zoom: number,
  scrollSec: number,
): View {
  const fit = Math.max(duration * 1.04, minViewSec, 20);
  const span = fit / Math.max(1, zoom);
  const pps = laneWidth / span;
  const scroll = zoom <= 1 ? 0 : Math.min(Math.max(0, scrollSec), Math.max(0, fit - span));
  return { pps, scroll, span };
}
