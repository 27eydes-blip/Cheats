// The Planner's free-time engine and the calendar merge. Pure functions over in-memory items:
// no files, timers, ports or network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { busyIntervals, buildView, findFree, freeBlocks, occurrences, planWeek, plannerSettings, weekSummary } from "../server/planner/engine.js";
import { blocksBetween, parseIcs } from "../server/briefing/calendar.js";
import { at } from "../server/planner/dates.js";
import { blockBox, isoToLocal, layoutOverlaps, localToIso, slotAt } from "../public/plannerlayout.js";

const cfg = plannerSettings({ planner: { wakeStart: "07:00", wakeEnd: "22:00", timezone: "America/Detroit" } });
const WED_EARLY = new Date("2026-11-25T11:00:00Z"); // 6:00 AM Wednesday in Detroit, before waking hours
const iso = (date, hhmm) => at(date, hhmm).toISOString();

const classes = [
  { id: "c1", type: "class", title: "Calculus", days: [1, 3, 5], start: "09:00", end: "09:50" },
  { id: "c2", type: "class", title: "History", days: [2, 4], start: "13:00", end: "14:15" },
];

test("defaults: waking hours 7 AM to 10 PM in America/Detroit", () => {
  const d = plannerSettings({});
  assert.deepEqual([d.wakeStart, d.wakeEnd, d.tz], ["07:00", "22:00", "America/Detroit"]);
});

test("classes repeat weekly on their days; weekly events repeat; homework shows at its due time", () => {
  const items = [
    ...classes,
    { id: "e1", type: "event", title: "Soccer", start: iso("2026-11-23", "18:00"), end: iso("2026-11-23", "19:30"), repeat: "weekly", allDay: false },
    { id: "h1", type: "homework", title: "Worksheet", due: iso("2026-11-26", "23:59"), minutes: 40, done: false },
  ];
  const occ = occurrences(items, "2026-11-23", "2026-12-06", { now: WED_EARLY, cfg });
  assert.equal(occ.filter((o) => o.id === "c1").length, 6, "MWF for two weeks");
  assert.equal(occ.filter((o) => o.id === "c2").length, 4);
  assert.deepEqual(occ.filter((o) => o.id === "e1").map((o) => o.date), ["2026-11-23", "2026-11-30"]);
  const hw = occ.find((o) => o.id === "h1");
  assert.equal(hw.date, "2026-11-26");
  assert.equal(hw.overdue, false);
  assert.equal(occurrences(items, "2026-11-23", "2026-11-29", { now: new Date("2026-11-28T12:00:00Z"), cfg }).find((o) => o.id === "h1").overdue, true);
});

test("free time is waking hours minus classes, events and calendar; all-day events and drafts don't block", () => {
  const items = [
    ...classes,
    { id: "e2", type: "event", title: "Test", start: iso("2026-11-25", "00:00"), end: iso("2026-11-26", "00:00"), allDay: true },
    { id: "s1", type: "study_block", title: "Study draft", start: iso("2026-11-25", "15:00"), end: iso("2026-11-25", "16:00"), status: "draft" },
    { id: "s2", type: "study_block", title: "Study kept", start: iso("2026-11-25", "16:00"), end: iso("2026-11-25", "17:00"), status: "accepted" },
  ];
  const calendar = [{ title: "Dentist", start: iso("2026-11-25", "12:00"), end: iso("2026-11-25", "12:30"), allDay: false }];
  const occ = occurrences(items, "2026-11-25", "2026-11-25", { calendar, now: WED_EARLY, cfg });
  assert.equal(occ.find((o) => o.title === "Dentist").source, "calendar");
  assert.equal(occ.find((o) => o.title === "Dentist").readOnly, true);
  const free = freeBlocks("2026-11-25", busyIntervals(occ), { now: WED_EARLY, cfg });
  const spans = free.map((b) => [isoToLocal(b.start, cfg.tz).minutes, isoToLocal(b.end, cfg.tz).minutes]);
  assert.deepEqual(spans, [
    [7 * 60, 9 * 60],
    [9 * 60 + 50, 12 * 60],
    [12 * 60 + 30, 16 * 60],
    [17 * 60, 22 * 60],
  ]);
  assert.equal(free.reduce((a, b) => a + b.minutes, 0), 120 + 130 + 210 + 300);
});

