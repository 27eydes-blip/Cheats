"use client";

import { useEffect, useState } from "react";
import { divisions } from "@/data/portfolio";

/**
 * The hero's heads-up display layer: viewfinder corner brackets, a scanner
 * line that sweeps down once on load, a boot log that types itself out, and
 * live readouts in the corners (status, clock, counts).
 *
 * The boot animation is CSS (starts on first paint); only the clock needs
 * JavaScript. Purely decorative, so it is hidden from assistive tech.
 */

const productCount = divisions.reduce((n, d) => n + d.projects.length, 0);

/** Boot log lines, typed one after another. Dots pad each line to a column. */
const boot: { text: string; value?: string }[] = [
  { text: "GLEYDE OS // BOOT SEQUENCE" },
  { text: "LOADING DIVISIONS", value: String(divisions.length).padStart(2, "0") },
  { text: "INDEXING PRODUCTS", value: String(productCount).padStart(2, "0") },
  { text: "SECURITY PROTOCOLS", value: "ACTIVE" },
  { text: "ALL SYSTEMS ONLINE" },
];

function line(l: (typeof boot)[number]) {
  if (!l.value) return l.text;
  const width = 30;
  return `${l.text} ${".".repeat(Math.max(2, width - l.text.length - l.value.length - 2))} ${l.value}`;
}

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const raf = requestAnimationFrame(() => setNow(fmt()));
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);
  return <span className="tabular-nums">{now ?? "--:--:--"}</span>;
}

export function HudOverlay() {
  return (
    <div aria-hidden="true" className="hud-mono pointer-events-none absolute inset-0 select-none">
      {/* Scanner line: one sweep down the screen on load */}
      <div className="hud-scan absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(239,227,196,0.9),transparent)] shadow-[0_0_24px_4px_rgba(239,227,196,0.25)]" />

      {/* Viewfinder corner brackets */}
      <div className="absolute inset-x-5 top-20 bottom-6 sm:inset-x-10 sm:top-24 sm:bottom-10 lg:inset-x-16">
        {(
          [
            "top-0 left-0 border-t border-l",
            "top-0 right-0 border-t border-r",
            "bottom-0 left-0 border-b border-l",
            "bottom-0 right-0 border-b border-r",
          ] as const
        ).map((pos, i) => (
          <span
            key={pos}
            className={`hud-in absolute size-5 border-gold/50 sm:size-7 ${pos}`}
            style={{ animationDelay: `${0.15 + i * 0.08}s` }}
          />
        ))}

        {/* Boot log (top left) */}
        <ol className="absolute top-5 left-5 hidden space-y-1.5 text-[0.62rem] leading-none tracking-[0.12em] text-ivory/55 md:block lg:top-7 lg:left-7">
          {boot.map((l, i) => (
            <li
              key={l.text}
              className={`hud-type whitespace-pre ${i === boot.length - 1 ? "text-gold-light" : ""}`}
              style={{ animationDelay: `${0.4 + i * 0.32}s` }}
            >
              <span className="text-gold/70">{">"} </span>
              {line(l)}
              {i === boot.length - 1 && <span className="hud-cursor ml-1 inline-block h-[0.8em] w-[0.5em] translate-y-[1px] bg-gold-light" />}
            </li>
          ))}
        </ol>

        {/* Top right: coordinates-style system readout */}
        <div className="hud-in absolute top-5 right-5 hidden text-right text-[0.62rem] leading-relaxed tracking-[0.14em] text-ivory/50 md:block lg:top-7 lg:right-7" style={{ animationDelay: "1.9s" }}>
          <p>SYS.CORE <span className="text-gold-light">100%</span></p>
          <p>LINK <span className="text-gold-light">SECURE</span></p>
        </div>

        {/* Bottom left: status */}
        <div className="hud-in absolute bottom-4 left-5 flex items-center gap-2.5 text-[0.6rem] tracking-[0.18em] text-ivory/55 sm:bottom-5 lg:bottom-7 lg:left-7" style={{ animationDelay: "2.1s" }}>
          <span className="hud-blink block size-1.5 rounded-full bg-gold-light shadow-[0_0_8px_#EFE3C4]" />
          STATUS <span className="text-gold-light">ONLINE</span>
        </div>

        {/* Bottom right: clock + counts */}
        <div className="hud-in absolute right-5 bottom-4 text-right text-[0.6rem] tracking-[0.18em] text-ivory/55 sm:bottom-5 lg:right-7 lg:bottom-7" style={{ animationDelay: "2.2s" }}>
          <span className="hidden sm:inline">
            {String(productCount).padStart(2, "0")} PRODUCTS · {String(divisions.length).padStart(2, "0")} DIVISIONS ·{" "}
          </span>
          <span className="text-gold-light">
            <Clock />
          </span>
        </div>
      </div>
    </div>
  );
}
