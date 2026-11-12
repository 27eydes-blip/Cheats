import { test } from "node:test";
import assert from "node:assert/strict";
import { isSummer, localTime, openStatus, parseHours, pickHoursSpec, validateHours, weeklyTable, type LocalTime } from "../src/lib/hours.ts";

const at = (weekday: number, hh: number, mm = 0): LocalTime => ({ weekday, minutes: hh * 60 + mm, mmdd: "07-04", ymd: "2026-07-04" });

test("parses ranges, lists and overrides", () => {
  const w = parseHours("daily 09:00-17:00; sun closed; fri-sat 09:00-23:00");
  assert.deepEqual(w[0], []);
  assert.deepEqual(w[1], [[540, 1020]]);
  assert.deepEqual(w[5], [[540, 1380]]);
  assert.deepEqual(parseHours("weekends 10:00-14:00")[6], [[600, 840]]);
  assert.deepEqual(parseHours("fri-mon 10:00-11:00")[0], [[600, 660]]); // wraps across Sunday
});

test("validates bad specs", () => {
  assert.equal(validateHours(""), null);
  assert.match(validateHours("mon 9-5")!, /Bad/);
  assert.match(validateHours("funday 09:00-10:00")!, /Unknown day/);
  assert.match(validateHours("closed")!, /Missing hours/);
});

test("open / closing soon / closed", () => {
  const spec = "mon-fri 08:00-21:00; sat-sun closed";
  assert.equal(openStatus(spec, at(1, 12)).state, "open");
  assert.equal(openStatus(spec, at(1, 12)).label, "Open now · until 9 PM");
  assert.equal(openStatus(spec, at(1, 20, 15)).state, "closing");
  assert.equal(openStatus(spec, at(1, 21)).state, "closed");
  assert.equal(openStatus(spec, at(1, 7)).label, "Closed · opens 8 AM");
  assert.equal(openStatus(spec, at(5, 22)).label, "Closed · opens Mon 8 AM");
  assert.equal(openStatus(spec, at(0, 22)).label, "Closed · opens tomorrow 8 AM");
  assert.equal(openStatus(null, at(1, 12)).state, "unknown");
});

test("spans past midnight count on the next day", () => {
  const spec = "thu-sat 22:00-04:00";
  assert.equal(openStatus(spec, at(4, 23)).state, "open"); // Thu 11pm
  assert.equal(openStatus(spec, at(5, 1)).state, "open"); // Fri 1am (from Thu)
  assert.equal(openStatus(spec, at(5, 3, 30)).state, "closing");
  assert.equal(openStatus(spec, at(0, 2)).state, "open"); // Sun 2am (from Sat)
  assert.equal(openStatus(spec, at(1, 1)).state, "closed"); // Mon 1am
});

test("24h", () => {
  assert.equal(openStatus("daily 24h", at(3, 3)).label, "Open 24 hours");
  assert.equal(weeklyTable("daily 24h")[0].text, "24 hours");
});

test("seasons", () => {
  assert.ok(isSummer("07-04", "05-22", "09-08"));
  assert.ok(!isSummer("10-01", "05-22", "09-08"));
  assert.ok(isSummer("01-10", "12-01", "02-28")); // wraps new year
  const l = { hours_default: "daily 10:00-18:00", hours_summer: "daily 08:00-22:00", hours_offseason: null };
  assert.equal(pickHoursSpec(l, true), "daily 08:00-22:00");
  assert.equal(pickHoursSpec(l, false), "daily 10:00-18:00");
});

test("localTime respects timezone", () => {
  // 2026-07-04T02:30Z = Jul 3, 10:30pm in New York (EDT, UTC-4), a Friday
  const t = localTime("America/New_York", new Date("2026-07-04T02:30:00Z"));
  assert.equal(t.weekday, 5);
  assert.equal(t.minutes, 22 * 60 + 30);
  assert.equal(t.mmdd, "07-03");
});
