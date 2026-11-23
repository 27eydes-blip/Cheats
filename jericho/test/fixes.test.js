// Fixes from real use: the calendar link, finding the claude command, and the multi-day forecast.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-fixes-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), briefing: { autoTime: "", calendarIcsUrl: "" }, claudeCode: { ...base.claudeCode, path: "/nowhere/claude", projectsDir: path.join(tmp, "projects") } }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");
process.env.JERICHO_NO_KEEPALIVE = "1";
const SECRET = "https://calendar.google.com/calendar/ical/me%40gmail.com/private-0123456789abcdef/basic.ics";
let calendarBody = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
let calendarStatus = 200;
let calendarDown = false;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("https://calendar.google.com/")) {
    if (calendarDown) throw new TypeError(`fetch failed for ${url}`); // errors can contain the link
    return new Response(calendarBody, { status: calendarStatus });
  }
  return new Response("nope", { status: 404 });
};

const { cleanCalendarLink, decodeEnvFile, parseEnvText } = await import("../server/config.js");
const { calendarSource, checkCalendar } = await import("../server/briefing/calendar.js");
const { findClaude, claudeSpawnSpec, escapeCmdArg, commonClaudeSpots } = await import("../server/tools/claudePath.js");
const { shapeForecast, pickForecastDays } = await import("../server/briefing/weather.js");
const { testCalendar, testClaudeCode } = await import("../server/selftest.js");
const { Brain } = await import("../server/brain.js");
const { fakeClient, say, use } = await import("./fake-client.js");

// ---- 1. calendar link ------------------------------------------------------------------------
test("calendar link cleaning: spaces, quotes, brackets, webcal, pasted twice", () => {
  const https = "https://p01-caldav.icloud.com/published/2/abc";
  for (const raw of [
    SECRET,
    `  ${SECRET}  `,
    `"${SECRET}"`,
    `'${SECRET}'`,
    `“${SECRET}”`,
    `<${SECRET}>`,
    `CALENDAR_ICS_URL=${SECRET}`,
    `" ${SECRET}\n"`,
  ]) assert.equal(cleanCalendarLink(raw), SECRET, JSON.stringify(raw));
  assert.equal(cleanCalendarLink("webcal://p01-caldav.icloud.com/published/2/abc"), https);
  assert.equal(cleanCalendarLink('"webcals://p01-caldav.icloud.com/published/2/abc"'), https);
  for (const empty of [undefined, null, "", "   ", '""', "''"]) assert.equal(cleanCalendarLink(empty), "", JSON.stringify(empty));
});

test("calendar link source: .env first, then settings.json; blank counts as not set", () => {
  assert.deepEqual(calendarSource({ CALENDAR_ICS_URL: ` "${SECRET}" ` }, { briefing: { calendarIcsUrl: "" } }), { url: SECRET, from: ".env" });
  assert.deepEqual(calendarSource({ CALENDAR_ICS_URL: "  " }, { briefing: { calendarIcsUrl: `webcal://x.example.com/a.ics` } }), { url: "https://x.example.com/a.ics", from: "settings.json" });
  assert.deepEqual(calendarSource({}, {}), { url: "", from: "" });
});

test(".env saved by Windows editors still loads: BOM, UTF-16, quotes, comments", () => {
  const text = 'ANTHROPIC_API_KEY=abc\r\nCALENDAR_ICS_URL="https://a.example.com/x.ics"\r\n# comment\r\nEMPTY=\r\nNOTE=hi # trailing\r\n';
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  for (const buf of [Buffer.from(text), bom, utf16, Buffer.from(text, "utf16le")]) {
    const env = parseEnvText(decodeEnvFile(buf).text);
    assert.equal(env.CALENDAR_ICS_URL, "https://a.example.com/x.ics");
    assert.equal(env.ANTHROPIC_API_KEY, "abc");
    assert.equal(env.NOTE, "hi");
  }
  assert.match(decodeEnvFile(utf16).note, /UTF-16/);
});

