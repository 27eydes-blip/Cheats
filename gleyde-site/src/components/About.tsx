import { site } from "@/lib/site";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** Section 01: what Gleyde is, in three lines. */
export function About() {
  return (
    <Section id="about" index="01" label="About">
      <Reveal>
        <p className="font-display text-[2rem] leading-[1.12] tracking-[0.01em] text-ivory sm:text-5xl md:text-[clamp(3rem,5vw,5.25rem)]">
          A technology company building games, software, and security.
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-10 max-w-xl text-base leading-relaxed font-light text-ivory/65 sm:text-lg">
          We make original games, focused tools and cybersecurity products, each held to the same
          standard: simple to use, carefully built, and made to last.
        </p>
      </Reveal>
      <Reveal delay={0.2}>
        <p className="mt-12 text-[0.7rem] tracking-[0.3em] text-ivory/55 uppercase">
          Founded by <span className="text-ivory">{site.founder}</span>
        </p>
      </Reveal>
    </Section>
  );
}
