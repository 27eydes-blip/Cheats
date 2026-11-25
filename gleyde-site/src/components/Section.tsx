import { Reveal } from "./Reveal";

/**
 * The frame every content section shares: a hairline rule across the top,
 * a small index label on the left ("01  About") and the content on the
 * right. On phones the label sits above the content.
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
    <section id={id} aria-labelledby={titleId} className="px-6 sm:px-10 lg:px-16">
      <div className="rule-t mx-auto grid max-w-[88rem] gap-x-10 gap-y-12 py-24 sm:py-32 md:grid-cols-12 lg:py-40">
        <Reveal className="md:col-span-3">
          <p className="eyebrow flex gap-5">
            <span className="text-gold">{index}</span>
            <span>{label}</span>
          </p>
        </Reveal>
        <div className="md:col-span-9">
          {title ? (
            <Reveal>
              <h2
                id={titleId}
                className="font-display text-[2rem] leading-[1.12] tracking-[0.02em] text-ivory sm:text-5xl lg:text-[3.75rem]"
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
