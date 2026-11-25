"use client";

import { m } from "framer-motion";
import { easeDeco } from "./Reveal";

/**
 * Section divider: two gold hairlines draw outward from a small central
 * diamond when the divider scrolls into view.
 */
export function Divider() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6">
      <m.span
        className="hairline block flex-1 origin-right"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.6, ease: easeDeco }}
      />
      <m.span
        className="block size-2 rotate-45 border border-gold/80"
        initial={{ opacity: 0, scale: 0.4 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.8, ease: easeDeco, delay: 0.2 }}
      />
      <m.span
        className="hairline block flex-1 origin-left"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.6, ease: easeDeco }}
      />
    </div>
  );
}
