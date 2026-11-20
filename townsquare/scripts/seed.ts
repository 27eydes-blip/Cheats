/**
 * Seed a fresh database with a national edition so the app feels alive:
 * 30 people, 12 national Stories with timelines, multi-outlet coverage, and
 * Takes with stances (plus head-to-head Answers), stance votes, 10 Desks with
 * threaded discussions, Live Studio shows, 50 headlines, and a few reports.
 *
 * All people, outlets, and events are fictional sample data.
 *
 *   npm run seed     (refuses to run on a database that already has users)
 *   npm run reset    (wipes ./data and seeds again)
 */
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { get, newId, run, tx } from "../src/lib/db";
import { seedTeams } from "../src/lib/sports/teams";
import { hashPassword } from "../src/lib/passwords";
import { extractHashtags, extractMentions } from "../src/lib/text";
import { blurPlaceholder, uploadDir } from "../src/lib/media";

let s = 7;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;

if (get<{ n: number }>("SELECT count(*) n FROM users")!.n > 0) {
  // Safe to run on every server start: a database with data is never touched.
  console.log("Database already has users; not seeding. (`npm run reset` wipes and reseeds locally.)");
  process.exit(0);
}

// ---------------------------------------------------------------- people
const PEOPLE: [string, string, string, boolean][] = [
  ["admin", "WorldNet Desk", "Official account. Standards, corrections, and product notes.", true],
  ["demo", "Demo Reader", "Just here to read the front page.", false],
  ["maria_lopez", "Maria Lopez", "Capitol Hill correspondent. Votes, whips, and the fine print.", true],
  ["jwashington", "James Washington", "Retired civics teacher. I read the Constitution for fun.", false],
  ["priya_codes", "Priya Natarajan", "Software engineer. Tech policy without the hype.", true],
  ["coach_dave", "Dave Kowalski", "College sports writer. Overtime is my love language.", false],
  ["thegreenthumb", "Lena Fischer", "Climate scientist. Weather is not climate, but it's related.", false],
  ["markets_mike", "Mike Chen", "Markets editor. Rates, jobs, and why your groceries cost more.", true],
  ["sarah_k", "Sarah Kim", "ER nurse. Health policy from the night shift.", false],
  ["tom_on_policy", "Tom Brennan", "Policy analyst. I read the 900-page bill so you don't have to.", true],
  ["ava_writes", "Ava Robinson", "Novelist and culture critic.", false],
  ["djmarcus", "Marcus Hill", "Union electrician. Opinions on infrastructure, professionally.", false],
  ["chef_rosa", "Rosa Martinez", "Restaurant owner. Small business, big tariffs.", false],
  ["hiker_ben", "Ben Okafor", "Park ranger. Public lands and wild places.", false],
  ["the_real_nina", "Nina Petrova", "Photojournalist. On the ground for storms and summits.", true],
  ["gameday_greg", "Greg Sullivan", "Sports takes, mostly correct.", false],
  ["dr_amina", "Dr. Amina Yusuf", "Family doctor. Context, not medical advice.", true],
  ["oldschool_ray", "Ray Duncan", "Long-haul trucker, 30 years. Freight tells you where the economy is.", false],
  ["jess_votes", "Jess Alvarez", "Election law nerd. Register, then vote. Every time.", false],
  ["pixel_pete", "Pete Moreau", "Game developer. AI, copyright, and craft.", false],
  ["kayla_runs", "Kayla Brooks", "College student. Tuition, jobs, and the future I'm inheriting.", false],
  ["faithful_frank", "Frank Williams", "Pastor and dad. Faith in public life.", false],
  ["linh_tran", "Linh Tran", "Importer. I see tariffs on every invoice.", false],
  ["astro_omar", "Omar Haddad", "Space reporter. Clear skies and clean launches.", true],
  ["bookish_beth", "Beth Carter", "Librarian. Facts have footnotes.", false],
  ["rancher_cole", "Cole Jensen", "Fourth-generation rancher. Weather is my religion.", false],
  ["zoe_designs", "Zoe Park", "Product designer. Interfaces and institutions.", false],
  ["veteran_vic", "Victor Ramos", "Marine veteran. Defense, veterans' care, and plain talk.", false],
  ["defense_dana", "Dana Whitfield", "Foreign affairs analyst. Treaties, trade, and tension.", true],
  ["night_owl_ike", "Ike Johnson", "Night-shift data analyst. Charts at 3am.", false],
];

// ---------------------------------------------------------------- outlets (fictional)
const OUTLETS: [string, string, string][] = [
  ["o1", "The National Ledger", "https://example.com/ledger"],
  ["o2", "Capitol Wire", "https://example.org/capitol-wire"],
  ["o3", "Meridian News", "https://example.net/meridian"],
  ["o4", "The Continental", "https://example.com/continental"],
  ["o5", "Signal Daily", "https://example.org/signal"],
  ["o6", "Harbor & Main", "https://example.net/harbor-main"],
];

