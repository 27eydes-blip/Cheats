// Spoken dates and times for the Planner, always in America/Detroit (planner.timezone).
// Dates are plain "YYYY-MM-DD" strings (a day on the wall calendar); instants are Dates.
// "Friday" when today is Friday, or "next Friday" while this week's Friday is still ahead, are
// ambiguous: the parser returns a short question with both options instead of guessing.
import { DEFAULT_TZ, parseClock, zonedParts, zonedTime } from "../alarms/time.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty five": 45, fifty: 50, ninety: 90 };

const pad = (n) => String(n).padStart(2, "0");
export const dateStr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function splitDate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return { y, m, d };
}

/** Today's date in the time zone. */
export function today(now = new Date(), tz = DEFAULT_TZ) {
  const p = zonedParts(now, tz);
  return dateStr(p.y, p.m, p.d);
}

export function addDays(s, n) {
  const { y, m, d } = splitDate(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return dateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(s) {
  const { y, m, d } = splitDate(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const daysBetween = (a, b) => {
  const x = splitDate(a);
  const y = splitDate(b);
  return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 86400_000);
};

/** The Monday (or `startsOn`) that starts the week holding `s`. */
export function weekStart(s, startsOn = 1) {
  return addDays(s, -((weekday(s) - startsOn + 7) % 7));
}

/** "HH:MM" on a date, as an instant. */
export function at(s, hhmm = "00:00", tz = DEFAULT_TZ) {
  const { y, m, d } = splitDate(s);
  const [h, min] = String(hhmm).split(":").map(Number);
  return zonedTime(y, m, d, h || 0, min || 0, tz);
}

/** The local date and "HH:MM" of an instant. */
export function localOf(date, tz = DEFAULT_TZ) {
  const p = zonedParts(new Date(date), tz);
  return { date: dateStr(p.y, p.m, p.d), time: `${pad(p.h)}:${pad(p.min)}` };
}

export function dayIndex(word) {
  const w = String(word || "").toLowerCase().slice(0, 3);
  return DAY_NAMES.findIndex((d) => d.startsWith(w));
}

/** "Friday, November 28" */
export function sayDate(s, now = new Date(), tz = DEFAULT_TZ) {
  const t = today(now, tz);
  const diff = daysBetween(t, s);
  const { y, m, d } = splitDate(s);
  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
  if (diff === 0) return `today, ${label}`;
  if (diff === 1) return `tomorrow, ${label}`;
  return label;
}

/** "3:30 PM" from "15:30". */
export function sayTime(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// ---- times ---------------------------------------------------------------------------------

const TIME_RE = new RegExp(
  [
    "\\b(?:at |by |before )?(noon|midnight|midday|end of (?:the )?day|eod)\\b",
    "\\b(?:at |by |before )?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|am|pm)(?=\\W|$)",
    "\\b(?:at |by |before )(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*o'?clock)?(\\s+(?:in the morning|in the afternoon|in the evening|at night|tonight))?\\b",
    "\\b(\\d{1,2})[:.](\\d{2})\\b",
  ].join("|"),
  "i",
);

/**
 * Finds a clock time in the text. { time: "HH:MM", rest } or { time: null, rest }.
 * "at 3" with no am/pm: 1 to 6 means the afternoon, 7 to 11 the morning (a school day).
 */
export function extractTime(text) {
  const t = String(text || "");
  const m = TIME_RE.exec(t);
  if (!m) return { time: null, rest: t };
  const rest = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  let hour;
  let minute = 0;
  if (m[1]) {
    const w = m[1].toLowerCase();
    if (w === "midnight") return { time: "23:59", rest }; // "due at midnight" means the end of that day
    if (/end|eod/.test(w)) return { time: "23:59", rest };
    return { time: "12:00", rest };
  }
  if (m[2]) {
    const c = parseClock(`${m[2]}${m[3] ? `:${m[3]}` : ""} ${m[4].replace(/\./g, "")}`);
    if (!c) return { time: null, rest: t };
    return { time: `${pad(c.hour)}:${pad(c.minute)}`, rest };
  }
  if (m[5]) {
    hour = +m[5];
    minute = m[6] ? +m[6] : 0;
    const part = (m[7] || "").trim().toLowerCase();
    if (hour > 23 || minute > 59) return { time: null, rest: t };
    if (hour <= 12) {
      if (/afternoon|evening|night|tonight/.test(part)) hour = hour === 12 ? 12 : hour + 12;
      else if (/morning/.test(part)) hour = hour === 12 ? 0 : hour;
      else if (hour >= 1 && hour <= 6) hour += 12;
    }
    return { time: `${pad(hour)}:${pad(minute)}`, rest };
  }
  hour = +m[8];
  minute = +m[9];
  if (hour > 23 || minute > 59) return { time: null, rest: t };
  return { time: `${pad(hour)}:${pad(minute)}`, rest };
}

// ---- dates ---------------------------------------------------------------------------------

/**
 * A spoken date: "today", "tomorrow", "Friday", "this Friday", "next Friday", "in 3 days",
 * "Nov 30", "November 30th", "11/30", "2026-11-30", "next week" (asks which day).
 * Returns { ok: true, date } or { ok: false, ask, options } (ambiguous) or { ok: false, error }.
 */
export function parseDate(text, now = new Date(), tz = DEFAULT_TZ) {
  const t = String(text || "").toLowerCase().replace(/[’‘]/g, "'").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const base = today(now, tz);
  if (!t) return { ok: false, error: "No date given." };
  let m;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) return { ok: true, date: dateStr(+m[1], +m[2], +m[3]) };
  if (/\b(day after tomorrow)\b/.test(t)) return { ok: true, date: addDays(base, 2) };
  if (/\b(today|tonight|this (?:morning|afternoon|evening))\b/.test(t)) return { ok: true, date: base };
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return { ok: true, date: addDays(base, 1) };
  if (/\byesterday\b/.test(t)) return { ok: true, date: addDays(base, -1) };
  if ((m = /\bin (\d+|a|an|one|two|three|four|five|six|seven|ten) (day|days|week|weeks)\b/.exec(t))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1]];
    return { ok: true, date: addDays(base, m[2].startsWith("week") ? n * 7 : n) };
  }
  // month and day: "nov 30", "november 30th", "30 november", "11/30", "11/30/2026"
  const md = new RegExp(`\\b${MONTH_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH_RE}(?: (\\d{4}))?\\b`).exec(t);
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (md || slash) {
    let month;
    let day;
    let year;
    if (md) {
      const name = md[1] || md[5];
      month = MONTHS.findIndex((x) => x.startsWith(name.slice(0, 3))) + 1;
      day = +(md[2] || md[4]);
      year = md[3] || md[6] ? +(md[3] || md[6]) : null;
    } else {
      month = +slash[1];
      day = +slash[2];
      year = slash[3] ? (slash[3].length === 2 ? 2000 + +slash[3] : +slash[3]) : null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, error: "That date doesn't exist." };
    const { y } = splitDate(base);
    let date = dateStr(year || y, month, day);
    if (splitDate(addDays(date, 0)).d !== day) return { ok: false, error: "That date doesn't exist." };
    // no year and more than a week in the past: they mean next year
    if (!year && daysBetween(base, date) < -7) date = dateStr(y + 1, month, day);
    return { ok: true, date };
  }
  if (/\bnext week\b/.test(t) && !new RegExp(DAY_RE).test(t)) {
    return { ok: false, ask: "Which day next week?", options: [] };
  }
  if (/\b(this )?weekend\b/.test(t)) {
    const sat = addDays(base, (6 - weekday(base) + 7) % 7);
    return { ok: true, date: sat };
  }
  if ((m = new RegExp(`\\b(this |next |on |coming |this coming )?${DAY_RE}\\b`).exec(t))) {
    const which = (m[1] || "").trim();
    const target = dayIndex(m[2]);
    const ahead = (target - weekday(base) + 7) % 7; // 0 = today
    const upcoming = addDays(base, ahead);
    const following = addDays(upcoming, 7);
    const isToday = ahead === 0;
    if (which === "this" || which === "coming" || which === "this coming") return { ok: true, date: upcoming };
    if (which === "next") {
      // "next Friday" said on a Monday: this week's Friday, or the one after? Ask.
      const sameWeek = weekStart(upcoming) === weekStart(base) && !isToday;
      if (sameWeek || isToday) return ambiguous(upcoming, following, now, tz);
      return { ok: true, date: upcoming };
    }
    if (isToday) return ambiguous(upcoming, following, now, tz);
    return { ok: true, date: upcoming };
  }
  return { ok: false, error: "I couldn't tell which day." };
}

function ambiguous(a, b, now, tz) {
  return { ok: false, ask: `Do you mean ${sayDate(a, now, tz)}, or ${sayDate(b, now, tz)}?`, options: [a, b] };
}

/**
 * A date and maybe a time: "Friday at 3pm", "tomorrow 11:59 pm", "nov 30". If no time is said,
 * `defaultTime` is used (null keeps it untimed). Returns { ok, date, time, at } or a question.
 */
export function parseWhen(text, now = new Date(), { defaultTime = null, tz = DEFAULT_TZ } = {}) {
  const { time, rest } = extractTime(text);
  const day = rest.trim() ? parseDate(rest, now, tz) : time ? { ok: true, date: today(now, tz) } : { ok: false, error: "No date given." };
  if (!day.ok) return day;
  const useTime = time || defaultTime;
  return { ok: true, date: day.date, time: useTime, timed: Boolean(time), at: useTime ? at(day.date, useTime, tz).toISOString() : null };
}

/** "90 minutes", "an hour and a half", "1.5 hours", "half an hour", "40 min" -> minutes, or null. */
export function parseDuration(text) {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(+t);
  if (/\bhalf an hour\b|\ba half hour\b/.test(t)) return 30;
  let total = 0;
  let found = false;
  const num = (s) => (/^\d+(\.\d+)?$/.test(s) ? +s : NUMBER_WORDS[s] ?? null);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty|fifty|ninety)\s*(hours?|hrs?|h\b|minutes?|mins?|m\b)/g)) {
    const n = num(m[1]);
    if (n == null) continue;
    found = true;
    total += /^h/.test(m[2]) ? n * 60 : n;
  }
  if (/\band a half\b/.test(t) && found) total += 30;
  return found ? Math.round(total) : null;
}

