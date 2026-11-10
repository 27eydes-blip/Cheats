import type { ScaleId } from "../types";
import { correctionSemitones } from "./correct";
import { detectPitch, type PitchTrack } from "./pitch";
import { psola } from "./psola";

export interface TuneSettings {
  key: number;
  scale: ScaleId;
  /** 0 = Natural … 1 = Hard */
  retune: number;
}

/** The slow part (pitch detection) — done once per recording and reused. */
export function analyze(samples: Float32Array, sampleRate: number): PitchTrack {
  return detectPitch(samples, sampleRate);
}

/** The fast part — re-run whenever key, scale or retune speed change. */
export function tune(
  samples: Float32Array,
  sampleRate: number,
  pitch: PitchTrack,
  settings: TuneSettings,
): Float32Array {
  const shift = correctionSemitones(pitch, settings.key, settings.scale, settings.retune);
  return psola(samples, sampleRate, pitch, shift);
}

export function tuneKey(audioId: string, s: TuneSettings): string {
  return `${audioId}|${s.key}|${s.scale}|${s.retune.toFixed(2)}`;
}
