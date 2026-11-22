/**
 * U.S. equity market clock: NYSE/Nasdaq regular session 9:30–16:00 ET,
 * Monday–Friday, with the exchange holiday calendar and 1:00 PM early closes
 * for 2025–2027 (from the NYSE's published schedule). Extend HOLIDAYS and
 * EARLY_CLOSES when the exchange publishes later years.
 */
export const OPEN_MIN = 9 * 60 + 30;
export const CLOSE_MIN = 16 * 60;
export const EARLY_CLOSE_MIN = 13 * 60;

export const HOLIDAYS: Record<string, string> = {
  "2025-01-01": "New Year's Day",
  "2025-01-09": "the National Day of Mourning",
  "2025-01-20": "Martin Luther King Jr. Day",
  "2025-02-17": "Washington's Birthday",
  "2025-04-18": "Good Friday",
  "2025-05-26": "Memorial Day",
  "2025-06-19": "Juneteenth",
  "2025-07-04": "Independence Day",
  "2025-09-01": "Labor Day",
  "2025-11-27": "Thanksgiving",
  "2025-12-25": "Christmas",
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving",
  "2026-12-25": "Christmas",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving",
  "2027-12-24": "Christmas (observed)",
};

/** Sessions that end at 1:00 PM ET. */
export const EARLY_CLOSES: Record<string, string> = {
  "2025-07-03": "the day before Independence Day",
  "2025-11-28": "the day after Thanksgiving",
  "2025-12-24": "Christmas Eve",
  "2026-11-27": "the day after Thanksgiving",
  "2026-12-24": "Christmas Eve",
  "2027-11-26": "the day after Thanksgiving",
};

function etParts(ms: number) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { weekday: p.weekday as string, date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute), seconds: Number(p.second) };
}

const WEEKDAY = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const isTradingDay = (date: string) => WEEKDAY(date) !== 0 && WEEKDAY(date) !== 6 && !HOLIDAYS[date];
/** Minute of the day (ET) the session closes on a trading day. */
export const closeMinute = (date: string) => (EARLY_CLOSES[date] ? EARLY_CLOSE_MIN : CLOSE_MIN);
/** Minutes in the regular session on a trading day (390, or 210 on early-close days). */
export const sessionLength = (date: string) => closeMinute(date) - OPEN_MIN;

/** UTC ms of a wall-clock time in New York (handles daylight time). */
export function etToUtc(date: string, minuteOfDay: number) {
  const [y, m, d] = date.split("-").map(Number);
  for (const off of [5, 4]) {
    const t = Date.UTC(y, m - 1, d, 0, minuteOfDay) + off * 3_600_000;
    const p = etParts(t);
    if (p.date === date && p.minutes === minuteOfDay) return t;
  }
  return Date.UTC(y, m - 1, d, 0, minuteOfDay) + 5 * 3_600_000;
}

export type MarketStatus = {
  open: boolean;
  label: string;
  /** Milliseconds until the next opening or closing bell. */
  nextChangeMs: number;
  /** The latest session that has started (today once the bell rings, else the previous trading day). */
  sessionDate: string;
  minuteOfSession: number;
  /** Today's (or the next session's) close in ET, e.g. "4:00 PM" or "1:00 PM". */
  closesAt: string;
  earlyClose: boolean;
  /** Set when today is an exchange holiday. */
  holiday?: string;
  /** The next trading day, when the market is closed. */
  nextSession: string;
};

const fmtMin = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${min >= 720 ? "PM" : "AM"}`;

export function marketStatus(now = Date.now()): MarketStatus {
  const et = etParts(now);
  const trading = isTradingDay(et.date);
  const close = closeMinute(et.date);
  const open = trading && et.minutes >= OPEN_MIN && et.minutes < close;
  const weekend = et.weekday === "Sat" || et.weekday === "Sun";
  const nextSession = trading && et.minutes < OPEN_MIN ? et.date : nextTradingDay(et.date);
  const nextChangeMs = open ? etToUtc(et.date, close) - now : etToUtc(nextSession, OPEN_MIN) - now;
  const holiday = !weekend ? HOLIDAYS[et.date] : undefined;
  const label = open
    ? EARLY_CLOSES[et.date] ? "Market open · early close" : "Market open"
    : holiday ? `Closed for ${holiday}` : weekend ? "Closed for the weekend" : et.minutes < OPEN_MIN ? "Pre-market" : "After hours";
  const started = trading && et.minutes >= OPEN_MIN;
  const sessionDate = started ? et.date : previousTradingDay(et.date);
  const len = sessionLength(sessionDate);
  const minuteOfSession = open ? Math.max(0, Math.min(len - 1, et.minutes - OPEN_MIN)) : len - 1;
  const closeDay = open || (trading && et.minutes < OPEN_MIN) ? et.date : nextSession;
  return { open, label, nextChangeMs, sessionDate, minuteOfSession, closesAt: fmtMin(closeMinute(closeDay)), earlyClose: !!EARLY_CLOSES[closeDay], holiday, nextSession };
}

/** The trading day before `date` (YYYY-MM-DD), skipping weekends and holidays. */
export function previousTradingDay(date: string) {
  let d = shift(date, -1);
  while (!isTradingDay(d)) d = shift(d, -1);
  return d;
}
/** Kept for older callers: the previous trading day. */
export const previousWeekday = previousTradingDay;

/** The trading day after `date`. */
export function nextTradingDay(date: string) {
  let d = shift(date, 1);
  while (!isTradingDay(d)) d = shift(d, 1);
  return d;
}

/** The last `n` trading dates ending with the current session, oldest first. */
export function recentSessions(n: number, now = Date.now()) {
  const out = [marketStatus(now).sessionDate];
  while (out.length < n) out.unshift(previousTradingDay(out[0]));
  return out;
}

export type CalendarEvent = { date: string; kind: "holiday" | "early"; name: string };
/** Upcoming holidays and early closes from `date` on (inclusive). */
export function upcomingCalendar(date: string, limit = 3): CalendarEvent[] {
  const evs: CalendarEvent[] = [
    ...Object.entries(HOLIDAYS).map(([d, name]) => ({ date: d, kind: "holiday" as const, name })),
    ...Object.entries(EARLY_CLOSES).map(([d, name]) => ({ date: d, kind: "early" as const, name })),
  ];
  return evs.filter((e) => e.date >= date && WEEKDAY(e.date) !== 0 && WEEKDAY(e.date) !== 6).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

/** ET calendar date of a moment. */
export const etDate = (ms: number) => etParts(ms).date;
/** Minutes past midnight in New York. */
export const etMinutes = (ms: number) => etParts(ms).minutes + etParts(ms).seconds / 60;
