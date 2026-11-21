import { get, run } from "../db";

/** Small key/value helpers over site_settings. */
export function getSetting(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM site_settings WHERE key = ?", [key])?.value ?? null;
}
export function setSetting(key: string, value: string | null) {
  if (value === null) run("DELETE FROM site_settings WHERE key = ?", [key]);
  else run("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

/**
 * The demo-data switch. Sample (fictional) stories and outlets are for local
 * testing only: in production they are always off, unless NEWS_DEMO=1 is set
 * (never set it on Railway). Locally the switch defaults to on and can be
 * flipped in the Control Room.
 */
export function demoAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.NEWS_DEMO === "1";
}
export function demoEnabled() {
  return demoAllowed() && (getSetting("news_demo") ?? "1") === "1";
}
export function setDemo(on: boolean) {
  setSetting("news_demo", on ? "1" : "0");
}
