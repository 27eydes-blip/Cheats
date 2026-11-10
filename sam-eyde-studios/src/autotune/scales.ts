import type { ScaleId } from "../types";

export const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALES: Record<ScaleId, { name: string; steps: number[] }> = {
  major: { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  minorPent: { name: "Minor Pentatonic", steps: [0, 3, 5, 7, 10] },
  majorPent: { name: "Major Pentatonic", steps: [0, 2, 4, 7, 9] },
  harmonicMinor: { name: "Harmonic Minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  chromatic: { name: "Chromatic", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const SCALE_ORDER: ScaleId[] = [
  "major",
  "minor",
  "minorPent",
  "majorPent",
  "harmonicMinor",
  "chromatic",
];

/** 12 booleans: which pitch classes belong to the key + scale. */
export function scaleMask(key: number, scale: ScaleId): boolean[] {
  const mask = new Array<boolean>(12).fill(false);
  for (const step of SCALES[scale].steps) mask[(key + step) % 12] = true;
  return mask;
}

/** Nearest MIDI note (integer) that is in the scale. Ties resolve downward. */
export function nearestScaleNote(midi: number, mask: boolean[]): number {
  const base = Math.round(midi);
  for (let d = 0; d <= 6; d++) {
    const lo = base - d;
    const hi = base + d;
    const loOk = mask[((lo % 12) + 12) % 12];
    const hiOk = mask[((hi % 12) + 12) % 12];
    if (loOk && hiOk) return Math.abs(midi - lo) <= Math.abs(midi - hi) ? lo : hi;
    if (loOk) return lo;
    if (hiOk) return hi;
  }
  return base;
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
