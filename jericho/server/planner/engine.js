// The Planner's free-time engine. Pure functions over the planner items, your read-only
// calendar and "now", so they're easy to test:
//   occurrences  every class, event, homework due time and study block in a date range
//   freeBlocks   waking hours (planner.wakeStart to wakeEnd) minus everything that's busy
//   buildView    what the page shows: days, items, free time and the "This week" summary
//   planWeek     draft study blocks before each due date (never saved until you accept them)
import { settings } from "../config.js";
import { DEFAULT_TZ } from "../alarms/time.js";
import { addDays, at, daysBetween, localOf, today, weekday, weekStart } from "./dates.js";

const MIN = 60_000;

export function plannerSettings(s = settings) {
  const p = s.planner || {};
  const hhmm = (v, d) => (/^\d{2}:\d{2}$/.test(String(v)) ? v : d);
  return {
    tz: p.timezone || DEFAULT_TZ,
    wakeStart: hhmm(p.wakeStart, "07:00"),
    wakeEnd: hhmm(p.wakeEnd, "22:00"),
    weekStartsOn: Number.isInteger(p.weekStartsOn) ? p.weekStartsOn : 1,
    chunkMinutes: Number(p.studyChunkMinutes) > 0 ? Number(p.studyChunkMinutes) : 60,
    minBlockMinutes: Number(p.minFreeBlockMinutes) > 0 ? Number(p.minFreeBlockMinutes) : 15,
    breakMinutes: Number(p.breakMinutes) >= 0 && p.breakMinutes != null ? Number(p.breakMinutes) : 10,
  };
}

const iso = (d) => new Date(d).toISOString();

