import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

/** Section 7: email link and a short contact form. */
export function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title" className="px-6 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto grid max-w-6xl gap-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-20">
        <div>
          <SectionHeading id="contact-title" eyebrow="Contact" title="Begin a conversation." />
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-sm text-base leading-relaxed font-light text-ivory/70">
              Partnerships, press, security work or a website of your own. Write to us and we will reply
              personally.
            </p>
            <a
              href={`mailto:${site.email}`}
              className="mt-10 inline-block border-b border-gold/40 pb-1 text-lg font-light tracking-[0.04em] break-all text-gold-light transition-colors hover:border-gold-light sm:text-xl"
            >
              {site.email}
            </a>
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <ContactForm />
        </Reveal>
      </div>
    </section>
  );
}
