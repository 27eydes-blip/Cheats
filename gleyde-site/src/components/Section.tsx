import { Reveal } from "./Reveal";

/**
 * The frame every content section shares. Each section is a full-screen
 * panel that the page snaps to, so one scroll shows one idea. Inside: a
 * hairline rule, a small index label on the left ("01  About") and the
 * content on the right. On phones the label sits above the content.
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
                className="font-display text-[2rem] leading-[1.12] tracking-[0.02em] text-ivory sm:text-5xl lg:text-[3.25rem]"
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