// ---------------------------------------------------------------- stories
type StoryDef = {
  key: string; title: string; summary: string; section: string; tag: string; status: "live" | "developing" | "ended";
  bias: number; // share of readers who agree with the story's framing
  updates: [string, "update" | "key" | "quote"][];
  coverage: string[];
  agree: string[]; disagree: string[]; context: string[]; question: string[];
};

const STORIES: StoryDef[] = [
  {
    key: "infrastructure", title: "Senate passes $1.2 trillion infrastructure package, 62–38", section: "Politics", tag: "infrastructure", status: "live", bias: 0.56,
    summary: "Fourteen senators crossed party lines to send the roads, rail, and broadband bill to the House, where leaders expect a vote next week.",
    updates: [
      ["Debate opens on the floor with 30 hours of time agreed.", "update"],
      ["Amendment to cut transit funding by 20% fails, 44–56.", "key"],
      ["“This is the first real investment in rail in a generation.” — Senate majority whip", "quote"],
      ["Broadband provision survives a point of order, 58–42.", "update"],
      ["Final passage: 62–38. Bill heads to the House.", "key"],
      ["House leaders schedule a vote for Tuesday; two caucuses have not committed.", "update"],
    ],
    coverage: ["Senate clears infrastructure bill with bipartisan support", "What's in the $1.2 trillion package, line by line", "Critics say infrastructure bill adds to the deficit", "Fourteen crossovers: who broke ranks and why"],
    agree: ["Roads and bridges aren't partisan. Glad they got this done.", "Broadband money finally reaches rural counties. That's real.", "As an electrician, this is years of work for my local. Good bill."],
    disagree: ["Another trillion on the credit card. Who pays it back?", "Too much money flows through slow federal programs. Block grants would work better.", "The transit money mostly helps a few big cities."],
    context: ["Context: about $550B of the total is new spending; the rest re-authorizes existing programs.", "Context: the CBO score lands in about two weeks; current estimates are preliminary."],
    question: ["Does any of the bridge money have a deadline to be spent?", "How does the House math work if both caucuses hold out?"],
  },
  {
    key: "fedrates", title: "Fed holds rates steady, signals one cut before summer", section: "Business", tag: "fed", status: "developing", bias: 0.48,
    summary: "The central bank kept its benchmark rate unchanged for a fourth straight meeting, citing cooling inflation but a still-tight labor market.",
    updates: [
      ["Rate decision: unchanged, as expected.", "key"],
      ["Statement drops the phrase “additional tightening.”", "update"],
      ["“We're not yet confident enough to declare victory.” — Fed chair", "quote"],
      ["Stocks rise 0.8%; 10-year yield falls to 4.1%.", "update"],
    ],
    coverage: ["Fed holds steady, hints at a cut", "Markets rally on softer Fed tone", "Why the Fed is waiting on the jobs data"],
    agree: ["Right call. Cutting too early is how you get the '70s again.", "Patience is underrated. Inflation is still above target."],
    disagree: ["Mortgage rates are crushing first-time buyers. Cut now.", "Small businesses can't wait until summer for cheaper credit."],
    context: ["Context: core inflation is down to 2.8% from a 5.6% peak, per the latest release."],
    question: ["Does a summer cut actually move mortgage rates, or is it priced in?"],
  },
  {
    key: "scotus-age", title: "Supreme Court weighs state laws requiring age checks on social media", section: "Politics", tag: "agecheck", status: "developing", bias: 0.52,
    summary: "Justices heard two hours of argument over whether laws requiring ID-based age verification violate the First Amendment.",
    updates: [
      ["Arguments begin; the courtroom is at capacity.", "update"],
      ["Several justices question how age checks would protect user privacy.", "key"],
      ["“Parents are asking for help, and states answered.” — state solicitor general", "quote"],
      ["Decision expected by the end of June.", "update"],
    ],
    coverage: ["Justices skeptical of sweeping age-check laws", "Parents' groups rally outside the Court", "How age verification would actually work"],
    agree: ["Kids shouldn't be on these apps unsupervised. Age checks are overdue.", "We check ID for alcohol. A phone can be just as harmful."],
    disagree: ["Uploading your ID to every app is a privacy disaster waiting to happen.", "This is a parenting problem, not a government one."],
    context: ["Context: three states have similar laws on hold pending this ruling."],
    question: ["Would the ruling apply to messaging apps too, or only feeds?"],
  },
  {
    key: "hurricane", title: "Hurricane Delia makes landfall on the Gulf Coast as a Category 3", section: "Top Stories", tag: "delia", status: "live", bias: 0.7,
    summary: "More than 400,000 customers are without power; federal emergency declarations cover parts of three states.",
    updates: [
      ["Delia strengthens to Category 3 overnight.", "update"],
      ["Landfall near the coast with 120 mph winds.", "key"],
      ["Federal emergency declarations approved for three states.", "key"],
      ["Utilities report 412,000 customers without power.", "update"],
      ["Search-and-rescue teams deploy at first light.", "update"],
    ],
    coverage: ["Delia slams Gulf Coast", "Power outages climb past 400,000", "How to help storm victims safely", "Why this storm intensified so fast"],
    agree: ["Grateful for the linemen already rolling in from out of state.", "Federal response was fast this time. Credit where it's due."],
    disagree: ["Evacuation orders came too late for the barrier islands.", "We keep rebuilding in the same flood zones. That has to change."],
    context: ["Context: donate through established relief groups; scam “relief funds” spike after every storm.", "Context: Category refers to wind speed only; storm surge is often the bigger danger."],
    question: ["Is the federal flood insurance program solvent enough for another big claim year?"],
  },
  {
    key: "antitrust", title: "Antitrust trial against search giant enters closing arguments", section: "Tech", tag: "antitrust", status: "developing", bias: 0.55,
    summary: "Government lawyers say default-search deals locked out rivals; the company says users simply prefer its product.",
    updates: [
      ["Government opens closing: “Defaults are destiny.”", "quote"],
      ["Company argues switching search engines takes two taps.", "update"],
      ["Judge says a ruling will come “in the new year.”", "key"],
    ],
    coverage: ["Search antitrust case nears verdict", "What a breakup could mean for your phone", "Inside the default-search deals"],
    agree: ["Paying billions to be the default isn't competing on quality.", "Competition is how we got better phones. Search needs it too."],
    disagree: ["People use it because it works. That's not a crime.", "Breaking up a successful American company helps foreign rivals."],
    context: ["Context: the remedies phase is separate; no breakup is decided in this ruling."],
    question: ["If defaults go away, what does the choice screen look like?"],
  },
  {
    key: "trade", title: "U.S. and EU reach deal to cut tariffs on steel and autos", section: "World", tag: "tradedeal", status: "developing", bias: 0.6,
    summary: "The agreement phases out tariffs over three years and creates a joint panel on subsidies for clean-energy manufacturing.",
    updates: [
      ["Negotiators announce a framework after an all-night session.", "key"],
      ["Steel tariffs fall 50% immediately, the rest over three years.", "update"],
      ["Automakers' group calls the deal “a relief.”", "update"],
    ],
    coverage: ["Transatlantic tariff truce", "Steel towns react to the trade deal", "Who wins and loses in the auto provisions"],
    agree: ["My import costs just dropped overnight. Huge for small businesses.", "Allies trading freely is how you counter bigger rivals."],
    disagree: ["Steelworkers got sold out again.", "Three years is too fast for mills to adjust."],
    context: ["Context: the deal still needs approval from the EU's member governments."],
    question: ["Does this change prices at the dealership this year?"],
  },
  {
    key: "railstrike", title: "Rail workers set December 1 strike deadline", section: "Business", tag: "railstrike", status: "live", bias: 0.5,
    summary: "Unions representing 110,000 workers say talks on sick leave have stalled; a shutdown could idle freight nationwide.",
    updates: [
      ["Union leaders announce the deadline at a press conference.", "key"],
      ["Carriers say they are “ready to keep talking.”", "update"],
      ["Retail groups warn of holiday shipping delays.", "update"],
      ["Congress could intervene under federal rail labor law.", "key"],
    ],
    coverage: ["Rail strike deadline looms", "What a rail shutdown would mean for prices", "The sick-leave fight at the heart of the talks"],
    agree: ["Workers asking for sick days isn't radical.", "Trucking can't absorb rail freight. The carriers should settle."],
    disagree: ["A strike in December would be a disaster for families and stores.", "Congress should step in early and impose a deal."],
    context: ["Context: under the Railway Labor Act, Congress can impose terms to prevent a national strike."],
    question: ["Would passenger trains stop too, or only freight?"],
  },
  {
    key: "huskies", title: "Huskies win the national title in overtime, 31–28", section: "Sports", tag: "championship", status: "ended", bias: 0.74,
    summary: "A walk-on kicker's 41-yarder sealed the program's first championship in 52 years.",
    updates: [
      ["Halftime: 21–7, favorites in control.", "update"],
      ["Huskies score 21 straight in the fourth quarter.", "key"],
      ["Overtime field goal: Huskies win, 31–28.", "key"],
    ],
    coverage: ["Huskies stun the favorites in overtime", "The walk-on kicker who won a title", "Best championship game in a decade?"],
    agree: ["Best title game I've ever watched. Period.", "Walk-on kicker for the win. That's college football."],
    disagree: ["That pass interference call in the 4th decided it.", "Great game, but the favorites coasted for a half."],
    context: ["Context: it's the largest fourth-quarter comeback in title-game history."],
    question: ["Does the kicker get a scholarship now?"],
  },
  {
    key: "ai-schools", title: "Education Department issues first national guidance on AI in classrooms", section: "Tech", tag: "aiclass", status: "developing", bias: 0.5,
    summary: "The voluntary guidance urges schools to teach AI literacy and set clear rules on AI-assisted homework.",
    updates: [
      ["Guidance released; 40 pages, voluntary.", "key"],
      ["Teachers' groups welcome “clarity,” ask for training funds.", "update"],
    ],
    coverage: ["New federal guidance on AI in schools", "Teachers react to AI rules", "What the guidance says about cheating"],
    agree: ["Kids need to learn how these tools work, not pretend they don't exist.", "Clear rules beat every school inventing its own."],
    disagree: ["Washington shouldn't be setting classroom policy.", "Kids need to learn to write before they learn to prompt."],
    context: ["Context: the guidance is voluntary; states and districts set actual policy."],
    question: ["Is there money attached for teacher training?"],
  },
  {
    key: "border", title: "House passes border security bill; Senate path uncertain", section: "Politics", tag: "border", status: "developing", bias: 0.5,
    summary: "The bill funds more agents and asylum judges and changes parole rules; it passed 219–211 with no votes to spare.",
    updates: [
      ["Bill passes 219–211.", "key"],
      ["Senate leaders say the bill won't come up “as written.”", "update"],
      ["Bipartisan group of senators begins drafting an alternative.", "update"],
    ],
    coverage: ["House narrowly passes border bill", "What's in the border package", "Senate dealmakers try again"],
    agree: ["More asylum judges is the part everyone should support.", "Finally a bill that funds enforcement and processing together."],
    disagree: ["The parole changes go too far and will separate families.", "A partisan bill that can't pass the Senate is just messaging."],
    context: ["Context: the immigration court backlog is over 3 million cases, per federal data."],
    question: ["How many new judges does the bill actually fund?"],
  },
  {
    key: "splashdown", title: "Crew splashes down after a record nine-month space station mission", section: "Tech", tag: "splashdown", status: "ended", bias: 0.82,
    summary: "The four astronauts conducted 300 experiments, including the first long-duration test of a new radiation shield.",
    updates: [["Deorbit burn complete.", "update"], ["Splashdown off the coast at 4:12 a.m.", "key"], ["Crew in good health, recovery team reports.", "update"]],
    coverage: ["Record mission ends with a smooth splashdown", "What nine months in orbit does to the body", "The experiments that came home"],
    agree: ["Watched it live with my kids. Still magic.", "Long missions like this are how we get to Mars."],
    disagree: ["Amazing, but the budget for this could fix a lot of roads."],
    context: ["Context: the previous U.S. record for a single mission was 355 days."],
    question: ["How long until they can walk normally?"],
  },
  {
    key: "writers", title: "Writers ratify new streaming contract, ending 118-day strike", section: "Culture", tag: "writersdeal", status: "ended", bias: 0.66,
    summary: "The deal sets minimum staffing, raises streaming residuals, and limits the use of AI-generated scripts.",
    updates: [["Tentative deal reached.", "key"], ["Members ratify with 91% voting yes.", "key"], ["Late-night shows return next week.", "update"]],
    coverage: ["Writers approve contract, ending strike", "The AI rules in the writers' deal", "When your shows come back"],
    agree: ["The AI protections set a precedent for every creative job.", "Good deal. Writers deserve residuals from streaming."],
    disagree: ["118 days of lost paychecks for crew members who weren't at the table."],
    context: ["Context: residuals are payments when a show is re-aired or streamed after its first run."],
    question: ["Does the AI clause cover rewrites of existing scripts?"],
  },
];

