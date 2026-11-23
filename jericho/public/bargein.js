// Barge-in: interrupting Jericho while he's talking. Shared by the page and the tests.
// An interruption only counts when ALL of these hold:
//   1. the mic level is clearly above the threshold,
//   2. for about 250-300 ms in a row,
//   3. and the words heard don't match what Jericho is saying (his own voice echoing back).
// The threshold is calibrated per reply: for the first second Jericho talks, the mic level
// (which is then mostly his echo) is measured, and the threshold is raised above it.

export const BARGE_DEFAULTS = { enabled: true, minLevel: 0.15, minMs: 270, calibrateMs: 1500, echoTailMs: 700, duckTo: 0.85 };
/** The threshold is always at least this many times his measured echo level. */
export const MIN_ECHO_MARGIN = 1.8;

/** Speakers: stricter (more echo reaches the mic). Headphones: more sensitive. */
export const BARGE_MODES = {
  off: null,
  speakers: { levelFactor: 1.4, echoMargin: 2.2 },
  headphones: { levelFactor: 0.7, echoMargin: 1.8 },
};
export const DEFAULT_BARGE_MODE = "speakers";

export function normalizeText(t) {
  return String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The existing echo check: the words are a piece of what Jericho said. */
export function isEcho(text, spoken) {
  const t = normalizeText(text);
  return t.length > 8 && normalizeText(spoken).includes(t);
}

/**
 * Stricter, for while he's talking: also catches short fragments of the sentence he's on
 * ("the weather" while he says "the weather today is..."), where most words are his.
 */
export function soundsLikeEcho(text, spoken, current = "") {
  if (isEcho(text, spoken)) return true;
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (!words.length) return true;
  const his = new Set(normalizeText(`${current} ${spoken}`).split(" ").filter(Boolean));
  const mine = words.filter((w) => !his.has(w));
  return mine.length / words.length < 0.4;
}

// ---- fuzzy echo matching -------------------------------------------------------------------
function editDistanceAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/** Same word, allowing small recognition slips ("weather"/"whether", "seventy"/"seventie"). */
export function wordsMatch(a, b) {
  if (a === b) return true;
  const strip = (w) => w.replace(/'/g, "");
  a = strip(a);
  b = strip(b);
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (editDistanceAtMostOne(a, b)) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true; // cut-off words
  }
  return false;
}

/**
 * Does `text` sound like his own recent sentences coming back through the speakers?
 * Normalized (case and punctuation ignored), fuzzy per word, and at least `minOverlap`
 * of the heard words (60% or more) found in his last few sentences. One or two heard words only count
 * as echo when they're one of his whole sentences ("Sure."), so a short "yes" from you
 * isn't thrown away just because he said "say yes to confirm".
 */
export function echoMatch(text, sentences, { minOverlap = 0.6 } = {}) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (!words.length || !sentences?.length) return false;
  const recent = sentences.map((x) => normalizeText(x)).filter(Boolean);
  if (words.length < 3) return recent.includes(words.join(" "));
  const his = recent.join(" ").split(" ").filter(Boolean);
  const found = words.filter((w) => his.some((h) => wordsMatch(w, h))).length;
  return found / words.length >= minOverlap;
}

/**
 * Should a transcript be dropped as echo? Only checked while he talks, during the echo
 * tail after he stops, or in the first 400 ms of a new utterance.
 */
export function shouldDropAsEcho({ text, recent, now, speaking = false, tailUntil = 0, utteranceStart = null, earlyMs = 400 }) {
  const inTail = now < tailUntil;
  const early = utteranceStart !== null && now - utteranceStart < earlyMs;
  if (!speaking && !inTail && !early) return false;
  return echoMatch(text, recent);
}

const YES = /\b(yes|yeah|yep|yup|yah|sure|confirm|confirmed|ok|okay|do it|go ahead|go for it|affirmative|correct|right)\b/i;
/** Anything that might be read as a yes. Heard mid-sentence, it never counts as one. */
export function soundsLikeYes(text) {
  return YES.test(normalizeText(text));
}

/**
 * Watches the mic level while Jericho speaks. Call startReply() when his audio starts,
 * level(value, nowMs) every frame, and sustained(nowMs) to ask whether you've been
 * talking over him for long enough.
 */
