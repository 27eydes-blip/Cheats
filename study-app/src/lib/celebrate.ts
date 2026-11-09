"use client";

/**
 * Confetti for wins (finishing a quiz, high scores, and later streaks).
 * Loaded on demand; skipped entirely when the user prefers reduced motion.
 */
const COLORS = ["#c4f82a", "#e9ffb0", "#ffffff", "#8bd400"];

function reduced() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function celebrate(level: "small" | "big" = "small") {
  if (reduced()) return;
  const { default: confetti } = await import("canvas-confetti");
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 200, ticks: 220 };
  if (level === "small") {
    confetti({ ...base, particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.7 } });
    return;
  }
  confetti({ ...base, particleCount: 90, angle: 60, spread: 65, startVelocity: 55, origin: { x: 0, y: 0.75 } });
  confetti({ ...base, particleCount: 90, angle: 120, spread: 65, startVelocity: 55, origin: { x: 1, y: 0.75 } });
  setTimeout(() => confetti({ ...base, particleCount: 120, spread: 110, startVelocity: 30, scalar: 1.1, origin: { y: 0.45 } }), 250);
}