const ANSWERS: Record<"agree" | "disagree", string[]> = {
  agree: ["I hear you, but the evidence points the other way here.", "Respectfully, the people closest to this see it differently.", "That's the cost of doing nothing, and it's higher."],
  disagree: ["Counterpoint: the details matter more than the headline.", "I'd push back. The trade-offs here are real.", "Maybe, but that ignores who actually pays for it."],
};

const GENERAL = [
  "Reading the full bill text tonight. Will post the highlights. #infrastructure",
  "Gas is down 12 cents this week. Small wins. #economy",
  "Every election season I remind people: check your registration. #vote",
  "The jobs report comes out Friday. Expectations are low. #economy",
  "Watching the storm track with family on the coast. Stay safe out there. #delia",
  "Library card is the best free subscription in America. #books",
  "Trade deals are boring until they hit your invoice. #tradedeal",
  "That overtime finish. I'm still not over it. #championship",
  "Long-haul freight is slower than last month. Watch the rail talks. #railstrike",
  "AI in classrooms is coming either way. Better to teach it well. #aiclass",
  "If you only read one explainer on the Fed today, read the statement itself. It's short. #fed",
  "Clear skies tonight in the Plains. Great night for the Moon. #space",
];

const DESKS: [string, string, string, string][] = [
  ["politics", "Politics Desk", "Congress, the courts, and campaigns. Every view, same rules.", "infrastructure"],
  ["world", "World Desk", "Trade, treaties, and what's happening beyond our borders.", "trade"],
  ["markets", "Markets Desk", "Rates, jobs, prices, and your paycheck.", "fedrates"],
  ["tech", "Tech Desk", "AI, antitrust, privacy, and the gadgets in your pocket.", "antitrust"],
  ["sports", "Sports Desk", "Scores, upsets, and arguments that never end.", "huskies"],
  ["science", "Science Desk", "Space, climate, and research worth reading.", "splashdown"],
  ["culture", "Culture Desk", "Books, film, TV, and the people who make them.", "writers"],
  ["veterans", "Veterans Desk", "Benefits, jobs, and community for those who served.", "border"],
  ["faith", "Faith & Public Life", "Faith, values, and how they meet policy.", "scotus-age"],
  ["weather", "Storm Desk", "Severe weather tracking and recovery resources.", "hurricane"],
];

