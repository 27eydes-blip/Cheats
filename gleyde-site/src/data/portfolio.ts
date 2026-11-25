/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  GLEYDE PORTFOLIO DATA
 * ─────────────────────────────────────────────────────────────────────────────
 *  This is the only file you need to edit to change what the site says about
 *  divisions, products, the roadmap and the leadership team.
 *
 *  • Add a product:    copy an object inside a division's `projects` array.
 *  • Remove a product: delete its object.
 *  • Change a status:  set `status` to one of the values in `Status` below.
 *  • Hide a link:      delete the `url` field (the card then shows no link).
 *
 *  URLs marked `// placeholder` are guesses. Replace them with the real
 *  domain when it goes live. Everything here is type-checked, so a typo in a
 *  status or a missing field shows up as a build error, not a broken page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Allowed status badges. Add a new one here and in `statusStyles` below. */
export type Status = "Live" | "Beta" | "In Development" | "Coming Soon" | "Concept";

export interface Project {
  name: string;
  /** One short line. Keep it under ~80 characters so cards stay tidy. */
  description: string;
  status: Status;
  /** Full URL including https://. Omit to show the product without a link. */
  url?: string;
}

export interface Division {
  /** Used as the HTML id; lowercase, no spaces. */
  id: string;
  /** Roman numeral shown beside the name. */
  numeral: string;
  name: string;
  /** One-line description shown under the name. */
  description: string;
  status: Status;
  /** The division's own domain. */
  url?: string;
  /** A person or team credit shown under the description. Optional. */
  lead?: string;
  /** Label before `lead`. Defaults to "Led by". */
  leadLabel?: string;
  projects: Project[];
  /** Shown after the project list, e.g. "and more". Optional. */
  footnote?: string;
}

export const divisions: Division[] = [
  {
    id: "games",
    numeral: "I",
    name: "Games Division",
    description: "Original games built to be played, replayed and remembered.",
    status: "Live",
    url: "https://games.gleydetechnologies.com", // placeholder
    lead: "Juwon Shon, Chief of the Game Sector",
    projects: [
      {
        name: "Glydrift",
        description: "The flagship: fast, fluid flight with Volt the Storm Bird.",
        status: "In Development",
        url: "https://glydrift.com",
      },
      {
        name: "Glydaway",
        description: "An endless side-scrolling runner spin-off of Glydrift.",
        status: "Beta",
        url: "https://glydaway.com",
      },
      {
        name: "Tandem",
        description: "A two-player game where nothing works unless you work together.",
        status: "In Development",
        url: "https://tandem.gleydetechnologies.com", // placeholder
      },
      {
        name: "Hunt",
        description: "A real-time, top-down combat racer for phones and desktop.",
        status: "Beta",
        url: "https://hunt.27eydes.workers.dev",
      },
      {
        name: "Motor City 1915",
        description: "Build an automotive empire in the Detroit of 1915.",
        status: "In Development",
        url: "https://motor-city-1915.pages.dev",
      },
      {
        name: "Ant Colony War",
        description: "Raise a colony, command the swarm, hold the hill.",
        status: "Concept",
        url: "https://antcolonywar.gleydetechnologies.com", // placeholder
      },
    ],
    footnote: "and more in the works",
  },
  {
    id: "security",
    numeral: "II",
    name: "Cybersecurity & Software",
    description: "Gleyde Cybersecurity & Software: website security checks and protection for businesses.",
    status: "In Development",
    url: "https://gleyde-security.pages.dev",
    leadLabel: "Team",
    lead: "Abe, Cybersecurity",
    projects: [
      {
        name: "Website Security Check",
        description: "An audit of your website's headers, TLS, exposure and weak points.",
        status: "In Development",
        url: "https://gleyde-security.pages.dev",
      },
      {
        name: "Protection Plans",
        description: "Ongoing monitoring and protection once the gaps are closed.",
        status: "Coming Soon",
      },
    ],
  },
  {
    id: "studio",
    numeral: "III",
    name: "Studio & Tools",
    description: "Focused apps and handcrafted websites, made with the same care.",
    status: "Live",
    url: "https://studio.gleydetechnologies.com", // placeholder
    projects: [
      {
        name: "Flashdrop",
        description: "A study app that turns notes into flashcards you actually review.",
        status: "In Development",
        url: "https://flashdrop.gleydetechnologies.com", // placeholder
      },
      {
        name: "Sam Eyde Studios",
        description: "A recording app for capturing, layering and polishing takes.",
        status: "In Development",
        url: "https://sam-eyde-studios.pages.dev",
      },
      {
        name: "QR City Guide",
        description: "Scan a code, discover the city: walkable guides on your phone.",
        status: "Concept",
      },
      {
        name: "Client Websites",
        description: "Fast, secure, beautifully made websites for businesses.",
        status: "Live",
      },
    ],
  },
];

/* ─── Roadmap ─────────────────────────────────────────────────────────────── */

export interface RoadmapPhase {
  /** Short label shown on the timeline, e.g. "Now". */
  phase: string;
  /** Optional time frame shown beside the label. */
  when?: string;
  title: string;
  items: string[];
}

export const roadmap: RoadmapPhase[] = [
  {
    phase: "Now",
    when: "2026",
    title: "Ship the first wave",
    items: [
      "Launch gleydetechnologies.com",
      "Open Hunt and Glydaway to more players",
      "Bring Glydrift to a public beta",
    ],
  },
  {
    phase: "Next",
    when: "2027",
    title: "Protect and expand",
    items: [
      "Release the Website Security Check for businesses",
      "Launch Flashdrop and Sam Eyde Studios",
      "Grow the Games Division with Tandem and Motor City 1915",
    ],
  },
  {
    phase: "Later",
    when: "Beyond",
    title: "Build the house of Gleyde",
    items: [
      "Ant Colony War and new original worlds",
      "Managed security and protection plans",
      "A single Gleyde account across every product",
    ],
  },
];

/* ─── Leadership ──────────────────────────────────────────────────────────── */

export interface Leader {
  name: string;
  title: string;
  /** One or two letters shown in the monogram. */
  initials: string;
  /** Optional small line under the title. */
  note?: string;
}

export const leadership: Leader[] = [
  { name: "Sam Eyde III", title: "CEO & Founder", initials: "SE" },
  { name: "Tristan Kerr", title: "COO & CTO", initials: "TK", note: "Second in command" },
  { name: "Juwon Shon", title: "Chief of the Game Sector", initials: "JS" },
  { name: "Abe", title: "Cybersecurity Team", initials: "A" },
];
