// The startup sound, made with Web Audio (no audio files, no Claude call):
//   1. a deep hum that swells in (startup.humSeconds, 3.5 s): low sine and triangle layers through
//      a low-pass filter that slowly opens, a fifth above for the gold, temple-like ring
//   2. three short high "diagnostic" beeps (1800, 2100, 2400 Hz, ~80 ms each, ~150 ms apart), one
//      per startup check (Claude, Voice, Calendar from the self-test) as each result is known; if a
//      result doesn't come in time, the beep plays anyway
//   3. a two-note rising "passed" chime with a soft shimmer (and the orb glows once), or, if a check
//      failed, a quiet low two-note "attention" tone instead. Never speech.
// Plays once per page load, and once more if the server restarts while the page is open.
// Pure timing and the controller logic are exported for the tests (node, with a fake AudioContext).

export const CHECKS = [
  { key: "claude", label: "Claude" },
  { key: "voice", label: "Voice" },
  { key: "calendar", label: "Calendar" },
];
export const BEEP_FREQS = [1800, 2100, 2400];
export const BEEP_MS = 80;
export const BEEP_GAP_MS = 150; // silence between beeps
export const MAX_WAIT_MS = 6000; // longest a beep waits for its check before playing anyway

export function clampHum(seconds) {
  const s = Number(seconds);
  return Number.isFinite(s) && s > 0 ? Math.min(8, Math.max(1, s)) : 3.5;
}

/** A self-test result ({ status: "PASS" | "FAIL" | "SKIP" }) as "ok", "fail" or "unknown". */
export function outcome(result) {
  const s = String(result?.status || result || "").toUpperCase();
  if (s === "PASS" || s === "SKIP") return "ok";
  if (s === "FAIL") return "fail";
  return "unknown";
}

/** "attention" if any check failed, else "pass" (unknown counts as passed: nothing went wrong that we know of). */
export function verdict(outcomes) {
  return outcomes.some((o) => o === "fail") ? "attention" : "pass";
}

/** The fixed part of the timeline (seconds from the start): when each beep plays if no waiting is needed. */
export function timeline(humSeconds = 3.5) {
  const hum = clampHum(humSeconds);
  const step = (BEEP_MS + BEEP_GAP_MS) / 1000;
  const beeps = BEEP_FREQS.map((freq, i) => ({ at: hum + i * step, freq, check: CHECKS[i].key }));
  const resolveAt = beeps.at(-1).at + BEEP_MS / 1000 + 0.25;
  return { hum, beeps, resolveAt, total: resolveAt + 1.6 };
}

// ---- sound -----------------------------------------------------------------------------------------

function env(g, t, peak, attack, release) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

/** 1. The hum: deep layers swelling in, a slow filter sweep, then easing down under the beeps. */
export function playHum(ctx, out, t0, seconds) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 3;
  lp.frequency.setValueAtTime(120, t0);
  lp.frequency.exponentialRampToValueAtTime(900, t0 + seconds * 0.85);
  lp.frequency.exponentialRampToValueAtTime(300, t0 + seconds + 1.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.55, t0 + seconds * 0.8); // the swell
  g.gain.exponentialRampToValueAtTime(0.18, t0 + seconds + 0.2); // eases under the beeps
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds + 2.2);
  lp.connect(g).connect(out);
  const layers = [
    { type: "sine", f: 55 }, // A1: the floor
    { type: "triangle", f: 110 }, // A2
    { type: "sine", f: 82.5 }, // a fifth above: the gold ring
    { type: "triangle", f: 110.6 }, // slightly detuned: a slow beat, like a temple drone
  ];
  for (const l of layers) {
    const o = ctx.createOscillator();
    o.type = l.type;
    o.frequency.setValueAtTime(l.f * 0.97, t0);
    o.frequency.linearRampToValueAtTime(l.f, t0 + seconds * 0.7); // a slight rise as it swells
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + seconds + 2.4);
  }
  return t0 + seconds;
}

/** 2. One diagnostic beep: short, bright, rising slightly within the beep. */
export function playBeep(ctx, out, t, freq) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.linearRampToValueAtTime(freq * 1.03, t + BEEP_MS / 1000);
  const g = ctx.createGain();
  env(g, t, 0.16, 0.006, BEEP_MS / 1000);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + BEEP_MS / 1000 + 0.05);
}

