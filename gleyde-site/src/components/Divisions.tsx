import { divisions } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { Section } from "./Section";
import { StatusBadge } from "./StatusBadge";

/** Strips the protocol for display: "https://a.com/x" → "a.com/x". */
function prettyUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <path d="M4 12 L12 4 M6 4 H12 V10" />
    </svg>
  );
}

/**
 * Section 02: the three divisions. Content comes from src/data/portfolio.ts.
 * Each division is a row: identity on the left, its products on the right,
 * separated only by hairlines.
 */
export function Divisions() {
  return (
    <Section id="divisions" index="02" label="Divisions" title="Three houses, one standard.">
      <ol className="mt-16 sm:mt-24">
        {divisions.map((d) => (
          <li key={d.id} id={`division-${d.id}`} className="rule-t py-14 first:pt-14 sm:py-20">
            <Reveal>
              <article aria-labelledby={`${d.id}-name`} className="grid gap-12 lg:grid-cols-9 lg:gap-10">
                <header className="lg:col-span-4">
                  <p className="flex items-center justify-between gap-4">
                    <span className="font-display text-sm tracking-[0.3em] text-gold" aria-hidden="true">
                      {d.numeral}
                    </span>
                    <StatusBadge status={d.status} />
                  </p>
                  <h3
                    id={`${d.id}-name`}
                    className="mt-8 font-display text-[1.75rem] leading-tight tracking-[0.02em] text-ivory sm:text-[2.25rem]"
                  >
                    {d.name}
                  </h3>
                  <p className="mt-5 max-w-sm text-base leading-relaxed font-light text-ivory/65">{d.description}</p>
                  {d.lead && (
                    <p className="mt-8 text-[0.68rem] leading-relaxed tracking-[0.22em] text-ivory/55 uppercase">
                      {d.leadLabel ?? "Led by"} <span className="text-ivory/85">{d.lead}</span>
                    </p>
                  )}
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group mt-8 inline-flex items-center gap-2 text-sm tracking-[0.06em] text-gold-light"
                    >
                      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_var(--hair)] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 ease-deco group-hover:bg-[length:100%_var(--hair)]">
                        {prettyUrl(d.url)}
                      </span>
                      <Arrow />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </header>

                <div className="lg:col-span-5">
                  <h4 className="sr-only">{d.name} products</h4>
                  <ul>
                    {d.projects.map((p) => {
                      const body = (
                        <>
                          <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 font-display text-lg tracking-[0.03em] text-ivory transition-colors duration-300 group-hover/p:text-gold-light">
                            {p.name}
                            {p.url && (
                              <span className="text-gold opacity-0 transition-opacity duration-300 group-hover/p:opacity-100 group-focus-visible/p:opacity-100">
                                <Arrow />
                              </span>
                            )}
                          </span>
                          <span className="col-span-2 row-start-2 mt-1.5 block text-sm leading-relaxed font-light text-ivory/60 sm:col-span-1">
                            {p.description}
                          </span>
                          <span className="col-start-2 row-start-1 self-center">
                            <StatusBadge status={p.status} />
                          </span>
                        </>
                      );
                      const row = "group/p rule-b grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 py-6";
                      return (
                        <li key={p.name} className="max-lg:first:rule-t">
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className={row}>
                              {body}
                              <span className="sr-only">(opens in a new tab)</span>
                            </a>
                          ) : (
                            <div className={row}>{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {d.footnote && (
                    <p className="mt-6 text-[0.68rem] tracking-[0.24em] text-ivory/50 uppercase">{d.footnote}</p>
                  )}
                </div>
              </article>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
