"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { site } from "@/lib/site";
import { GleydeMark } from "./GleydeMark";

/**
 * Full-screen hero: the mark, the name, the tagline. Nothing else.
 *
 * The entrance (logo drawing in, text rising) is plain CSS so it starts on
 * first paint, before JavaScript loads; that keeps LCP fast. Framer Motion
 * only adds a gentle scroll parallax once the page is interactive.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const markY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "30%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "16%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      id="top"
      aria-labelledby="hero-title"
      className="panel relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 pt-16 pb-24"
    >
      <m.div style={{ y: markY, opacity: fade }}>
        <GleydeMark
          animated
          delay={0.15}
          title="Gleyde Technologies logo"
          className="h-40 w-auto sm:h-52 lg:h-[clamp(14rem,24vh,18rem)]"
        />
      </m.div>

      <m.div style={{ y: textY, opacity: fade }} className="mt-10 text-center sm:mt-14">
        <h1 id="hero-title" className="font-display text-ivory">
          <span
            className="block animate-rise pl-[0.12em] text-[clamp(3.4rem,13.5vw,12.5rem)] leading-[0.9] tracking-[0.12em]"
            style={{ animationDelay: "0.35s" }}
          >
            Gleyde
          </span>
          <span
            className="mt-6 block animate-rise pl-[0.8em] text-[0.8rem] tracking-[0.8em] text-gold sm:text-base lg:text-lg"
            style={{ animationDelay: "0.6s" }}
          >
            Technologies
          </span>
        </h1>
        <p
          className="mt-10 animate-rise pl-[0.34em] text-[0.8rem] font-light tracking-[0.34em] text-ivory/65 uppercase sm:mt-12 sm:text-[0.95rem]"
          style={{ animationDelay: "1.1s" }}
        >
          {site.tagline}
        </p>
      </m.div>

      {/* Scroll cue: a single hairline with a travelling highlight */}
      <a
        href="#about"
        className="absolute bottom-8 left-1/2 block -translate-x-1/2 animate-rise p-3"
        style={{ animationDelay: "2.2s" }}
        aria-label="Scroll to About"
      >
        <span className="relative block h-14 w-px overflow-hidden bg-ivory/12">
          <span className="scroll-cue absolute inset-0 block bg-gold" />
        </span>
      </a>
    </section>
  );
}
