"use client";

import { useEffect, useState } from "react";

/** "FLASH · 5h left" with a ring that drains over the 24 hours. */
export function FlashBadge({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, expiresAt - (now ?? expiresAt - 12 * 3_600_000));
  const frac = left / (24 * 3_600_000);
  const h = Math.floor(left / 3_600_000);
  const label = left <= 0 ? "expiring" : h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(left / 60_000))}m left`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[rgb(251_191_36/0.12)] px-1.5 py-0.5 amber-ink text-[10.5px] font-extrabold tracking-[0.1em] uppercase ring-1 ring-[#fbbf24]/40" title="Flash dispatches disappear after 24 hours">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="-rotate-90">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${frac * 28.3} 28.3`} />
      </svg>
      Flash · <span suppressHydrationWarning>{label}</span>
    </span>
  );
}
