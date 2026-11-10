import type { ScaleId } from "../types";
import type { PitchTrack } from "./pitch";
import { hzToMidi, nearestScaleNote, scaleMask } from "./scales";

/** How far past the midpoint the voice must go before the target note changes. */
const HYSTERESIS_SEMITONES = 0.2;
/** A silence longer than this starts a fresh phrase. */
const PHRASE_GAP_SEC = 0.15;

/** Retune slider (0 = Natural … 1 = Hard) → glide time constant in seconds. */
export function retuneTimeConstant(retune: number): number {
  const r = Math.min(1, Math.max(0, retune));
  return 0.35 * (1 - r) ** 2;
}

/**
 * For every pitch frame, how many semitones to shift the voice.
 * Each frame snaps to the nearest note in key (with hysteresis so it doesn't
 * flicker between neighbours); the correction then glides at the retune speed.
 * Slow speeds leave vibrato alone, instant speed gives the hard-tune sound.
 */
export function correctionSemitones(
  pitch: PitchTrack,
  key: number,
  scale: ScaleId,
  retune: number,
): Float32Array {
  const { f0, hop } = pitch;
  const out = new Float32Array(f0.length);
  const mask = scaleMask(key, scale);
  const tau = retuneTimeConstant(retune);
  const alpha = tau <= 1e-4 ? 1 : 1 - Math.exp(-hop / tau);
  const gapFrames = Math.round(PHRASE_GAP_SEC / hop);

  let note: number | null = null;
  let corr = 0;
  let silent = gapFrames + 1;
  for (let i = 0; i < f0.length; i++) {
    if (f0[i] <= 0) {
      silent++;
      continue;
    }
    if (silent > gapFrames) {
      note = null;
      corr = 0;
    }
    silent = 0;
    const midi = hzToMidi(f0[i]);
    const candidate = nearestScaleNote(midi, mask);
    if (
      note === null ||
      (candidate !== note &&
        Math.abs(midi - note) - Math.abs(midi - candidate) > 2 * HYSTERESIS_SEMITONES)
    ) {
      note = candidate;
    }
    const wanted = note - midi;
    corr += alpha * (wanted - corr);
    out[i] = corr;
  }
  return out;
}
