import type { Episode } from '../../script/types';
import type { Timeline } from './types';

export const SNAP_FREEZE = 0.22;
export const SENSES_SPEED = 0.38;

export type Clock = {
  /** Story time at each frame. */
  T: Float64Array;
  /** Story time at which each beat starts. */
  beatT: number[];
  /** Story times of every snap. */
  snapsT: number[];
  /** Real times of cues. */
  cues: { type: string; at: number }[];
};

/** Story time runs slower during hyper-senses and stops dead for a moment on every snap. */
export function buildClock(tl: Timeline, ep: Episode, fps: number): Clock {
  const n = Math.ceil(tl.duration * fps) + 2;
  const cues = tl.words.flatMap((w) => w.cues.map((type) => ({ type, at: w.start })));
  const snaps = cues.filter((c) => c.type === 'snap').map((c) => c.at);
  const speed = (r: number) => {
    for (const s of snaps) if (r >= s && r < s + SNAP_FREEZE) return 0;
    let v = 1;
    tl.beats.forEach((b, i) => {
      if (!ep.beats[i].senses) return;
      const k = Math.min(1, Math.max(0, (r - b.start) / 0.5), Math.max(0, (b.end - r) / 0.5));
      v = Math.min(v, 1 - (1 - SENSES_SPEED) * k);
    });
    return v;
  };
  const T = new Float64Array(n);
  for (let f = 1; f < n; f++) T[f] = T[f - 1] + speed((f - 0.5) / fps) / fps;
  const at = (r: number) => T[Math.max(0, Math.min(n - 1, Math.round(r * fps)))];
  return { T, beatT: tl.beats.map((b) => at(b.start)), snapsT: snaps.map(at), cues };
}

/** Trap-jaw mandibles: snapped shut at each snap, then slowly cocked open again. */
export const jawAt = (T: number, snapsT: number[]) => {
  let last = -1e9;
  for (const s of snapsT) if (s <= T + 1e-6) last = s;
  const d = T - last;
  if (d < 0.4) return 0;
  return Math.min(1, (d - 0.4) / 0.9);
};
