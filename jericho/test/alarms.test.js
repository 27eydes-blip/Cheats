// Alarms: Eastern time parsing, passed times going to tomorrow, daylight saving edges,
// persistence, repeats, snooze, the scheduled-task name guard, ringing and the kill switch.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-alarms-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const T = await import("../server/alarms/time.js");
const { AlarmStore } = await import("../server/alarms/store.js");
const { AlarmManager } = await import("../server/alarms/manager.js");
const W = await import("../server/alarms/wake.js");
const { cancelAll } = await import("../server/cancel.js");
const { alarmCommand, snoozeMinutes } = await import("../public/alarmrules.js");
const { tools, isRisky } = await import("../server/tools/index.js");

const TZ = "America/Detroit";
const at = (iso) => new Date(iso);
const local = (d) => `${d.toLocaleDateString("en-CA", { timeZone: TZ })} ${T.clockText(d, TZ)}`;

test("Eastern time parsing", () => {
  const cases = { "7": [7, 0], "7am": [7, 0], "7:30 pm": [19, 30], "7:30 P.M.": [19, 30], "19:30": [19, 30], "0730": [7, 30], "6.45am": [6, 45], noon: [12, 0], midnight: [0, 0], "12am": [0, 0], "12 pm": [12, 0], "7 in the morning": [7, 0], "8 o'clock at night": [20, 0], "9:15": [9, 15] };
  for (const [text, [h, m]] of Object.entries(cases)) assert.deepEqual(T.parseClock(text), { hour: h, minute: m }, text);
  for (const bad of ["", "soon", "25:00", "7:75", "13pm"]) assert.equal(T.parseClock(bad), null, bad);
  // the same wall clock time is a different UTC instant in winter and summer
  assert.equal(T.zonedTime(2026, 11, 24, 7, 0, TZ).toISOString(), "2026-11-24T12:00:00.000Z"); // EST, UTC-5
  assert.equal(T.zonedTime(2026, 7, 1, 7, 0, TZ).toISOString(), "2026-07-01T11:00:00.000Z"); // EDT, UTC-4
});

test("a time that has already passed today goes to tomorrow", () => {
  const now = at("2026-11-23T14:00:00Z"); // Monday 9:00 AM EST
  assert.equal(local(T.nextOccurrence({ hour: 10, minute: 0 }, now, TZ)), "2026-11-23 10:00 AM");
  assert.equal(local(T.nextOccurrence({ hour: 8, minute: 0 }, now, TZ)), "2026-11-24 8:00 AM");
  assert.equal(local(T.nextOccurrence({ hour: 9, minute: 0 }, now, TZ)), "2026-11-24 9:00 AM", "exactly now counts as passed");
  assert.equal(T.describeTime(T.nextOccurrence({ hour: 8, minute: 0 }, now, TZ), now, TZ), "tomorrow, Tuesday, November 24 at 8:00 AM");
  // late evening: "1 AM" is tomorrow, and near midnight the Eastern date (not UTC) decides
  const lateEve = at("2026-11-24T04:30:00Z"); // Monday 11:30 PM EST (already Tuesday in UTC)
  assert.equal(local(T.nextOccurrence({ hour: 23, minute: 45 }, lateEve, TZ)), "2026-11-23 11:45 PM");
  assert.equal(local(T.nextOccurrence({ hour: 1, minute: 0 }, lateEve, TZ)), "2026-11-24 1:00 AM");
});