/** Every occurrence between two dates (inclusive), sorted by start. */
export function occurrences(items, from, to, { calendar = [], now = new Date(), cfg = plannerSettings() } = {}) {
  const out = [];
  const startMs = at(from, "00:00", cfg.tz).getTime();
  const endMs = at(addDays(to, 1), "00:00", cfg.tz).getTime();
  const inRange = (s, e) => e > startMs && s < endMs;
  const days = [];
  for (let d = from; daysBetween(d, to) >= 0 && days.length < 62; d = addDays(d, 1)) days.push(d);
  for (const it of items) {
    if (it.type === "class") {
      for (const d of days) {
        if (!it.days?.includes(weekday(d))) continue;
        if ((it.from && d < it.from) || (it.until && d > it.until)) continue;
        const s = at(d, it.start, cfg.tz);
        const e = at(d, it.end, cfg.tz);
        out.push({ key: `${it.id}@${d}`, id: it.id, type: "class", title: it.title, start: iso(s), end: iso(e), date: d, allDay: false, source: "planner", location: it.location || "" });
      }
    } else if (it.type === "event") {
      const s0 = new Date(it.start).getTime();
      const dur = Math.max(0, new Date(it.end || it.start).getTime() - s0) || (it.allDay ? 0 : 60 * MIN);
      if (it.repeat === "weekly") {
        const first = localOf(s0, cfg.tz);
        for (const d of days) {
          if (d < first.date || weekday(d) !== weekday(first.date) || (it.until && d > it.until)) continue;
          const s = at(d, first.time, cfg.tz).getTime();
          out.push({ key: `${it.id}@${d}`, id: it.id, type: "event", kind: it.kind || "", title: it.title, start: iso(s), end: iso(s + dur), date: d, allDay: it.allDay, source: "planner", repeat: "weekly" });
        }
      } else if (inRange(s0, s0 + Math.max(dur, 1))) {
        out.push({ key: it.id, id: it.id, type: "event", kind: it.kind || "", title: it.title, start: iso(s0), end: iso(s0 + dur), date: localOf(s0, cfg.tz).date, allDay: it.allDay, source: "planner" });
      }
    } else if (it.type === "homework") {
      const due = new Date(it.due).getTime();
      if (!inRange(due, due + 1)) continue;
      out.push({ key: it.id, id: it.id, type: "homework", title: it.title, subject: it.subject || "", start: iso(due), end: iso(due), date: localOf(due, cfg.tz).date, minutes: it.minutes, done: it.done, overdue: !it.done && due < now.getTime(), source: "planner" });
    } else if (it.type === "study_block") {
      const s = new Date(it.start).getTime();
      const e = new Date(it.end).getTime();
      if (!inRange(s, e)) continue;
      out.push({ key: it.id, id: it.id, type: "study_block", title: it.title, homeworkId: it.homeworkId, start: iso(s), end: iso(e), date: localOf(s, cfg.tz).date, status: it.status, source: "planner" });
    }
  }
  for (const c of calendar) {
    const s = new Date(c.start).getTime();
    const e = new Date(c.end || c.start).getTime();
    if (!inRange(s, Math.max(e, s + 1))) continue;
    out.push({ key: `cal:${s}:${c.title}`, id: null, type: "event", title: c.title, start: iso(s), end: iso(e), date: localOf(s, cfg.tz).date, allDay: Boolean(c.allDay), source: "calendar", readOnly: true, location: c.location || "" });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** What takes up time: classes, timed events, calendar events and accepted study blocks. */
export function busyIntervals(occ, { includeDrafts = false } = {}) {
  return occ
    .filter((o) => !o.allDay && (o.type === "class" || o.type === "event" || (o.type === "study_block" && (o.status === "accepted" || includeDrafts))))
    .map((o) => [new Date(o.start).getTime(), new Date(o.end).getTime()])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
}

/** Free blocks on one day: waking hours minus busy time (and minus the past, today). */
export function freeBlocks(date, busy, { now = new Date(), cfg = plannerSettings() } = {}) {
  let start = at(date, cfg.wakeStart, cfg.tz).getTime();
  const end = at(date, cfg.wakeEnd, cfg.tz).getTime();
  const nowMs = now.getTime();
  if (nowMs > start) start = Math.ceil(nowMs / (5 * MIN)) * 5 * MIN; // from now, on a 5 minute mark
  const out = [];
  let cur = start;
  for (const [s, e] of busy) {
    if (e <= cur || s >= end) continue;
    if (s > cur) out.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
    if (cur >= end) break;
  }
  if (cur < end) out.push([cur, end]);
  return out.filter(([s, e]) => e - s >= cfg.minBlockMinutes * MIN).map(([s, e]) => ({ start: iso(s), end: iso(e), minutes: Math.round((e - s) / MIN) }));
}

/** The page's data for a date range (a day, a week or a month). */
export function buildView({ from, to, items, calendar = [], now = new Date(), cfg = plannerSettings() }) {
  const occ = occurrences(items, from, to, { calendar, now, cfg });
  const busy = busyIntervals(occ);
  const days = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    const free = daysBetween(today(now, cfg.tz), d) < 0 ? [] : freeBlocks(d, busy, { now, cfg });
    days.push({ date: d, free, freeMinutes: free.reduce((a, b) => a + b.minutes, 0) });
  }
  return { from, to, days, items: occ, summary: weekSummary({ items, calendar, now, cfg }), settings: { wakeStart: cfg.wakeStart, wakeEnd: cfg.wakeEnd, tz: cfg.tz, weekStartsOn: cfg.weekStartsOn } };
}

/** "This week": homework by due date (overdue first), hours of work left, free hours per day. */
export function weekSummary({ items, calendar = [], now = new Date(), cfg = plannerSettings() }) {
  const t = today(now, cfg.tz);
  const from = weekStart(t, cfg.weekStartsOn);
  const to = addDays(from, 6);
  const endMs = at(addDays(to, 1), "00:00", cfg.tz).getTime();
  const homework = items
    .filter((i) => i.type === "homework" && (new Date(i.due).getTime() < endMs) && (!i.done || new Date(i.due).getTime() >= at(from, "00:00", cfg.tz).getTime()))
    .map((i) => ({ id: i.id, title: i.title, subject: i.subject || "", due: i.due, minutes: i.minutes, done: i.done, overdue: !i.done && new Date(i.due).getTime() < now.getTime() }))
    .sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));
  const workLeftMinutes = homework.filter((h) => !h.done).reduce((a, h) => a + h.minutes, 0);
  const occ = occurrences(items, t, to, { calendar, now, cfg });
  const busy = busyIntervals(occ);
  const freeByDay = [];
  for (let d = t; daysBetween(d, to) >= 0; d = addDays(d, 1)) freeByDay.push({ date: d, freeMinutes: freeBlocks(d, busy, { now, cfg }).reduce((a, b) => a + b.minutes, 0) });
  return { from, to, homework, workLeftMinutes, freeByDay };
}