test("calendar check: PASS with today's count, FAIL with a plain reason, never the link", async () => {
  delete process.env.CALENDAR_ICS_URL;
  let r = await checkCalendar();
  assert.equal(r.status, "FAIL");
  assert.match(r.reason, /^not set/);

  process.env.CALENDAR_ICS_URL = ` '${SECRET.replace("https://", "webcal://")}' `;
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  calendarBody = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", `DTSTART:${ymd}T090000`, "SUMMARY:Standup", "END:VEVENT", "BEGIN:VEVENT", `DTSTART;VALUE=DATE:${ymd}`, "SUMMARY:Holiday", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  r = await checkCalendar();
  assert.equal(r.status, "PASS");
  assert.match(r.reason, /^2 events today/);

  calendarBody = "<html>Not found</html>";
  r = await checkCalendar();
  assert.equal(r.status, "FAIL");
  assert.match(r.reason, /not a valid calendar/);

  calendarStatus = 404;
  r = await checkCalendar();
  assert.match(r.reason, /link unreachable \(the calendar server answered 404\)/);

  calendarStatus = 200;
  calendarDown = true;
  r = await testCalendar();
  assert.match(r.reason, /link unreachable/);
  calendarDown = false;

  process.env.CALENDAR_ICS_URL = "calendar.google.com/not-a-link";
  r = await checkCalendar();
  assert.match(r.reason, /isn't a web address/);

  const logFile = path.join(tmp, "actions.log");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  assert.doesNotMatch(log, /private-0123456789abcdef/);
});

// ---- 2. finding claude -------------------------------------------------------------------------
const winEnv = {
  USERPROFILE: "C:\\Users\\Sam",
  APPDATA: "C:\\Users\\Sam\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\Sam\\AppData\\Local",
  PATH: "C:\\Windows\\system32;\"C:\\Program Files\\nodejs\"",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  ComSpec: "C:\\Windows\\system32\\cmd.exe",
};
const has = (...files) => (f) => files.map((x) => x.toLowerCase()).includes(f.toLowerCase());

test("claude on the PATH wins (Windows and Mac/Linux)", () => {
  const r = findClaude({ platform: "win32", env: winEnv, exists: has("C:\\Program Files\\nodejs\\claude.cmd") });
  assert.deepEqual([r.found, r.path, r.via], [true, "C:\\Program Files\\nodejs\\claude.cmd", "PATH"]);
  const u = findClaude({ platform: "linux", env: { PATH: "/usr/bin:/opt/x/bin" }, home: "/home/sam", exists: has("/opt/x/bin/claude") });
  assert.deepEqual([u.found, u.path], [true, "/opt/x/bin/claude"]);
});

test("claude in the usual Windows install folders, in order", () => {
  const spots = commonClaudeSpots({ platform: "win32", env: winEnv });
  assert.deepEqual(spots.slice(0, 3), [
    "C:\\Users\\Sam\\.local\\bin\\claude.exe",
    "C:\\Users\\Sam\\AppData\\Roaming\\npm\\claude.cmd",
    "C:\\Users\\Sam\\AppData\\Local\\Programs\\claude\\claude.exe",
  ]);
  for (const spot of spots.slice(0, 3)) {
    const r = findClaude({ platform: "win32", env: winEnv, exists: has(spot) });
    assert.deepEqual([r.found, r.path, r.via], [true, spot, "install folder"], spot);
  }
  const both = findClaude({ platform: "win32", env: winEnv, exists: has(spots[0], spots[1]) });
  assert.equal(both.path, spots[0], ".exe in .local\\bin comes first");
});

test("claudeCode.path overrides everything; a folder works too; a wrong path says so", () => {
  const exe = "D:\\Tools\\claude\\claude.exe";
  assert.equal(findClaude({ platform: "win32", env: winEnv, setting: `"${exe}"`, exists: has(exe, "C:\\Users\\Sam\\.local\\bin\\claude.exe") }).path, exe);
  assert.equal(findClaude({ platform: "win32", env: winEnv, setting: "D:\\Tools\\claude", exists: has(exe) }).path, exe);
  const bad = findClaude({ platform: "win32", env: winEnv, setting: "D:\\nope\\claude.exe", exists: has("C:\\Users\\Sam\\.local\\bin\\claude.exe") });
  assert.equal(bad.found, false);
  assert.match(bad.reason, /claudeCode\.path/);
});

test("not found anywhere: a clear reason", () => {
  const r = findClaude({ platform: "win32", env: winEnv, exists: () => false });
  assert.equal(r.found, false);
  assert.match(r.reason, /isn't installed or isn't on the PATH/);
  assert.ok(r.tried.length > 5);
});

test("claude.cmd runs through cmd.exe /c with escaped fixed arguments; claude.exe runs directly", () => {
  const cmd = claudeSpawnSpec({ path: "C:\\Users\\Sam\\AppData\\Roaming\\npm\\claude.cmd" }, ["-p", "--output-format", "json"], { platform: "win32", env: winEnv });
  assert.equal(cmd.command, "C:\\Windows\\system32\\cmd.exe");
  assert.deepEqual(cmd.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.equal(cmd.args.length, 4, "one command line, built only from the path and fixed arguments");
  assert.equal(cmd.options.windowsVerbatimArguments, true);
  assert.ok(cmd.viaCmd);
  const exe = claudeSpawnSpec({ path: "C:\\Users\\Sam\\.local\\bin\\claude.exe" }, ["-p", "do it"], { platform: "win32", env: winEnv });
  assert.deepEqual([exe.command, exe.args, exe.viaCmd], ["C:\\Users\\Sam\\.local\\bin\\claude.exe", ["-p", "do it"], false]);
  // anything cmd would treat as a command is escaped
  for (const evil of ["a & del /q *", "x | calc", "%PATH%", "\"quoted\" & echo hi", "!x!", "a > b"]) {
    const e = escapeCmdArg(evil);
    assert.doesNotMatch(e.replace(/\^./g, ""), /[&|%!<>"]/, evil);
  }
});

// ---- 3. multi-day forecast ---------------------------------------------------------------------
const FORECAST = {
  current: { temperature_2m: 40, apparent_temperature: 35, weather_code: 3 },
  daily: {
    time: ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"], // Monday...Sunday
    temperature_2m_max: [45.4, 52.2, 38, 60, 41, 33, 35],
    temperature_2m_min: [30, 40.6, 25, 50, 30, 20, 22],
    precipitation_probability_max: [10, 80, 0, 40, 20, 5, 70],
    weather_code: [3, 61, 0, 2, 3, 73, 61],
  },
};

test("forecast parsing: one entry per day with high, low, rain, sky and advice", () => {
  const days = shapeForecast(FORECAST, { units: "fahrenheit", name: "Birmingham, Michigan" });
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.label), ["today", "tomorrow", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  assert.deepEqual([days[1].high, days[1].low, days[1].rain, days[1].sky, days[1].advice], [52, 41, 80, "rainy", "Take an umbrella."]);
  assert.equal(days[5].advice, "Snow's likely, so leave extra time.");
  assert.throws(() => shapeForecast({ daily: {} }));
});

test("which days a question is about", () => {
  const days = shapeForecast(FORECAST, { units: "fahrenheit" });
  const pick = (w) => pickForecastDays(days, w).map((d) => d.weekday);
  assert.deepEqual(pick("what's the weather tomorrow"), ["Tuesday"]);
  assert.deepEqual(pick("will it rain this weekend"), ["Saturday", "Sunday"]);
  assert.deepEqual(pick("weather for Friday"), ["Friday"]);
  assert.deepEqual(pick("today"), ["Monday"]);
  assert.deepEqual(pick("next few days"), ["Tuesday", "Wednesday", "Thursday"]);
  assert.equal(pick("this week").length, 7);
  assert.deepEqual(pick("monday"), ["Monday"], "today's weekday is today");
  assert.deepEqual(pick("next monday"), [], "beyond the 7 days");
  const fromSunday = shapeForecast({ ...FORECAST, daily: { ...FORECAST.daily, time: ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"] } }, { units: "fahrenheit" });
  assert.deepEqual(pickForecastDays(fromSunday, "this weekend").map((d) => d.weekday), ["Sunday"], "on Sunday, this weekend is today");
});

test("claude missing: Jericho says so and names the fix, without asking for a yes", async () => {
  const client = fakeClient([use("t1", "claude_code", { folder: "app", task: "build it" }), say("I can't find Claude Code.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("cc", "build me an app");
  assert.equal(r.awaitingConfirmation, false);
  const result = client.calls[1].messages.at(-1).content[0];
  assert.match(result.content, /can't find the claude command/);
  assert.match(result.content, /claudeCode\.path/);
  assert.match(result.content, /Install Claude Code/);
  const st = await testClaudeCode({ path: "/nowhere/claude" });
  assert.equal(st.status, "FAIL");
  assert.match(st.reason, /Install Claude Code/);
});
