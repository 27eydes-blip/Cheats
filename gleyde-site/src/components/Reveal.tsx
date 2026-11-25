"use client";

import { m, type HTMLMotionProps } from "framer-motion";

/** Shared easing: a long, soft deceleration. */
export const easeDeco = [0.22, 1, 0.36, 1] as const;

type RevealProps = HTMLMotionProps<"div"> & {
  /** Seconds to wait after the element scrolls into view. */
  delay?: number;
  /** Distance to slide up from, in px. */
  y?: number;
};

/**
 * Fades and slides its children in the first time they scroll into view.
 * Only opacity and transform animate, so there is no layout shift.
 */
export function Reveal({ delay = 0, y = 28, children, ...rest }: RevealProps) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 1.1, ease: easeDeco, delay }}
      {...rest}
    >
      {children}
    </m.div>
  );
}
