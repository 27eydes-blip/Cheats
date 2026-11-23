// Alarm times in US Eastern (America/Detroit by default), with daylight saving handled by the
// platform's time zone data (Intl). No dependencies, so it's easy to test.
//   - a time that doesn't exist (2:30 AM on the spring-forward night) rings an hour later, at 3:30
//   - a time that happens twice (1:30 AM on the fall-back night) rings the first time
export const DEFAULT_TZ = "America/Detroit";
export const REPEATS = ["once", "daily", "weekdays"];

const fmts = new Map();
function formatter(tz) {
  if (!fmts.has(tz)) {
    fmts.set(
      tz,
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }),
    );
  }
  return fmts.get(tz);
}

/** The wall-clock parts of an instant in a time zone. */
export function zonedParts(date, tz = DEFAULT_TZ) {
  const o = {};
  for (const p of formatter(tz).formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second, weekday: o.weekday };
}

/** UTC offset (ms) in effect at an instant, e.g. -4 h for EDT. */
function offsetAt(ms, tz) {
  const p = zonedParts(new Date(ms), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant a wall-clock time happens in a time zone (see the DST rules above). */
export function zonedTime(y, m, d, h, min, tz = DEFAULT_TZ) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const candidates = [...new Set([guess - offsetAt(guess, tz), guess - offsetAt(guess - offsetAt(guess, tz), tz)])];
  // also try the offsets just before and after, which covers both sides of a change
  for (const k of [-1, 1]) candidates.push(guess - offsetAt(guess + k * 6 * 3600_000, tz));
  const valid = [...new Set(candidates)].filter((t) => {
    const p = zonedParts(new Date(t), tz);
    return p.y === y && p.m === m && p.d === d && p.h === h && p.min === min;
  });
  if (valid.length) return new Date(Math.min(...valid)); // twice (fall back): the first one
  return new Date(Math.max(...candidates)); // never (spring forward): an hour later
}

/** "7", "7am", "7:30 pm", "19:30", "0730", "6.45am", "noon", "midnight", "7 in the morning". */
export function parseClock(input) {
  let t = String(input || "").toLowerCase().trim();
  if (!t) return null;
  if (/\bnoon\b|\bmidday\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmidnight\b/.test(t)) return { hour: 0, minute: 0 };
  t = t.replace(/\bo'?clock\b/g, "").replace(/\bin the morning\b/g, "am").replace(/\b(in the )?(afternoon|evening)\b|\bat night\b|\btonight\b/g, "pm");
  t = t.replace(/a\.m\.?/g, "am").replace(/p\.m\.?/g, "pm");
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm)?\b/.exec(t.replace(/\s+/g, " ").trim()) || /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/.exec(t);
  if (!m) return null;
  let hour = +m[1];
  const minute = m[2] ? +m[2] : 0;
  const ampm = m[3] || (/\bpm\b/.test(t) ? "pm" : /\bam\b/.test(t) ? "am" : "");
  if (minute > 59 || hour > 23) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "am" && hour === 12) hour = 0;
    if (ampm === "pm" && hour !== 12) hour += 12;
  }
  return { hour, minute };
}

const WEEKEND = new Set([0, 6]);

/**
 * The next time an alarm rings, strictly after `now`. A time that has already passed today
 * goes to tomorrow; "weekdays" skips Saturday and Sunday.
 */
export function nextOccurrence({ hour, minute, repeat = "once" }, now = new Date(), tz = DEFAULT_TZ) {
  const today = zonedParts(now, tz);
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    if (repeat === "weekdays" && WEEKEND.has(day.getUTCDay())) continue;
    const at = zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, tz);
    if (at > now) return at;
  }
  throw new Error("no next occurrence"); // can't happen
}

/** After a repeating alarm rings (or was missed): its next time, after both `now` and when it last rang. */
export function advance(alarm, now = new Date(), tz = DEFAULT_TZ) {
  if (!alarm.repeat || alarm.repeat === "once") return null;
  const after = new Date(Math.max(now.getTime(), Date.parse(alarm.fireAt) || 0));
  return nextOccurrence(alarm, after, tz);
}

/** Snooze: from now, whole minutes (1 to 60, default 9). */
export function snoozeUntil(now = new Date(), minutes = 9) {
  const m = Math.round(Number(minutes));
  const mins = Number.isFinite(m) && m >= 1 ? Math.min(60, m) : 9;
  return new Date(now.getTime() + mins * 60_000);
}

/** "tomorrow, Tuesday November 24 at 7:00 AM" (Eastern), for saying out loud. */
export function describeTime(date, now = new Date(), tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  const n = zonedParts(now, tz);
  const dayDiff = Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(n.y, n.m - 1, n.d)) / 86400_000);
  const when = dayDiff === 0 ? "today" : dayDiff === 1 ? "tomorrow" : "";
  const dayName = date.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const time = clockText(date, tz);
  return `${when ? `${when}, ` : ""}${dayName} at ${time}`;
}

export function clockText(date, tz = DEFAULT_TZ) {
  return date.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

/** Is this our time zone's daylight time right now? (for "Eastern Daylight Time" wording) */
export function zoneName(date, tz = DEFAULT_TZ) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date).find((x) => x.type === "timeZoneName");
  return part?.value || tz;
}
