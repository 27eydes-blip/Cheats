import { site } from "@/lib/site";
import { Reveal } from "./Reveal";

/** Section 6: intellectual property statement. */
export function Legal() {
  return (
    <section id="legal" aria-labelledby="legal-title" className="px-6 py-28 sm:py-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">Legal</p>
        <h2 id="legal-title" className="mt-5 font-display text-2xl tracking-[0.08em] text-ivory sm:text-3xl">
          Intellectual Property
        </h2>
        <div className="mx-auto mt-8 h-px w-16 bg-gold/50" aria-hidden="true" />
        <p className="mt-8 text-base leading-loose font-light text-ivory/75 sm:text-lg sm:leading-loose">
          All games, software, brands, logos, and content on this site are the intellectual property of{" "}
          {site.legalName}. Created by {site.founder}. All rights reserved.
        </p>
      </Reveal>
    </section>
  );
}
