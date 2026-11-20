/**
 * U.S. equity market clock (NYSE/Nasdaq regular session 9:30–16:00 ET,
 * Monday–Friday). Exchange holidays are not modeled yet.
 */
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

function etParts(ms: number) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { weekday: p.weekday as string, date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute), seconds: Number(p.second) };
}

export type MarketStatus = { open: boolean; label: string; nextChangeMs: number; sessionDate: string; minuteOfSession: number };

export function marketStatus(now = Date.now()): MarketStatus {
  const et = etParts(now);
  const weekend = et.weekday === "Sat" || et.weekday === "Sun";
  const open = !weekend && et.minutes >= OPEN_MIN && et.minutes < CLOSE_MIN;
  const secOfDay = et.minutes * 60 + et.seconds;
  let next: number;
  if (open) next = (CLOSE_MIN * 60 - secOfDay) * 1000;
  else {
    // seconds until the next weekday 9:30 ET
    const dayOffset = (d: string) => ({ Fri: et.minutes >= CLOSE_MIN ? 3 : 0, Sat: 2, Sun: 1 } as Record<string, number>)[d] ?? (et.minutes >= CLOSE_MIN ? 1 : 0);
    const days = dayOffset(et.weekday);
    next = (days * 86400 + OPEN_MIN * 60 - secOfDay) * 1000;
  }
  const minuteOfSession = Math.max(0, Math.min(389, et.minutes - OPEN_MIN));
  const label = open ? "Market open" : weekend ? "Closed for the weekend" : et.minutes < OPEN_MIN ? "Pre-market" : "After hours";
  // Before the open (or on a weekend) the latest session is the previous trading day.
  const started = !weekend && et.minutes >= OPEN_MIN;
  const sessionDate = started ? et.date : previousWeekday(et.date);
  return { open, label, nextChangeMs: next, sessionDate, minuteOfSession: open ? minuteOfSession : 389 };
}

const WEEKDAY = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The weekday before `date` (YYYY-MM-DD). */
export function previousWeekday(date: string) {
  let d = shift(date, -1);
  while (WEEKDAY(d) === 0 || WEEKDAY(d) === 6) d = shift(d, -1);
  return d;
}

/** The last `n` trading dates ending with the current session, oldest first. */
export function recentSessions(n: number, now = Date.now()) {
  const out = [marketStatus(now).sessionDate];
  while (out.length < n) out.unshift(previousWeekday(out[0]));
  return out;
}
