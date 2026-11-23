// Morning briefing, web search and the daily offer. The network is faked, so no live data is needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-brief-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
const SECRET_URL = "https://calendar.example.com/private-abc123secret/basic.ics";
fs.writeFileSync(
  settingsFile,
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), briefing: { autoTime: "00:00", name: "Sammy", calendarIcsUrl: "" } }),
);
process.env.JERICHO_SETTINGS = settingsFile;
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");
process.env.JERICHO_NO_KEEPALIVE = "1";
process.env.CALENDAR_ICS_URL = SECRET_URL.replace("https://", "webcal://");

// ---- fake network ---------------------------------------------------------------------------
const down = new Set();
let hits = [];
const ok = (body, type = "application/json") => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": type } });
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const ymd = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const lastWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:a", `DTSTART:${ymd(d)}T090000`, `DTEND:${ymd(d)}T093000`, "SUMMARY:Standup with the", "  team", "END:VEVENT",
  "BEGIN:VEVENT", "UID:b", `DTSTART;VALUE=DATE:${ymd(d)}`, "SUMMARY:Mom's birthday", "END:VEVENT",
  "BEGIN:VEVENT", "UID:c", `DTSTART:${ymd(d)}T150000`, "SUMMARY:Cancelled thing", "STATUS:CANCELLED", "END:VEVENT",
  // weekly gym, moved today from 6pm to 7pm
  "BEGIN:VEVENT", "UID:gym", `DTSTART:${ymd(lastWeek)}T180000`, "RRULE:FREQ=WEEKLY", "SUMMARY:Gym", "END:VEVENT",
  "BEGIN:VEVENT", "UID:gym", `RECURRENCE-ID:${ymd(d)}T180000`, `DTSTART:${ymd(d)}T190000`, "SUMMARY:Gym", "END:VEVENT",
  // daily reading, skipped tomorrow
  "BEGIN:VEVENT", "UID:read", `DTSTART:${ymd(lastWeek)}T070000`, "RRULE:FREQ=DAILY", `EXDATE:${ymd(tomorrow)}T070000`, "SUMMARY:Reading", "END:VEVENT",
  "BEGIN:VEVENT", "UID:dent", `DTSTART:${ymd(tomorrow)}T080000`, "SUMMARY:Dentist", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const WEATHER = {
  current: { temperature_2m: 41.4, apparent_temperature: 35.2, weather_code: 3 },
  daily: { temperature_2m_max: [48.6], temperature_2m_min: [33.1], precipitation_probability_max: [20], weather_code: [3] },
};
const yahooChart = (price, prev) => ({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev } }] } });
globalThis.fetch = async (input) => {
  const url = String(input);
  const host = new URL(url).host;
  hits.push(host);
  if (down.has(host)) throw new TypeError("fetch failed");
  if (host === "calendar.example.com") return ok(ICS, "text/calendar");
  if (host === "api.open-meteo.com") return ok(WEATHER);
  if (host.endsWith("finance.yahoo.com")) {
    if (url.includes("ES%3DF")) return ok(yahooChart(6060, 6000)); // +1%
    if (url.includes("NQ%3DF")) return ok(yahooChart(19800, 20000)); // -1%
    if (url.includes("YM%3DF")) return ok(yahooChart(44010, 44000)); // flat
    if (url.includes("BTC-USD")) return ok(yahooChart(97000, 100000)); // -3%
  }
  if (host === "stooq.com") return ok("Symbol,Date,Time,Open,High,Low,Close\nES.F,2026-11-23,09:00:00,6000,6100,5990,6030\n", "text/csv");
  if (host === "api.coingecko.com") return ok({ bitcoin: { usd: 98000, usd_24h_change: 2.345 } });
  return new Response("nope", { status: 404 });
};

const { clearCache, cached } = await import("../server/briefing/cache.js");
const { parseIcs, eventsFor, getCalendar } = await import("../server/briefing/calendar.js");
const { getWeather, adviceFor, shapeWeather } = await import("../server/briefing/weather.js");
const { getMarkets, fromStooqCsv, DISCLAIMER } = await import("../server/briefing/markets.js");
const { getBriefing } = await import("../server/briefing/index.js");
const { Brain, isBriefingRequest, shouldOfferBriefing } = await import("../server/brain.js");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const reset = () => {
  clearCache();
  down.clear();
  hits = [];
};
const readLog = () => fs.readFileSync(path.join(tmp, "actions.log"), "utf8");

