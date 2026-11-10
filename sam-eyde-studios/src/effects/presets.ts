import type { PresetId } from "../types";

export interface PresetDef {
  id: PresetId;
  name: string;
  blurb: string;
  /** Defaults applied to the track when the preset is chosen. */
  autotune: boolean;
  retune: number;
  /** High-pass cutoff (Hz) — clears rumble and mic handling noise. */
  hpHz: number;
  /** Presence boost around 3.5 kHz (dB). */
  presenceDb: number;
  /** Air high-shelf around 9 kHz (dB). */
  airDb: number;
  reverb: { seconds: number; predelayMs: number; toneHz: number; mix: number } | null;
  /** Delay time is either tempo-synced (`beats`) or fixed (`seconds`). */
  delay: { beats?: number; seconds?: number; feedback: number; mix: number; toneHz: number } | null;
  doubler: { mix: number; depthMs: number } | null;
}

export const PRESETS: Record<PresetId, PresetDef> = {
  melodicTrap: {
    id: "melodicTrap",
    name: "Melodic Trap",
    blurb: "Hard tune, big dark reverb, dotted-8th delay, wide doubles",
    autotune: true,
    retune: 1,
    hpHz: 110,
    presenceDb: 3,
    airDb: 4,
    reverb: { seconds: 3.4, predelayMs: 35, toneHz: 3200, mix: 0.34 },
    delay: { beats: 0.75, feedback: 0.4, mix: 0.24, toneHz: 2600 },
    doubler: { mix: 0.5, depthMs: 2.6 },
  },
  rnbSmooth: {
    id: "rnbSmooth",
    name: "R&B Smooth",
    blurb: "Medium tune, lush reverb, 8th-note delay",
    autotune: true,
    retune: 0.6,
    hpHz: 90,
    presenceDb: 2,
    airDb: 3,
    reverb: { seconds: 2.5, predelayMs: 25, toneHz: 7500, mix: 0.3 },
    delay: { beats: 0.5, feedback: 0.3, mix: 0.16, toneHz: 4200 },
    doubler: { mix: 0.14, depthMs: 1.8 },
  },
  country: {
    id: "country",
    name: "Country",
    blurb: "Light, natural tune, short slapback delay, small room",
    autotune: true,
    retune: 0.2,
    hpHz: 80,
    presenceDb: 2,
    airDb: 1.5,
    reverb: { seconds: 0.7, predelayMs: 8, toneHz: 8000, mix: 0.14 },
    delay: { seconds: 0.115, feedback: 0.06, mix: 0.22, toneHz: 5500 },
    doubler: null,
  },
  popPolish: {
    id: "popPolish",
    name: "Pop Polish",
    blurb: "Medium tune, bright, moderate reverb",
    autotune: true,
    retune: 0.6,
    hpHz: 100,
    presenceDb: 3.5,
    airDb: 5.5,
    reverb: { seconds: 1.6, predelayMs: 20, toneHz: 11000, mix: 0.2 },
    delay: { beats: 0.5, feedback: 0.18, mix: 0.07, toneHz: 6000 },
    doubler: { mix: 0.18, depthMs: 1.6 },
  },
  clean: {
    id: "clean",
    name: "Clean",
    blurb: "No tune, no effects",
    autotune: false,
    retune: 0.6,
    hpHz: 20,
    presenceDb: 0,
    airDb: 0,
    reverb: null,
    delay: null,
    doubler: null,
  },
};

export const PRESET_ORDER: PresetId[] = ["melodicTrap", "rnbSmooth", "country", "popPolish", "clean"];

/** Delay time in seconds for a preset at a tempo. */
export function delaySeconds(preset: PresetDef, bpm: number): number {
  const d = preset.delay;
  if (!d) return 0.25;
  const s = d.seconds ?? ((d.beats ?? 0.5) * 60) / bpm;
  return Math.min(1.9, Math.max(0.02, s));
}
