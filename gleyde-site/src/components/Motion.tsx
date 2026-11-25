"use client";

import { m, type Variants } from "framer-motion";
import { easeDeco, inView } from "./Reveal";

/**
 * Scroll-triggered entrances used across the panels. Each replays whenever
 * its panel comes back into view. Only transform / opacity / clip-path
 * animate, and Framer Motion's reduced-motion setting tames them.
 */

/** Heading text that rises word by word from behind a mask. */
export function RevealWords({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const words = text.split(" ");
  return (
    <m.span
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      transition={{ staggerChildren: 0.07, delayChildren: delay }}
    >
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] align-bottom -mb-[0.12em]">
          <m.span
            className="inline-block"
            variants={{ hidden: { y: "108%" }, show: { y: "0%", transition: { duration: 1.05, ease: easeDeco } } }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </m.span>
        </span>
      ))}
    </m.span>
  );
}

const listVariants: Variants = { hidden: {}, show: {} };
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: easeDeco } },
};

/** A list whose items cascade in one after another. Use with StaggerItem. */
export function StaggerList({
  as = "ul",
  delay = 0.15,
  gap = 0.08,
  className,
  children,
}: {
  as?: "ul" | "ol";
  delay?: number;
  gap?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as === "ol" ? m.ol : m.ul;
  return (
    <Tag
      className={className}
      variants={listVariants}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      transition={{ staggerChildren: gap, delayChildren: delay }}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <m.li className={className} variants={itemVariants}>
      {children}
    </m.li>
  );
}

/** A hairline that draws across (or down) when it comes into view. */
export function DrawLine({
  className,
  vertical = false,
  delay = 0,
}: {
  className?: string;
  vertical?: boolean;
  delay?: number;
}) {
  return (
    <m.span
      aria-hidden="true"
      className={className}
      style={{ originX: 0, originY: 0 }}
      initial={vertical ? { scaleY: 0 } : { scaleX: 0 }}
      whileInView={vertical ? { scaleY: 1 } : { scaleX: 1 }}
      viewport={inView}
      transition={{ duration: 1.6, ease: easeDeco, delay }}
    />
  );
}

/**
 * Content that wipes upward into view from behind a mask (section numerals).
 * The outer element watches the viewport; the inner one is clipped (a fully
 * clipped element would never register as visible on its own).
 */
export function WipeUp({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <m.span className={className} initial="hidden" whileInView="show" viewport={inView}>
      <m.span
        className="block"
        variants={{
          hidden: { clipPath: "inset(100% 0% 0% 0%)", y: 18 },
          show: { clipPath: "inset(0% 0% 0% 0%)", y: 0, transition: { duration: 1.3, ease: easeDeco } },
        }}
      >
        {children}
      </m.span>
    </m.span>
  );
}
