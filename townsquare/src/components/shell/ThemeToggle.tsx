"use client";

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "../icons";

export type Theme = "system" | "light" | "dark";

export function applyTheme(t: Theme) {
  document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  // Dark is the house look; "Auto" follows the device; "Light" is the optional edition.
  const light = t === "light" || (t === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("dark", !light);
  document.documentElement.classList.toggle("light", light);
}

export function readTheme(): Theme {
  const m = document.cookie.match(/(?:^|; )theme=(\w+)/);
  return (m?.[1] as Theme) ?? "dark";
}

/** Three-way switch: Dark (default), Light, or Auto (follows the device). */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [t, setT] = useState<Theme>("dark");
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

/** One button that cycles Dark → Light → Auto. */
export function ThemeCycle({ className = "" }: { className?: string }) {
  const [t, setT] = useState<Theme>("dark");
  useEffect(() => setT(readTheme()), []);
  const next: Theme = t === "dark" ? "light" : t === "light" ? "system" : "dark";
  const label = t === "dark" ? "Dark" : t === "light" ? "Light" : "Auto";
  return (
    <button type="button" onClick={() => (setT(next), applyTheme(next))} aria-label={`Theme: ${label}. Switch to ${next === "system" ? "Auto" : next}`} title={`Theme: ${label}`} className={`inline-flex h-11 w-11 items-center justify-center rounded-[12px] transition-colors ${className}`}>
      <span key={t} className="animate-pop">{t === "dark" ? <MoonIcon size={20} /> : t === "light" ? <SunIcon size={20} /> : <MonitorIcon size={20} />}</span>
    </button>
  );
}