/** 3a. "Passed": two rising notes (A5 then E6) with a soft high shimmer. */
export function playPass(ctx, out, t) {
  for (const [f, at] of [[880, 0], [1318.5, 0.14]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    env(g, t + at, 0.22, 0.01, 0.9);
    o.connect(g).connect(out);
    o.start(t + at);
    o.stop(t + at + 1.0);
    // the shimmer: a quiet octave above, gently wobbling
    const s = ctx.createOscillator();
    s.type = "sine";
    s.frequency.value = f * 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = f * 0.004;
    lfo.connect(lfoGain).connect(s.frequency);
    const sg = ctx.createGain();
    env(sg, t + at + 0.03, 0.05, 0.05, 1.1);
    s.connect(sg).connect(out);
    for (const n of [s, lfo]) {
      n.start(t + at);
      n.stop(t + at + 1.3);
    }
  }
}

/** 3b. "Attention": two soft, low, falling notes. Quiet on purpose. */
export function playAttention(ctx, out, t) {
  for (const [f, at] of [[392, 0], [311.1, 0.22]]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    env(g, t + at, 0.12, 0.02, 0.6);
    o.connect(g).connect(out);
    o.start(t + at);
    o.stop(t + at + 0.7);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Plays the whole sequence on `ctx`. `outcomeOf(key)` returns a promise of "ok" | "fail" |
 * "unknown" for each check; a beep waits for it (at most MAX_WAIT_MS) before playing.
 * Resolves with { verdict, outcomes }. onBeep(i, outcome) and onResolve(verdict) for the page.
 */
export async function playStartup(ctx, { humSeconds = 3.5, volume = 0.6, outcomeOf = async () => "unknown", onBeep = () => {}, onResolve = () => {}, maxWaitMs = MAX_WAIT_MS, sleep = wait } = {}) {
  const t = timeline(humSeconds);
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume)) * 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.03;
  playHum(ctx, master, t0, t.hum);
  await sleep(t.hum * 1000);
  const outcomes = [];
  for (let i = 0; i < CHECKS.length; i++) {
    let timer;
    const result = await Promise.race([
      Promise.resolve(outcomeOf(CHECKS[i].key)).catch(() => "unknown"),
      new Promise((r) => (timer = setTimeout(() => r("unknown"), maxWaitMs))),
    ]);
    clearTimeout(timer);
    outcomes.push(result);
    playBeep(ctx, master, ctx.currentTime + 0.01, BEEP_FREQS[i]);
    onBeep(i, result);
    await sleep(BEEP_MS + BEEP_GAP_MS);
  }
  const v = verdict(outcomes);
  await sleep(150);
  (v === "pass" ? playPass : playAttention)(ctx, master, ctx.currentTime + 0.02);
  onResolve(v, outcomes);
  return { verdict: v, outcomes };
}

/**
 * When to play: once per page load, and once per new server start (the server's startedAt).
 * If the browser blocks audio, it waits for the first click or key press (or the mic being
 * allowed) and plays then. deps: { makeContext, getState, subscribe, listenForGesture, play, enabled }.
 */
export function createStartupController(deps) {
  const playedFor = new Set(); // server start ids already played this page load
  let pendingGesture = null;
  let playing = false;

  async function tryPlay(state) {
    if (!deps.enabled() || playing) return "skipped";
    const id = String(state?.startedAt ?? "unknown");
    if (playedFor.has(id)) return "already";
    let ctx = null;
    try {
      ctx = deps.makeContext();
      if (ctx.state !== "running") await ctx.resume?.().catch(() => {});
    } catch {
      return "no-audio";
    }
    if (ctx.state !== "running") {
      // blocked: play on the first gesture instead (only one waiting at a time)
      ctx.close?.().catch?.(() => {});
      if (!pendingGesture) {
        pendingGesture = deps.listenForGesture(() => {
          pendingGesture = null;
          tryPlay(state);
        });
      }
      return "waiting";
    }
    playedFor.add(id);
    playing = true;
    try {
      await deps.play(ctx, state);
    } finally {
      playing = false;
    }
    return "played";
  }

  return {
    /** Page load: play for the server start the page sees. */
    async start() {
      const state = await deps.getState().catch(() => ({ startedAt: "unknown" }));
      return tryPlay(state);
    },
    /** The event stream reconnected: if the server restarted, play once for the new start. */
    async serverMaybeRestarted() {
      const state = await deps.getState().catch(() => null);
      if (!state || playedFor.has(String(state.startedAt)) || playedFor.size === 0) return "same";
      return tryPlay(state);
    },
    /** A gesture already happened (the power-on tap, the mic allowed): play now if waiting. */
    gesture() {
      if (pendingGesture) {
        const cb = pendingGesture.fire;
        pendingGesture.cancel?.();
        pendingGesture = null;
        cb?.();
      }
    },
    /** Is the startup sequence playing, or still to play on the next gesture? (the power-up skips its own chime) */
    claimsSound() {
      return deps.enabled() && (playing || Boolean(pendingGesture));
    },
  };
}
