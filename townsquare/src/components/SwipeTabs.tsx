"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/** Horizontal swipe on phones moves between sibling tabs (e.g. Following ⇄ For You ⇄ Breaking). */
export function SwipeTabs({ hrefs, index, children }: { hrefs: string[]; index: number; children: React.ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        const el = e.target as HTMLElement;
        // Don't hijack swipes inside horizontally scrolling areas (chips, image viewers).
        start.current = el.closest("[data-no-swipe], .overflow-x-auto, dialog") ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - s.t > 600) return;
        const next = index + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < hrefs.length) router.push(hrefs[next], { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
