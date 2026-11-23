// Always-listening rules, shared by the page and the tests: restarting speech recognition
// with a backoff, what each recognition error means, the "go to sleep" command, wake-word
// sensitivity and room mode (speaking from across the room).
import { findWake, stripLeadingWake, wakeRegex } from "./wake.js";

/** Wait before restarting recognition after it stopped: 250 ms, doubling, at most 5 s. */
export function backoffDelay(failures) {
  return Math.min(5000, 250 * 2 ** Math.max(0, Math.min(5, failures)));
}

/**
 * What a SpeechRecognition error means for us:
 *   "blocked"  mic permission refused: needs the user (tap to reconnect after allowing it)
 *   "lost"     no microphone / it went away: show "Mic lost, tap to reconnect"
 *   "retry"    network or service hiccup: restart with a backoff
 *   "quiet"    normal (silence, our own abort): restart straight away
 */
export function classifyRecError(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "blocked";
  if (error === "audio-capture") return "lost";
  if (error === "no-speech" || error === "aborted") return "quiet";
  return "retry";
}

const SLEEP = new Set(["go to sleep", "go to sleep now", "sleep", "mute", "mute yourself", "mute the mic", "stop listening", "go to bed"]);
/**
 * "Jericho, go to sleep" mutes the mic. Without a conversation going, the wake word is
 * needed, so a stray "sleep" in the room doesn't mute him.
 */
export function isSleepCommand(text, words, { inConversation = false } = {}) {
  const raw = String(text).trim();
  const woke = findWake(raw, words).found;
  if (!woke && !inConversation) return false;
  const rest = (woke ? stripLeadingWake(raw, words) : raw)
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\b(please|okay|ok|now then)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // the wake word might have been said last ("go to sleep, Jericho")
  const tidy = rest.replace(new RegExp(`\\s*\\b(${words.map((w) => w.replace(/\s+/g, "\\s*")).join("|")})$`), "").trim();
  return SLEEP.has(tidy);
}

// ---- wake sensitivity -----------------------------------------------------------------------
export const SENSITIVITIES = ["low", "normal", "high"];
export const DEFAULT_SENSITIVITY = "normal";

/** Edit distance of at most one (so "jerichow" or "jeriko" still count on High). */
function nearlyEqual(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** High sensitivity: near-misses of "jericho" become "jericho" before the wake check. */
export function fuzzWake(text) {
  return String(text).replace(/[A-Za-z']+/g, (w) => (w.length >= 6 && nearlyEqual(w.toLowerCase(), "jericho") ? "jericho" : w));
}

/**
 * Pick what was heard, given the recognizer's alternatives (best first), the wake words and
 * the sensitivity:
 *   low     best guess only, and the wake word must open the sentence ("Jericho, ...")
 *   normal  best guess, wake word anywhere (as before)
 *   high    every alternative is checked, and near-misses count
 * Returns { found, text } where text is the alternative to use.
 */
export function pickWake(alternatives, words, sensitivity = DEFAULT_SENSITIVITY) {
  const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).map(String).filter((a) => a.trim());
  if (!alts.length) return { found: false, text: "" };
  if (sensitivity === "low") {
    const t = alts[0].trim();
    const m = wakeRegex(words).exec(t);
    // nothing but punctuation before it: the wake word opens the sentence
    return { found: Boolean(m) && t.slice(0, m.index).replace(/[^a-z0-9]/gi, "") === "", text: t };
  }
  const candidates = sensitivity === "high" ? alts.flatMap((a) => [a, fuzzWake(a)]) : [alts[0]];
  for (const c of candidates) if (findWake(c, words).found) return { found: true, text: c };
  return { found: false, text: alts[0] };
}

// ---- room mode ----------------------------------------------------------------------------
/** Without a calibration, room mode lowers the mic thresholds to this share. */
export const ROOM_FACTOR = 0.6;

/**
 * The mic level that counts as you talking (barge-in), given the normal setting and room
 * mode. A calibration measured the room's background noise and your voice from where you
 * sit; the threshold goes between them (well above the noise, below your voice).
 */
export function roomThreshold(base, room = {}) {
  if (!room.on) return base;
  const { noise, voice } = room;
  if (Number.isFinite(noise) && Number.isFinite(voice) && voice > noise) {
    const between = Math.max(noise * 2.5, noise + (voice - noise) * 0.35);
    return Math.min(base, Math.max(0.02, Math.min(between, voice * 0.8)));
  }
  return Math.max(0.02, base * ROOM_FACTOR);
}

/** How much to boost the mic level shown on screen in room mode, so a distant voice still registers. */
export function roomGain(room = {}) {
  if (!room.on) return 1;
  if (Number.isFinite(room.voice) && room.voice > 0) return Math.min(4, Math.max(1, 0.35 / room.voice));
  return 1.6;
}

/** Summarize a calibration run: quiet levels, then you saying "Jericho" from your seat. */
export function calibrateRoom(quietLevels, voiceLevels) {
  const pct = (arr, p) => {
    const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN;
  };
  const noise = pct(quietLevels, 0.9);
  const voice = pct(voiceLevels, 0.95);
  if (!Number.isFinite(noise) || !Number.isFinite(voice)) return { ok: false, reason: "no mic readings" };
  if (voice < noise * 1.5 || voice - noise < 0.01) return { ok: false, reason: "I couldn't hear you over the room. Try again a little louder.", noise, voice };
  return { ok: true, noise: +noise.toFixed(4), voice: +voice.toFixed(4) };
}