test("daylight saving edges", () => {
  // spring forward (Sun Mar 8 2026): 2:30 AM doesn't exist, so it rings at 3:30 AM EDT
  const gap = T.zonedTime(2026, 3, 8, 2, 30, TZ);
  assert.equal(gap.toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(T.clockText(gap, TZ), "3:30 AM");
  // fall back (Sun Nov 1 2026): 1:30 AM happens twice; it rings the first time (EDT)
  assert.equal(T.zonedTime(2026, 11, 1, 1, 30, TZ).toISOString(), "2026-11-01T05:30:00.000Z");
  // a daily 7:00 AM alarm stays at 7:00 local time across both changes
  const sat = at("2026-03-07T13:00:00Z"); // Sat 8:00 AM EST
  const daily = { hour: 7, minute: 0, repeat: "daily", fireAt: "2026-03-07T12:00:00Z" };
  const sunday = T.advance(daily, sat, TZ);
  assert.equal(sunday.toISOString(), "2026-03-08T11:00:00.000Z"); // 7:00 EDT
  assert.equal(T.clockText(sunday, TZ), "7:00 AM");
  const beforeFallBack = { hour: 7, minute: 0, repeat: "daily", fireAt: "2026-10-31T11:00:00Z" };
  const nov1 = T.advance(beforeFallBack, at("2026-10-31T12:00:00Z"), TZ);
  assert.equal(nov1.toISOString(), "2026-11-01T12:00:00.000Z"); // 7:00 EST
  // set on the evening before spring forward, for 2:30: rings 3:30 that night, not a day late
  assert.equal(local(T.nextOccurrence({ hour: 2, minute: 30 }, at("2026-03-08T03:00:00Z"), TZ)), "2026-03-08 3:30 AM");
});

test("repeats advance: daily, weekdays skip the weekend, once is done", () => {
  const fri = at("2026-11-27T12:05:00Z"); // Friday 7:05 AM EST, just after it rang
  const weekdays = { hour: 7, minute: 0, repeat: "weekdays", fireAt: "2026-11-27T12:00:00Z" };
  assert.equal(local(T.advance(weekdays, fri, TZ)), "2026-11-30 7:00 AM"); // Monday
  assert.equal(local(T.advance({ ...weekdays, repeat: "daily" }, fri, TZ)), "2026-11-28 7:00 AM");
  assert.equal(T.advance({ ...weekdays, repeat: "once" }, fri, TZ), null);
  // weekdays set on a Saturday: Monday
  assert.equal(local(T.nextOccurrence({ hour: 6, minute: 30, repeat: "weekdays" }, at("2026-11-28T15:00:00Z"), TZ)), "2026-11-30 6:30 AM");
});

test("snooze math", () => {
  const now = at("2026-11-24T12:00:00Z");
  assert.equal(T.snoozeUntil(now).toISOString(), "2026-11-24T12:09:00.000Z", "default 9 minutes");
  assert.equal(T.snoozeUntil(now, 15).toISOString(), "2026-11-24T12:15:00.000Z");
  assert.equal(T.snoozeUntil(now, 500).toISOString(), "2026-11-24T13:00:00.000Z", "at most an hour");
  assert.equal(T.snoozeUntil(now, "nonsense").toISOString(), "2026-11-24T12:09:00.000Z");
  assert.deepEqual(alarmCommand("Jericho, snooze"), { action: "snooze", minutes: null });
  assert.deepEqual(alarmCommand("snooze for 15 minutes"), { action: "snooze", minutes: 15 });
  assert.deepEqual(alarmCommand("five more minutes"), { action: "snooze", minutes: 5 });
  assert.equal(snoozeMinutes("snooze for half an hour"), 30);
  assert.deepEqual(alarmCommand("Jericho, stop"), { action: "stop" });
  assert.deepEqual(alarmCommand("okay I'm up"), { action: "stop" });
  assert.equal(alarmCommand("what's the weather"), null);
  // his own voice reading the label isn't you
  assert.equal(alarmCommand("alarm stop by the pharmacy it's 7 am", { spoken: ["Alarm: stop by the pharmacy. It's 7:00 AM."] }), null);
});

test("the task name prefix guard", () => {
  assert.equal(W.isJerichoTaskName("Jericho Alarm 3"), true);
  for (const bad of ["Jericho Alarm", "Jericho Alarm x", "Jericho Alarm 3 & calc", "Jericho Alarm 3; Remove-Item C:\\", "jericho alarm 3", " Jericho Alarm 3", "Microsoft\\Windows\\Defrag", "Other Task", "Jericho Alarm 1234567890"]) {
    assert.equal(W.isJerichoTaskName(bad), false, bad);
  }
  assert.equal(W.taskName(12), "Jericho Alarm 12");
  for (const bad of [0, -1, 1.5, "3; calc", "abc"]) assert.throws(() => W.taskName(bad), String(bad));
  // the manual command has only the name, the fixed script and the time: no labels, no secrets
  const cmd = W.manualCommand(7, new Date(2026, 10, 24, 6, 58));
  assert.match(cmd, /^Register-ScheduledTask -TaskName 'Jericho Alarm 7' /);
  assert.match(cmd, /-WakeToRun/);
  assert.match(cmd, /alarm-wake\.ps1/);
  assert.match(cmd, /'2026-11-24 06:58'/);
  assert.equal(W.wakeTime("2026-11-24T12:00:00Z", 2, at("2026-11-24T10:00:00Z")).toISOString(), "2026-11-24T11:58:00.000Z");
  // the wake script runs nothing but starting Jericho and opening its page
  const script = fs.readFileSync(new URL("../scripts/alarm-wake.ps1", import.meta.url), "utf8");
  assert.doesNotMatch(script, /\$args|Invoke-Expression|iex\b|ANTHROPIC|ELEVENLABS|TWILIO|token/i);
});

test("wake timers: plain status from powercfg", () => {
  const out = (ac, dc) => `Power Setting GUID: bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d  (Allow wake timers)\n  Current AC Power Setting Index: 0x0000000${ac}\n  Current DC Power Setting Index: 0x0000000${dc}\n`;
  assert.equal(W.parseWakeTimers(out(1, 1)).status, "enabled");
  assert.equal(W.parseWakeTimers(out(0, 0)).status, "disabled");
  assert.equal(W.parseWakeTimers(out(2, 2)).status, "important-only");
  assert.equal(W.parseWakeTimers(out(1, 0)).status, "partly");
  assert.equal(W.parseWakeTimers("").status, "unknown");
  assert.match(W.parseWakeTimers(out(0, 0)).howTo, /Allow wake timers/);
});

// ---- persistence and the manager -------------------------------------------------------------
test("persistence: reload keeps alarms, drops long-past one-time ones, advances repeating ones", () => {
  const file = path.join(tmp, "reload.json");
  const now = at("2026-11-24T15:00:00Z"); // Tue 10:00 AM EST
  fs.writeFileSync(file, JSON.stringify({
    nextId: 6,
    alarms: [
      { id: 1, hour: 7, minute: 0, repeat: "once", fireAt: "2026-11-24T12:00:00Z", state: "ringing" }, // 3 h ago: dropped
      { id: 2, hour: 9, minute: 50, repeat: "once", fireAt: "2026-11-24T14:50:00Z" }, // 10 min ago: kept (rings now)
      { id: 3, hour: 7, minute: 0, repeat: "daily", fireAt: "2026-11-23T12:00:00Z" }, // missed: tomorrow 7:00
      { id: 4, hour: 18, minute: 0, repeat: "once", fireAt: "2026-11-24T23:00:00Z", label: "dinner" },
      { id: "bad", fireAt: "nope" },
    ],
  }));
  const store = new AlarmStore(file, TZ);
  const r = store.load(now);
  assert.deepEqual(r.dropped.map((a) => a.id), [1]);
  assert.deepEqual(r.advanced.map((a) => a.id), [3]);
  assert.deepEqual(store.list().map((a) => a.id), [2, 4, 3]);
  assert.equal(store.get(3).fireAt, "2026-11-25T12:00:00.000Z");
  assert.ok(store.list().every((a) => a.state === "scheduled"));
  // and it was written back, so a second restart sees the same
  const again = new AlarmStore(file, TZ);
  again.load(now);
  assert.deepEqual(again.list().map((a) => a.id), [2, 4, 3]);
  assert.equal(again.add({ hour: 8, minute: 0, repeat: "once", fireAt: "2026-11-25T13:00:00Z" }).id, 6, "ids keep counting");
});

function fakeManager(now) {
  const calls = [];
  const clock = { now };
  const wake = {
    supported: () => true,
    scheduleWake: async (a) => (calls.push(["schedule", a.id, a.fireAt]), { ok: true, status: "scheduled" }),
    removeWake: async (id) => (calls.push(["remove", id]), { ok: true, status: "removed" }),
    listWakeTasks: async () => ["Jericho Alarm 99"],
    TASK_PREFIX: "Jericho Alarm ",
  };
  const native = { playing: false, starts: 0, start() { this.playing = true; this.starts++; return true; }, stop() { this.playing = false; } };
  const store = new AlarmStore(path.join(tmp, `m-${Math.random()}.json`), TZ);
  const m = new AlarmManager({ store, tz: TZ, wakeTasks: wake, native, clock: () => clock.now });
  return { m, calls, clock, native };
}

test("set, ring, stop: a one-time alarm is removed with its wake task; a daily one moves on", async () => {
  const { m, calls, clock } = fakeManager(at("2026-11-23T14:00:00Z")); // Mon 9:00 AM
  const r = await m.set({ time: "7:00 AM", label: "gym" });
  assert.equal(r.alarm.when, "tomorrow, Tuesday, November 24 at 7:00 AM");
  const d = await m.set({ time: "6:30", repeat: "daily" });
  assert.deepEqual(calls.slice(0, 2).map((c) => c[0]), ["schedule", "schedule"]);
  const rings = [];
  m.on("ring", (a) => rings.push(a));
  clock.now = at("2026-11-24T11:30:00Z"); // 6:30 AM Tuesday
  m.tick(clock.now);
  assert.deepEqual(rings.map((a) => a.id), [d.alarm.id]);
  await m.stop();
  assert.equal(m.store.get(d.alarm.id).fireAt, "2026-11-25T11:30:00.000Z", "daily: tomorrow 6:30");
  clock.now = at("2026-11-24T12:00:00Z");
  m.tick(clock.now);
  assert.equal(rings.at(-1).label, "gym");
  await m.stop(r.alarm.id);
  assert.equal(m.store.get(r.alarm.id), null);
  assert.deepEqual(calls.at(-1), ["remove", r.alarm.id]);
  m.ringing.clear();
});

test("snooze moves only this ring; a ringing alarm stops with the kill switch; blocked sound plays the native one", async () => {
  const { m, clock, native } = fakeManager(at("2026-11-23T14:00:00Z"));
  const { alarm } = await m.set({ time: "9:30", repeat: "weekdays" });
  clock.now = at("2026-11-23T14:30:00Z");
  m.tick(clock.now);
  assert.equal(m.ringingIds().length, 1);
  const s = await m.snooze(null, 15);
  assert.equal(s.until, "2026-11-23T14:45:00.000Z");
  assert.equal(m.store.get(alarm.id).state, "scheduled");
  assert.equal(m.store.get(alarm.id).hour, 9, "its usual time is kept");
  clock.now = at("2026-11-23T14:45:00Z");
  m.tick(clock.now);
  assert.equal(m.ringingIds().length, 1, "rings again after the snooze");
  m.blocked();
  assert.equal(native.playing, true, "browser blocked sound: native alarm sound");
  cancelAll("test"); // "Jericho, stop" / the Stop button on the server side
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.ringingIds().length, 0);
  assert.equal(native.playing, false, "stopping also stops the native sound");
  assert.equal(local(new Date(m.store.get(alarm.id).fireAt)), "2026-11-24 9:30 AM", "weekdays: next day at the usual time");
});