const DESK_THREADS = [
  "What's the one detail in this story most coverage is missing?", "Megathread: questions you want answered this week", "Best explainer you've read on this so far?",
];
const COMMENTS = [
  "The fine print matters more than the headline here.", "Disagree, and here's why: the numbers don't add up.", "Source? Genuinely asking.", "Good thread, thanks for setting it up.",
  "Can someone summarize the key vote?", "Same experience in my state.", "Hard agree.", "Counterpoint: it depends a lot on the region.", "They posted the full text online.", "Following this one.",
];

const LIVE: [string, "stream" | "audio" | "debate", string, number, string, string, number][] = [
  ["Capitol Report: inside the infrastructure vote", "stream", "maria_lopez", -25, "Maria breaks down the whip count and takes your questions.", "infrastructure", 4812],
  ["Storm Desk: Delia live coverage", "stream", "the_real_nina", -50, "Live from the coast as recovery begins.", "delia", 9310],
  ["Markets at the open", "audio", "markets_mike", 80, "What's moving and why, in 20 minutes.", "fed", 0],
  ["Debate night: should the Fed cut now?", "debate", "tom_on_policy", 60 * 9, "Two economists, five-minute rounds. You call the winner.", "fed", 0],
  ["Rail talks: what a strike would mean", "audio", "oldschool_ray", 60 * 27, "A trucker and a rail economist on the deadline.", "railstrike", 0],
  ["Launch Night: next crew rotation", "stream", "astro_omar", 60 * 50, "Countdown coverage and Q&A.", "space", 0],
];

