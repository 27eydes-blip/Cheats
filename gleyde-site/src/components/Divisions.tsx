import Link from "next/link";
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
 * Section 02: the divisions, one full-screen panel each. Content comes from
 * src/data/portfolio.ts; add a division there and it gets its own panel.
 * Identity on the left, products on the right, separated only by hairlines.
 * On phones, product descriptions are hidden so each panel fits one screen.
 */
export function Divisions() {
  return (
    <>
      {divisions.map((d, i) => (
        <Section
          key={d.id}
          // The first division takes the #divisions anchor used by the nav.
          id={i === 0 ? "divisions" : `division-${d.id}`}
          index="02"
          label={`Divisions ${d.numeral}`}
          title={d.name}
          aside={
            <Link
              href="/portfolio"
              className="group inline-flex items-center gap-2 text-[0.68rem] tracking-[0.24em] text-gold-light uppercase"
            >
              Full portfolio
              <span className="transition-transform duration-500 ease-deco group-hover:translate-x-1">→</span>
            </Link>
          }
        >
          <div className="mt-6 grid gap-8 sm:mt-10 lg:grid-cols-9 lg:gap-10">
            <Reveal delay={0.05} className="lg:col-span-4">
              <StatusBadge status={d.status} />
              <p className="mt-5 max-w-sm text-base leading-relaxed font-light text-ivory/65">{d.description}</p>
              {d.lead && (
                <p className="mt-6 text-[0.68rem] leading-relaxed tracking-[0.22em] text-ivory/55 uppercase">
                  {d.leadLabel ?? "Led by"} <span className="text-ivory/85">{d.lead}</span>
                </p>
              )}
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-6 inline-flex items-center gap-2 text-sm tracking-[0.06em] text-gold-light"
                >
                  <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_var(--hair)] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 ease-deco group-hover:bg-[length:100%_var(--hair)]">
                    {prettyUrl(d.url)}
                  </span>
                  <Arrow />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </Reveal>

            <Reveal delay={0.12} className="lg:col-span-5">
              <h3 className="sr-only">{d.name} products</h3>
              <ul className="rule-t">
                {d.projects.map((p) => {
                  const body = (
                    <>
                      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 font-display text-base tracking-[0.03em] text-ivory transition-colors duration-300 group-hover/p:text-gold-light sm:text-lg">
                        {p.name}
                        {p.url && (
                          <span className="text-gold opacity-0 transition-opacity duration-300 group-hover/p:opacity-100 group-focus-visible/p:opacity-100">
                            <Arrow />
                          </span>
                        )}
                      </span>
                      <span className="col-span-2 row-start-2 mt-1.5 hidden text-sm leading-relaxed font-light text-ivory/60 sm:col-span-1 sm:block">
                        {p.description}
                      </span>
                      <span className="col-start-2 row-start-1 self-center">
                        <StatusBadge status={p.status} />
                      </span>
                    </>
                  );
                  const row = "group/p rule-b grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 py-3.5 sm:py-3.5";
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
                <p className="mt-5 text-[0.68rem] tracking-[0.24em] text-ivory/50 uppercase">{d.footnote}</p>
              )}
            </Reveal>
          </div>
        </Section>
      ))}
    </>
  );
}
