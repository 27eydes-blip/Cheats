import { About } from "@/components/About";
import { Contact } from "@/components/Contact";
import { Divider } from "@/components/Divider";
import { Divisions } from "@/components/Divisions";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Leadership } from "@/components/Leadership";
import { Legal } from "@/components/Legal";
import { Nav } from "@/components/Nav";
import { Roadmap } from "@/components/Roadmap";
import { divisions, leadership } from "@/data/portfolio";
import { site } from "@/lib/site";

/** Organization structured data for search engines. */
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: site.name,
    legalName: site.legalName,
    url: site.url,
    logo: `${site.url}/icon.svg`,
    image: `${site.url}/opengraph-image`,
    description: site.description,
    slogan: site.tagline,
    foundingDate: String(site.foundingYear),
    email: site.email,
    founder: { "@type": "Person", name: site.founder },
    employee: leadership.map((l) => ({ "@type": "Person", name: l.name, jobTitle: l.title })),
    department: divisions.map((d) => ({
      "@type": "Organization",
      name: d.name,
      description: d.description,
      ...(d.url ? { url: d.url } : {}),
    })),
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: site.email },
  };
}

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="fixed top-3 left-3 z-[70] -translate-y-24 rounded-full bg-ivory px-5 py-2 text-sm text-ink transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <About />
        <Divider />
        <Divisions />
        <Divider />
        <Roadmap />
        <Divider />
        <Leadership />
        <Divider />
        <Legal />
        <Divider />
        <Contact />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // JSON.stringify output is safe here: all values are our own constants.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
