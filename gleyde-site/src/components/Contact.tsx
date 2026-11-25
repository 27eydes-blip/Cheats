import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** Section 06: email link and a short contact form. */
export function Contact() {
  return (
    <Section id="contact" index="06" label="Contact" title="Begin a conversation.">
      <div className="mt-8 grid gap-10 sm:mt-14 lg:grid-cols-9 lg:gap-10">
        <Reveal className="lg:col-span-4">
          <p className="max-w-sm text-base leading-relaxed font-light text-ivory/65">
            Partnerships, press, security work or a website of your own. Write to us and we will reply
            personally.
          </p>
          <a
            href={`mailto:${site.email}`}
            className="mt-8 inline-block bg-[linear-gradient(currentColor,currentColor)] bg-[length:100%_var(--hair)] bg-left-bottom bg-no-repeat pb-1.5 text-lg font-light tracking-[0.02em] break-all text-gold-light transition-colors duration-300 hover:text-ivory"
          >
            {site.email}
          </a>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-5">
          <ContactForm />
        </Reveal>
      </div>
    </Section>
  );
}
