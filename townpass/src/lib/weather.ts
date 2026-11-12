/**
 * Live conditions from Open-Meteo (https://open-meteo.com): temperature, wind,
 * rain chance, UV index, sunrise/sunset, plus water temperature and wave height
 * for coastal towns. No API key needed for the free tier (non-commercial use).
 * Set the OPEN_METEO_API_KEY secret to use the commercial endpoints.
 *
 * Results are cached per city in D1 for 15 minutes, so the guide makes at most
 * ~4 upstream calls per city per hour no matter how much traffic it gets.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { City } from "./db";

export interface HourPoint {
  label: string; // "3 PM"
  tempF: number;
  uv: number;
  rain: number | null; // % chance
  icon: string;
}

export interface Conditions {
  updatedAt: number; // epoch ms when fetched
  observedAt: string; // local "HH:MM" of the reading
  tempF: number;
  feelsF: number;
  desc: string;
  icon: string;
  isDay: boolean;
  windMph: number;
  gustMph: number | null;
  windDir: string;
  uvNow: number;
  uvMax: number | null;
  rainNext6h: number | null; // max % chance in the next 6 hours
  highF: number | null;
  lowF: number | null;
  sunrise: string | null; // "6:47 AM"
  sunset: string | null;
  waterF: number | null;
  wavesFt: number | null;
  hourly: HourPoint[];
}

export const CACHE_MS = 15 * 60_000;
/** After a failed fetch, wait this long before trying the weather service again. */
export const RETRY_MS = 2 * 60_000;
const STALE_MAX_MS = 6 * 3_600_000;
const TIMEOUT_MS = 2500;

/* ----------------------------- pure helpers ------------------------------ */

const WMO: [number[], string, string, string][] = [
  // codes, description, day icon, night icon
  [[0], "Clear", "☀️", "🌙"],
  [[1], "Mostly clear", "🌤️", "🌙"],
  [[2], "Partly cloudy", "⛅", "☁️"],
  [[3], "Overcast", "☁️", "☁️"],
  [[45, 48], "Fog", "🌫️", "🌫️"],
  [[51, 53, 55, 56, 57], "Drizzle", "🌦️", "🌧️"],
  [[61, 63, 65, 66, 67], "Rain", "🌧️", "🌧️"],
  [[71, 73, 75, 77], "Snow", "❄️", "❄️"],
  [[80, 81, 82], "Showers", "🌦️", "🌧️"],
  [[85, 86], "Snow showers", "🌨️", "🌨️"],
  [[95, 96, 99], "Thunderstorms", "⛈️", "⛈️"],
];

export function describe(code: number, isDay = true): { desc: string; icon: string } {
  const row = WMO.find(([codes]) => codes.includes(code));
  return row ? { desc: row[1], icon: isDay ? row[2] : row[3] } : { desc: "—", icon: "🌡️" };
}

export function compass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** EPA/WHO UV index categories. */
export function uvLevel(uv: number): { key: "low" | "moderate" | "high" | "veryhigh" | "extreme"; label: string; advice: string } {
  const u = Math.round(uv);
  if (u <= 2) return { key: "low", label: "Low", advice: "Minimal sun protection needed. Sunglasses on bright days." };
  if (u <= 5) return { key: "moderate", label: "Moderate", advice: "SPF 30+, hat and sunglasses. Seek shade around midday." };
  if (u <= 7) return { key: "high", label: "High", advice: "SPF 30+ and reapply every 2 hours. Shade from 11 AM to 3 PM." };
  if (u <= 10) return { key: "veryhigh", label: "Very high", advice: "Unprotected skin burns fast. SPF 50, cover up, shade 10 AM–4 PM." };
  return { key: "extreme", label: "Extreme", advice: "Burns in minutes. Avoid midday sun; SPF 50, long sleeves, hat." };
}

/** "2026-07-04T20:14" -> "8:14 PM" (the API already returns local time). */
export function clock(iso: string | null | undefined, withMinutes = true): string | null {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return withMinutes && m[2] !== "00" ? `${h12}:${m[2]} ${suffix}` : `${h12} ${suffix}`;
}

const round = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);
const num = (n: unknown, d = 0) => (typeof n === "number" && Number.isFinite(n) ? n : d);