test("calendar: today's events, moved and cancelled occurrences, tomorrow's first, link never leaked", async () => {
  reset();
  const cal = await getCalendar();
  assert.equal(cal.ok, true);
  const titles = cal.today.map((e) => `${e.title} ${e.time}`);
  assert.deepEqual(titles, ["Mom's birthday all day", "Reading 7:00 AM", "Standup with the team 9:00 AM", "Gym 7:00 PM"]);
  assert.equal(cal.tomorrowFirst.title, "Dentist", "reading is skipped tomorrow (EXDATE)");
  assert.equal(hits[0], "calendar.example.com", "webcal:// becomes https://");

  reset();
  down.add("calendar.example.com");
  const bad = await getCalendar();
  assert.equal(bad.ok, false);
  assert.doesNotMatch(JSON.stringify(bad), /abc123secret|example\.com/);
  await getBriefing();
  assert.doesNotMatch(readLog(), /abc123secret/, "the link is never logged");
});

test("calendar: parseIcs handles all-day and recurrence rules directly", () => {
  const events = parseIcs(ICS);
  assert.equal(events.some((e) => /Cancelled/.test(e.summary)), false);
  const { today } = eventsFor(events, d);
  assert.equal(today.filter((e) => e.title === "Gym").length, 1, "moved occurrence isn't shown twice");
});

test("weather: Open-Meteo shape, high/low/rain and one line of advice", async () => {
  reset();
  const w = await getWeather();
  assert.equal(w.ok, true);
  assert.equal(w.place, "Birmingham, Michigan");
  assert.deepEqual([w.now, w.high, w.low, w.rain, w.units], [41, 49, 33, 20, "F"]);
  assert.equal(w.advice, "Bring a jacket.");
  assert.equal(adviceFor({ high: 70, low: 55, rain: 80, code: 61, units: "fahrenheit" }), "Take an umbrella.");
  assert.equal(adviceFor({ high: 30, low: 20, rain: 0, code: 73, units: "fahrenheit" }), "Snow's likely, so leave extra time.");
  assert.throws(() => shapeWeather({}));
});

test("markets: direction and percent, Stooq and Yahoo fallbacks, disclaimer always", async () => {
  reset();
  const m = await getMarkets();
  assert.equal(m.ok, true);
  assert.equal(m.disclaimer, DISCLAIMER);
  const by = Object.fromEntries(m.quotes.map((q) => [q.symbol, q]));
  assert.deepEqual([by["ES=F"].direction, by["ES=F"].changePct], ["up", 1]);
  assert.deepEqual([by["NQ=F"].direction, by["NQ=F"].changePct], ["down", -1]);
  assert.equal(by["YM=F"].direction, "flat");
  assert.deepEqual([by.BTC.source, by.BTC.changePct], ["CoinGecko", 2.35]);
  for (const q of m.quotes) assert.equal("price" in q, false, "no prices");

  reset();
  down.add("query1.finance.yahoo.com").add("query2.finance.yahoo.com").add("api.coingecko.com");
  const fb = await getMarkets();
  const fbBy = Object.fromEntries(fb.quotes.map((q) => [q.symbol, q]));
  assert.equal(fbBy["ES=F"].source, "Stooq");
  assert.equal(fbBy["ES=F"].changePct, 0.5);
  assert.equal(fbBy.BTC.ok, false, "Yahoo is down too, so Bitcoin is skipped");

  reset();
  down.add("query1.finance.yahoo.com").add("api.coingecko.com");
  const btc = Object.fromEntries((await getMarkets()).quotes.map((q) => [q.symbol, q])).BTC;
  assert.deepEqual([btc.source, btc.changePct, btc.direction], ["Yahoo Finance", -3, "down"]);

  reset();
  for (const h of ["query1.finance.yahoo.com", "query2.finance.yahoo.com", "api.coingecko.com", "stooq.com"]) down.add(h);
  const none = await getMarkets();
  assert.equal(none.ok, false);
  assert.equal(none.disclaimer, DISCLAIMER);
  assert.throws(() => fromStooqCsv("Symbol,Date\n"));
});

