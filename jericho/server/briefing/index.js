// The morning briefing: calendar, weather and markets, each fetched on its own with a time
// limit, so a part that fails or is slow is skipped (and mentioned) without holding up the rest.
import { settings } from "../config.js";
import { logAction } from "../logger.js";
import { withTimeout } from "./cache.js";
import { getCalendar } from "./calendar.js";
import { getMarkets } from "./markets.js";
import { getWeather } from "./weather.js";
import { briefingPart } from "../planner/index.js";

const PART_TIMEOUT_MS = 6000;

async function part(name, fn) {
  const t0 = Date.now();
  try {
    const r = await withTimeout(fn(), PART_TIMEOUT_MS, name);
    logAction("briefing_part", { part: name, ok: r.ok, ms: Date.now() - t0, ...(r.ok ? {} : { reason: r.reason }) });
    return r;
  } catch (err) {
    const reason = /took too long/.test(err.message) ? "took too long" : "had a problem";
    logAction("briefing_part", { part: name, ok: false, ms: Date.now() - t0, reason });
    return { ok: false, reason };
  }
}

export function briefingName() {
  return settings.briefing?.name || settings.calls?.ownerName || "";
}

export async function getBriefing() {
  const [calendar, weather, markets, planner] = await Promise.all([part("calendar", getCalendar), part("weather", getWeather), part("markets", getMarkets), part("planner", () => briefingPart())]);
  const now = new Date();
  return {
    name: briefingName(),
    date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    calendar,
    weather,
    markets,
    planner,
  };
}
