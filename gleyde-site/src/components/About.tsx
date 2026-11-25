import { site } from "@/lib/site";
import { Reveal } from "./Reveal";

/** Section 2: what Gleyde is, in three lines. */
export function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="px-6 py-28 sm:py-36 md:py-44">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <p className="eyebrow">About</p>
          <h2 id="about-title" className="sr-only">
            About Gleyde Technologies
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-8 font-display text-[1.6rem] leading-[1.45] tracking-[0.02em] text-ivory sm:text-4xl md:text-[2.6rem]">
            A technology company building <span className="text-gold-gradient">games</span>,{" "}
            <span className="text-gold-gradient">software</span>, and{" "}
            <span className="text-gold-gradient">security</span>.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-10 max-w-2xl text-base leading-relaxed font-light text-ivory/70 sm:text-lg">
            We make original games, focused tools and cybersecurity products, each held to the same
            standard: simple to use, carefully built, and made to last.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mt-10 text-[0.7rem] tracking-[0.32em] text-ivory/60 uppercase">
            Founded by <span className="text-ivory">{site.founder}</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
