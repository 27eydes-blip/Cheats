export type ScaleId =
  | "major"
  | "minor"
  | "minorPent"
  | "majorPent"
  | "harmonicMinor"
  | "chromatic";

export type PresetId =
  | "cactusWave"
  | "melodicTrap" | "rnbSmooth" | "country" | "popPolish" | "clean";

export type TrackKind = "beat" | "vocal";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  /** Key of the decoded audio in the audio library. */
  audioId: string;
  /** Timeline position (seconds) where the (trimmed) clip starts. */
  startSec: number;
  /** Seconds hidden from the start / end of the source audio. */
  trimStart: number;
  trimEnd: number;
  /** Full length of the source audio in seconds. */
  duration: number;
  volume: number;
  muted: boolean;
  solo: boolean;
  /** Recorded takes are shifted earlier by the project's latency compensation. */
  latencyComp: boolean;
  autotune: boolean;
  /** 0 = Natural (slow), 1 = Hard (instant). */
  retune: number;
  preset: PresetId;
  /** 0..2 (0–200 %). */
  fxAmount: number;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  /** 0 = C … 11 = B */
  key: number;
  scale: ScaleId;
  latencyMs: number;
  metronome: boolean;
  countIn: boolean;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}
