"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { tabHref, type HomeTab } from "@/lib/feedtabs-meta";

const TABS: { tab: HomeTab; label: string }[] = [
  { tab: { kind: "foryou" }, label: "For You" },
  { tab: { kind: "friends" }, label: "Friends" },
];

/**
 * The one feed tab row: For You (default) and Friends, directly above the
 * timeline. Swiping left/right on the feed switches between them. Topics are
 * in the top nav; the topics and teams you pick are under Your Topics in the menu.
 */
export function FeedTabs({ active }: { active: HomeTab }) {
  const router = useRouter();
  const index = active.kind === "friends" ? 1 : 0;

  // Swipe on the feed to switch tabs (ignores sideways scrollers and the screen edge).
  useEffect(() => {
    const el = document.getElementById("home-feed");
    if (!el) return;
    let s: { x: number; y: number } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      s = t.clientX < 28 || (e.target as Element).closest?.("[data-no-swipe], input, textarea, [role=menu]") ? null : { x: t.clientX, y: t.clientY };
    };
    const end = (e: TouchEvent) => {
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      s = null;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
      const next = TABS[index + (dx < 0 ? 1 : -1)];
      if (next) router.push(tabHref(next.tab), { scroll: false });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => (el.removeEventListener("touchstart", start), el.removeEventListener("touchend", end));
  }, [index, router]);

  return (
    <div className="sticky top-[var(--sub-top)] z-20 border-b border-[var(--hairline)] bg-[var(--paper)]/95 backdrop-blur-md">
      <div role="tablist" aria-label="Home feed" className="flex">
        {TABS.map((x, i) => {
          const on = i === index;
          return (
            <Link
              key={x.label}
              href={tabHref(x.tab)}
              scroll={false}
              role="tab"
              aria-selected={on}
              className={`relative flex h-11 flex-1 items-center justify-center text-[15px] transition-colors ${on ? "font-bold text-ink-1" : "font-medium text-ink-3 hover:text-ink-1"}`}
            >
              {x.label}
              {on && <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-[var(--wn-blue)]" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
