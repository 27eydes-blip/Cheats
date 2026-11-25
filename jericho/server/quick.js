import { matchLg } from "./lg/voice.js";

// Instant answers with no Claude call at all, for the obvious commands: the time, the date,
// volume up/down/mute, snooze while an alarm is ringing, a simple alarm at a clear time, and
// plain TV commands (power, volume, mute, play/pause, home, back, open a well-known app). "Stop" (the kill switch) and
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

// ---- simple alarms: "set an alarm for 7 am", "wake me up at 6:30 tomorrow morning" ----------
// Only an unambiguous clock time (am/pm, noon, midnight, or a 24-hour time) is handled here;
// "set an alarm for 7" (morning or evening?), labels or dates go to Claude.
const ALARM = /^(?:set (?:an |a |my |the )?alarm (?:for |at )|alarm (?:for |at )|wake me(?: up)? at |set (?:an |a )?alarm to )(.+)$/;
const ALARM_REPEAT = / (every day|daily|each day|every weekday|on weekdays|weekdays)$/;
const CLOCK = /^(?:(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a m|p m|in the morning|in the evening|in the afternoon|at night|tonight|o'?clock (?:am|pm|in the morning|at night|tonight))|(\d{1,2})[:.](\d{2})|noon|midnight)$/;

function tidyKeep(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b([ap])\.\s?m\.?/g, "$1m")
    .replace(/[^a-z0-9':. ]+/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchAlarm(text) {
  const t = tidyKeep(text);
  const m = ALARM.exec(t);
  if (!m) return null;
  let when = m[1].trim();
  let repeat = "once";
  const r = ALARM_REPEAT.exec(when);
  if (r) {
    repeat = /week/.test(r[1]) ? "weekdays" : "daily";
    when = when.slice(0, r.index).trim();
  }
  const c = CLOCK.exec(when);
  if (!c) return null;
  // 24-hour times must really be 24-hour ("19:30"), not "7:30" (morning or evening?)
  if (c[4] && !(+c[4] >= 13 && +c[4] <= 23) && !(c[4].length === 2 && c[4].startsWith("0"))) return null;
  return { kind: "alarm", time: when.replace(/\ba m\b/, "am").replace(/\bp m\b/, "pm"), repeat };
}

// ---- the Roku TV: power, volume, mute, play/pause, home/back, open a well-known app ---------
const TV = "(?:the )?(?:tv|television|roku)";
const TV_APPS = ["netflix", "youtube", "hulu", "disney plus", "disney", "max", "hbo max", "prime video", "amazon prime", "prime", "spotify", "peacock", "paramount plus", "paramount", "pluto", "tubi", "apple tv", "espn", "sling", "youtube tv", "plex"];
const TV_RULES = [
  [new RegExp(`^(?:turn on ${TV}|turn ${TV} on|switch on ${TV}|switch ${TV} on|power on ${TV}|${TV} on)$`), { action: "power_on" }],
  [new RegExp(`^(?:turn off ${TV}|turn ${TV} off|switch off ${TV}|switch ${TV} off|power off ${TV}|${TV} off)$`), { action: "power_off" }],
  [new RegExp(`^(?:turn up ${TV}|turn ${TV} up|${TV} volume up|${TV} louder|volume up on ${TV}|turn up the volume on ${TV}|turn the volume up on ${TV}|make ${TV} louder)$`), { action: "volume_up", times: 3 }],
  [new RegExp(`^(?:turn down ${TV}|turn ${TV} down|${TV} volume down|${TV} quieter|volume down on ${TV}|turn down the volume on ${TV}|turn the volume down on ${TV}|make ${TV} quieter)$`), { action: "volume_down", times: 3 }],
  [new RegExp(`^(?:mute ${TV}|unmute ${TV}|${TV} mute|${TV} unmute)$`), { action: "mute" }],
  [new RegExp(`^(?:pause ${TV}|play ${TV}|resume ${TV}|${TV} pause|${TV} play|unpause ${TV}|pause (?:it |the show |the movie )?on ${TV}|resume (?:it )?on ${TV})$`), { action: "press", button: "play_pause" }],
  [new RegExp(`^(?:${TV} home|go home on ${TV}|home on ${TV}|home screen on ${TV})$`), { action: "press", button: "home" }],
  [new RegExp(`^(?:${TV} back|go back on ${TV}|back on ${TV})$`), { action: "press", button: "back" }],
];
const TV_OPEN = new RegExp(`^(?:open|launch|start|put on|put|go to|switch to) (${TV_APPS.join("|")}) on ${TV}$|^${TV} (${TV_APPS.join("|")})$`);

export function matchTv(text) {
  const t = tidy(text);
  if (!t || t.split(" ").length > 9) return null;
  for (const [re, input] of TV_RULES) if (re.test(t)) return { kind: "tv", input: { ...input } };
  const o = TV_OPEN.exec(t);
  if (o) return { kind: "tv", input: { action: "open_app", app: o[1] || o[2] } };
  return null;
}

// ---- the Planner: open it, and the plain "what's due" questions ------------------------------
const PLANNER_OPEN = /^(?:open|show|pull up|bring up) (?:me )?(?:my |the )?(?:planner|homework planner|schedule|calendar)$/;
const PLANNER_DUE = /^(?:what(?:'s|s| is) due|what homework (?:is due|do i have)|what do i have due|any homework)(?: (today|tonight|tomorrow|this week))?$/;
const PLANNER_WEEK = /^(?:what do i have|what(?:'s|s| is) on|what(?:'s|s| is) my) (?:this week|my week|for the week|the week)$|^what(?:'s| is) (?:my|the) week (?:look|looking) like$/;

export function matchPlanner(text) {
  const t = tidy(text);
  if (!t || t.split(" ").length > 9) return null;
  if (PLANNER_OPEN.test(t)) return { kind: "planner", tool: "open_planner", input: {} };
  const due = PLANNER_DUE.exec(t);
  if (due) return { kind: "planner", tool: "list_due", input: { range: /tom/.test(due[1] || "") ? "tomorrow" : /today|tonight/.test(due[1] || "") ? "today" : "week" } };
  if (PLANNER_WEEK.test(t)) return { kind: "planner", tool: "list_week", input: { week: "this" } };
  return null;
}

/** { kind: "time" | "date" | "volume" | "snooze" | "alarm" | "tv" | "lg" | "planner", ... } or null when it isn't one of these. */
export function matchQuick(text) {
  const plan = matchPlanner(text);
  if (plan) return plan;
  // the LG TVs by room come before the Roku rules ("the TV" means the LGs once one is paired)
  const lg = matchLg(text);
  if (lg) return lg;
  const alarm = matchAlarm(text);
  if (alarm) return alarm;
  const tv = matchTv(text);
  if (tv) return tv;
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
  if (match.kind === "alarm") {
    const tool = deps.tools?.get("set_alarm");
    if (!tool) return null;
    const input = { time: match.time, repeat: match.repeat };
    const r = await tool.run(input, { signal: deps.signal });
    if (!r?.ok) return null; // Claude can explain or ask
    const note = r.wakeNote ? " Heads up: the laptop may not wake up for it on its own. Ask me about alarm wake-up for the fix." : "";
    return { say: `${r.say}${note}`, tool: "set_alarm", input, ok: true };
  }
  if (match.kind === "lg") {
    if (match.ask) return { say: match.ask, ok: true };
    const tool = deps.tools?.get("lg_tv");
    if (!tool) return null;
    const r = await tool.run(match.input, { signal: deps.signal });
    let say = r?.ok ? r.say : r?.ask || r?.error || "The TV didn't answer.";
    if (match.roku) {
      // "turn off all the TVs and the Roku"
      const roku = await deps.tools?.get("tv")?.run({ action: "power_off" }, { signal: deps.signal });
      say = `${say} ${roku?.ok ? "Roku off." : "The Roku didn't answer."}`;
    }
    return { say, tool: "lg_tv", input: match.input, ok: Boolean(r?.ok) };
  }
  if (match.kind === "planner") {
    const tool = deps.tools?.get(match.tool);
    if (!tool) return null;
    const r = await tool.run(match.input, { signal: deps.signal });
    if (!r?.ok) return null;
    return { say: r.say, tool: match.tool, input: match.input, ok: true, ...(tool.card ? { card: tool.card(r) } : {}) };
  }
  if (match.kind === "tv") {
    const tool = deps.tools?.get("tv");
    if (!tool) return null;
    const r = await tool.run(match.input, { signal: deps.signal });
    const say = r?.ok ? r.said || "Done." : String(r?.error || "I couldn't reach the TV.");
    return { say, tool: "tv", input: match.input, ok: Boolean(r?.ok) };
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