export function createBargeDetector(settings = {}, mode = DEFAULT_BARGE_MODE) {
  const cfg = { ...BARGE_DEFAULTS, ...settings };
  let m = BARGE_MODES[mode] === undefined ? BARGE_MODES[DEFAULT_BARGE_MODE] : BARGE_MODES[mode];
  let replyStart = null;
  let echo = [];
  let echoLevel = 0;
  let loudSince = null;
  let lastLoudRun = null; // { from, to } of the latest run above the threshold
  let sessionEcho = 0; // the highest echo level measured so far this session
  const base = () => cfg.minLevel * (m ? m.levelFactor : 1);
  const calibrating = (now) => replyStart !== null && now - replyStart < cfg.calibrateMs;

  const api = {
    get enabled() {
      return Boolean(cfg.enabled && m);
    },
    setMode(next) {
      m = BARGE_MODES[next] === undefined ? BARGE_MODES[DEFAULT_BARGE_MODE] : BARGE_MODES[next];
    },
    startReply(now) {
      sessionEcho = Math.max(sessionEcho, echoLevel); // keep the loudest earlier reply
      replyStart = now;
      echo = [];
      echoLevel = 0;
      loudSince = null;
      lastLoudRun = null;
    },
    stop() {
      replyStart = null;
      loudSince = null;
      lastLoudRun = null;
    },
    /** Forget what was measured; the next second and a half of his voice measures it again. */
    recalibrate(now = null) {
      sessionEcho = 0;
      echoLevel = 0;
      echo = [];
      if (replyStart !== null && now !== null) replyStart = now;
    },
    /** What counts as "clearly above": the base level, or well above his echo (at least 1.8x), whichever is higher. */
    threshold(now = Infinity) {
      const margin = Math.max(MIN_ECHO_MARGIN, m ? m.echoMargin : 2);
      const t = Math.max(base(), Math.max(echoLevel, sessionEcho) * margin);
      // still calibrating: be extra strict, the echo level isn't known yet
      return calibrating(now) ? Math.max(t, base() * 1.6) : t;
    },
    echoLevel: () => echoLevel,
    sessionEcho: () => Math.max(sessionEcho, echoLevel),
    calibrating: (now) => calibrating(now),
    level(value, now) {
      if (replyStart === null) return;
      if (calibrating(now)) {
        echo.push(value);
        const sorted = [...echo].sort((a, b) => a - b);
        echoLevel = sorted[Math.floor(sorted.length * 0.9)] ?? 0; // 90th percentile, ignores one-off spikes
      }
      if (value >= api.threshold(now)) {
        loudSince ??= now;
        lastLoudRun = { from: loudSince, to: now };
      } else loudSince = null;
    },
    /** Loud for at least minMs in a row, ending within the last `withinMs` (recognition lags the audio). */
    sustained(now, withinMs = 1500) {
      if (!lastLoudRun) return false;
      return lastLoudRun.to - lastLoudRun.from >= cfg.minMs && now - lastLoudRun.to <= withinMs;
    },
  };
  return api;
}

/**
 * The decision, given what was heard while he talks:
 *   "kill"      the kill phrase (handled exactly as before)
 *   "ignore"    echo, too quiet, too short, or barge-in is off
 *   "reconfirm" a yes heard while a confirmation is waiting: stop talking, but ask again
 *   "interrupt" a real interruption: stop and treat the words as the next request
 */
export function decideBargeIn({ text, spoken = "", current = "", sustained, enabled = true, confirmPending = false, isKill = false }) {
  if (isKill) return { action: "kill" };
  if (!enabled) return { action: "ignore", reason: "off" };
  const t = normalizeText(text);
  if (t.replace(/ /g, "").length < 2) return { action: "ignore", reason: "too short" };
  if (!sustained) return { action: "ignore", reason: "not loud or long enough" };
  if (soundsLikeEcho(text, spoken, current)) return { action: "ignore", reason: "echo" };
  if (confirmPending && soundsLikeYes(text)) return { action: "reconfirm" };
  return { action: "interrupt" };
}