/** Turn Open-Meteo forecast (+ optional marine) JSON into what the UI needs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseConditions(f: any, marine: any, fetchedAt: number): Conditions | null {
  const c = f?.current;
  if (!c || typeof c.temperature_2m !== "number") return null;
  const isDay = c.is_day !== 0;
  const { desc, icon } = describe(num(c.weather_code), isDay);
  const h = f.hourly ?? {};
  const times: string[] = h.time ?? [];
  const hourStart = String(c.time ?? "").slice(0, 13); // "YYYY-MM-DDTHH"
  let start = times.findIndex((t) => t.slice(0, 13) >= hourStart);
  if (start < 0) start = 0;

  const hourly: HourPoint[] = [];
  for (let i = start; i < times.length && hourly.length < 8; i++) {
    const code = num(h.weather_code?.[i]);
    const hr = Number(times[i].slice(11, 13));
    hourly.push({
      label: clock(times[i], false) ?? "",
      tempF: num(round(h.temperature_2m?.[i])),
      uv: num(round(h.uv_index?.[i])),
      rain: round(h.precipitation_probability?.[i]),
      icon: describe(code, hr >= 7 && hr < 19).icon,
    });
  }
  const rain6 = (h.precipitation_probability ?? []).slice(start, start + 6).filter((x: unknown) => typeof x === "number");
  const uvNow = typeof c.uv_index === "number" ? c.uv_index : num(h.uv_index?.[start]);

  return {
    updatedAt: fetchedAt,
    observedAt: clock(c.time) ?? "",
    tempF: num(round(c.temperature_2m)),
    feelsF: num(round(c.apparent_temperature ?? c.temperature_2m)),
    desc,
    icon,
    isDay,
    windMph: num(round(c.wind_speed_10m)),
    gustMph: round(c.wind_gusts_10m),
    windDir: compass(num(c.wind_direction_10m)),
    uvNow: Math.max(0, Math.round(uvNow)),
    uvMax: round(f.daily?.uv_index_max?.[0]),
    rainNext6h: rain6.length ? Math.max(...rain6) : null,
    highF: round(f.daily?.temperature_2m_max?.[0]),
    lowF: round(f.daily?.temperature_2m_min?.[0]),
    sunrise: clock(f.daily?.sunrise?.[0]),
    sunset: clock(f.daily?.sunset?.[0]),
    waterF: round(marine?.current?.sea_surface_temperature),
    wavesFt: typeof marine?.current?.wave_height === "number" ? Math.round(marine.current.wave_height * 10) / 10 : null,
    hourly,
  };
}

/* ----------------------------- fetching + cache ----------------------------- */

export function forecastUrl(city: Pick<City, "lat" | "lon" | "timezone">, apiKey?: string): string {
  const base = apiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
  const q = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,uv_index",
    hourly: "temperature_2m,uv_index,precipitation_probability,weather_code",
    daily: "uv_index_max,sunrise,sunset,temperature_2m_max,temperature_2m_min",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: city.timezone,
    forecast_days: "2",
  });
  if (apiKey) q.set("apikey", apiKey);
  return `${base}?${q}`;
}

export function marineUrl(city: Pick<City, "lat" | "lon" | "timezone">, apiKey?: string): string {
  const base = apiKey ? "https://customer-marine-api.open-meteo.com/v1/marine" : "https://marine-api.open-meteo.com/v1/marine";
  const q = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    current: "wave_height,sea_surface_temperature",
    temperature_unit: "fahrenheit",
    length_unit: "imperial",
    timezone: city.timezone,
  });
  if (apiKey) q.set("apikey", apiKey);
  return `${base}?${q}`;
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cached conditions for a city, or null if the city has no coordinates or the
 * weather service is down and nothing recent is cached. Never throws: weather
 * is a nice-to-have and must not break the guide.
 */
export async function getConditions(db: D1Database, city: City, apiKey?: string): Promise<Conditions | null> {
  if (city.lat == null || city.lon == null) return null;
  const now = Date.now();
  const cached = await db
    .prepare("SELECT json, fetched_at FROM weather_cache WHERE city_id = ?")
    .bind(city.id)
    .first<{ json: string; fetched_at: number }>()
    .catch(() => null);
  const last = cached ? (JSON.parse(cached.json) as Conditions | null) : null;
  if (cached && now - cached.fetched_at < CACHE_MS) {
    // `null` = a recent failed attempt; serve the last good reading (if still reasonably fresh) without refetching
    return last && now - last.updatedAt < STALE_MAX_MS ? last : null;
  }

  try {
    const [forecast, marine] = await Promise.all([
      getJson(forecastUrl(city, apiKey)),
      city.coastal ? getJson(marineUrl(city, apiKey)).catch(() => null) : Promise.resolve(null),
    ]);
    const parsed = parseConditions(forecast, marine, now);
    if (!parsed) throw new Error("Unexpected weather response");
    await db
      .prepare("INSERT OR REPLACE INTO weather_cache (city_id, json, fetched_at) VALUES (?, ?, ?)")
      .bind(city.id, JSON.stringify(parsed), now)
      .run();
    return parsed;
  } catch (e) {
    console.warn("weather unavailable for", city.slug, (e as Error).message);
    // Back off: mark the cache so the next RETRY_MS of page views don't each wait on a failing service.
    // Keeps the last good reading (its own updatedAt still tells us how old it is).
    await db
      .prepare("INSERT OR REPLACE INTO weather_cache (city_id, json, fetched_at) VALUES (?, ?, ?)")
      .bind(city.id, JSON.stringify(last), now - CACHE_MS + RETRY_MS)
      .run()
      .catch(() => {});
    return last && now - last.updatedAt < STALE_MAX_MS ? last : null;
  }
}
