// Overnight bug-fix pass: things that could hang, crash or leak.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-polish-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), briefing: { calendarIcsUrl: "" } }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");
process.env.JERICHO_NO_KEEPALIVE = "1";
process.env.CALENDAR_ICS_URL = "https://calendar.example.com/private-abc/basic.ics";

// every outside request must carry a timeout signal
const seenSignals = [];
globalThis.fetch = async (url, init = {}) => {
  seenSignals.push([new URL(String(url)).host, Boolean(init.signal)]);
  return new Response("nope", { status: 503 });
};

const { limit } = await import("../server/selftest.js");
const { getCalendar } = await import("../server/briefing/calendar.js");
const { getWeather, getForecast } = await import("../server/briefing/weather.js");
const { getMarkets } = await import("../server/briefing/markets.js");
const { clearCache } = await import("../server/briefing/cache.js");
const { AlarmManager } = await import("../server/alarms/manager.js");
const { AlarmStore } = await import("../server/alarms/store.js");

test("self-test: a check that hangs is reported as FAIL in time, and one that throws can't crash it", async () => {
  const keepAlive = setTimeout(() => {}, 5000); // (the server is always busy; a bare test isn't)
  const t0 = Date.now();
  const hung = await limit(new Promise(() => {}), 200);
  clearTimeout(keepAlive);
  assert.equal(hung.status, "FAIL");
  assert.match(hung.reason, /no answer within/);
  assert.ok(Date.now() - t0 < 1000);
  const threw = await limit(Promise.reject(new Error("boom")), 200);
  assert.deepEqual([threw.status, threw.reason], ["FAIL", "boom"]);
  assert.deepEqual(await limit(Promise.resolve({ status: "PASS", reason: "ok" }), 200), { status: "PASS", reason: "ok" });
  // the server starts the self-test after it's listening and catches anything it throws
  const index = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(index, /selfTestIsolated\(\)[\s\S]{0,600}\.catch\(/);
  assert.ok(index.indexOf("selfTestIsolated()") > index.indexOf("server.listen("), "never before listening");
  assert.match(index, /installCrashLog\(/, "background errors are logged, not fatal");
});

test("calendar, weather and market requests always have a timeout (so the HUD and tools can't hang)", async () => {
  clearCache();
  await getCalendar();
  await getWeather();
  await getForecast("tomorrow");
  await getMarkets();
  const hosts = new Set(seenSignals.map(([h]) => h));
  for (const h of ["calendar.example.com", "api.open-meteo.com", "query1.finance.yahoo.com", "stooq.com", "api.coingecko.com"]) assert.ok(hosts.has(h), h);
  assert.deepEqual(seenSignals.filter(([, has]) => !has), [], "every request had a signal");
});

test("an alarm still rings when its file can't be saved (full disk), and the error is logged", async () => {
  const store = new AlarmStore(path.join(tmp, "alarms.json"));
  let now = new Date("2026-11-23T14:00:00Z");
  const m = new AlarmManager({
    store,
    wakeTasks: { supported: () => false, scheduleWake: async () => ({ ok: false, status: "not-windows" }), removeWake: async () => ({ ok: false }), listWakeTasks: async () => [] },
    native: { playing: false, start() {}, stop() {} },
    clock: () => now,
  });
  await m.set({ time: "9:30" });
  store.save = () => {
    throw new Error("ENOSPC: no space left on device");
  };
  const rang = [];
  m.on("ring", (a) => rang.push(a.id));
  now = new Date("2026-11-23T14:30:00Z");
  assert.doesNotThrow(() => m.tick(now));
  assert.equal(rang.length, 1, "it rang anyway");
  for (const r of m.ringing.values()) {
    clearTimeout(r.ackTimer);
    clearTimeout(r.maxTimer);
  }
});

test("the page: speech can't get stuck, events reconnect, the settings panel scrolls", () => {
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /speechQueue\.then\(\(\) => playTurn\(turn\)\)\.catch/, "a failed reply doesn't block later ones");
  assert.match(app, /stalled mid-sentence/, "a stream that stops moving falls back to the browser voice");
  assert.match(app, /const guard = setTimeout\(\(\) => resolve\(\), 6000 \+ text\.length \* 120\)/, "browser voice can't wait forever");
  assert.match(app, /events\.onopen = \(\) => \{\s*refreshAlarmList\(\)/, "an alarm missed during a drop still rings");
  const css = fs.readFileSync(new URL("../public/presence.css", import.meta.url), "utf8");
  assert.match(css, /\.look-panel \{[^}]*overflow-y: auto/);
  const scene = fs.readFileSync(new URL("../public/presence/scene.js", import.meta.url), "utf8");
  assert.match(scene, /if \(capped && now - last < 1000 \/ 30 - 2\) return;/, "30 fps when calm (and while an alarm rings)");
  assert.match(scene, /const restful = !alarmOn && !powering/, "calm never includes powering up");
});
