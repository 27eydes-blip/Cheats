// Instant answers with no Claude call at all, for the obvious commands: the time, the date,
// volume up/down/mute, and snooze while an alarm is ringing. "Stop" (the kill switch) and
// "go to sleep" / "mute" (muting Jericho's mic) are handled even earlier, the same as before.
// Only whole, plain commands match: anything longer or vaguer goes to Claude as usual.
// Every action here is in the safe tier and goes through the same tool code (and logs) as
// when Claude calls it.

const FILLER = /\b(please|jericho|jer|hey|okay|ok|now|for me|could you|can you|would you|just|quickly)\b/g;

function tidy(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TIME = new Set(["what time is it", "what's the time", "whats the time", "what is the time", "time", "the time", "what time's it", "tell me the time", "what's the time right", "what time is it right"]);
const DATE = new Set(["what's the date", "whats the date", "what is the date", "what day is it", "what's today's date", "what is today's date", "what's today", "what day is today", "what's the date today", "what is the date today", "the date"]);
const VOL_UP = new Set(["volume up", "turn the volume up", "turn up the volume", "turn it up", "louder", "turn volume up", "up the volume", "volume louder", "raise the volume"]);
const VOL_DOWN = new Set(["volume down", "turn the volume down", "turn down the volume", "turn it down", "quieter", "softer", "turn volume down", "lower the volume", "volume lower"]);
const VOL_MUTE = new Set(["mute the volume", "mute the sound", "mute the pc", "mute the computer", "mute volume", "mute sound", "unmute the volume", "unmute the sound", "unmute the pc", "unmute the computer", "unmute volume", "unmute sound"]);
const SNOOZE = new Set(["snooze", "snooze it", "snooze the alarm", "snooze alarm", "snooze that"]);

/** { kind: "time" | "date" | "volume" | "snooze", ... } or null when it isn't one of these. */
export function matchQuick(text) {
  const t = tidy(text);
  if (!t || t.split(" ").length > 7) return null;
  if (TIME.has(t)) return { kind: "time" };
  if (DATE.has(t)) return { kind: "date" };
  if (VOL_UP.has(t)) return { kind: "volume", step: "up" };
  if (VOL_DOWN.has(t)) return { kind: "volume", step: "down" };
  if (VOL_MUTE.has(t)) return { kind: "volume", mute: true };
  if (SNOOZE.has(t)) return { kind: "snooze" };
  return null;
}

/** "It's 7:42 PM." in the user's time zone. */
export function timeSentence(now = new Date(), { lang = "en-US", timeZone } = {}) {
  const time = now.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  return `It's ${time}.`;
}

export function dateSentence(now = new Date(), { lang = "en-US", timeZone } = {}) {
  const date = now.toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric", ...(timeZone ? { timeZone } : {}) });
  return `It's ${date}.`;
}

/**
 * Runs a matched command. deps: { tools, alarms, now, lang, timeZone, signal }.
 * Returns { say } (what to speak), or null to hand it to Claude after all (e.g. "snooze" with
 * nothing ringing).
 */
export async function runQuick(match, deps = {}) {
  const now = deps.now || new Date();
  if (match.kind === "time") return { say: timeSentence(now, deps) };
  if (match.kind === "date") return { say: dateSentence(now, deps) };
  if (match.kind === "volume") {
    const tool = deps.tools?.get("set_volume");
    if (!tool) return null;
    const input = match.mute ? { mute: true } : { step: match.step };
    const r = await tool.run(input, { signal: deps.signal });
    if (!r.ok) return { say: `I couldn't change the volume. ${String(r.error || "").replace(/\.?$/, ".")}`.trim(), tool: "set_volume", input, ok: false };
    return { say: match.mute ? "Okay, mute toggled." : match.step === "up" ? "Turned it up." : "Turned it down.", tool: "set_volume", input, ok: true };
  }
  if (match.kind === "snooze") {
    const ringing = deps.alarms?.list?.().some((a) => a.state === "ringing");
    if (!ringing) return null;
    const r = await deps.alarms.snooze(null);
    if (!r?.ok) return { say: "I couldn't snooze it.", ok: false };
    return { say: `Snoozed for ${deps.alarms.snoozeMinutes} minutes.`, ok: true };
  }
  return null;
}
