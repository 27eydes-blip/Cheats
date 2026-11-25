"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { site } from "@/lib/site";
import { GleydeMark } from "./GleydeMark";

/**
 * Full-screen hero.
 *
 * The entrance (logo drawing in, text rising) is plain CSS so it starts on
 * first paint, before JavaScript loads; that keeps LCP fast. Framer Motion
 * only adds the scroll parallax once the page is interactive.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Layers move at different speeds as the hero scrolls away.
  const markY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "38%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "22%"]);
  const glowY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "12%"]);
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      ref={ref}
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 pt-16 pb-28"
    >
      {/* Background: soft gold glow + faint concentric deco diamonds */}
      <m.div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ y: glowY }}>
        <div className="absolute top-1/2 left-1/2 size-[64rem] max-w-[200vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(216,200,160,0.13),rgba(216,200,160,0.04)_45%,transparent_72%)]" />
        <svg
          viewBox="0 0 800 800"
          className="absolute top-1/2 left-1/2 h-[150vmin] w-[150vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.09]"
          fill="none"
          stroke="#D8C8A0"
          strokeWidth="0.6"
        >
          {[380, 260].map((r) => (
            <path key={r} d={`M400 ${400 - r} L${400 + r * 0.72} 400 L400 ${400 + r} L${400 - r * 0.72} 400 Z`} />
          ))}
          
        </svg>
      </m.div>

      <m.div style={{ y: markY, opacity: fade }} className="relative">
        <GleydeMark
          animated
          delay={0.15}
          title="Gleyde Technologies logo"
          className="h-40 w-auto drop-shadow-[0_0_28px_rgba(216,200,160,0.25)] sm:h-52 md:h-60"
        />
      </m.div>

      <m.div style={{ y: textY, opacity: fade }} className="relative mt-10 text-center sm:mt-12">
        <h1 id="hero-title" className="font-display text-ivory">
          <span
            className="block animate-rise text-[3.25rem] leading-none tracking-[0.12em] pl-[0.12em] sm:text-7xl md:text-8xl"
            style={{ animationDelay: "0.35s" }}
          >
            Gleyde
          </span>
          <span
            className="text-gold-gradient mt-4 block animate-rise text-[0.8rem] tracking-[0.62em] pl-[0.62em] sm:text-base sm:tracking-[0.7em] sm:pl-[0.7em] md:mt-5"
            style={{ animationDelay: "0.6s" }}
          >
            Technologies
          </span>
        </h1>
        <p
          className="mt-10 animate-rise text-[0.95rem] font-light tracking-[0.24em] pl-[0.24em] text-ivory/75 sm:text-lg"
          style={{ animationDelay: "1.1s" }}
        >
          {site.tagline}
        </p>
      </m.div>

      {/* Scroll cue */}
      <a
        href="#about"
        className="group absolute bottom-8 left-1/2 flex -translate-x-1/2 animate-rise flex-col items-center gap-3 p-2"
        style={{ animationDelay: "2.2s" }}
        aria-label="Scroll to About"
      >
        <span className="text-[0.6rem] tracking-[0.4em] text-ivory/60 uppercase transition-colors group-hover:text-gold-light">
          Scroll
        </span>
        <span className="relative block h-12 w-px overflow-hidden bg-ivory/10">
          <span className="scroll-cue bg-gold-gradient absolute inset-0 block" />
        </span>
      </a>
    </section>
  );
}