/** "mon", "Mondays", "MWF", "tues and thurs", "weekdays" -> [1, 3, 5] */
export function parseDays(input) {
  const list = Array.isArray(input) ? input.join(" ") : String(input || "");
  const t = list.toLowerCase();
  if (/\bweekdays?\b|\bevery ?day of the week\b/.test(t)) return [1, 2, 3, 4, 5];
  if (/\bdaily\b|\bevery ?day\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^\s*[mtwrfsu]{2,7}\s*$/i.test(list) && !/[a-z]{3}/.test(t.replace(/[mtwrfsu]/g, ""))) {
    const map = { m: 1, t: 2, w: 3, r: 4, f: 5, s: 6, u: 0 };
    return [...new Set([...t.trim()].map((c) => map[c]))].sort();
  }
  const out = new Set();
  for (const m of t.matchAll(new RegExp(DAY_RE, "g"))) out.add(dayIndex(m[1]));
  return [...out].filter((d) => d >= 0).sort();
}

/** "9", "9:30 am", "14:00", "2pm" -> "HH:MM" (a bare 1-6 means the afternoon). */
export function parseHHMM(input) {
  const s = String(input || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    if (h > 23 || m > 59) return null;
    return `${pad(h >= 1 && h <= 6 && !/^0/.test(s) ? h + 12 : h)}:${pad(m)}`;
  }
  const r = extractTime(/\d/.test(s) && !/[ap]\.?m|:|o'?clock/i.test(s) ? `at ${s}` : s);
  return r.time;
}
