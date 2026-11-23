// Weather for the briefing, from Open-Meteo (free, no key). Location in settings.json.
import { settings } from "../config.js";
import { keepAliveFetch } from "../net.js";
import { cached } from "./cache.js";

export function locationSettings() {
  const l = settings.location || {};
  return {
    name: l.name || "Birmingham, Michigan",
    lat: Number.isFinite(Number(l.lat)) ? Number(l.lat) : 42.5467,
    lon: Number.isFinite(Number(l.lon)) ? Number(l.lon) : -83.2113,
    units: l.units === "celsius" ? "celsius" : "fahrenheit",
  };
}

// WMO weather codes (what Open-Meteo returns), in plain words.
const CODES = [
  [[0], "clear"], [[1], "mostly clear"], [[2], "partly cloudy"], [[3], "overcast"], [[45, 48], "foggy"],
  [[51, 53, 55, 56, 57], "drizzly"], [[61, 63, 66, 80, 81], "rainy"], [[65, 67, 82], "heavy rain"],
  [[71, 73, 75, 77, 85, 86], "snowy"], [[95, 96, 99], "stormy"],
];
const describe = (code) => (CODES.find(([list]) => list.includes(code)) || [, "mixed"])[1];

/** One practical line, e.g. "Bring a jacket." */
export function adviceFor({ high, low, rain, code, units }) {
  const f = (c) => (units === "celsius" ? c : (c - 32) * (5 / 9)); // compare in Celsius
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow's likely, so leave extra time.";
  if (rain >= 60) return "Take an umbrella.";
  if (f(high) <= 0) return "Bundle up, it's freezing.";
  if (f(high) < 12) return "Bring a jacket.";
  if (rain >= 35) return "Maybe pack an umbrella.";
  if (f(high) >= 30) return "It'll be hot, so stay cool.";
  if (f(low) < 8) return "Cool morning, so grab a layer.";
  return "Nice day for it.";
}

export function shapeWeather(json, loc = locationSettings()) {
  const d = json.daily;
  const c = json.current;
  if (!d || !c) throw new Error("unexpected weather data");
  const w = {
    place: loc.name,
    units: loc.units === "celsius" ? "C" : "F",
    now: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature ?? c.temperature_2m),
    high: Math.round(d.temperature_2m_max[0]),
    low: Math.round(d.temperature_2m_min[0]),
    rain: Math.round(d.precipitation_probability_max?.[0] ?? 0),
    sky: describe(d.weather_code?.[0] ?? c.weather_code),
  };
  w.advice = adviceFor({ high: w.high, low: w.low, rain: w.rain, code: d.weather_code?.[0], units: loc.units });
  return w;
}

export async function getWeather() {
  const loc = locationSettings();
  try {
    const json = await cached(`weather:${loc.lat},${loc.lon},${loc.units}`, 5 * 60_000, async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(loc.lat),
        longitude: String(loc.lon),
        current: "temperature_2m,apparent_temperature,weather_code",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
        temperature_unit: loc.units,
        timezone: "auto",
        forecast_days: "1",
      }).toString();
      const res = await keepAliveFetch(url);
      if (!res.ok) throw new Error(`the weather service answered ${res.status}`);
      return res.json();
    });
    return { ok: true, ...shapeWeather(json, loc) };
  } catch (err) {
    return { ok: false, reason: /answered|unexpected/.test(err.message) ? err.message : "couldn't reach the weather service" };
  }
}
