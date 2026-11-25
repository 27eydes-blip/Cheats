import { divisions } from "@/data/portfolio";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { StatusBadge } from "./StatusBadge";

/** Strips the protocol for display: "https://a.com/x" → "a.com/x". */
function prettyUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M4 12 L12 4 M6 4 H12 V10" />
    </svg>
  );
}

/**
 * Section 3: the three divisions. Content comes from src/data/portfolio.ts.
 * Each division is a large card: numeral, name, description, status and
 * domain, followed by its products.
 */
export function Divisions() {
  return (
    <section id="divisions" aria-labelledby="divisions-title" className="px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="divisions-title" eyebrow="Divisions" title="Three houses, one standard." />

        <ol className="mt-16 space-y-6 sm:mt-20 sm:space-y-8">
          {divisions.map((d, i) => (
            <li key={d.id} id={`division-${d.id}`}>
              <Reveal delay={i * 0.08}>
                <article
                  aria-labelledby={`${d.id}-name`}
                  className="group relative overflow-hidden rounded-[2px] border border-ivory/10 bg-ink-soft/60 transition-[box-shadow,border-color] duration-700 ease-deco hover:border-gold/40 hover:glow-gold"
                >
                  {/* Deco corner accents */}
                  <span aria-hidden="true" className="absolute top-0 left-0 h-px w-16 bg-gold/60 transition-all duration-700 ease-deco group-hover:w-32" />
                  <span aria-hidden="true" className="absolute top-0 left-0 h-16 w-px bg-gold/60 transition-all duration-700 ease-deco group-hover:h-32" />
                  <span aria-hidden="true" className="absolute right-0 bottom-0 h-px w-16 bg-gold/60 transition-all duration-700 ease-deco group-hover:w-32" />
                  <span aria-hidden="true" className="absolute right-0 bottom-0 h-16 w-px bg-gold/60 transition-all duration-700 ease-deco group-hover:h-32" />

                  <div className="grid gap-8 p-7 sm:p-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 md:p-14">
                    {/* Left: identity */}
                    <header>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-display text-sm tracking-[0.3em] text-gold" aria-hidden="true">
                          {d.numeral}
                        </span>
                        <StatusBadge status={d.status} />
                      </div>
                      <h3
                        id={`${d.id}-name`}
                        className="mt-6 font-display text-[1.75rem] leading-tight tracking-[0.04em] text-ivory sm:text-4xl"
                      >
                        {d.name}
                      </h3>
                      <p className="mt-4 text-base leading-relaxed font-light text-ivory/75">{d.description}</p>
                      {d.lead && (
                        <p className="mt-6 text-[0.7rem] leading-relaxed tracking-[0.2em] text-ivory/60 uppercase">
                          {d.leadLabel ?? "Led by"} <span className="text-ivory/85">{d.lead}</span>
                        </p>
                      )}
                      {d.url && (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-8 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-sm tracking-[0.08em] text-gold-light transition-colors hover:border-gold-light"
                        >
                          {prettyUrl(d.url)}
                          <Arrow />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      )}
                    </header>

                    {/* Right: products */}
                    <div>
                      <h4 className="sr-only">{d.name} products</h4>
                      <ul className="divide-y divide-ivory/8 border-y border-ivory/8">
                        {d.projects.map((p) => {
                          // Mobile: name + badge share a row and the description runs full
                          // width beneath. From sm up the badge sits beside both lines.
                          const body = (
                            <>
                              <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 font-display text-lg tracking-[0.04em] text-ivory transition-colors group-hover/p:text-gold-light">
                                {p.name}
                                {p.url && (
                                  <span className="text-gold opacity-0 transition-opacity duration-300 group-hover/p:opacity-100 group-focus-visible/p:opacity-100">
                                    <Arrow />
                                  </span>
                                )}
                              </span>
                              <span className="col-span-2 row-start-2 mt-1 block text-sm leading-relaxed font-light text-ivory/65 sm:col-span-1">
                                {p.description}
                              </span>
                              <span className="col-start-2 row-start-1 self-start">
                                <StatusBadge status={p.status} />
                              </span>
                            </>
                          );
                          const row = "group/p grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-5";
                          return (
                            <li key={p.name}>
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
                        <p className="mt-5 font-display text-sm tracking-[0.18em] text-ivory/60 italic">
                          {d.footnote}…
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