test("today's free time starts from now; past days have none; tiny gaps are ignored", () => {
  const noon = new Date("2026-11-25T17:02:00Z"); // 12:02 PM
  const free = freeBlocks("2026-11-25", [], { now: noon, cfg });
  assert.equal(isoToLocal(free[0].start, cfg.tz).minutes, 12 * 60 + 5, "rounded up to 12:05");
  const view = buildView({ from: "2026-11-23", to: "2026-11-29", items: classes, now: noon, cfg });
  assert.equal(view.days[0].freeMinutes, 0, "Monday is past");
  const gap = freeBlocks("2026-11-27", [[at("2026-11-27", "07:00").getTime(), at("2026-11-27", "09:00").getTime()], [at("2026-11-27", "09:10").getTime(), at("2026-11-27", "22:00").getTime()]], { now: WED_EARLY, cfg });
  assert.deepEqual(gap, [], "a 10 minute gap isn't free time");
});

test("daylight saving: the fall-back day still has 15 waking hours", () => {
  const sunday = new Date("2026-10-31T12:00:00Z");
  const free = freeBlocks("2026-11-01", [], { now: sunday, cfg });
  assert.equal(free[0].minutes, 15 * 60);
});

test("find free time of at least N minutes", () => {
  const blocks = findFree({ items: classes, now: WED_EARLY, from: "2026-11-26", minutes: 90, cfg });
  assert.deepEqual(blocks.map((b) => [isoToLocal(b.start, cfg.tz).minutes / 60, isoToLocal(b.end, cfg.tz).minutes / 60]), [[7, 13], [14.25, 22]]);
  assert.equal(findFree({ items: classes, now: WED_EARLY, from: "2026-11-26", minutes: 9 * 60, cfg }).length, 0);
});