test("cancel by number, label or all; leftover wake tasks are cleaned up", async () => {
  const { m, calls } = fakeManager(at("2026-11-23T14:00:00Z"));
  await m.set({ time: "7am", label: "gym" });
  await m.set({ time: "8am", label: "meds" });
  await m.set({ time: "9am" });
  assert.deepEqual((await m.cancel("meds")).map((a) => a.label), ["meds"]);
  assert.equal((await m.cancel("2")).length, 1);
  assert.equal((await m.cancel("nothing like this")).length, 0);
  assert.equal((await m.cancel("all")).length, 1);
  assert.equal(m.list().length, 0);
  await m.syncWakeTasks();
  assert.deepEqual(calls.at(-1), ["remove", 99], "a task with no alarm behind it is removed");
});

test("tools: your own alarms are set and cancelled with no yes, even all of them", () => {
  assert.equal(isRisky("cancel_alarm", { which: "all" }), false);
  assert.equal(isRisky("cancel_alarm", { which: "2" }), false);
  assert.equal(isRisky("set_alarm", { time: "7" }), false);
  for (const name of ["set_alarm", "list_alarms", "cancel_alarm"]) assert.ok(tools.has(name), name);
});

test("set_alarm through the brain: Jericho is handed the exact day and time to say", async () => {
  const { Brain } = await import("../server/brain.js");
  const { fakeClient, say, use } = await import("./fake-client.js");
  const client = fakeClient([use("a1", "set_alarm", { time: "6:45 AM", label: "gym", repeat: "weekdays" }), say("Done.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("al", "wake me at 6:45 on weekdays for the gym");
  assert.equal(r.awaitingConfirmation, false, "setting an alarm needs no yes");
  const result = JSON.parse(client.calls[1].messages.at(-1).content[0].content);
  assert.equal(result.ok, true);
  assert.match(result.say, /^Alarm set for (today|tomorrow|[A-Z][a-z]+day), .* at 6:45 AM, and every weekday after that, labelled gym\.$/);
  const { alarms } = await import("../server/alarms/manager.js");
  assert.equal(alarms.list().length, 1);
  // cancelling all just does it, and the result says what was cancelled
  const client2 = fakeClient([use("a2", "cancel_alarm", { which: "all" }), say("Cancelled.")]);
  const r2 = await new Brain({ client: client2 }).handle("al2", "cancel all my alarms");
  assert.equal(r2.awaitingConfirmation, false);
  assert.equal(alarms.list().length, 0);
  assert.match(client2.calls[1].messages.at(-1).content[0].content, /"cancelled":\[\{"when"/);
});
