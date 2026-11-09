"use client";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { IconCheck, IconSparkle } from "@/components/icons";
import { handwriting } from "@/lib/fonts";

const LINES = [
  { text: "Photosynthesis", heading: true },
  { text: "happens in the chloroplast" },
  { text: "light + H₂O + CO₂ → glucose + O₂" },
  { text: "chlorophyll absorbs red & blue light" },
];
const CHOICES = ["Mitochondria", "Chloroplast", "Nucleus", "Ribosome"];
const STAGES = ["photo", "scan", "quiz", "answer"] as const;
const DURATION = [1400, 2200, 1500, 2600];

/**
 * Looping hero demo: a photo of handwritten notes gets scanned, then turns
 * into a quiz question that gets answered. Static final frame when the user
 * prefers reduced motion.
 */
export function NotesToQuizDemo({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const stage = reduce ? "answer" : STAGES[i];

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setI((x) => (x + 1) % STAGES.length), DURATION[i]);
    return () => clearTimeout(t);
  }, [i, reduce]);

  const showQuiz = stage === "quiz" || stage === "answer";

  return (
    <div className={clsx("relative mx-auto aspect-[5/4] w-full max-w-[560px]", className)} aria-label="Demo: a photo of notes turns into a quiz" role="img">
      <div className="absolute inset-x-10 top-6 bottom-0 rounded-[40px] bg-accent opacity-[0.14] blur-3xl" />

      {/* The photo of notes */}
      <motion.div
        className="absolute left-[4%] top-[6%] w-[62%] origin-top-left"
        animate={showQuiz ? { scale: 0.58, x: -6, y: -8, rotate: -6, opacity: 0.9 } : { scale: 1, x: 0, y: 0, rotate: -3, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
      >
        <div className="relative overflow-hidden rounded-[22px] border border-black/5 bg-[#fbf8ef] p-[7%] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(transparent,transparent_27px,rgb(80_120_200/0.16)_28px)]" />
          <div className="pointer-events-none absolute inset-y-0 left-[9%] w-px bg-red-400/40" />
          <div className={clsx(handwriting.className, "relative flex flex-col gap-[6px] text-[#1f2430]")}>
            {LINES.map((l, k) => (
              <motion.p
                key={k}
                className={clsx("relative w-fit leading-[22px]", l.heading ? "text-[26px] font-bold" : "text-[19px] font-medium")}
                animate={stage === "scan" ? { backgroundColor: ["rgba(196,248,42,0)", "rgba(196,248,42,0.55)", "rgba(196,248,42,0.22)"] } : { backgroundColor: "rgba(196,248,42,0)" }}
                transition={{ delay: stage === "scan" ? 0.35 + k * 0.38 : 0, duration: 0.5 }}
                style={{ borderRadius: 6, padding: "0 4px" }}
              >
                {l.text}
              </motion.p>
            ))}
          </div>
          <AnimatePresence>
            {stage === "scan" && (
              <motion.div
                key="beam"
                className="pointer-events-none absolute inset-x-0 h-16"
                initial={{ top: "-15%", opacity: 0 }}
                animate={{ top: ["-15%", "100%"], opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.9, ease: "easeInOut" }}
                style={{ background: "linear-gradient(180deg, transparent, rgba(196,248,42,0.35) 70%, #c4f82a 98%, transparent)" }}
              />
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {stage === "scan" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#0b0c0e] px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Reading handwriting…
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* The quiz it becomes */}
      <AnimatePresence>
        {showQuiz && (
          <motion.div
            key="quiz"
            className="absolute right-[2%] top-[18%] w-[68%]"
            initial={{ opacity: 0, x: 40, scale: 0.9, rotate: 4 }}
            animate={{ opacity: 1, x: 0, scale: 1, rotate: 1.5 }}
            exit={{ opacity: 0, x: 30, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }}
          >
            <div className="rounded-[26px] border border-white/10 bg-[#121417] p-5 text-white shadow-[0_40px_80px_-24px_rgb(0_0_0/0.85)]">
              <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                <span>Question 1 of 12</span>
                <span className="rounded-full bg-[#c4f82a]/15 px-2 py-0.5 text-[#c4f82a]">Biology</span>
              </div>
              <p className="mb-4 text-[17px] font-semibold leading-snug tracking-tight">Where does photosynthesis happen?</p>
              <div className="grid grid-cols-2 gap-2">
                {CHOICES.map((c, k) => {
                  const right = stage === "answer" && k === 1;
                  return (
                    <motion.div
                      key={c}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, scale: right ? [1, 1.06, 1] : 1 }}
                      transition={{ delay: 0.12 + k * 0.06, scale: { delay: 0.35, duration: 0.35 } }}
                      className={clsx(
                        "flex items-center justify-between rounded-2xl border px-3 py-2.5 text-[13px] font-medium",
                        right ? "border-[#c4f82a] bg-[#c4f82a] text-[#0b0c0e]" : "border-white/10 bg-white/[0.04] text-white/85",
                      )}
                    >
                      {c}
                      {right && <IconCheck size={15} />}
                    </motion.div>
                  );
                })}
              </div>
            </div>
            <AnimatePresence>
              {stage === "answer" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 15 }}
                  className="absolute -right-2 -top-4 flex items-center gap-1 rounded-full bg-[#c4f82a] px-3 py-1.5 text-sm font-bold text-[#0b0c0e] shadow-[0_10px_30px_-6px_rgb(196_248_42/0.7)]"
                >
                  <IconSparkle size={15} /> +10
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
