/**
 * Section page settings (client-safe: no database). Each section reuses the
 * same page; these say what to pull in and which views make sense for it.
 */
export type SectionKey = "politics" | "world" | "business" | "tech" | "culture";

export type Beat = { label: string; words: readonly string[] };
export type SectionConfig = {
  key: SectionKey;
  label: string;
  path: string;
  /** Kicker and one-line promise under the title. */
  kicker: string;
  dek: string;
  /** stories.section values that belong here. */
  storySections: string[];
  /** news_items.topic values (from the ingest's classifier), for opinion pieces. */
  topics: string[];
  /** The For You topic key (the readers' conversation feed). */
  feedTopic: string;
  /** Sub-sections, by whole words in headlines. */
  beats: Record<string, Beat>;
  beatsLabel: string;
  /** Pull matching stories from other sections too (the ingest has no Culture category). */
  pool?: { words: readonly string[]; min: number; exclude: string[] };
  /** Left / Center / Right views: on where the outlets' political lean says something useful. */
  spectrum: boolean;
  aiDesks: string[];
  /** The masthead glow (blue for every section; Politics shows the spectrum's blue and red). */
  glow: [string, string];
};

const POLITICS_BEATS = {
  congress: { label: "Congress", words: ["congress", "senate", "senator", "senators", "house speaker", "speaker", "lawmakers", "representatives", "filibuster", "committee", "bill", "legislation", "caucus", "appropriations", "shutdown", "majority leader", "minority leader", "capitol hill"] },
  "white-house": { label: "White House", words: ["white house", "president", "administration", "executive order", "cabinet", "oval office", "press secretary", "chief of staff", "veto", "pardon", "vice president"] },
  courts: { label: "Courts", words: ["supreme court", "court", "judge", "justices", "ruling", "lawsuit", "appeals", "indictment", "indicted", "trial", "prosecutor", "prosecutors", "attorney general", "justice department", "doj", "injunction", "verdict"] },
  elections: { label: "Elections", words: ["election", "elections", "campaign", "voters", "voting", "ballot", "primary", "primaries", "poll", "polls", "polling", "candidate", "candidates", "midterm", "midterms", "nominee", "redistricting", "turnout", "debate"] },
  states: { label: "States", words: ["governor", "state legislature", "statehouse", "state senate", "state house", "mayor", "attorney general", "county", "legislature"] },
} as const;

const CULTURE_WORDS = {
  film: ["film", "films", "movie", "movies", "box office", "oscar", "oscars", "academy awards", "director", "hollywood", "cinema", "sundance", "cannes", "film festival", "premiere", "sequel", "blockbuster", "actor", "actress", "studio"],
  music: ["music", "album", "albums", "song", "songs", "singer", "rapper", "band", "tour", "concert", "grammy", "grammys", "billboard", "spotify", "music festival", "musician", "chart"],
  tv: ["tv", "television", "series", "season finale", "netflix", "hbo", "streaming", "emmy", "emmys", "showrunner", "sitcom", "episode", "disney+", "hulu", "late night"],
  books: ["book", "books", "novel", "novels", "author", "authors", "memoir", "bestseller", "publisher", "publishing", "booker", "pulitzer", "library", "libraries", "poet", "poetry"],
} as const;

