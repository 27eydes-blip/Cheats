import { roadmap } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

/**
 * Section 4: Now / Next / Later as a vertical timeline. A gold hairline
 * runs down the left with a diamond node per phase.
 */
export function Roadmap() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="px-6 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-4xl">
        <SectionHeading id="roadmap-title" eyebrow="Roadmap" title="Where we are going." />

        <ol className="relative mt-16 sm:mt-20">
          {/* The spine */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[5px] w-px bg-linear-to-b from-gold/70 via-gold/25 to-transparent sm:left-[calc(9rem+5px)]"
          />
          {roadmap.map((phase, i) => (
            <li key={phase.phase} className="relative pb-16 pl-10 last:pb-0 sm:grid sm:grid-cols-[9rem_1fr] sm:pl-0">
              <Reveal delay={i * 0.1} className="sm:pr-10 sm:text-right">
                <p className="font-display text-2xl tracking-[0.12em] text-gold-light">{phase.phase}</p>
                {phase.when && (
                  <p className="mt-1 text-[0.65rem] tracking-[0.3em] text-ivory/60 uppercase">{phase.when}</p>
                )}
              </Reveal>

              {/* Node */}
              <span
                aria-hidden="true"
                className="absolute top-2.5 left-0 block size-[11px] rotate-45 border border-gold bg-ink sm:left-36"
              >
                <span className={`absolute inset-[3px] ${i === 0 ? "bg-gold-light shadow-[0_0_10px_#EFE3C4]" : "bg-gold/30"}`} />
              </span>

              <Reveal delay={i * 0.1 + 0.08} className="mt-4 sm:mt-0 sm:pl-12">
                <h3 className="font-display text-xl tracking-[0.04em] text-ivory sm:text-2xl">{phase.title}</h3>
                <ul className="mt-5 space-y-3">
                  {phase.items.map((item) => (
                    <li key={item} className="flex gap-4 text-base leading-relaxed font-light text-ivory/75">
                      <span aria-hidden="true" className="mt-[0.7em] block h-px w-4 shrink-0 bg-gold/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
