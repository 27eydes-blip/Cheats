"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin gold bar along the top edge while a page change is in flight.
 * Starts on any same-origin link click, finishes when the URL updates.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [w, setW] = useState(0);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (url.pathname.startsWith("/api/")) return;
      setShow(true);
      setW(12);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setW((x) => (x < 85 ? x + (90 - x) * 0.12 : x)), 160);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!show) return;
    if (timer.current) clearInterval(timer.current);
    setW(100);
    const t = setTimeout(() => (setShow(false), setW(0)), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, search]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px]">
      <div
        className="h-full bg-gold shadow-[0_0_10px_var(--gold)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${w}%`, opacity: show ? 1 : 0 }}
      />
    </div>
  );
}
