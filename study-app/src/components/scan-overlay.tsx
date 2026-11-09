"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { IconSparkle } from "./icons";

const STEPS = ["Cleaning up the page", "Reading your handwriting", "Checking subject words", "Flagging words to double-check"];

/**
 * Plays over a page photo while the AI reads it: a lime scan beam sweeps the
 * page, detected "words" light up, and the status line cycles through what's
 * happening, so waiting feels like progress.
 */
export function ScanOverlay({ seed = 1 }: { seed?: number }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);

  // Pseudo-random word boxes, stable per page.
  const boxes = useMemo(() => {
    // Deterministic pseudo-random numbers from the seed.
    const rnd = (n: number) => (((seed * 9301 + n * 49297) % 233280) + 233280) % 233280 / 233280;
    return Array.from({ length: 14 }, (_, i) => ({
      top: 10 + ((i * 6.1) % 78),
      left: 8 + rnd(i * 3 + 1) * 50,
      width: 10 + rnd(i * 3 + 2) * 26,
      delay: rnd(i * 3 + 3) * 2.4,
    }));
  }, [seed]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
      <div className="absolute inset-0 bg-black/25" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "linear-gradient(rgb(196 248 42 / 0.18) 1px, transparent 1px), linear-gradient(90deg, rgb(196 248 42 / 0.18) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {!reduce &&
        boxes.map((b, i) => (
          <motion.span
            key={i}
            className="absolute h-[2.6%] rounded-[4px] border border-[#c4f82a] bg-[#c4f82a]/25"
            style={{ top: `${b.top}%`, left: `${b.left}%`, width: `${b.width}%` }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 0.5, 0], scale: [0.8, 1, 1, 1] }}
            transition={{ duration: 2.4, delay: b.delay, repeat: Infinity, repeatDelay: 1.2 }}
          />
        ))}
      {!reduce && (
        <div className="absolute inset-x-0 h-24 -translate-y-full" style={{ animation: "scan 3.2s cubic-bezier(0.65,0,0.35,1) infinite" }}>
          <div className="h-full bg-gradient-to-b from-transparent via-[#c4f82a]/20 to-[#c4f82a]/45" />
          <div className="h-[3px] bg-[#c4f82a] shadow-[0_0_24px_6px_rgb(196_248_42/0.65)]" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
        <div className="flex items-center gap-2.5 rounded-full bg-black/80 py-2 pl-2.5 pr-4 text-sm font-medium text-white shadow-lg backdrop-blur-md">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#c4f82a] text-black">
            <IconSparkle size={14} />
          </span>
          <AnimatePresence mode="wait">
            <motion.span key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {STEPS[step]}…
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Text-side placeholder: lines that "write themselves" while reading. */
export function ReadingLines() {
  const reduce = useReducedMotion();
  const widths = [38, 92, 78, 86, 64, 90, 72, 55];
  return (
    <div className="flex flex-col gap-3.5" aria-hidden>
      {widths.map((w, i) => (
        <motion.div
          key={i}
          className={i === 0 ? "skeleton h-5 rounded-full" : "skeleton h-3.5 rounded-full"}
          initial={reduce ? false : { width: "0%" }}
          animate={{ width: `${w}%` }}
          transition={{ delay: 0.25 + i * 0.22, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
