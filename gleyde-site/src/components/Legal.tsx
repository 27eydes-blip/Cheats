import { site } from "@/lib/site";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** Section 05: intellectual property statement. */
export function Legal() {
  return (
    <Section id="legal" index="05" label="Legal">
      <Reveal>
        <p className="max-w-3xl text-lg leading-relaxed font-light text-ivory/70 sm:text-xl sm:leading-relaxed">
          All games, software, brands, logos, and content on this site are the intellectual property of{" "}
          <span className="text-ivory">{site.legalName}</span>. Created by {site.founder}. All rights
          reserved.
        </p>
      </Reveal>
    </Section>
  );
}