test("briefing: a failing part is skipped while the others still come back", async () => {
  reset();
  down.add("api.open-meteo.com");
  const b = await getBriefing();
  assert.equal(b.name, "Sammy");
  assert.equal(b.weather.ok, false);
  assert.ok(b.weather.reason);
  assert.equal(b.calendar.ok, true);
  assert.equal(b.markets.ok, true);
});

test("each part is cached for 5 minutes", async () => {
  reset();
  await getWeather();
  await getWeather();
  assert.equal(hits.filter((h) => h === "api.open-meteo.com").length, 1);
  let n = 0;
  await cached("x", 5 * 60_000, async () => ++n);
  await cached("x", 5 * 60_000, async () => ++n);
  assert.equal(n, 1);
  const realNow = Date.now;
  Date.now = () => realNow() + 5 * 60_000 + 1;
  try {
    await cached("x", 5 * 60_000, async () => ++n);
  } finally {
    Date.now = realNow;
  }
  assert.equal(n, 2, "refetched after 5 minutes");
});

test("voice triggers for the briefing", () => {
  for (const s of ["good morning", "Good morning Jericho", "morning briefing please", "brief me"]) assert.equal(isBriefingRequest(s), true, s);
  for (const s of ["what's the weather", "brief summary of this file", "morning"]) assert.equal(isBriefingRequest(s), false, s);
});

test("brain: 'hey jericho, good morning' calls the briefing, sends a card, adds the disclaimer", async () => {
  reset();
  const client = fakeClient([use("b1", "morning_briefing", {}), say("Morning, Sammy. Standup at nine. Forty one and cloudy, bring a jacket. The S&P is up one percent.")]);
  const brain = new Brain({ client });
  const cards = [];
  const sentences = [];
  const r = await brain.handle("brief", "Hey Jericho, good morning", { onCard: (c) => cards.push(c), onSentence: (s) => sentences.push(s) });
  const userText = client.calls[0].messages.find((m) => m.role === "user").content.at(-1).text;
  assert.doesNotMatch(userText, /jericho/i, "wake word stripped before the brain");
  assert.match(userText, /good morning/);
  assert.ok(client.calls[0].messages.some((m) => m.role === "system" && /call morning_briefing/.test(m.content)));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, "briefing");
  assert.equal(cards[0].weather.ok, true);
  assert.ok(sentences.at(-1).includes("not financial advice"), "disclaimer spoken when the reply left it out");
  assert.match(r.reply, /not financial advice/);
});

test("brain: web search answers carry their sources for the chat panel", async () => {
  const client = fakeClient([
    {
      stop_reason: "end_turn",
      content: [
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "lions score" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", title: "ESPN", url: "https://www.espn.com/nfl/game" }, { type: "web_search_result", title: "Other", url: "javascript:alert(1)" }] },
        { type: "text", text: "According to ESPN, the Lions won 31 to 24.", citations: [{ type: "web_search_result_location", url: "https://www.espn.com/nfl/game", title: "ESPN" }] },
      ],
    },
  ]);
  const brain = new Brain({ client });
  const r = await brain.handle("ws", "did the lions win");
  assert.equal(r.reply, "According to ESPN, the Lions won 31 to 24.");
  assert.deepEqual(r.sources, [{ title: "ESPN", url: "https://www.espn.com/nfl/game" }]);
  const tools = client.calls[0].tools.map((t) => t.name);
  assert.ok(tools.includes("web_search"));
  assert.equal(client.calls[0].tools.find((t) => t.name === "web_search").max_uses, 3);
});

test("brain: web search not enabled on the key fails gracefully, then is left out", async () => {
  const err = Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "web search is not enabled for this organization" } }, undefined, new Headers());
  const client = fakeClient([() => { throw err; }, say("Hi.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("wsx", "what's the news today");
  assert.match(r.reply, /Web search isn't turned on/);
  await brain.handle("wsx", "hello");
  assert.equal(client.calls[1].tools.some((t) => t.name === "web_search"), false);
});

test("autoTime offers the briefing once per day", () => {
  fs.rmSync(path.join(tmp, "data", "briefing-state.json"), { force: true });
  assert.equal(shouldOfferBriefing(), true);
  assert.equal(shouldOfferBriefing(), false);
});
