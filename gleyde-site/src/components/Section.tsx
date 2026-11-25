import { DrawLine, RevealWords, WipeUp } from "./Motion";
import { Reveal } from "./Reveal";

/**
 * The frame every content section shares. Each section is a full-screen
 * panel that the page snaps to, so one scroll shows one idea. Inside: a
 * hairline rule, a large outlined section number with a small label on the
 * left, and the content on the right. On phones the label sits above the
 * content.
 *
 * Entrance (replays on every visit): the rule draws across, the number
 * wipes up, the label fades in and a text title rises word by word.
 */
export function Section({
  id,
  index,
  label,
  title,
  aside,
  children,
}: {
  id: string;
  index: string;
  label: string;
  /** Optional extra content under the label (desktop only), e.g. a link. */
  aside?: React.ReactNode;
  /** Optional large heading at the top of the content column. */
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = `${id}-title`;
  const titleClass =
    "font-display text-[2.25rem] leading-[1.04] tracking-[0.01em] text-ivory sm:text-[3.25rem] md:text-[clamp(3.25rem,5.2vw,5.5rem)]";
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="panel flex min-h-svh items-center px-6 pt-20 pb-10 sm:px-10 sm:pt-24 sm:pb-14 lg:px-16"
    >
      <div className="relative mx-auto grid w-full max-w-[88rem] gap-x-10 gap-y-6 pt-8 sm:gap-y-10 sm:pt-12 md:grid-cols-12">
        <DrawLine className="hairline absolute inset-x-0 top-0 block" />

        <div className="flex items-end gap-5 md:col-span-3 md:block">
          {/* The section number: large, outlined, Art Deco. */}
          <WipeUp className="block">
            <span
              aria-hidden="true"
              className="numeral-outline block font-display text-[3.25rem] leading-[0.8] md:text-[clamp(5rem,8vw,9rem)]"
            >
              {index}
            </span>
          </WipeUp>
          <Reveal delay={0.25} y={12}>
            <p className="eyebrow pb-1 md:mt-7 md:pb-0">{label}</p>
            {aside && <div className="mt-10 hidden md:block">{aside}</div>}
          </Reveal>
        </div>

        <div className="md:col-span-9">
          {title ? (
            <h2 id={titleId} className={titleClass}>
              {typeof title === "string" ? <RevealWords text={title} delay={0.1} /> : title}
            </h2>
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
