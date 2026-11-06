// Haptics: every buzz in the game goes through here, so each moment has its own feel and
// they never pile up into a constant hum.
//
//  - Installed iOS / Android app: the native Capacitor Haptics plugin (@capacitor/haptics).
//  - Browsers with the Vibration API (Android Chrome): a short vibrate() pattern instead.
//  - iPhone Safari / home-screen web apps (no Vibration API) and desktops: nothing, silently.
//
// Setting: Save.data.settings.haptics = "off" | "light" | "full" (default "full"; the old
// boolean `false` still means off). Light skips the frequent ticks (flap, coins) and softens
// the rest. No call here ever throws or blocks: native calls are fire-and-forget promises and
// multi-step patterns are spaced with timers.
import { Save } from "../data/save.js";
import { TEST } from "./testFlags.js";

export const HAPTIC_LEVELS = ["off", "light", "full"];

/** The current level: "off", "light" or "full". */
export function hapticLevel() {
  const v = Save.data?.settings?.haptics;
  if (v === false) return "off";
  return HAPTIC_LEVELS.includes(v) ? v : "full";
}

// One step: [delay ms, "impact", "LIGHT"|"MEDIUM"|"HEAVY"] | [ms, "notify", "SUCCESS"] |
// [ms, "tick"] (the softest iOS selection tick). `web` is the vibrate() pattern.
// prio: a pattern drops anything of lower priority while it plays; a higher one interrupts it.
// gap: the same pattern can't fire again within this many ms (too fast to feel separate).
// light: false = skipped on the Light setting; an array = the steps used on Light instead.
const P = {
  flap: { prio: 0, gap: 70, steps: [[0, "impact", "LIGHT"]], web: [6], light: false },
  soft: { prio: 1, gap: 80, steps: [[0, "tick"]], web: [5], light: false },
  coin: { prio: 1, gap: 110, steps: [[0, "tick"]], web: [4], light: false },
  near: { prio: 2, gap: 120, steps: [[0, "impact", "MEDIUM"]], web: [12], light: [[0, "impact", "LIGHT"]] },
  strong: { prio: 3, gap: 120, steps: [[0, "impact", "HEAVY"]], web: [28], light: [[0, "impact", "MEDIUM"]] },
  star: {
    prio: 3,
    gap: 200,
    steps: [
      [0, "impact", "MEDIUM"],
      [110, "impact", "MEDIUM"],
    ],
    web: [14, 90, 14],
    light: [
      [0, "impact", "LIGHT"],
      [110, "impact", "LIGHT"],
    ],
  },
  success: {
    prio: 4,
    gap: 600,
    steps: [
      [0, "notify", "SUCCESS"],
      [320, "impact", "MEDIUM"],
      [420, "impact", "HEAVY"],
    ],
    web: [20, 60, 20, 220, 18, 80, 36],
    light: [[0, "notify", "SUCCESS"]],
  },
  purchase: {
    prio: 4,
    gap: 600,
    steps: [[0, "notify", "SUCCESS"]],
    web: [20, 60, 30],
  },
  realm: { prio: 4, gap: 1500, steps: [[0, "impact", "MEDIUM"]], web: [18] }, // see realm()
  abyss: { prio: 5, gap: 800, steps: [[0, "impact", "HEAVY"]], web: [60], light: [[0, "impact", "MEDIUM"]] },
  crash: {
    prio: 6,
    gap: 400,
    steps: [
      [0, "impact", "HEAVY"],
      [70, "impact", "MEDIUM"],
    ],
    web: [55],
    light: [[0, "impact", "MEDIUM"]],
  },
};

const lastAt = {};
let busyUntil = 0;
let busyPrio = -1;
let timers = [];
let selecting = false;
const log = TEST.on ? [] : null; // test builds: what played, for the automated tests

function native() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (!cap?.isNativePlatform?.()) return null;
    return cap.Plugins?.Haptics || null;
  } catch {
    return null;
  }
}

// a native plugin call: fire and forget, never an unhandled rejection
function call(h, method, arg) {
  try {
    const r = h[method]?.(arg);
    r?.catch?.(() => {});
  } catch {}
}

function step(h, [, kind, arg]) {
  if (kind === "impact") call(h, "impact", { style: arg });
  else if (kind === "notify") call(h, "notification", { type: arg });
  else if (kind === "tick") {
    // iOS only ticks a selection after selectionStart; start it once and keep it open
    if (!selecting) {
      selecting = true;
      call(h, "selectionStart");
    }
    call(h, "selectionChanged");
  }
}

function webVibrate(pattern) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    // browsers refuse (and log a warning) before the first tap on the page
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {}
}

function stopPending() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function play(id, opts = {}) {
  try {
    const level = hapticLevel();
    if (level === "off") return;
    const p = P[id];
    let steps = opts.steps || p.steps;
    if (level === "light") {
      if (p.light === false) return;
      steps = opts.light || p.light || steps;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - (lastAt[id] ?? -1e9) < p.gap) return;
    if (now < busyUntil && p.prio < busyPrio) return; // a bigger moment is still playing
    lastAt[id] = now;
    if (p.prio >= busyPrio || now >= busyUntil) stopPending();
    const len = steps[steps.length - 1][0] + 60;
    busyUntil = now + len;
    busyPrio = p.prio;
    log?.push(id);
    if (log && log.length > 200) log.splice(0, 100);
    const h = native();
    if (!h) {
      webVibrate(level === "light" ? (opts.web || p.web).slice(0, 1) : opts.web || p.web);
      return;
    }
    for (const s of steps) {
      if (s[0] <= 0) step(h, s);
      else timers.push(setTimeout(() => step(h, s), s[0]));
    }
  } catch {}
}

/** Realm change: a rising light-medium-heavy triple on the eighth notes after the drop. */
function realm(bpm) {
  const beat = 60000 / (bpm > 0 ? bpm : 124);
  const s = Math.round(Math.min(260, Math.max(120, beat / 2)));
  play("realm", {
    steps: [
      [0, "impact", "LIGHT"],
      [s, "impact", "MEDIUM"],
      [2 * s, "impact", "HEAVY"],
    ],
    light: [
      [0, "impact", "LIGHT"],
      [s, "impact", "LIGHT"],
      [2 * s, "impact", "MEDIUM"],
    ],
    web: [10, s - 10, 18, s - 18, 30],
  });
}

export const Haptics = {
  /** the lightest tick: every flap (and button presses) */
  tap: () => play("flap"),
  flap: () => play("flap"),
  /** a soft tick: combo steps, perfect passes, small rewards */
  light: () => play("soft"),
  /** a single heavy impact: milestones, boosts, chests, rifts */
  strong: () => play("strong"),
  /** brushed past an obstacle */
  nearMiss: () => play("near"),
  /** a coin (skipped when coins come too fast to feel separate) */
  coin: () => play("coin"),
  /** a level's hidden star coin */
  starCoin: () => play("star"),
  /** "ENTERING …": on the realm's first beat; pass the music's BPM */
  realm,
  /** the Abyss slam */
  abyss: () => play("abyss"),
  /** the run ends */
  crash: () => play("crash"),
  /** celebration: NEW BEST, LEVEL COMPLETE */
  newBest: () => play("success"),
  levelComplete: () => play("success"),
  /** bought or unlocked something */
  purchase: () => play("purchase"),
  unlock: () => play("purchase"),
  /** drop anything still queued (e.g. leaving the game) */
  cancel: () => {
    stopPending();
    busyUntil = 0;
    busyPrio = -1;
  },
  log,
};

if (TEST.on && typeof window !== "undefined") window.__haptics = Haptics;
