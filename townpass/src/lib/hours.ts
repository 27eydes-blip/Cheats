/**
 * Opening-hours parsing and "Open now / Closes soon / Closed" logic.
 *
 * Hours spec format (one string per season, edited in /admin):
 *   "mon-fri 08:00-21:00; sat 09:00-22:00; sun closed"
 *   "daily 11:30-15:00, 17:00-22:00"      (two spans in one day)
 *   "thu-sat 22:00-04:00"                 (past midnight is fine)
 *   "daily 24h"                           (open 24 hours)
 * Day tokens: mon tue wed thu fri sat sun, ranges like fri-mon, plus
 * "daily", "weekdays", "weekends". Later segments override earlier ones,
 * so "daily 09:00-17:00; sun closed" works.
 */

export type Span = [openMin: number, closeMin: number]; // closeMin may exceed 1440 (after midnight)
export type WeekHours = Span[][]; // index 0 = Sunday ... 6 = Saturday

export type OpenState = "open" | "closing" | "closed" | "unknown";

export const CLOSING_SOON_MINUTES = 60;

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayIndex(token: string): number {
  const i = DAY_NAMES.indexOf(token.slice(0, 3));
  if (i < 0) throw new Error(`Unknown day "${token}"`);
  return i;
}

function parseDays(token: string): number[] {
  const t = token.toLowerCase();
  if (t === "daily" || t === "everyday" || t === "all") return [0, 1, 2, 3, 4, 5, 6];
  if (t === "weekdays") return [1, 2, 3, 4, 5];
  if (t === "weekends") return [6, 0];
  const out = new Set<number>();
  for (const part of t.split(",")) {
    if (!part) continue;
    const [a, b] = part.split("-");
    const start = dayIndex(a);
    if (b === undefined) {
      out.add(start);
      continue;
    }
    const end = dayIndex(b);
    for (let d = start; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === end) break;
    }
  }
  return [...out];
}

function parseTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Bad time "${s}" (use 24h HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`Bad time "${s}"`);
  return h * 60 + min;
}

/** Parse a spec string. Throws with a human-readable message on bad input. */
export function parseHours(spec: string): WeekHours {
  const week: WeekHours = [[], [], [], [], [], [], []];
  for (const rawSeg of spec.split(/[;\n]/)) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const firstSpace = seg.search(/\s/);
    if (firstSpace < 0) throw new Error(`Missing hours in "${seg}"`);
    const days = parseDays(seg.slice(0, firstSpace).replace(/\s/g, ""));
    const rest = seg.slice(firstSpace).trim().toLowerCase();
    let spans: Span[] = [];
    if (rest === "closed") {
      spans = [];
    } else if (rest === "24h" || rest === "24 hours" || rest === "open 24 hours") {
      spans = [[0, 1440]];
    } else {
      for (const r of rest.split(",")) {
        const [o, c] = r.split("-").map((x) => x.trim());
        if (!o || !c) throw new Error(`Bad span "${r.trim()}" (use HH:MM-HH:MM)`);
        const open = parseTime(o);
        let close = parseTime(c);
        if (close <= open) close += 1440; // runs past midnight
        spans.push([open, close]);
      }
    }
    for (const d of days) week[d] = spans;
  }
  return week;
}

/** Returns null if the spec is valid, otherwise the error message. */
export function validateHours(spec: string | null | undefined): string | null {
  if (!spec || !spec.trim()) return null;
  try {
    parseHours(spec);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export interface LocalTime {
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
  mmdd: string; // "07-04"
  ymd: string; // "2026-07-04"
}

export function localTime(timezone: string, at: Date = new Date()): LocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = DAY_LABELS.indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  return {
    weekday,
    minutes: hour * 60 + Number(get("minute")),
    mmdd: `${get("month")}-${get("day")}`,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Inclusive MM-DD range check that also handles ranges wrapping New Year. */
export function isSummer(mmdd: string, start: string, end: string): boolean {
  return start <= end ? mmdd >= start && mmdd <= end : mmdd >= start || mmdd <= end;
}

export interface HoursSource {
  hours_default: string | null;
  hours_summer: string | null;
  hours_offseason: string | null;
}

export function pickHoursSpec(l: HoursSource, summer: boolean): string | null {
  const seasonal = summer ? l.hours_summer : l.hours_offseason;
  return (seasonal && seasonal.trim()) || (l.hours_default && l.hours_default.trim()) || null;
}

export interface OpenStatus {
  state: OpenState;
  label: string; // "Open now · until 9 PM", "Closes soon · 9:30 PM", "Closed · opens 8 AM"
}

export function fmtMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  if (m === 0 && min > 0) return "Midnight";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

export function openStatus(spec: string | null, now: LocalTime): OpenStatus {
  if (!spec) return { state: "unknown", label: "Hours not listed" };
  let week: WeekHours;
  try {
    week = parseHours(spec);
  } catch {
    return { state: "unknown", label: "Hours not listed" };
  }
  const today = week[now.weekday];
  const yesterday = week[(now.weekday + 6) % 7];

  // Candidate open spans: today's, plus yesterday's spans that run past midnight.
  const active: Span[] = [];
  for (const [o, c] of today) if (now.minutes >= o && now.minutes < c) active.push([o, c]);
  for (const [o, c] of yesterday) {
    const t = now.minutes + 1440;
    if (c > 1440 && t >= o && t < c) active.push([o - 1440, c - 1440]);
  }

  if (active.length) {
    // If spans touch (e.g. 24h every day), extend the close time.
    let close = Math.max(...active.map((s) => s[1]));
    if (close >= 1440) {
      const tomorrow = week[(now.weekday + 1) % 7];
      const cont = tomorrow.find(([o]) => o === 0);
      if (cont && close === 1440) close = 1440 + cont[1];
    }
    if (close - now.minutes >= 24 * 60) return { state: "open", label: "Open 24 hours" };
    if (close - now.minutes <= CLOSING_SOON_MINUTES) {
      return { state: "closing", label: `Closes soon · ${fmtMinutes(close)}` };
    }
    return { state: "open", label: `Open now · until ${fmtMinutes(close)}` };
  }

  // Closed: find next opening within a week.
  const laterToday = today.filter(([o]) => o > now.minutes).sort((a, b) => a[0] - b[0])[0];
  if (laterToday) return { state: "closed", label: `Closed · opens ${fmtMinutes(laterToday[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = (now.weekday + i) % 7;
    const first = [...week[d]].sort((a, b) => a[0] - b[0])[0];
    if (first) {
      const when = i === 1 ? "tomorrow" : DAY_LABELS[d];
      return { state: "closed", label: `Closed · opens ${when} ${fmtMinutes(first[0])}` };
    }
  }
  return { state: "closed", label: "Closed" };
}

/** Weekly table for display: [{ day: "Mon", text: "8 AM – 9 PM" }, ...] starting Monday. */
export function weeklyTable(spec: string | null): { day: string; text: string; index: number }[] {
  if (!spec) return [];
  let week: WeekHours;
  try {
    week = parseHours(spec);
  } catch {
    return [];
  }
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAY_LABELS[d],
    index: d,
    text: week[d].length
      ? week[d]
          .map(([o, c]) => (o === 0 && c === 1440 ? "24 hours" : `${fmtMinutes(o)} – ${fmtMinutes(c)}`))
          .join(", ")
      : "Closed",
  }));
}
