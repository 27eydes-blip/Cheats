import { leadership } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

/** Section 5: leadership cards, each with an initials monogram in a diamond. */
export function Leadership() {
  return (
    <section id="leadership" aria-labelledby="leadership-title" className="px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="leadership-title" eyebrow="Leadership" title="The people behind Gleyde." />

        <ul className="mt-16 grid grid-cols-2 gap-3 sm:mt-20 sm:gap-5 lg:grid-cols-4">
          {leadership.map((person, i) => (
            <li key={person.name}>
              <Reveal delay={i * 0.08} className="h-full">
                <article className="group flex h-full flex-col items-center border border-ivory/10 px-3 pt-9 pb-8 text-center sm:px-6 sm:pt-12 sm:pb-10 transition-[box-shadow,border-color] duration-700 ease-deco hover:border-gold/40 hover:glow-gold">
                  <div className="relative flex size-20 items-center sm:size-28 justify-center" aria-hidden="true">
                    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none">
                      <path d="M50 2 L98 50 L50 98 L2 50 Z" stroke="#C9A24B" strokeWidth="0.8" />
                      <path
                        d="M50 10 L90 50 L50 90 L10 50 Z"
                        stroke="#C9A24B"
                        strokeOpacity="0.35"
                        strokeWidth="0.6"
                        className="origin-center transition-transform duration-700 ease-deco group-hover:scale-[0.92]"
                      />
                    </svg>
                    <span className="text-gold-gradient relative font-display text-xl tracking-[0.08em] sm:text-2xl">
                      {person.initials}
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-base tracking-[0.06em] sm:mt-8 sm:text-xl text-ivory">{person.name}</h3>
                  <p className="mt-3 text-[0.6rem] leading-relaxed tracking-[0.2em] sm:text-[0.7rem] sm:tracking-[0.24em] text-gold uppercase">
                    {person.title}
                  </p>
                  {person.note && <p className="mt-2 text-xs font-light sm:text-sm text-ivory/60">{person.note}</p>}
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
