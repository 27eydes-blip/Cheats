import { leadership } from "@/data/portfolio";
import { StaggerItem, StaggerList } from "./Motion";
import { Section } from "./Section";

const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * Section 04: leadership as an editorial masthead. One row per person:
 * a Roman numeral, the name set large in Cinzel, and the title in small
 * caps, divided by hairlines. Rows light up in champagne on hover.
 * Order and wording come from `leadership` in src/data/portfolio.ts.
 */
export function Leadership() {
  return (
    <Section id="leadership" index="04" label="Leadership">
      <StaggerList as="ol" className="rule-t" delay={0.2} gap={0.12}>
        {leadership.map((person, i) => (
          <StaggerItem key={person.name} className="rule-b">
              <article className="group grid grid-cols-[2.25rem_1fr] items-baseline gap-x-4 py-6 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-x-8 sm:py-8 lg:py-9">
                <span
                  aria-hidden="true"
                  className="font-display text-xs tracking-[0.2em] text-gold transition-colors duration-500 group-hover:text-gold-light"
                >
                  {numerals[i] ?? i + 1}
                </span>
                <h3 className="font-display text-[1.85rem] leading-none tracking-[0.02em] text-ivory transition-[color,transform] duration-700 ease-deco group-hover:translate-x-2 group-hover:text-gold-light sm:text-[clamp(2.25rem,4.4vw,4.25rem)]">
                  {person.name}
                </h3>
                <p className="col-start-2 mt-3 text-[0.65rem] leading-relaxed tracking-[0.26em] text-ivory/60 uppercase sm:col-start-3 sm:mt-0 sm:text-right sm:text-[0.7rem]">
                  {person.title}
                  {person.note && (
                    <span className="mt-1.5 block text-[0.8rem] tracking-[0.02em] normal-case text-ivory/55">
                      {person.note}
                    </span>
                  )}
                </p>
              </article>
          </StaggerItem>
        ))}
      </StaggerList>
    </Section>
  );
}