const EXTRA_NEWS: [string, string][] = [
  ["Politics", "Governors' association calls for faster disaster-aid payments"],
  ["Business", "Jobless claims fall to a four-month low"],
  ["Business", "Retailers expect record online holiday spending"],
  ["World", "Allies agree on new sanctions package at summit"],
  ["World", "Shipping costs ease as canal traffic recovers"],
  ["Tech", "Chipmaker breaks ground on new domestic plant"],
  ["Tech", "Phone makers agree to seven years of security updates"],
  ["Sports", "Basketball preview: ten teams that can win it all"],
  ["Sports", "Marathon sets record with 60,000 finishers"],
  ["Culture", "Museum attendance returns to pre-pandemic levels"],
  ["Culture", "Debut novel tops bestseller list for a fifth week"],
  ["Top Stories", "Flu vaccine supply ample this season, health officials say"],
  ["Politics", "Bipartisan bill would cap insulin costs for all insurance plans"],
  ["Business", "Mortgage rates dip for a third straight week"],
];

/** A simple generated picture so media grids have something to show. */
async function makeImage(ownerId: string, i: number): Promise<string> {
  const hue = 205 + ((i * 23) % 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,32%)"/><stop offset="1" stop-color="hsl(${hue + 10},60%,12%)"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="${300 + (i * 97) % 600}" cy="260" r="110" fill="hsl(43,60%,62%)" opacity=".85"/>
    <path d="M0 620 L260 420 L470 560 L720 330 L1000 540 L1200 430 L1200 800 L0 800 Z" fill="hsl(${hue},40%,8%)" opacity=".9"/></svg>`;
  const data = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const id = newId();
  mkdirSync(uploadDir(), { recursive: true });
  writeFileSync(path.join(uploadDir(), `${id}.webp`), data);
  run("INSERT INTO media (id, owner_id, kind, mime, width, height, bytes, path, alt, blur, created_at) VALUES (?, ?, 'image', 'image/webp', 1200, 800, ?, ?, ?, ?, ?)", [
    id, ownerId, data.length, `${id}.webp`, "Illustration: mountains under a gold sun", await blurPlaceholder(data), NOW,
  ]);
  return id;
}

async function main() {
  console.log("Seeding the national edition…");
  // On a public server the well-known sample passwords must not work: use the
  // SEED_*_PASSWORD variables if set, otherwise long random ones nobody knows.
  const prod = process.env.NODE_ENV === "production";
  const secret = () => randomBytes(18).toString("base64url");
  const adminPlain = process.env.SEED_ADMIN_PASSWORD || (prod ? secret() : "worldnet-admin");
  const demoPlain = process.env.SEED_DEMO_PASSWORD || (prod ? secret() : "worldnet-demo");
  const [adminPw, demoPw, otherPw] = await Promise.all([hashPassword(adminPlain), hashPassword(demoPlain), hashPassword(prod ? secret() : "worldnet-user")]);
  const users = PEOPLE.map(([handle, name, bio, verified], i) => ({ id: newId() + i, handle, name, bio, verified, created: NOW - int(60, 1400) * 24 * HOUR }));
  const by = new Map(users.map((u) => [u.handle, u]));
  const voices = users.slice(2);
  const images: string[] = [];

  tx(() => {
    for (const u of users) {
      run(
        `INSERT INTO users (id, email, password_hash, handle, display_name, bio, links, role, verified, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [u.id, `${u.handle.replace(/\W/g, "")}@worldnet.test`, u.handle === "admin" ? adminPw : u.handle === "demo" ? demoPw : otherPw, u.handle, u.name, u.bio,
          u.handle === "maria_lopez" ? JSON.stringify([{ label: "Portfolio", url: "https://example.com/maria" }]) : "[]", u.handle === "admin" ? "admin" : "user", u.verified ? 1 : 0, u.created],
      );
    }
    for (const u of users) {
      for (let k = 0; k < int(4, 12); k++) {
        const t = rand() < 0.45 ? users[int(2, 9)] : pick(users);
        if (t.id !== u.id) run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [u.id, t.id, NOW - int(1, 900) * HOUR]);
      }
    }
    for (const h of ["maria_lopez", "markets_mike", "tom_on_policy", "dr_amina", "defense_dana", "the_real_nina", "priya_codes", "coach_dave"]) {
      run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [by.get("demo")!.id, by.get(h)!.id, NOW - 100 * HOUR]);
    }
    for (const [id, name, home] of OUTLETS) run("INSERT INTO news_sources (id, name, homepage, verified) VALUES (?, ?, ?, 1)", [id, name, home]);
  });
  for (let i = 0; i < 8; i++) images.push(await makeImage(pick(voices).id, i));

  let n = 0;
  const post = (author: string, body: string, created: number, x: { reply?: { id: string; root: string }; story?: string; stance?: string; community?: string } = {}) => {
    const id = newId() + n++;
    run(`INSERT INTO posts (id, author_id, body, reply_to_id, root_id, community_id, story_key, stance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, author, body, x.reply?.id ?? null, x.reply?.root ?? null, x.community ?? null, x.story ?? null, x.stance ?? null, created,
    ]);
    for (const t of extractHashtags(body)) run("INSERT OR IGNORE INTO post_hashtags (post_id, tag, created_at) VALUES (?, ?, ?)", [id, t, created]);
    for (const h of extractMentions(body)) {
      const m = by.get(h);
      if (m) run("INSERT OR IGNORE INTO mentions (post_id, user_id) VALUES (?, ?)", [id, m.id]);
    }
    return id;
  };
  const vote = (type: "story" | "post", id: string, agreeShare: number, voters = 0.6) => {
    for (const u of users) {
      if (rand() > voters) continue;
      const r = rand();
      const value = r < agreeShare ? "agree" : r < agreeShare + 0.12 ? "unsure" : "disagree";
      run("INSERT OR IGNORE INTO stances (user_id, target_type, target_id, value, created_at) VALUES (?, ?, ?, ?, ?)", [u.id, type, id, value, NOW - int(1, 600) * MIN]);
    }
  };

  tx(() => {
    let img = 0;
    STORIES.forEach((st, si) => {
      const age = (st.status === "ended" ? 30 : st.status === "live" ? 6 : 14) * HOUR;
      const created = NOW - age;
      run("INSERT INTO stories (key, title, summary, section, tag, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        st.key, st.title, st.summary, st.section, st.tag, st.status, created, st.status === "live" ? NOW - int(2, 9) * MIN : NOW - int(1, 8) * HOUR,
      ]);
      st.updates.forEach(([body, kind], i) =>
        run("INSERT INTO story_updates (id, story_key, body, kind, author_id, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
          newId() + st.key + i, st.key, body, kind, i % 3 === 2 ? null : (si % 2 ? by.get("maria_lopez")! : by.get("tom_on_policy")!).id,
          i % 3 === 2 ? OUTLETS[(si + i) % OUTLETS.length][0] : null, created + Math.round(((i + 1) / (st.updates.length + 1)) * (age - 10 * MIN)),
        ]),
      );
      st.coverage.forEach((title, i) => {
        const o = OUTLETS[(si + i) % OUTLETS.length];
        run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
          newId() + st.key + "c" + i, o[0], st.section, title, "Sample summary. Real items show a short snippet from the outlet with a link back.", `${o[2]}/${st.key}-${i + 1}`, st.key, created + i * 40 * MIN,
        ]);
      });
      vote("story", st.key, st.bias, 0.8);

      const takes: { id: string; stance: string; at: number; author: string }[] = [];
      for (const stance of ["agree", "disagree", "context", "question"] as const) {
        for (const body of st[stance]) {
          const author = pick(voices);
          const at = Math.min(NOW - 2 * MIN, created + int(10, Math.max(20, age / MIN - 5)) * MIN);
          const id = post(author.id, `${body} #${st.tag}`, at, { story: st.key, stance });
          takes.push({ id, stance, at, author: author.id });
          vote("post", id, stance === "context" ? 0.8 : stance === "agree" ? 0.62 : 0.45, 0.45);
          if (img < images.length && stance === "agree" && rand() < 0.35) run("UPDATE media SET post_id = ?, owner_id = ? WHERE id = ?", [id, author.id, images[img++]]);
        }
      }
      // Answers with the opposite stance: these become head-to-head debate cards.
      for (const t of takes.filter((x) => x.stance === "agree" || x.stance === "disagree").slice(0, 3)) {
        const opposite = t.stance === "agree" ? "disagree" : "agree";
        let answerer = pick(voices);
        if (answerer.id === t.author) answerer = voices[(voices.indexOf(answerer) + 1) % voices.length];
        const id = post(answerer.id, pick(ANSWERS[t.stance as "agree" | "disagree"]), Math.min(NOW - MIN, t.at + int(5, 90) * MIN), { reply: { id: t.id, root: t.id }, story: st.key, stance: opposite });
        vote("post", id, 0.5, 0.4);
      }
    });

    GENERAL.forEach((body) => post(pick(voices).id, body, NOW - int(10, 3000) * MIN));
    while (img < images.length) {
      const id = post(pick(voices).id, "Golden hour over the plains tonight.", NOW - int(30, 900) * MIN);
      run("UPDATE media SET post_id = ? WHERE id = ?", [id, images[img++]]);
    }

    // Likes and reposts (Amplify) kept so the stored counts mean something
    for (let k = 0; k < 260; k++) {
      const p = get<{ id: string }>("SELECT id FROM posts WHERE community_id IS NULL ORDER BY random() LIMIT 1")!;
      const u = pick(users);
      run("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", [u.id, p.id, NOW - int(1, 600) * MIN]);
      if (rand() < 0.15) run("INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)", [u.id, p.id, NOW - int(1, 600) * MIN]);
    }
    run(`UPDATE posts SET like_count = (SELECT count(*) FROM likes WHERE post_id = posts.id), repost_count = (SELECT count(*) FROM reposts WHERE post_id = posts.id),
      reply_count = (SELECT count(*) FROM posts c WHERE c.reply_to_id = posts.id), quote_count = (SELECT count(*) FROM posts c WHERE c.quote_of_id = posts.id)`);

    // Poll of the Day
    const pollPost = post(by.get("jess_votes")!.id, "Poll of the Day: what should Congress tackle first in January? #vote", NOW - 3 * HOUR);
    const pid = newId();
    run("INSERT INTO polls (id, post_id, closes_at) VALUES (?, ?, ?)", [pid, pollPost, NOW + 21 * HOUR]);
    const opts = ["Health care costs", "Border security", "Housing prices", "The deficit"].map((label, idx) => {
      const oid = newId() + idx;
      run("INSERT INTO poll_options (id, poll_id, idx, label) VALUES (?, ?, ?, ?)", [oid, pid, idx, label]);
      return oid;
    });
    for (const u of users.slice(2)) if (rand() < 0.85) run("INSERT INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", [pid, u.id, pick(opts), NOW - HOUR]);
    run("UPDATE poll_options SET votes = (SELECT count(*) FROM poll_votes WHERE option_id = poll_options.id)");

    // Desks (communities) with threaded discussions, a pinned story, and an Editor
    for (const [slug, name, desc, pinned] of DESKS) {
      const cid = newId() + slug;
      run("INSERT INTO communities (id, slug, name, description, rules, created_by, pinned_story_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        cid, slug, name, desc, JSON.stringify(["Argue the idea, not the person", "Link sources for factual claims", "No spam or self-promotion"]), pick(voices).id, pinned, NOW - int(30, 400) * 24 * HOUR,
      ]);
      run("INSERT OR IGNORE INTO memberships (community_id, user_id, role, created_at) VALUES (?, ?, 'moderator', ?)", [cid, pick(voices).id, NOW]);
      run("INSERT OR IGNORE INTO memberships (community_id, user_id, role, created_at) VALUES (?, ?, 'moderator', ?)", [cid, by.get("admin")!.id, NOW]);
      for (const u of users) if (rand() < 0.5 || u.handle === "demo") run("INSERT OR IGNORE INTO memberships (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", [cid, u.id, NOW]);
      DESK_THREADS.forEach((title, ti) => {
        const created = NOW - int(2, 60) * HOUR;
        const root = post(pick(voices).id, title, created, { community: cid });
        const thread: { id: string; depth: number; at: number }[] = [{ id: root, depth: 0, at: created }];
        for (let k = 0; k < int(3, 8) + (ti === 0 ? 4 : 0); k++) {
          const parent = rand() < 0.45 ? thread[0] : pick(thread.filter((x) => x.depth < 4));
          const at = Math.min(NOW - MIN, parent.at + int(3, 240) * MIN);
          thread.push({ id: post(pick(voices).id, pick(COMMENTS), at, { reply: { id: parent.id, root }, community: cid }), depth: parent.depth + 1, at });
        }
        for (const t of thread) for (const u of users) {
          const r = rand();
          if (r < (t.depth === 0 ? 0.55 : 0.22)) run("INSERT OR IGNORE INTO community_votes (user_id, post_id, value, created_at) VALUES (?, ?, ?, ?)", [u.id, t.id, r < 0.04 ? -1 : 1, NOW]);
        }
      });
    }
    run("UPDATE posts SET score = (SELECT coalesce(sum(value), 0) FROM community_votes v WHERE v.post_id = posts.id), reply_count = (SELECT count(*) FROM posts c WHERE c.reply_to_id = posts.id) WHERE community_id IS NOT NULL");

    // Headlines not attached to a story
    EXTRA_NEWS.forEach(([section, title], i) => {
      const o = OUTLETS[i % OUTLETS.length];
      run("INSERT INTO news_items (id, source_id, section, title, summary, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        newId() + "x" + i, o[0], section, title, "Sample summary. Real items show a short snippet from the outlet with a link back.", `${o[2]}/brief-${i + 1}`, NOW - int(1, 40) * HOUR,
      ]);
    });

    // Live Studio
    for (const [title, kind, handle, startMin, desc, tag, viewers] of LIVE) {
      run("INSERT INTO live_events (id, kind, title, host_id, starts_at, ends_at, created_at, description, tag, viewers) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)", [
        newId() + handle + startMin, kind, title, by.get(handle)!.id, NOW + startMin * MIN, NOW, desc, tag, viewers,
      ]);
    }

    run("INSERT INTO site_settings (key, value) VALUES ('banner', ?)", [JSON.stringify({ text: "Senate passes $1.2 trillion infrastructure package, 62–38", url: "/news/story/infrastructure", level: "breaking", setAt: NOW })]);

    // Newsdesk items for the demo reader
    const demo = by.get("demo")!;
    const demoTake = post(demo.id, "Reading every update on the infrastructure vote. The broadband money matters where I live. #infrastructure", NOW - 3 * HOUR, { story: "infrastructure", stance: "agree" });
    for (const h of ["maria_lopez", "chef_rosa", "astro_omar"]) {
      run("INSERT INTO stances (user_id, target_type, target_id, value, created_at) VALUES (?, 'post', ?, 'agree', ?)", [by.get(h)!.id, demoTake, NOW - 2 * HOUR]);
      run("INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, 'like', ?, ?)", [newId() + h, demo.id, by.get(h)!.id, demoTake, NOW - 2 * HOUR]);
    }
    const answer = post(by.get("tom_on_policy")!.id, "Fair, but the broadband money has a 5-year spend window. Watch the rollout.", NOW - 90 * MIN, { reply: { id: demoTake, root: demoTake }, story: "infrastructure", stance: "context" });
    run("INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, 'reply', ?, ?)", [newId() + "r", demo.id, by.get("tom_on_policy")!.id, answer, NOW - 90 * MIN]);
    run("INSERT INTO notifications (id, user_id, actor_id, type, created_at) VALUES (?, ?, ?, 'follow', ?)", [newId() + "f", demo.id, by.get("maria_lopez")!.id, NOW - HOUR]);
    run("INSERT INTO bookmarks (user_id, post_id, created_at) SELECT ?, id, ? FROM posts WHERE stance = 'context' AND story_key = 'fedrates' LIMIT 1", [demo.id, NOW - 30 * MIN]);
    run("UPDATE posts SET reply_count = (SELECT count(*) FROM posts c WHERE c.reply_to_id = posts.id) WHERE id = ?", [demoTake]);

    // Reports for the Control Room queue
    const spam = post(by.get("night_owl_ike")!.id, "Sample reported take for the Control Room queue (pretend this was spam).", NOW - 5 * HOUR);
    for (const [who, reason] of [["sarah_k", "spam"], ["bookish_beth", "spam"], ["jwashington", "harassment"]]) {
      run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, 'post', ?, ?, '', ?)", [newId() + who, by.get(who)!.id, spam, reason, NOW - 4 * HOUR]);
    }
    run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, 'user', ?, 'impersonation', 'Claims to be a senator; is not.', ?)", [
      newId() + "imp", by.get("jess_votes")!.id, by.get("pixel_pete")!.id, NOW - 2 * HOUR,
    ]);
  });

  seedTeams();
  const counts = Object.fromEntries(["users", "stories", "story_updates", "posts", "stances", "communities", "news_items", "live_events", "teams"].map((t) => [t, get<{ n: number }>(`SELECT count(*) n FROM ${t}`)!.n]));
  console.log("Done:", counts);
  if (prod) console.log("\nSample accounts have private passwords. Sign up with an email listed in ADMIN_EMAILS to get the Control Room.");
  else console.log("\nLog in with:\n  admin@worldnet.test / worldnet-admin  (Control Room)\n  demo@worldnet.test  / worldnet-demo\n  any other seeded user: <handle>@worldnet.test / worldnet-user");
}

main();
