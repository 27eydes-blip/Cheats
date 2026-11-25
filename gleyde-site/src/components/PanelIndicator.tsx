"use client";

import { useEffect, useState } from "react";

export type Panel = { id: string; label: string };

/**
 * A quiet vertical index on the right edge: one short line per panel, the
 * current one longer and in champagne. Click a line to jump to that panel.
 * The panel list is built in app/page.tsx from the same data as the page,
 * so it updates itself when divisions are added. Hidden on phones.
 */
export function PanelIndicator({ panels }: { panels: Panel[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = panels
      .map((p) => document.getElementById(p.id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(els.indexOf(e.target as HTMLElement));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [panels]);

  return (
    <nav aria-label="Page sections" className="fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 md:block lg:right-8">
      <ol className="flex flex-col items-end gap-1">
        {panels.map((p, i) => (
          <li key={p.id}>
            <a
              href={`#${p.id}`}
              aria-label={p.label}
              aria-current={i === active ? "true" : undefined}
              className="group flex items-center justify-end gap-3 py-1.5"
            >
              <span className="pointer-events-none text-[0.6rem] tracking-[0.24em] whitespace-nowrap text-ivory/0 uppercase transition-colors duration-300 group-hover:text-ivory/70 group-focus-visible:text-ivory/70">
                {p.label}
              </span>
              <span
                className={`block h-(--hair) transition-all duration-500 ease-deco ${
                  i === active ? "w-8 bg-gold-light" : "w-4 bg-ivory/35 group-hover:w-6 group-hover:bg-ivory/70"
                }`}
              />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
