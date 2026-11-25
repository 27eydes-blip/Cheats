import { Reveal } from "./Reveal";

/**
 * The frame every content section shares. Each section is a full-screen
 * panel that the page snaps to, so one scroll shows one idea. Inside: a
 * hairline rule, a large outlined section number with a small label on the
 * left, and the content on the right. On phones the label sits above the content.
 */
export function Section({
  id,
  index,
  label,
  title,
  children,
}: {
  id: string;
  index: string;
  label: string;
  /** Optional large heading at the top of the content column. */
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="panel flex min-h-svh items-center px-6 pt-20 pb-10 sm:px-10 sm:pt-24 sm:pb-14 lg:px-16"
    >
      <div className="rule-t mx-auto grid w-full max-w-[88rem] gap-x-10 gap-y-6 pt-8 sm:gap-y-10 sm:pt-12 md:grid-cols-12">
        <Reveal className="flex items-end gap-5 md:col-span-3 md:block">
          {/* The section number: large, outlined, Art Deco. */}
          <span
            aria-hidden="true"
            className="numeral-outline block font-display text-[3.25rem] leading-[0.8] md:text-[clamp(5rem,8vw,9rem)]"
          >
            {index}
          </span>
          <p className="eyebrow pb-1 md:mt-7 md:pb-0">{label}</p>
        </Reveal>
        <div className="md:col-span-9">
          {title ? (
            <Reveal>
              <h2
                id={titleId}
                className="font-display text-[2.25rem] leading-[1.04] tracking-[0.01em] text-ivory sm:text-[3.25rem] md:text-[clamp(3.25rem,5.2vw,5.5rem)]"
              >
                {title}
              </h2>
            </Reveal>
          ) : (
            <h2 id={titleId} className="sr-only">
              {label}
            </h2>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
