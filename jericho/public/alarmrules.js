// What counts as "stop" or "snooze" while an alarm rings. Shared by the page and the tests.
// No wake word needed while it rings; Jericho's own voice reading the label is ignored as echo.
import { echoMatch, normalizeText } from "./bargein.js";

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty five": 45, "twenty five": 25 };

/** "snooze for 15 minutes", "five more minutes", "half an hour" -> minutes (1 to 60), or null. */
export function snoozeMinutes(text) {
  const t = normalizeText(text).replace(/-/g, " ");
  if (/\bhalf an hour\b/.test(t)) return 30;
  if (/\ban hour\b/.test(t)) return 60;
  let m = /\b(\d{1,3})\s*(?:more\s*)?(?:min|mins|minute|minutes)\b/.exec(t);
  if (m) return Math.min(60, Math.max(1, Number(m[1])));
  for (const [w, n] of Object.entries(WORDS).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${w}\\s*(?:more\\s*)?(?:min|mins|minute|minutes)\\b`).test(t)) return n;
  }
  m = /\bsnooze (?:for )?(\d{1,2})\b/.exec(t);
  return m ? Math.min(60, Math.max(1, Number(m[1]))) : null;
}

const STOP = /\b(stop|stop it|dismiss|turn (it )?off|shut (it )?(up|off)|cancel|enough|i'?m up|i am up|i'?m awake|silence|quiet|alarm off)\b/;

/**
 * { action: "stop" } | { action: "snooze", minutes: n | null (= the default) } | null.
 * `spoken`: what Jericho said while ringing (the label), so his own voice can't stop it.
 */
export function alarmCommand(text, { spoken = [] } = {}) {
  const t = normalizeText(text);
  if (!t) return null;
  // his own voice reading the label: ignored, unless it holds a command word he didn't say
  if (spoken.length && echoMatch(text, spoken)) {
    const his = normalizeText(spoken.join(" "));
    const cmd = /\b(stop|snooze|dismiss)\b/.exec(t);
    if (!cmd || new RegExp(`\\b${cmd[1]}\\b`).test(his)) return null;
  }
  if (/\bsnooze\b/.test(t) || (/\b(more minutes?|minutes more)\b/.test(t) && snoozeMinutes(t))) return { action: "snooze", minutes: snoozeMinutes(t) };
  if (STOP.test(t)) return { action: "stop" };
  return null;
}
