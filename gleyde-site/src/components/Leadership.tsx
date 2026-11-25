import { leadership } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** Section 04: leadership. Initials in a fine diamond, name, title. */
export function Leadership() {
  return (
    <Section id="leadership" index="04" label="Leadership" title="The people behind Gleyde.">
      <ul className="mt-16 grid grid-cols-2 gap-x-6 gap-y-16 sm:mt-24 lg:grid-cols-4 lg:gap-x-10">
        {leadership.map((person, i) => (
          <li key={person.name}>
            <Reveal delay={i * 0.06}>
              <article className="group">
                <div className="relative flex size-16 items-center justify-center sm:size-20" aria-hidden="true">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" fill="none">
                    <path
                      d="M50 1 L99 50 L50 99 L1 50 Z"
                      stroke="currentColor"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      className="text-ivory/30 transition-colors duration-500 group-hover:text-gold"
                    />
                  </svg>
                  <span className="relative font-display text-base tracking-[0.08em] text-gold-light sm:text-lg">
                    {person.initials}
                  </span>
                </div>
                <h3 className="mt-8 font-display text-lg tracking-[0.03em] text-ivory sm:text-xl">{person.name}</h3>
                <p className="mt-3 text-[0.62rem] leading-relaxed tracking-[0.22em] text-ivory/55 uppercase sm:text-[0.68rem]">
                  {person.title}
                </p>
                {person.note && <p className="mt-2 text-sm font-light text-ivory/45">{person.note}</p>}
              </article>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
