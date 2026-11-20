"use client";

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "../icons";

export type Theme = "system" | "light" | "dark";

export function applyTheme(t: Theme) {
  document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function readTheme(): Theme {
  const m = document.cookie.match(/(?:^|; )theme=(\w+)/);
  return (m?.[1] as Theme) ?? "system";
}

/** Three-way switch: Auto (follows the device), Light, Dark. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [t, setT] = useState<Theme>("system");
  useEffect(() => setT(readTheme()), []);
  useEffect(() => {
    if (t !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [t]);
  const opts: [Theme, string, React.ReactNode][] = [
    ["system", "Auto", <MonitorIcon key="m" size={16} />],
    ["light", "Light", <SunIcon key="s" size={16} />],
    ["dark", "Dark", <MoonIcon key="d" size={16} />],
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full bg-surface-2 p-1">
      {opts.map(([v, l, icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={t === v}
          onClick={() => (setT(v), applyTheme(v))}
          className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold transition-all duration-200 ${t === v ? "bg-surface text-ink-1 shadow-1" : "text-ink-3 hover:text-ink-1"}`}
          title={l}
        >
          {icon}
          {!compact && <span>{l}</span>}
          {compact && <span className="sr-only">{l}</span>}
        </button>
      ))}
    </div>
  );
}
