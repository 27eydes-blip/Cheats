import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { PortfolioGrid } from "@/components/PortfolioGrid";
import { divisions } from "@/data/portfolio";
import { site } from "@/lib/site";

const productCount = divisions.reduce((n, d) => n + d.projects.length, 0);

export const metadata: Metadata = {
  title: "Portfolio",
  description: `Every game, app and security product from ${site.legalName}: ${productCount} products across ${divisions.length} divisions.`,
  alternates: { canonical: "/portfolio" },
  openGraph: { url: "/portfolio", title: `Portfolio | ${site.name}` },
};

/** Structured data: the portfolio as an ItemList for search engines. */
function jsonLd() {
  const items = divisions.flatMap((d) => d.projects);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${site.name} portfolio`,
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      description: p.description,
      ...(p.url ? { url: p.url } : {}),
    })),
  };
}

/** /portfolio: everything Gleyde makes, in one place. */
export default function PortfolioPage() {
  return (
    <>
      <Nav />
      <main id="main" className="px-6 pt-32 pb-24 sm:px-10 sm:pt-44 lg:px-16">
        <div className="mx-auto max-w-[88rem]">
          <p className="eyebrow">
            <span className="text-gold">{String(productCount).padStart(2, "0")}</span>
            <span className="ml-4">
              Products across {divisions.length} divisions
            </span>
          </p>
          <h1 className="mt-8 font-display text-[clamp(3rem,9vw,8.5rem)] leading-[0.95] tracking-[0.01em] text-ivory">
            Portfolio
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed font-light text-ivory/65 sm:text-lg">
            Every game, app and security product we make, in one place.
          </p>
          <PortfolioGrid divisions={divisions} />
        </div>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
