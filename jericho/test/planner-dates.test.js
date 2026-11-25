// Planner date parsing, in America/Detroit. Pure functions: no files, timers, ports or network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, at, extractTime, localOf, parseDate, parseDays, parseDuration, parseHHMM, parseWhen, sayDate, today, weekStart, weekday } from "../server/planner/dates.js";

// Wednesday, November 25, 2026, 10:00 AM in Detroit (15:00 UTC)
const WED = new Date("2026-11-25T15:00:00Z");

test("today, tomorrow, weekdays and relative days", () => {
  assert.equal(today(WED), "2026-11-25");
  assert.equal(today(new Date("2026-11-26T03:30:00Z")), "2026-11-25", "10:30 PM in Detroit is still Wednesday");
  const d = (t) => parseDate(t, WED).date;
  assert.equal(d("today"), "2026-11-25");
  assert.equal(d("tonight"), "2026-11-25");
  assert.equal(d("tomorrow"), "2026-11-26");
  assert.equal(d("day after tomorrow"), "2026-11-27");
  assert.equal(d("friday"), "2026-11-27");
  assert.equal(d("this Friday"), "2026-11-27");
  assert.equal(d("on monday"), "2026-11-30");
  assert.equal(d("Sat"), "2026-11-28");
  assert.equal(d("in 3 days"), "2026-11-28");
  assert.equal(d("in a week"), "2026-12-02");
  assert.equal(d("this weekend"), "2026-11-28");
});

test("explicit dates: month names, slashes, ISO, and next year when it's long past", () => {
  const d = (t) => parseDate(t, WED).date;
  assert.equal(d("Nov 30"), "2026-11-30");
  assert.equal(d("November 30th"), "2026-11-30");
  assert.equal(d("the 3rd of December"), "2026-12-03");
  assert.equal(d("12/3"), "2026-12-03");
  assert.equal(d("12/3/27"), "2027-12-03");
  assert.equal(d("2026-12-01"), "2026-12-01");
  assert.equal(d("January 5"), "2027-01-05", "January is next year");
  assert.equal(d("Nov 22"), "2026-11-22", "a few days ago stays this year");
  assert.equal(parseDate("Feb 30", WED).ok, false);
});

test("ambiguous dates ask one short question with both options", () => {
  const nextFri = parseDate("next Friday", WED);
  assert.equal(nextFri.ok, false);
  assert.match(nextFri.ask, /^Do you mean Friday, November 27, or Friday, December 4\?$/);
  assert.deepEqual(nextFri.options, ["2026-11-27", "2026-12-04"]);
  const sameDay = parseDate("Wednesday", WED);
  assert.deepEqual(sameDay.options, ["2026-11-25", "2026-12-02"], "today, or a week from today?");
  assert.match(sameDay.ask, /today, Wednesday, November 25/);
  assert.equal(parseDate("next Monday", WED).date, "2026-11-30", "next week's Monday is clear");
  assert.equal(parseDate("next week", WED).ask, "Which day next week?");
  assert.equal(parseDate("someday", WED).ok, false);
});

test("times: am/pm, noon, midnight, end of day, and bare hours on a school day", () => {
  assert.equal(extractTime("friday at 3pm").time, "15:00");
  assert.equal(extractTime("friday at 3").time, "15:00", "1 to 6 means afternoon");
  assert.equal(extractTime("at 9").time, "09:00", "7 to 11 means morning");
  assert.equal(extractTime("at 9 at night").time, "21:00");
  assert.equal(extractTime("11:59 p.m.").time, "23:59");
  assert.equal(extractTime("by noon").time, "12:00");
  assert.equal(extractTime("by midnight").time, "23:59", "due at midnight means the end of that day");
  assert.equal(extractTime("end of day").time, "23:59");
  assert.equal(extractTime("14:30").time, "14:30");
  assert.equal(extractTime("tomorrow").time, null);
});

test("parseWhen: Detroit instants, daylight saving included, with a default time", () => {
  const w = parseWhen("tomorrow at 3", WED);
  assert.deepEqual([w.date, w.time, w.timed, w.at], ["2026-11-26", "15:00", true, "2026-11-26T20:00:00.000Z"]);
  const due = parseWhen("friday", WED, { defaultTime: "23:59" });
  assert.equal(due.at, "2026-11-28T04:59:00.000Z");
  assert.equal(due.timed, false);
  // summer: Detroit is UTC-4
  assert.equal(at("2026-07-01", "09:00").toISOString(), "2026-07-01T13:00:00.000Z");
  // the fall-back night: 1:30 AM happens twice; the first one is used
  assert.equal(at("2026-11-01", "01:30").toISOString(), "2026-11-01T05:30:00.000Z");
  assert.deepEqual(localOf("2026-11-26T20:00:00.000Z"), { date: "2026-11-26", time: "15:00" });
});

test("durations, days of the week and class times", () => {
  for (const [t, m] of [["90 minutes", 90], ["an hour and a half", 90], ["1.5 hours", 90], ["half an hour", 30], ["40 min", 40], ["2 hours", 120], ["an hour", 60], ["45", 45], ["", null], ["soon", null]]) assert.equal(parseDuration(t), m, t);
  assert.deepEqual(parseDays("MWF"), [1, 3, 5]);
  assert.deepEqual(parseDays("TR"), [2, 4]);
  assert.deepEqual(parseDays("tues and thurs"), [2, 4]);
  assert.deepEqual(parseDays("Mondays and Wednesdays"), [1, 3]);
  assert.deepEqual(parseDays("weekdays"), [1, 2, 3, 4, 5]);
  for (const [t, hhmm] of [["9", "09:00"], ["9:30 am", "09:30"], ["2pm", "14:00"], ["1:30", "13:30"], ["14:00", "14:00"], ["10:15", "10:15"], ["09:00", "09:00"]]) assert.equal(parseHHMM(t), hhmm, t);
});

test("calendar helpers: weeks start Monday, weekday numbers, spoken dates", () => {
  assert.equal(weekStart("2026-11-25"), "2026-11-23");
  assert.equal(weekStart("2026-11-29"), "2026-11-23", "Sunday ends the week");
  assert.equal(weekday("2026-11-25"), 3);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(sayDate("2026-11-26", WED), "tomorrow, Thursday, November 26");
  assert.equal(sayDate("2026-12-04", WED), "Friday, December 4");
});
