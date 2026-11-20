"use client";

import { useEffect, useState } from "react";

export function shortTime(ms: number, nowMs = Date.now()) {
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Current time, only after mount: the server and the phone may be in different time zones and locales. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "5m" style time that keeps itself fresh; full local date on hover and for screen readers. */
export function Time({ ms }: { ms: number }) {
  const now = useNow();
  const iso = new Date(ms).toISOString();
  const full = now ? new Date(ms).toLocaleString() : iso;
  return (
    <time dateTime={iso} title={full} aria-label={full} suppressHydrationWarning>
      {now ? shortTime(ms, now) : " "}
    </time>
  );
}

/** A full local date/time, rendered in the viewer's own time zone after mount. */
export function LocalDate({ ms, options }: { ms: number; options?: Intl.DateTimeFormatOptions }) {
  const now = useNow(3_600_000);
  return (
    <time dateTime={new Date(ms).toISOString()} suppressHydrationWarning>
      {now ? new Date(ms).toLocaleString(undefined, options ?? { dateStyle: "medium", timeStyle: "short" }) : " "}
    </time>
  );
}
