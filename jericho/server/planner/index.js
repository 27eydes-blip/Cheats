// The Planner: what Jericho's tools and the Planner page call. Your items live in
// data/planner.json (see store.js); your own calendar (CALENDAR_ICS_URL) is merged in,
// read-only, marked source "calendar". Every answer has a short `say` for speaking.
import { calendarBlocks } from "../briefing/calendar.js";
import { addDays, at, daysBetween, localOf, parseDate, parseDays, parseDuration, parseHHMM, parseWhen, sayDate, sayTime, today, weekStart, extractTime } from "./dates.js";
import { buildView, findFree, occurrences, planWeek, plannerSettings, weekSummary } from "./engine.js";
import * as store from "./store.js";

const MIN = 60_000;
const cfg = () => plannerSettings();

/** Calendar events for a range; never fails (an unreachable calendar just adds nothing). */
export async function calendarFor(from, to) {
  try {
    const r = await calendarBlocks(from, to);
    return { blocks: r.blocks || [], note: r.ok ? "" : r.reason };
  } catch {
    return { blocks: [], note: "couldn't reach the calendar" };
  }
}

const hours = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} minutes`;
  if (!m) return `${h} hour${h === 1 ? "" : "s"}`;
  if (m === 30) return `${h} and a half hours`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} minutes`;
};
const whenOf = (isoStr, now) => {
  const l = localOf(isoStr, cfg().tz);
  return `${sayDate(l.date, now, cfg().tz)} at ${sayTime(l.time)}`;
};
const dueText = (h, now) => {
  const l = localOf(h.due, cfg().tz);
  return `${sayDate(l.date, now, cfg().tz)}${l.time === "23:59" ? "" : ` at ${sayTime(l.time)}`}`;
};

// ---- finding the item they mean --------------------------------------------------------------

const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !["the", "my", "a", "an", "for", "homework", "assignment", "due", "on", "to", "of"].includes(w));

