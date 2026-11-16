/** Versioned localStorage save. Every read/write is guarded (private mode, quota, disabled storage). */
import type { ModelId } from '../art/cars';
import type { UpgradeKind } from '../data/cars';
import type { GhostLap } from '../game/race';
import type { FilmLevel } from '../render/film';

export interface Settings {
  master: number; sfx: number; music: number;
  film: FilmLevel;
  tilt: boolean;
  haptics: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  showHelp: boolean;
  /** Set once the film default moved to Light (polish pass). */
  filmV2?: boolean;
}

export interface CupProgress { results: number[]; points: number; done: boolean; best: number }

export interface SaveData {
  v: 1;
  coins: number;
  owned: ModelId[];
  car: ModelId;
  paints: Partial<Record<ModelId, string>>;
  paintsOwned: string[];
  upgrades: Partial<Record<ModelId, Partial<Record<UpgradeKind, number>>>>;
  cups: Record<string, CupProgress>;
  ghosts: Record<string, GhostLap>;
  bestLaps: Record<string, number>;
  raced: string[];
  settings: Settings;
  stats: { races: number; wins: number; drifts: number; horns: number };
  seenIntro: boolean;
}

const KEY = 'motorcity1915.save';

export const defaults = (): SaveData => ({
  v: 1, coins: 250, owned: ['runabout'], car: 'runabout', paints: { runabout: 'carmine' }, paintsOwned: ['carmine'],
  upgrades: {}, cups: {}, ghosts: {}, bestLaps: {}, raced: [],
  settings: { master: 0.9, sfx: 0.9, music: 0.6, film: 1, tilt: false, haptics: true, difficulty: 'normal', showHelp: true, filmV2: true },
  stats: { races: 0, wins: 0, drifts: 0, horns: 0 },
  seenIntro: false,
});

export function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return d;
    const out: SaveData = { ...d, ...s, settings: { ...d.settings, ...(s.settings ?? {}) }, stats: { ...d.stats, ...(s.stats ?? {}) } };
    if (!s.settings?.filmV2) { if (out.settings.film === 2) out.settings.film = 1; out.settings.filmV2 = true; }
    return out;
  } catch { return d; }
}

export function store(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or unavailable: keep playing */ }
}

export function reset(): SaveData { try { localStorage.removeItem(KEY); } catch { /* ignore */ } return defaults(); }
