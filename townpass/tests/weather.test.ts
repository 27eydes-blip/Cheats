import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, compass, describe, forecastUrl, parseConditions, uvLevel } from "../src/lib/weather.ts";

// Shape of an Open-Meteo /v1/forecast response with timezone=America/New_York.
const hours = Array.from({ length: 24 }, (_, i) => `2026-07-18T${String(i).padStart(2, "0")}:00`);
const forecast = {
  timezone: "America/New_York",
  current: { time: "2026-07-18T13:15", temperature_2m: 88.4, apparent_temperature: 96.2, weather_code: 2, wind_speed_10m: 11.6, wind_direction_10m: 220, wind_gusts_10m: 21.3, is_day: 1, uv_index: 10.6 },
  hourly: {
    time: hours,
    temperature_2m: hours.map((_, i) => 78 + i / 2),
    uv_index: hours.map((_, i) => Math.max(0, 11 - Math.abs(13 - i) * 1.6)),
    precipitation_probability: hours.map((_, i) => (i === 16 ? 60 : 10)),
    weather_code: hours.map((_, i) => (i === 16 ? 95 : 1)),
  },
  daily: { time: ["2026-07-18"], uv_index_max: [11.2], sunrise: ["2026-07-18T06:47"], sunset: ["2026-07-18T20:14"], temperature_2m_max: [90.1], temperature_2m_min: [80.6] },
};
const marine = { current: { time: "2026-07-18T13:00", wave_height: 1.64, sea_surface_temperature: 87.3 } };

test("parses current conditions, hourly strip and marine data", () => {
  const c = parseConditions(forecast, marine, 1)!;
  assert.equal(c.tempF, 88);
  assert.equal(c.feelsF, 96);
  assert.equal(c.desc, "Partly cloudy");
  assert.equal(c.windDir, "SW");
  assert.equal(c.uvNow, 11);
  assert.equal(c.uvMax, 11);
  assert.equal(c.sunset, "8:14 PM");
  assert.equal(c.sunrise, "6:47 AM");
  assert.equal(c.waterF, 87);
  assert.equal(c.wavesFt, 1.6);
  assert.equal(c.rainNext6h, 60); // 4 PM storm is within 6h of 1 PM
  assert.equal(c.hourly.length, 8);
  assert.equal(c.hourly[0].label, "1 PM"); // starts at the current hour
  assert.equal(c.hourly[3].icon, "⛈️");
});

test("works without marine data and rejects junk", () => {
  const c = parseConditions(forecast, null, 1)!;
  assert.equal(c.waterF, null);
  assert.equal(c.wavesFt, null);
  assert.equal(parseConditions({}, null, 1), null);
  assert.equal(parseConditions({ error: true, reason: "x" }, null, 1), null);
});

test("UV categories follow EPA bands", () => {
  assert.deepEqual([0, 2, 3, 5, 6, 7, 8, 10, 11, 13].map((u) => uvLevel(u).key), ["low", "low", "moderate", "moderate", "high", "high", "veryhigh", "veryhigh", "extreme", "extreme"]);
});

test("small helpers", () => {
  assert.equal(compass(0), "N");
  assert.equal(compass(359), "N");
  assert.equal(compass(135), "SE");
  assert.equal(describe(0, false).icon, "🌙");
  assert.equal(clock("2026-07-18T12:00"), "12 PM");
  assert.equal(clock("2026-07-18T00:30"), "12:30 AM");
  const url = forecastUrl({ lat: 24.5551, lon: -81.78, timezone: "America/New_York" });
  assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=24\.5551&longitude=-81\.78/);
  assert.match(forecastUrl({ lat: 1, lon: 2, timezone: "UTC" }, "KEY"), /customer-api.*apikey=KEY/);
});
