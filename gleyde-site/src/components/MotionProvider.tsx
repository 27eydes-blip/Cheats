"use client";

import { LazyMotion, MotionConfig } from "framer-motion";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/**
 * Wraps the app so every Framer Motion animation:
 *  - honours prefers-reduced-motion (transforms skipped, opacity still fades);
 *  - uses the lightweight `m` components, with the animation features
 *    loaded lazily (keeps the initial JavaScript small for a fast LCP).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