/** The planner item they mean ("the physics test", "accounting"), or a short question. */
export function resolveItem(which, { types = ["homework", "event", "class", "study_block"], now = new Date() } = {}) {
  const items = store.list().filter((i) => types.includes(i.type));
  const exact = items.find((i) => i.id === which);
  if (exact) return { ok: true, item: exact };
  const q = words(which);
  if (!q.length) return { ok: false, error: "Which one?" };
  const scored = items
    .map((i) => {
      const w = new Set(words(`${i.title} ${i.subject || ""} ${i.kind || ""}`));
      const hits = q.filter((x) => w.has(x) || [...w].some((y) => y.startsWith(x) || x.startsWith(y))).length;
      return { i, score: hits / q.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.i.done) - Number(b.i.done));
  if (!scored.length) return { ok: false, error: `I couldn't find "${String(which).slice(0, 60)}" in your planner.` };
  const best = scored.filter((x) => x.score === scored[0].score);
  // several equally good matches: prefer unfinished homework, else ask
  const open = best.filter((x) => !(x.i.type === "homework" && x.i.done));
  const pool = open.length ? open : best;
  if (pool.length === 1) return { ok: true, item: pool[0].i };
  const names = pool.slice(0, 3).map((x) => (x.i.type === "homework" ? `${x.i.title}, due ${dueText(x.i, now)}` : x.i.title));
  return { ok: false, ask: `Which one: ${names.join(", or ")}?`, options: pool.slice(0, 3).map((x) => x.i.id) };
}

// ---- adding ------------------------------------------------------------------------------------

export function addHomework({ title, subject = "", due, minutes }, now = new Date()) {
  if (!String(title || "").trim()) return { ok: false, error: "What's the homework called?" };
  const when = parseWhen(due, now, { defaultTime: "23:59", tz: cfg().tz });
  if (!when.ok) return when.ask ? { ok: false, ask: when.ask, options: when.options } : { ok: false, error: `When is it due? (${when.error})` };
  const parsed = parseDuration(minutes);
  const mins = parsed || 30;
  const item = store.add({ type: "homework", title, subject, due: when.at, minutes: mins, done: false });
  return { ok: true, item, say: `Added ${item.title}, due ${dueText(item, now)}, about ${hours(mins)}${parsed ? "" : " (my guess; tell me if it's longer)"}.` };
}

export function addEvent({ title, when, end, minutes, allDay, repeat = "none", kind = "", location = "" }, now = new Date()) {
  if (!String(title || "").trim()) return { ok: false, error: "What's it called?" };
  const w = parseWhen(when, now, { tz: cfg().tz });
  if (!w.ok) return w.ask ? { ok: false, ask: w.ask, options: w.options } : { ok: false, error: `When is it? (${w.error})` };
  const tz = cfg().tz;
  let start;
  let stop;
  const whole = allDay === true || (allDay !== false && !w.timed);
  if (whole) {
    start = at(w.date, "00:00", tz);
    stop = at(addDays(w.date, 1), "00:00", tz);
  } else {
    start = new Date(w.at);
    const endTime = end ? extractTime(String(end).match(/\d|noon|midnight/) && !/[ap]\.?m|:|noon|midnight|o'?clock/i.test(end) ? `at ${end}` : end).time : null;
    const dur = parseDuration(minutes) || 60;
    stop = endTime ? at(w.date, endTime, tz) : new Date(start.getTime() + dur * MIN);
    if (stop <= start) stop = new Date(start.getTime() + dur * MIN);
  }
  const item = store.add({ type: "event", title, kind, start: start.toISOString(), end: stop.toISOString(), allDay: whole, repeat, location });
  const l = localOf(item.start, tz);
  return { ok: true, item, say: `Added ${item.title} on ${sayDate(l.date, now, tz)}${whole ? "" : ` at ${sayTime(l.time)}`}${repeat === "weekly" ? ", every week" : ""}.` };
}

/** "Set my class schedule": [{ title, days: "MWF", start: "9", end: "9:50" }, ...]. */
export function setClasses({ classes = [], replace = false }) {
  const parsed = [];
  for (const c of classes) {
    const days = parseDays(c.days);
    const start = parseHHMM(c.start);
    const end = parseHHMM(c.end) || (start && c.minutes ? addMinutes(start, parseDuration(c.minutes)) : null);
    if (!c.title || !days.length || !start || !end || end <= start) return { ok: false, error: `I need the days and start and end times for ${c.title || "that class"}.` };
    parsed.push({ type: "class", title: c.title, days, start, end, location: c.location || "" });
  }
  if (!parsed.length) return { ok: false, error: "Which classes, on which days and times?" };
  const out = store.batch((items) => ({ items: [...(replace ? items.filter((i) => i.type !== "class") : items), ...parsed.map((p) => ({ ...p, id: Math.random().toString(36).slice(2, 10) }))], count: parsed.length }), replace ? "classes_replaced" : "classes_added");
  const names = parsed.map((p) => p.title).join(", ");
  return { ok: true, count: out.count, say: `${replace ? "Your class schedule is now" : "Added"} ${names}.` };
}

function addMinutes(hhmm, m) {
  const [h, mi] = hhmm.split(":").map(Number);
  const t = h * 60 + mi + (m || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// ---- changing ----------------------------------------------------------------------------------

export function completeHomework({ which, done = true }, now = new Date()) {
  const r = resolveItem(which, { types: ["homework"], now });
  if (!r.ok) return r;
  const item = store.update(r.item.id, { done, doneAt: done ? new Date().toISOString() : null }, done ? "complete" : "reopen");
  return { ok: true, item, say: done ? `Checked off ${item.title}.` : `${item.title} is back on your list.` };
}

export function moveItem({ which, to }, now = new Date()) {
  const r = resolveItem(which, { types: ["homework", "event", "study_block"], now });
  if (!r.ok) return r;
  const it = r.item;
  const tz = cfg().tz;
  const w = parseWhen(to, now, { tz });
  if (!w.ok) return w.ask ? { ok: false, ask: w.ask, options: w.options } : { ok: false, error: `Move it to when? (${w.error})` };
  if (it.type === "homework") {
    const keep = localOf(it.due, tz).time;
    const due = at(w.date, w.time || keep, tz).toISOString();
    const item = store.update(it.id, { due }, "move");
    return { ok: true, item, say: `${item.title} is now due ${dueText(item, now)}.` };
  }
  const dur = new Date(it.end) - new Date(it.start);
  const keep = localOf(it.start, tz).time;
  const start = it.allDay && !w.timed ? at(w.date, "00:00", tz) : at(w.date, w.time || keep, tz);
  const item = store.update(it.id, { start: start.toISOString(), end: new Date(start.getTime() + dur).toISOString(), ...(it.type === "event" && it.allDay && w.timed ? { allDay: false, end: new Date(start.getTime() + 60 * MIN).toISOString() } : {}) }, "move");
  const l = localOf(item.start, tz);
  return { ok: true, item, say: `Moved ${item.title} to ${sayDate(l.date, now, tz)}${item.allDay ? "" : ` at ${sayTime(l.time)}`}.` };
}

export function deleteItem({ which }, now = new Date()) {
  const r = resolveItem(which, { now });
  if (!r.ok) return r;
  const gone = store.remove(r.item.id, "delete");
  return { ok: true, say: `Deleted ${gone.title} from your planner.` };
}

// ---- reading -----------------------------------------------------------------------------------

export async function listDue({ range = "week" } = {}, now = new Date()) {
  const tz = cfg().tz;
  const t = today(now, tz);
  const ranges = { today: [t, t], tomorrow: [addDays(t, 1), addDays(t, 1)], week: [t, addDays(weekStart(t, cfg().weekStartsOn), 6)], next7: [t, addDays(t, 6)] };
  const [from, to] = ranges[range] || ranges.week;
  const endMs = at(addDays(to, 1), "00:00", tz).getTime();
  const startMs = at(from, "00:00", tz).getTime();
  const hw = store
    .list()
    .filter((i) => i.type === "homework" && !i.done && new Date(i.due).getTime() < endMs && (range === "week" || new Date(i.due).getTime() >= startMs))
    .sort((a, b) => a.due.localeCompare(b.due));
  const overdue = hw.filter((h) => new Date(h.due) < now);
  const upcoming = hw.filter((h) => new Date(h.due) >= now);
  const parts = [];
  if (overdue.length) parts.push(`Overdue: ${overdue.map((h) => h.title).join(", ")}.`);
  if (upcoming.length) parts.push(upcoming.map((h) => `${h.title}, due ${dueText(h, now)}, about ${hours(h.minutes)}`).join(". ") + ".");
  const label = range === "today" ? "today" : range === "tomorrow" ? "tomorrow" : "this week";
  const total = hw.reduce((a, h) => a + h.minutes, 0);
  return {
    ok: true,
    homework: hw.map((h) => ({ id: h.id, title: h.title, subject: h.subject, due: h.due, minutes: h.minutes, overdue: new Date(h.due) < now })),
    workLeftMinutes: total,
    say: hw.length ? `${parts.join(" ")}${hw.length > 1 ? ` That's about ${hours(total)} of work.` : ""}` : `Nothing due ${label}.`,
  };
}

export async function listWeek({ week = "this" } = {}, now = new Date()) {
  const tz = cfg().tz;
  const t = today(now, tz);
  const from = week === "next" ? addDays(weekStart(t, cfg().weekStartsOn), 7) : t;
  const to = week === "next" ? addDays(from, 6) : addDays(weekStart(t, cfg().weekStartsOn), 6);
  const cal = await calendarFor(from, to);
  const occ = occurrences(store.list(), from, to, { calendar: cal.blocks, now, cfg: cfg() });
  const summary = weekSummary({ items: store.list(), calendar: cal.blocks, now, cfg: cfg() });
  const lines = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    const day = occ.filter((o) => o.date === d && o.type !== "study_block");
    if (!day.length) continue;
    const events = day.filter((o) => o.type === "event").map((o) => o.title);
    const due = day.filter((o) => o.type === "homework" && !o.done).map((o) => o.title);
    const classes = day.filter((o) => o.type === "class").length;
    const bits = [];
    if (classes) bits.push(`${classes} class${classes === 1 ? "" : "es"}`);
    if (events.length) bits.push(events.join(", "));
    if (due.length) bits.push(`${due.join(", ")} due`);
    if (bits.length) lines.push(`${sayDate(d, now, tz).replace(/, .*/, "")}: ${bits.join("; ")}`);
  }
  const free = summary.freeByDay.reduce((a, b) => a + b.freeMinutes, 0);
  return {
    ok: true,
    items: occ.map((o) => ({ type: o.type, title: o.title, date: o.date, start: o.start, allDay: o.allDay, source: o.source, done: o.done })),
    workLeftMinutes: summary.workLeftMinutes,
    freeByDay: summary.freeByDay,
    calendarNote: cal.note || undefined,
    say: `${lines.length ? `${lines.join(". ")}.` : "Nothing on your planner this week."} ${summary.workLeftMinutes ? `About ${hours(summary.workLeftMinutes)} of homework left, and ${hours(free)} free${week === "next" ? "" : " the rest of the week"}.` : ""}`.trim(),
  };
}

export async function findFreeTime({ day, minutes = 30 } = {}, now = new Date()) {
  const tz = cfg().tz;
  const mins = parseDuration(minutes) || 30;
  let from = today(now, tz);
  let to = addDays(from, 6);
  if (day && !/\b(this week|week)\b/i.test(day)) {
    const d = parseDate(day, now, tz);
    if (!d.ok) return d.ask ? { ok: false, ask: d.ask, options: d.options } : { ok: false, error: `Which day? (${d.error})` };
    from = d.date;
    to = d.date;
  }
  const cal = await calendarFor(from, to);
  const blocks = findFree({ items: store.list(), calendar: cal.blocks, now, from, to, minutes: mins, cfg: cfg() });
  const speak = blocks.slice(0, 3).map((b) => `${from === to ? "" : `${sayDate(b.date, now, tz).replace(/, .*/, "")} `}${sayTime(localOf(b.start, tz).time)} to ${sayTime(localOf(b.end, tz).time)}`);
  return {
    ok: true,
    blocks: blocks.slice(0, 10),
    say: blocks.length ? `You're free ${speak.join(", ")}${blocks.length > 3 ? `, and ${blocks.length - 3} more` : ""}.` : `No free stretch of ${hours(mins)} ${from === to ? `on ${sayDate(from, now, tz)}` : "in the next week"}.`,
  };
}

// ---- planning ------------------------------------------------------------------------------------

/** "Plan my week": replaces any earlier drafts with new draft study blocks. Never commits them. */
export async function planMyWeek(now = new Date()) {
  const tz = cfg().tz;
  const t = today(now, tz);
  const cal = await calendarFor(t, addDays(t, 7));
  const items = store.list().filter((i) => !(i.type === "study_block" && i.status === "draft"));
  const { drafts, shortfalls } = planWeek({ items, calendar: cal.blocks, now, cfg: cfg() });
  store.batch(() => ({ items: [...items, ...drafts.map((d) => ({ ...d, id: Math.random().toString(36).slice(2, 10) }))], count: drafts.length }), "plan_drafted");
  const total = drafts.reduce((a, d) => a + (new Date(d.end) - new Date(d.start)) / MIN, 0);
  const short = shortfalls.length ? ` There isn't enough free time for ${shortfalls.map((s) => s.title).join(" and ")}.` : "";
  return {
    ok: true,
    drafts: drafts.map((d) => ({ title: d.title, start: d.start, end: d.end })),
    shortfalls,
    say: drafts.length ? `I drafted ${drafts.length} study block${drafts.length === 1 ? "" : "s"}, about ${hours(total)}, starting ${whenOf(drafts[0].start, now)}.${short} They're drafts: accept, change or reject them on your planner, or tell me.` : shortfalls.length ? `I couldn't fit any study time before the due dates.${short}` : "Nothing needs study time this week.",
  };
}

/** Accept or reject the drafted study blocks (all of them, or the ones matching `which`). */
export function reviewPlan({ action, which = "" }) {
  const drafts = store.list().filter((i) => i.type === "study_block" && i.status === "draft");
  if (!drafts.length) return { ok: false, error: "There's no draft plan right now. Say plan my week to make one." };
  const match = which ? drafts.filter((d) => words(which).some((w) => words(d.title).includes(w))) : drafts;
  if (!match.length) return { ok: false, error: "None of the drafts match that." };
  const ids = new Set(match.map((d) => d.id));
  store.batch((items) => ({ items: action === "accept" ? items.map((i) => (ids.has(i.id) ? { ...i, status: "accepted" } : i)) : items.filter((i) => !ids.has(i.id)), count: ids.size }), action === "accept" ? "plan_accepted" : "plan_rejected");
  return { ok: true, count: ids.size, say: action === "accept" ? `Locked in ${ids.size} study block${ids.size === 1 ? "" : "s"}.` : `Dropped ${ids.size} draft block${ids.size === 1 ? "" : "s"}.` };
}

// ---- the page ------------------------------------------------------------------------------------

/** The Planner page's data: view "day" | "week" | "month" around `date`. */
export async function pageView({ view = "week", date } = {}, now = new Date()) {
  const tz = cfg().tz;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : today(now, tz);
  let from = d;
  let to = d;
  if (view === "week") {
    from = weekStart(d, cfg().weekStartsOn);
    to = addDays(from, 6);
  } else if (view === "month") {
    const first = `${d.slice(0, 7)}-01`;
    from = weekStart(first, cfg().weekStartsOn);
    const nextMonth = addDays(`${d.slice(0, 7)}-28`, 4).slice(0, 7);
    to = addDays(weekStart(addDays(`${nextMonth}-01`, -1), cfg().weekStartsOn), 6);
  }
  const cal = await calendarFor(from, to);
  return { ok: true, view, date: d, today: today(now, tz), version: store.version(), calendarNote: cal.note || undefined, ...buildView({ from, to, items: store.list(), calendar: cal.blocks, now, cfg: cfg() }) };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Changes made on the page (tap, drag, check off). Input is validated; times are ISO strings. */
export async function pageChange(body = {}, now = new Date()) {
  const op = String(body.op || "");
  const it = body.id ? store.get(String(body.id)) : null;
  if (["move", "toggle", "delete", "update"].includes(op) && !it) return { ok: false, error: "That item isn't in your planner." };
  switch (op) {
    case "add": {
      const type = body.type;
      if (type === "homework") {
        if (!ISO_RE.test(body.due || "")) return { ok: false, error: "A due date is needed." };
        return { ok: true, item: store.add({ type, title: body.title, subject: body.subject, due: new Date(body.due).toISOString(), minutes: body.minutes, done: false }) };
      }
      if (type === "event" || type === "study_block") {
        if (!ISO_RE.test(body.start || "") || !ISO_RE.test(body.end || "") || new Date(body.end) <= new Date(body.start)) return { ok: false, error: "A start and end time are needed." };
        return { ok: true, item: store.add({ type, title: body.title, start: new Date(body.start).toISOString(), end: new Date(body.end).toISOString(), allDay: Boolean(body.allDay), repeat: body.repeat, status: "accepted" }) };
      }
      if (type === "class") return setClasses({ classes: [{ title: body.title, days: body.days, start: body.start, end: body.end, location: body.location }] });
      return { ok: false, error: "Unknown item type." };
    }
    case "move": {
      if (!ISO_RE.test(body.start || "")) return { ok: false, error: "Where to?" };
      const start = new Date(body.start);
      if (it.type === "homework") return { ok: true, item: store.update(it.id, { due: start.toISOString() }, "move") };
      if (it.type === "class") {
        const l = localOf(start, cfg().tz);
        const [sh, sm] = it.start.split(":").map(Number);
        const [eh, em] = it.end.split(":").map(Number);
        const dayShift = Number.isInteger(body.fromDay) ? (new Date(`${l.date}T12:00:00Z`).getUTCDay() - body.fromDay) : 0;
        const days = it.days.map((d) => (d + dayShift + 7) % 7);
        return { ok: true, item: store.update(it.id, { days, start: l.time, end: addMinutes(l.time, eh * 60 + em - (sh * 60 + sm)) }, "move") };
      }
      const dur = new Date(it.end) - new Date(it.start);
      return { ok: true, item: store.update(it.id, { start: start.toISOString(), end: new Date(start.getTime() + dur).toISOString() }, "move") };
    }
    case "toggle":
      if (it.type !== "homework") return { ok: false, error: "Only homework can be checked off." };
      return { ok: true, item: store.update(it.id, { done: !it.done, doneAt: !it.done ? new Date().toISOString() : null }, it.done ? "reopen" : "complete") };
    case "update": {
      const patch = {};
      for (const k of ["title", "subject", "minutes", "location"]) if (body[k] !== undefined) patch[k] = body[k];
      return { ok: true, item: store.update(it.id, patch, "update") };
    }
    case "delete":
      store.remove(it.id, "delete"); // a tap on Delete in the page, which asks first
      return { ok: true };
    case "plan":
      return planMyWeek(now);
    case "accept":
    case "reject":
      return reviewPlan({ action: op, which: body.which || "" });
    default:
      return { ok: false, error: "Unknown change." };
  }
}

/** For the morning briefing: homework due today and tomorrow, and today's free time. */
export async function briefingPart(now = new Date()) {
  const tz = cfg().tz;
  const t = today(now, tz);
  const [dueToday, dueTomorrow] = await Promise.all([listDue({ range: "today" }, now), listDue({ range: "tomorrow" }, now)]);
  const cal = await calendarFor(t, t);
  const free = findFree({ items: store.list(), calendar: cal.blocks, now, from: t, to: t, minutes: 15, cfg: cfg() });
  const freeMinutes = free.reduce((a, b) => a + b.minutes, 0);
  const longest = free.reduce((a, b) => (b.minutes > (a?.minutes || 0) ? b : a), null);
  return {
    ok: true,
    dueToday: dueToday.homework.map((h) => ({ title: h.title, minutes: h.minutes, overdue: h.overdue })),
    dueTomorrow: dueTomorrow.homework.map((h) => ({ title: h.title, minutes: h.minutes })),
    freeToday: hours(freeMinutes),
    longestFree: longest ? `${sayTime(localOf(longest.start, tz).time)} to ${sayTime(localOf(longest.end, tz).time)}` : null,
  };
}

export { store };
