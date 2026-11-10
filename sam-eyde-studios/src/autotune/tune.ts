import type { ScaleId } from "../types";
import { correctionSemitones, DEFAULT_HYSTERESIS } from "./correct";
import { detectPitch, type PitchTrack } from "./pitch";
import { psola } from "./psola";

export interface TuneSettings {
  key: number;
  scale: ScaleId;
  /** 0 = Natural … 1 = Hard */
  retune: number;
  /** Semitones of "stickiness" before the target note changes; 0 = snap the instant a boundary is crossed. */
  hysteresis?: number;
  /** Formant shift in semitones (+ = lighter / airier, − = bigger / darker). */
  formant?: number;
  /** Extra voices to generate, as semitone offsets from the tuned lead (e.g. [12] = octave up). */
  layers?: number[];
}

/** The slow part (pitch detection) — done once per recording and reused. */
export function analyze(samples: Float32Array, sampleRate: number): PitchTrack {
  return detectPitch(samples, sampleRate);
}

/**
 * The fast part — re-run whenever the settings change.
 * Returns the tuned lead first, followed by one channel per requested layer.
 */
export function tuneAll(
  samples: Float32Array,
  sampleRate: number,
  pitch: PitchTrack,
  settings: TuneSettings,
): Float32Array[] {
  const shift = correctionSemitones(
    pitch,
    settings.key,
    settings.scale,
    settings.retune,
    settings.hysteresis ?? DEFAULT_HYSTERESIS,
  );
  const formant = settings.formant ?? 0;
  const out = [psola(samples, sampleRate, pitch, shift, { formant })];
  for (const semis of settings.layers ?? []) {
    out.push(psola(samples, sampleRate, pitch, shift, { formant, extraSemitones: semis, voicedOnly: true }));
  }
  return out;
}

/** Just the tuned lead. */
export function tune(
  samples: Float32Array,
  sampleRate: number,
  pitch: PitchTrack,
  settings: TuneSettings,
): Float32Array {
  return tuneAll(samples, sampleRate, pitch, { ...settings, layers: [] })[0];
}

export function tuneKey(audioId: string, s: TuneSettings): string {
  return [
    audioId,
    s.key,
    s.scale,
    s.retune.toFixed(2),
    (s.hysteresis ?? DEFAULT_HYSTERESIS).toFixed(2),
    (s.formant ?? 0).toFixed(2),
    (s.layers ?? []).join(","),
  ].join("|");
}