export const SECTIONS: Record<SectionKey, SectionConfig> = {
  politics: {
    key: "politics", label: "Politics", path: "/politics", kicker: "WorldNet Politics",
    dek: "Every side of the story: what happened, who's covering it, and what each side is reading.",
    storySections: ["Politics"], topics: ["Politics"], feedTopic: "politics", beats: POLITICS_BEATS, beatsLabel: "Beats",
    spectrum: true, aiDesks: ["ai_capitol", "ai_lawdesk"], glow: ["#5b8def", "#c96a72"],
  },
  world: {
    key: "world", label: "World", path: "/world", kicker: "WorldNet World",
    dek: "The world's news by region, with how outlets across the spectrum are covering it.",
    storySections: ["World"], topics: ["World"], feedTopic: "world", beatsLabel: "Regions",
    beats: {
      americas: { label: "Americas", words: ["canada", "canadian", "mexico", "mexican", "brazil", "brazilian", "argentina", "venezuela", "colombia", "cuba", "cuban", "haiti", "chile", "peru", "ecuador", "bolivia", "panama", "guatemala", "honduras", "nicaragua", "el salvador", "latin america", "caribbean", "ottawa", "brasilia", "caracas", "havana"] },
      europe: { label: "Europe", words: ["ukraine", "ukrainian", "russia", "russian", "kremlin", "moscow", "kyiv", "britain", "british", "uk", "england", "london", "france", "french", "paris", "germany", "german", "berlin", "italy", "italian", "spain", "spanish", "poland", "polish", "eu", "european union", "europe", "european", "nato", "brussels", "netherlands", "sweden", "norway", "finland", "greece", "hungary", "ireland", "scotland", "serbia", "putin", "zelensky", "macron", "starmer"] },
      "middle-east": { label: "Middle East", words: ["israel", "israeli", "gaza", "west bank", "palestinian", "palestinians", "hamas", "hezbollah", "iran", "iranian", "tehran", "iraq", "iraqi", "syria", "syrian", "lebanon", "lebanese", "saudi", "saudi arabia", "yemen", "houthi", "houthis", "jordan", "egypt", "egyptian", "qatar", "uae", "turkey", "turkish", "erdogan", "netanyahu", "middle east"] },
      asia: { label: "Asia", words: ["china", "chinese", "beijing", "xi", "taiwan", "taiwanese", "japan", "japanese", "tokyo", "korea", "korean", "seoul", "pyongyang", "india", "indian", "modi", "pakistan", "pakistani", "afghanistan", "taliban", "bangladesh", "philippines", "vietnam", "indonesia", "thailand", "myanmar", "malaysia", "singapore", "hong kong", "australia", "australian", "new zealand", "asia", "asian"] },
      africa: { label: "Africa", words: ["africa", "african", "nigeria", "nigerian", "south africa", "kenya", "kenyan", "ethiopia", "ethiopian", "sudan", "sudanese", "congo", "somalia", "sahel", "mali", "niger", "ghana", "uganda", "rwanda", "libya", "tunisia", "morocco", "algeria", "zimbabwe", "senegal", "tanzania", "mozambique"] },
    },
    spectrum: true, aiDesks: ["ai_worlddesk", "ai_defensedesk"], glow: ["#2f6bff", "#22d3ee"],
  },
  business: {
    key: "business", label: "Business", path: "/business", kicker: "WorldNet Business",
    dek: "Markets, companies and the economy, and how outlets across the spectrum are covering them.",
    storySections: ["Business"], topics: ["Markets"], feedTopic: "markets", beatsLabel: "Desks",
    beats: {
      markets: { label: "Markets", words: ["stock", "stocks", "shares", "market", "markets", "dow", "s&p", "s&p 500", "nasdaq", "wall street", "bond", "bonds", "treasury", "yield", "yields", "investors", "rally", "selloff", "sell off", "oil price", "oil prices", "crude", "bitcoin", "crypto", "gold", "dollar", "futures"] },
      companies: { label: "Companies", words: ["ceo", "earnings", "profit", "profits", "revenue", "merger", "acquisition", "acquire", "deal", "layoffs", "ipo", "company", "companies", "startup", "board", "shareholders", "quarterly", "antitrust", "bankruptcy", "brand", "retailer", "automaker"] },
      economy: { label: "Economy", words: ["economy", "economic", "inflation", "fed", "federal reserve", "interest rate", "interest rates", "rates", "jobs", "jobs report", "unemployment", "gdp", "recession", "tariff", "tariffs", "trade", "consumer prices", "wages", "housing", "mortgage", "spending", "deficit", "budget"] },
    },
    spectrum: true, aiDesks: ["ai_markets", "ai_energydesk"], glow: ["#2f6bff", "#22d3ee"],
  },
  tech: {
    key: "tech", label: "Tech", path: "/tech", kicker: "WorldNet Tech",
    dek: "AI, gadgets and cybersecurity: the technology news that matters, from every outlet covering it.",
    storySections: ["Tech"], topics: ["Tech"], feedTopic: "tech", beatsLabel: "Desks",
    beats: {
      ai: { label: "AI", words: ["ai", "artificial intelligence", "chatbot", "chatbots", "openai", "anthropic", "gemini", "chatgpt", "machine learning", "model", "models", "llm", "neural", "deepmind", "generative", "robot", "robots", "automation", "nvidia"] },
      gadgets: { label: "Gadgets", words: ["iphone", "ipad", "android", "smartphone", "phone", "phones", "laptop", "laptops", "tablet", "wearable", "watch", "headset", "vr", "console", "playstation", "xbox", "nintendo", "camera", "chip", "chips", "processor", "apple", "samsung", "google pixel", "gadget", "gadgets", "device", "devices", "ev", "tesla"] },
      cybersecurity: { label: "Cybersecurity", words: ["cyber", "cybersecurity", "hack", "hacked", "hacker", "hackers", "breach", "data breach", "ransomware", "malware", "phishing", "vulnerability", "exploit", "spyware", "password", "passwords", "outage", "scam", "scams", "privacy", "encryption"] },
    },
    spectrum: false, aiDesks: ["ai_techdesk"], glow: ["#2f6bff", "#22d3ee"],
  },
  culture: {
    key: "culture", label: "Culture", path: "/culture", kicker: "WorldNet Culture",
    dek: "Film, music, TV and books: what's out, what people are talking about, and who's covering it.",
    storySections: ["Culture"], topics: ["Culture"], feedTopic: "culture", beatsLabel: "Desks",
    beats: {
      film: { label: "Film", words: CULTURE_WORDS.film },
      music: { label: "Music", words: CULTURE_WORDS.music },
      tv: { label: "TV", words: CULTURE_WORDS.tv },
      books: { label: "Books", words: CULTURE_WORDS.books },
    },
    // The news intake has no Culture category, so matching stories are pulled in from other sections.
    pool: { words: [...CULTURE_WORDS.film, ...CULTURE_WORDS.music, ...CULTURE_WORDS.tv, ...CULTURE_WORDS.books], min: 2, exclude: ["Sports", "Politics"] },
    spectrum: false, aiDesks: ["ai_culturedesk"], glow: ["#2f6bff", "#22d3ee"],
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];
export const isSectionKey = (s: string | null | undefined): s is SectionKey => !!s && s in SECTIONS;
export const sectionByPath = (path: string) => SECTION_KEYS.find((k) => path === SECTIONS[k].path || path.startsWith(SECTIONS[k].path + "/")) ?? null;
/** The section page for a For You topic key ("markets" → Business), if there is one. */
export const SECTION_FOR_TOPIC: Record<string, SectionKey> = { politics: "politics", world: "world", markets: "business", tech: "tech", culture: "culture" };
