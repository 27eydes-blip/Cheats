/** Time-zone helpers for game times. The browser stores its zone in the `tz` cookie (see TzCookie). */
export const DEFAULT_TZ = "America/New_York";

export function validTz(tz: string | undefined | null): string {
  if (!tz || tz.length > 64) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Like Date#getTimezoneOffset for a zone: minutes to add to local time to get UTC. */
export function tzOffsetMin(tz: string, t: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((t - local) / 60_000);
}

const dayKey = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

export function fmtTime(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

/** "Today", "Tomorrow", "Yesterday", or "Sun, Nov 23". */
export function fmtDay(ms: number, tz: string, t = Date.now()) {
  const k = dayKey(ms, tz);
  if (k === dayKey(t, tz)) return "Today";
  if (k === dayKey(t + 86_400_000, tz)) return "Tomorrow";
  if (k === dayKey(t - 86_400_000, tz)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms));
}

export const sameDay = (a: number, b: number, tz: string) => dayKey(a, tz) === dayKey(b, tz);

export const tzAbbr = (tz: string, t = Date.now()) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")?.value ?? "";
