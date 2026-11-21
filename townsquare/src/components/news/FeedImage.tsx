"use client";

import { useState } from "react";

/**
 * An image the outlet's own feed supplied (hot-linked, never copied or
 * scraped), credited to the outlet. If it fails to load, it disappears and
 * the generated story art underneath shows instead.
 */
export function FeedImage({ url, credit, className = "", showCredit = true }: { url: string; credit: string; className?: string; showCredit?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span className="absolute inset-0 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`h-full w-full object-cover ${className}`} />
      {showCredit && credit && <span className="absolute right-1 bottom-1 rounded-[4px] bg-black/60 px-1 py-px text-[9.5px] leading-tight text-white/90">{credit}</span>}
    </span>
  );
}
