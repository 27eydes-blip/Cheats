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
        {/* Draws itself in, then glows once when complete. */}
        <span className="mark-glow block">
          <GleydeMark
            animated
            delay={0.15}
            title="Gleyde Technologies logo"
            className="h-40 w-auto sm:h-52 lg:h-[clamp(14rem,24vh,18rem)]"
          />
        </span>
      </m.div>

      <m.div style={{ y: textY, opacity: fade }} className="mt-10 text-center sm:mt-14">
        <h1 id="hero-title" className="font-display text-ivory">
          <span className="sr-only">Gleyde Technologies</span>
          {/* "Gleyde": each letter rises from behind a mask, one after another. */}
          <span
            aria-hidden="true"
            className="flex justify-center overflow-hidden py-[0.06em] pl-[0.12em] text-[clamp(3.4rem,13.5vw,12.5rem)] leading-[0.9] tracking-[0.12em]"
          >
            {"Gleyde".split("").map((ch, i) => (
              <span key={i} className="letter-rise inline-block" style={{ animationDelay: `${0.45 + i * 0.075}s` }}>
                {ch}
              </span>
            ))}
          </span>
          {/* A fine champagne line sweeps out from the centre. */}
          <span aria-hidden="true" className="line-sweep mx-auto mt-5 block h-px w-24 bg-gold/70 sm:w-40" />
          {/* "Technologies" opens out from the centre. */}
          <span
            aria-hidden="true"
            className="open-out mt-5 block text-[0.8rem] text-gold sm:text-base lg:text-lg"
          >
            Technologies
          </span>
        </h1>
        <p className="mt-10 flex justify-center gap-[0.7em] pl-[0.34em] text-[0.8rem] font-light tracking-[0.34em] text-ivory/65 uppercase sm:mt-12 sm:text-[0.95rem]">
          {site.tagline.split(" ").map((word, i) => (
            <span key={word} className="inline-block animate-rise" style={{ animationDelay: `${1.55 + i * 0.16}s` }}>
              {word}
            </span>
          ))}
        </p>
      </m.div>

      {/* Scroll cue: a single hairline with a travelling highlight */}
      <a
        href="#about"
        className="absolute bottom-8 left-1/2 block -translate-x-1/2 animate-rise p-3"
        style={{ animationDelay: "2.3s" }}
        aria-label="Scroll to About"
      >
        <span className="relative block h-14 w-px overflow-hidden bg-ivory/12">
          <span className="scroll-cue absolute inset-0 block bg-gold" />
        </span>
      </a>
    </section>
  );
}
