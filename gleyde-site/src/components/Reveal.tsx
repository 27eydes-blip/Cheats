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
 * Fades and slides its children in whenever they scroll into view (and
 * resets once they leave, so panels come alive again on every visit).
 * Only opacity and transform animate, so there is no layout shift.
 */
export function Reveal({ delay = 0, y = 44, children, ...rest }: RevealProps) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.15 }}
      transition={{ duration: 1.4, ease: easeDeco, delay }}
      {...rest}
    >
      {children}
    </m.div>
  );
}

/** The viewport rule every scroll animation shares: replay on each visit. */
export const inView = { once: false, amount: 0.15 } as const;
