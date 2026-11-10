import { useSyncExternalStore } from "react";
import type { Project, Track } from "../types";
import { uid } from "../util";

export type Screen = "projects" | "studio";

export interface UiState {
  playing: boolean;
  recording: boolean;
  countingIn: boolean;
  /** Timeline zoom: 1 = whole song fits the screen. */
  zoom: number;
  /** Left edge of the visible timeline (seconds) when zoomed in. */
  scrollSec: number;
  /** Width in px of every waveform lane. */
  laneWidth: number;
  /** Minimum visible duration (grows while recording past the end). */
  minViewSec: number;
  /** Track ids currently being tuned in the worker. */
  tuning: Record<string, boolean>;
  /** Audio ids that have decoded audio + waveform ready. */
  audioReady: Record<string, boolean>;
  toast: string | null;
  audioStarted: boolean;
  loading: boolean;
}

export interface AppState {
  screen: Screen;
  project: Project | null;
  ui: UiState;
}

const LATENCY_KEY = "ses.latencyMs";

export function defaultLatency(): number {
  try {
    const v = Number(localStorage.getItem(LATENCY_KEY));
    if (Number.isFinite(v) && v > 0 && v <= 400) return v;
  } catch {
    /* storage unavailable */
  }
  return 120;
}

export function rememberLatency(ms: number): void {
  try {
    localStorage.setItem(LATENCY_KEY, String(ms));
  } catch {
    /* storage unavailable */
  }
}

export function newProject(name = "New Project"): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    bpm: 120,
    key: 0,
    scale: "minor",
    latencyMs: defaultLatency(),
    metronome: false,
    countIn: true,
    tracks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const initialUi: UiState = {
  playing: false,
  recording: false,
  countingIn: false,
  zoom: 1,
  scrollSec: 0,
  laneWidth: 320,
  minViewSec: 0,
  tuning: {},
  audioReady: {},
  toast: null,
  audioStarted: false,
  loading: false,
};

let state: AppState = { screen: "projects", project: null, ui: initialUi };
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(next: AppState): void {
  if (next === state) return;
  state = next;
  for (const l of [...listeners]) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function setUi(patch: Partial<UiState>): void {
  setState({ ...state, ui: { ...state.ui, ...patch } });
}

/** Apply a change to the open project (bumps updatedAt so autosave picks it up). */
export function updateProject(change: Partial<Project> | ((p: Project) => Partial<Project>)): void {
  const p = state.project;
  if (!p) return;
  const patch = typeof change === "function" ? change(p) : change;
  setState({ ...state, project: { ...p, ...patch, updatedAt: Date.now() } });
}

export function updateTrack(id: string, patch: Partial<Track>): void {
  updateProject((p) => ({ tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function addTrack(track: Track): void {
  updateProject((p) => ({ tracks: [...p.tracks, track] }));
}

export function removeTrack(id: string): void {
  updateProject((p) => ({ tracks: p.tracks.filter((t) => t.id !== id) }));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, ms = 3200): void {
  setUi({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: null }), ms);
}