test("This week: homework by due date with overdue first, hours of work left, free hours per day", () => {
  const items = [
    ...classes,
    { id: "h1", type: "homework", title: "Late reading", due: iso("2026-11-24", "23:59"), minutes: 30, done: false },
    { id: "h2", type: "homework", title: "Worksheet", due: iso("2026-11-27", "23:59"), minutes: 40, done: false },
    { id: "h3", type: "homework", title: "Essay", due: iso("2026-11-26", "09:00"), minutes: 90, done: false },
    { id: "h4", type: "homework", title: "Quiz prep", due: iso("2026-11-26", "08:00"), minutes: 20, done: true },
    { id: "h5", type: "homework", title: "Next week", due: iso("2026-12-02", "23:59"), minutes: 60, done: false },
  ];
  const s = weekSummary({ items, now: WED_EARLY, cfg });
  assert.deepEqual(s.homework.map((h) => h.title), ["Late reading", "Quiz prep", "Essay", "Worksheet"]);
  assert.equal(s.homework[0].overdue, true);
  assert.equal(s.workLeftMinutes, 30 + 90 + 40);
  assert.deepEqual(s.freeByDay.map((d) => d.date), ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  assert.equal(s.freeByDay[3].freeMinutes, 15 * 60, "Saturday is wide open");
});

test("plan my week: drafts before each due date, in chunks with breaks, never over a class, and nothing saved", () => {
  const items = [
    ...classes,
    { id: "h1", type: "homework", title: "Essay", due: iso("2026-11-25", "12:00"), minutes: 150, done: false },
    { id: "h2", type: "homework", title: "Worksheet", due: iso("2026-11-27", "23:59"), minutes: 40, done: false },
    { id: "s0", type: "study_block", title: "Study: Worksheet", homeworkId: "h2", start: iso("2026-11-26", "07:00"), end: iso("2026-11-26", "07:20"), status: "accepted" },
  ];
  const before = JSON.stringify(items);
  const { drafts, shortfalls } = planWeek({ items, now: WED_EARLY, cfg });
  assert.equal(JSON.stringify(items), before, "the items themselves are untouched");
  assert.ok(drafts.every((d) => d.status === "draft" && d.type === "study_block"));
  const essay = drafts.filter((d) => d.homeworkId === "h1");
  const essayMinutes = essay.reduce((a, d) => a + (new Date(d.end) - new Date(d.start)) / 60000, 0);
  // Wednesday 7:00 to 9:00 before calculus, two chunks at most a day: 7:00-8:00, a 10 minute break, 8:10-9:00
  assert.equal(essayMinutes, 110);
  assert.deepEqual(shortfalls, [{ homeworkId: "h1", title: "Essay", minutesShort: 40 }]);
  assert.ok(essay.every((d) => new Date(d.end) <= new Date(iso("2026-11-25", "12:00"))), "all before it's due");
  const worksheet = drafts.filter((d) => d.homeworkId === "h2");
  assert.equal(worksheet.reduce((a, d) => a + (new Date(d.end) - new Date(d.start)) / 60000, 0), 20, "40 minutes less the 20 already accepted");
  // no draft overlaps a class or another draft
  const occ = occurrences(items, "2026-11-25", "2026-12-02", { now: WED_EARLY, cfg }).filter((o) => o.type === "class");
  const all = [...drafts.map((d) => [new Date(d.start), new Date(d.end)]), ...occ.map((o) => [new Date(o.start), new Date(o.end)])].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < all.length; i++) assert.ok(all[i][0] >= all[i - 1][1], "no overlaps");
  // a break after each chunk
  const wed = essay.map((d) => [new Date(d.start), new Date(d.end)]);
  assert.ok(wed[1][0] - wed[0][1] >= 10 * 60000);
});

test("your calendar link is merged read-only, with end times, across repeating events", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:1", "SUMMARY:Work shift", "DTSTART:20261124T170000", "DTEND:20261124T210000", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH", "END:VEVENT",
    "BEGIN:VEVENT", "UID:2", "SUMMARY:Thanksgiving", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261127", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blocks = blocksBetween(parseIcs(ics), "2026-11-23", "2026-11-29");
  const shifts = blocks.filter((b) => b.title === "Work shift");
  assert.equal(shifts.length, 2);
  assert.equal(new Date(shifts[0].end) - new Date(shifts[0].start), 4 * 3600_000);
  assert.equal(blocks.find((b) => b.title === "Thanksgiving").allDay, true);
});

test("page layout helpers: zone conversion, slots, boxes and side-by-side overlaps", () => {
  const tz = "America/Detroit";
  assert.equal(localToIso("2026-11-25", 15 * 60, tz), "2026-11-25T20:00:00.000Z");
  assert.equal(localToIso("2026-07-01", 9 * 60, tz), "2026-07-01T13:00:00.000Z");
  assert.deepEqual(isoToLocal("2026-11-25T20:00:00.000Z", tz), { date: "2026-11-25", minutes: 900 });
  assert.equal(slotAt(100, { pxPerMin: 0.9, startMin: 420, endMin: 1320 }), 420 + 105, "snapped to 15 minutes");
  assert.equal(slotAt(-50, { pxPerMin: 0.9, startMin: 420, endMin: 1320 }), 420);
  assert.deepEqual(blockBox(540, 600, { pxPerMin: 1, dayStart: 420, dayEnd: 1320 }), { top: 120, height: 60, clipped: false });
  assert.deepEqual(layoutOverlaps([{ start: 0, end: 60 }, { start: 30, end: 90 }, { start: 120, end: 150 }]), [{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 0, cols: 1 }]);
});
