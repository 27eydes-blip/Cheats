/**
 * Site-wide constants: one place for the company name, URL and contact email.
 * Anything that shows up in metadata, JSON-LD, the footer or the contact
 * section reads from here.
 */
export const site = {
  name: "Gleyde Technologies",
  legalName: "Gleyde Technologies, LLC",
  /** Canonical URL. Override per environment with NEXT_PUBLIC_SITE_URL. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gleydetechnologies.com").replace(/\/$/, ""),
  tagline: "Games. Software. Security.",
  description:
    "Gleyde Technologies, LLC is a technology company building games, software, and cybersecurity products. Founded by Sam Eyde III.",
  founder: "Sam Eyde III",
  foundingYear: 2026,
  /** TODO: replace with the real inbox once it exists. */
  email: "hello@gleydetechnologies.com",
} as const;

/**
 * Navigation links, in order. "#…" links are sections of the home page
 * (they become "/#…" on other pages); "/…" links are separate pages.
 */
export const navLinks = [
  { href: "#about", label: "About" },
  { href: "#divisions", label: "Divisions" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#leadership", label: "Leadership" },
  { href: "#contact", label: "Contact" },
] as const;
