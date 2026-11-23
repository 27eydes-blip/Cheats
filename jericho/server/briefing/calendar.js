// Calendar for the briefing: read-only, from a private iCal (.ics) link. No sign-in.
// The link comes from CALENDAR_ICS_URL in .env (preferred) or briefing.calendarIcsUrl in
// settings.json. It's a secret: it's never logged, spoken or sent to the page.
import { settings } from "../config.js";
import { keepAliveFetch } from "../net.js";
import { cached } from "./cache.js";

export function calendarUrl() {
  const raw = (process.env.CALENDAR_ICS_URL || settings.briefing?.calendarIcsUrl || "").trim();
  return raw.replace(/^webcal:\/\//i, "https://");
}

// ---- a small iCal reader --------------------------------------------------------------

function unfold(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(v) {
  return String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** DTSTART/DTEND value -> { date: Date, allDay } (TZID times are read as local time). */
function parseDate(value, params) {
  const v = String(value).trim();
  if (/VALUE=DATE(;|$)/i.test(params) || /^\d{8}$/.test(v)) {
    return { date: new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0", z] = m;
  const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return { date, allDay: false };
}

export function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") cur = { exdates: [] };
    else if (line === "END:VEVENT") {
      if (cur?.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...paramParts] = line.slice(0, i).split(";");
      const params = paramParts.join(";");
      const value = line.slice(i + 1);
      if (name === "DTSTART") cur.start = parseDate(value, params);
      else if (name === "DTEND") cur.end = parseDate(value, params);
      else if (name === "SUMMARY") cur.summary = unescapeText(value);
      else if (name === "LOCATION") cur.location = unescapeText(value);
      else if (name === "RRULE") cur.rrule = Object.fromEntries(value.split(";").map((kv) => kv.split("=")));
      else if (name === "EXDATE") for (const v of value.split(",")) { const d = parseDate(v, params); if (d) cur.exdates.push(d.date.getTime()); }
      else if (name === "STATUS") cur.status = value.trim().toUpperCase();
      else if (name === "RECURRENCE-ID") cur.recurrenceId = parseDate(value, params);
      else if (name === "UID") cur.uid = value.trim();
    }
  }
  return events.filter((e) => e.status !== "CANCELLED");
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Does a (possibly repeating) event happen on `day`? Returns that occurrence's start, or null. */
function occurrenceOn(ev, day) {
  const s = ev.start.date;
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
  if (!ev.rrule) return sameDay(s, day) ? s : null;
  if (startOfDay(day) < startOfDay(s)) return null;
  const r = ev.rrule;
  if (r.UNTIL) {
    const u = parseDate(r.UNTIL, "");
    if (u && startOfDay(day) > u.date) return null;
  }
  const interval = Math.max(1, Number(r.INTERVAL || 1));
  const daysBetween = Math.round((startOfDay(day) - startOfDay(s)) / 86400000);
  let hit = false;
  if (r.FREQ === "DAILY") hit = daysBetween % interval === 0;
  else if (r.FREQ === "WEEKLY") {
    const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => x.replace(/^[+-]?\d+/, "")) : [DAYS[s.getDay()]];
    const weeks = Math.floor((startOfDay(day) - startOfDay(new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay()))) / (7 * 86400000));
    hit = byday.includes(DAYS[day.getDay()]) && weeks % interval === 0;
  } else if (r.FREQ === "MONTHLY") hit = day.getDate() === s.getDate() && ((day.getFullYear() - s.getFullYear()) * 12 + day.getMonth() - s.getMonth()) % interval === 0;
  else if (r.FREQ === "YEARLY") hit = day.getDate() === s.getDate() && day.getMonth() === s.getMonth();
  if (!hit) return null;
  if (r.COUNT) {
    // Rough COUNT support: stop after COUNT intervals of the base frequency.
    const unit = r.FREQ === "WEEKLY" ? 7 : r.FREQ === "DAILY" ? 1 : 30;
    if (daysBetween / unit / interval >= Number(r.COUNT)) return null;
  }
  if (ev.exdates.some((x) => sameDay(new Date(x), day))) return null;
  return ev.start.allDay ? startOfDay(day) : at;
}

/** Today's events and tomorrow's first one, from parsed events. */
export function eventsFor(events, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // A moved single occurrence of a repeating event comes as its own event with a RECURRENCE-ID;
  // the repeating event then mustn't also show up at the old time that day.
  const overrides = events.filter((e) => e.recurrenceId);
  const pick = (day) =>
    events
      .map((e) => {
        let when;
        if (e.recurrenceId) when = sameDay(e.start.date, day) ? e.start.date : null;
        else {
          when = occurrenceOn(e, day);
          if (when && e.rrule && overrides.some((o) => o.uid === e.uid && sameDay(o.recurrenceId.date, day))) when = null;
        }
        return when ? { title: e.summary || "Untitled event", start: when, allDay: e.start.allDay, location: e.location || "" } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  const todays = pick(today);
  const tomorrows = pick(tomorrow);
  return {
    today: todays.map(fmt),
    tomorrowFirst: tomorrows.length ? fmt(tomorrows.find((e) => !e.allDay) || tomorrows[0]) : null,
  };
}

function fmt(e) {
  return {
    title: e.title,
    time: e.allDay ? "all day" : e.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    allDay: e.allDay,
    location: e.location,
  };
}

/** The briefing's calendar part. Errors never include the link. */
export async function getCalendar() {
  const url = calendarUrl();
  if (!url) return { ok: false, reason: "no calendar link set" };
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: "the calendar link has to start with https or webcal" };
  try {
    const text = await cached("calendar", 5 * 60_000, async () => {
      const res = await keepAliveFetch(url, { headers: { accept: "text/calendar" } });
      if (!res.ok) throw new Error(`the calendar server answered ${res.status}`);
      return res.text();
    });
    if (!/BEGIN:VCALENDAR/.test(text)) return { ok: false, reason: "that link didn't return a calendar" };
    return { ok: true, ...eventsFor(parseIcs(text)) };
  } catch (err) {
    // Never pass the raw error on: it can contain the link.
    const safe = /answered \d+/.test(err.message) ? err.message : "couldn't reach the calendar";
    return { ok: false, reason: safe };
  }
}
