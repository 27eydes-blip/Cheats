import { roadmap } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/**
 * Section 03: Now / Next / Later as a vertical timeline. A single hairline
 * runs down the left; the current phase is marked with a champagne dot.
 */
export function Roadmap() {
  return (
    <Section id="roadmap" index="03" label="Roadmap" title="Where we are going.">
      <ol className="relative mt-10 sm:mt-16">
        <span aria-hidden="true" className="absolute top-3 bottom-3 left-[2.5px] w-(--hair) bg-(--color-rule)" />
        {roadmap.map((phase, i) => (
          <li key={phase.phase} className="relative pb-8 pl-10 last:pb-0 sm:grid sm:grid-cols-[12rem_1fr] sm:pb-10 sm:pl-14">
            <span
              aria-hidden="true"
              className={`absolute top-[0.6rem] left-0 block size-1.5 rounded-full ${
                i === 0 ? "bg-gold-light" : "border-(length:--hair) border-ivory/40 bg-ink"
              }`}
            />
            <Reveal>
              <p className="font-display text-xl tracking-[0.08em] text-ivory sm:text-2xl">{phase.phase}</p>
              {phase.when && (
                <p className="mt-2 text-[0.65rem] tracking-[0.3em] text-ivory/50 uppercase">{phase.when}</p>
              )}
            </Reveal>
            <Reveal delay={0.08} className="mt-3 sm:mt-0">
              <h3 className="font-display text-lg tracking-[0.02em] text-gold-light sm:text-2xl">{phase.title}</h3>
              <ul className="mt-3 space-y-1.5 sm:mt-6 sm:space-y-3">
                {phase.items.map((item) => (
                  <li key={item} className="text-sm leading-relaxed font-light text-ivory/65 sm:text-base">
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
