import { Reveal } from "./Reveal";

/** Eyebrow label + Cinzel title used at the top of every section. */
export function SectionHeading({
  eyebrow,
  title,
  id,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** id for the heading, so the section can reference it with aria-labelledby. */
  id: string;
  align?: "left" | "center";
}) {
  const centered = align === "center";
  return (
    <Reveal className={centered ? "text-center" : undefined}>
      <p className="eyebrow">{eyebrow}</p>
      <h2
        id={id}
        className="mt-5 font-display text-[2rem] leading-[1.15] tracking-[0.04em] text-ivory sm:text-5xl md:text-[3.5rem]"
      >
        {title}
      </h2>
    </Reveal>
  );
}