/** Free blocks of at least `minutes` between two dates. */
export function findFree({ items, calendar = [], now = new Date(), from, to = from, minutes = 30, cfg = plannerSettings() }) {
  const occ = occurrences(items, from, to, { calendar, now, cfg });
  const busy = busyIntervals(occ);
  const out = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) for (const b of freeBlocks(d, busy, { now, cfg })) if (b.minutes >= minutes) out.push({ date: d, ...b });
  return out;
}

/**
 * Draft study blocks for the next 7 days: each unfinished homework gets its estimated minutes
 * (less any accepted study time) in chunks of up to planner.studyChunkMinutes, in free time
 * before it's due, with a short break after each chunk and at most two chunks of it a day.
 * Returns { drafts, shortfalls }. Nothing is saved here.
 */
export function planWeek({ items, calendar = [], now = new Date(), cfg = plannerSettings() }) {
  const t = today(now, cfg.tz);
  const horizon = addDays(t, 7);
  const horizonMs = at(addDays(horizon, 1), "00:00", cfg.tz).getTime();
  const occ = occurrences(items, t, horizon, { calendar, now, cfg });
  const busy = busyIntervals(occ); // drafts from an earlier plan are replaced, so they don't count
  const accepted = (hwId) => items.filter((i) => i.type === "study_block" && i.status === "accepted" && i.homeworkId === hwId).reduce((a, b) => a + (new Date(b.end) - new Date(b.start)) / MIN, 0);
  const homework = items
    .filter((i) => i.type === "homework" && !i.done && new Date(i.due).getTime() <= horizonMs)
    .sort((a, b) => a.due.localeCompare(b.due));
  const drafts = [];
  const shortfalls = [];
  for (const hw of homework) {
    let need = Math.max(0, hw.minutes - accepted(hw.id));
    const dueMs = new Date(hw.due).getTime();
    // overdue work still gets time: as soon as possible, within the next two days
    const limit = dueMs > now.getTime() ? dueMs : at(addDays(t, 2), "00:00", cfg.tz).getTime();
    const perDay = new Map();
    for (let d = t; need > 0 && daysBetween(d, horizon) >= 0; d = addDays(d, 1)) {
      if (at(d, cfg.wakeStart, cfg.tz).getTime() >= limit) break;
      while (need > 0 && (perDay.get(d) || 0) < 2) {
        busy.sort((x, y) => x[0] - y[0]);
        let placed = false;
        for (const block of freeBlocks(d, busy, { now, cfg })) {
          const s = new Date(block.start).getTime();
          const e = Math.min(new Date(block.end).getTime(), limit);
          const len = Math.min(need, cfg.chunkMinutes, Math.floor((e - s) / MIN));
          if (len < Math.min(need, 20)) continue; // too short to be worth it
          drafts.push({ type: "study_block", status: "draft", homeworkId: hw.id, title: `Study: ${hw.title}`, start: iso(s), end: iso(s + len * MIN) });
          busy.push([s, s + (len + cfg.breakMinutes) * MIN]);
          perDay.set(d, (perDay.get(d) || 0) + 1);
          need -= len;
          placed = true;
          break;
        }
        if (!placed) break;
      }
    }
    if (need > 0) shortfalls.push({ homeworkId: hw.id, title: hw.title, minutesShort: Math.round(need) });
  }
  return { drafts, shortfalls };
}
