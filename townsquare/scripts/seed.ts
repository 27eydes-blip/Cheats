/**
 * Seed a fresh database so the app feels alive on first run:
 * 30 users, 10 communities, 200 posts (with replies, quotes, polls, images),
 * 50 news items from clearly fictional outlets, follows, likes, reposts,
 * a breaking banner, and a few reports for the admin queue.
 *
 *   npm run seed        (refuses to run on a database that already has users)
 *   npm run reset       (wipes ./data and seeds again)
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { all, get, newId, run, tx } from "../src/lib/db";
import { hashPassword } from "../src/lib/passwords";
import { extractHashtags, extractMentions } from "../src/lib/text";
import { blurPlaceholder, uploadDir } from "../src/lib/media";

// Deterministic randomness so every seed looks the same.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const NOW = Date.now();
const HOUR = 3_600_000;

if (get<{ n: number }>("SELECT count(*) n FROM users")!.n > 0) {
  console.log("Database already has users. Run `npm run reset` to wipe and reseed.");
  process.exit(0);
}

const PEOPLE: [string, string, string][] = [
  ["admin", "Townsquare Team", "Official account. Moderation, product updates, and help."],
  ["demo", "Demo User", "Just here to try things out."],
  ["maria_lopez", "Maria Lopez", "City hall reporter. Coffee first, questions second."],
  ["jwashington", "James Washington", "Retired teacher. Local history nerd. Grandpa x4."],
  ["priya_codes", "Priya Natarajan", "Software engineer. Writing about tech without the hype."],
  ["coach_dave", "Coach Dave", "High school football coach. Go Eagles."],
  ["thegreenthumb", "Lena Fischer", "Gardener, beekeeper, compost evangelist 🐝"],
  ["markets_mike", "Mike Chen", "Markets, money, and why your groceries cost more."],
  ["sarah_k", "Sarah Kim", "Nurse. Night shift survivor. Dog mom."],
  ["tom_on_policy", "Tom Brennan", "Policy wonk. I read the bill so you don't have to."],
  ["ava_writes", "Ava Robinson", "Novelist. Working on book three. Send snacks."],
  ["djmarcus", "Marcus Hill", "DJ, producer, vinyl collector."],
  ["chef_rosa", "Rosa Martinez", "Line cook turned food truck owner 🌮"],
  ["hiker_ben", "Ben Okafor", "Trails, tents, and too many photos of sunsets."],
  ["the_real_nina", "Nina Petrova", "Photographer. Light chaser."],
  ["gameday_greg", "Greg Sullivan", "Sports takes, mostly bad ones."],
  ["dr_amina", "Dr. Amina Yusuf", "Family doctor. Not medical advice on here, just context."],
  ["oldschool_ray", "Ray Duncan", "Mechanic for 30 years. Ask me about your weird noise."],
  ["jess_votes", "Jess Alvarez", "Civic engagement. Register, then vote. Every time."],
  ["pixel_pete", "Pete Moreau", "Indie game dev. Making a farming game, slowly."],
  ["kayla_runs", "Kayla Brooks", "Marathoner. Couch to 26.2 in two years."],
  ["faithful_frank", "Frank Williams", "Deacon, dad, and a pretty good griller."],
  ["linh_tran", "Linh Tran", "Small business owner. Nail salon + a lot of opinions on rent."],
  ["astro_omar", "Omar Haddad", "Amateur astronomer. Clear skies!"],
  ["bookish_beth", "Beth Carter", "Librarian. Yes, we still exist. Yes, we have Wi-Fi."],
  ["rancher_cole", "Cole Jensen", "Fourth-generation cattle rancher. Weather is my religion."],
  ["zoe_designs", "Zoe Park", "Product designer. Opinions on fonts."],
  ["veteran_vic", "Victor Ramos", "USMC vet. Helping vets find jobs."],
  ["mom_of_three", "Hannah Lee", "Three kids, one minivan, zero free time."],
  ["night_owl_ike", "Ike Johnson", "Insomniac. Posting at 3am so you don't have to."],
];

const TAGS = ["localnews", "election2026", "economy", "weather", "football", "tech", "ai", "gardening", "food", "schoolboard", "traffic", "health", "music", "books", "space", "smallbusiness", "veterans", "running"];

const LINES = [
  "City council meets tonight at 7 on the new budget. I'll be live-posting the highlights. #localnews",
  "Gas went up another 20 cents this week. Anyone else feeling it? #economy",
  "Hot take: the best pizza in town is from the place next to the laundromat. Fight me. #food",
  "Storm rolling in this afternoon. Bring the patio furniture in. #weather",
  "Friday night lights! Eagles up 21-14 at the half 🏈 #football",
  "New AI tools are cool, but please double-check what they tell you. #ai #tech",
  "First tomatoes of the season. Worth every aphid. #gardening",
  "School board voted 4-3 on the new start times. Thoughts? #schoolboard",
  "Highway 9 is a parking lot right now. Take the frontage road. #traffic",
  "Reminder: flu shots are free at the county clinic through Saturday. #health",
  "Just finished a 6-hour set. My ears are ringing in a good way. #music",
  "Reading three books at once is a lifestyle, not a problem. #books",
  "Jupiter is incredibly bright tonight, look southeast after 9pm. #space",
  "Rent on our shop went up 30%. Small businesses can't keep absorbing this. #smallbusiness",
  "Hiring event for veterans this Thursday at the community center. Bring a resume, we'll help with the rest. #veterans",
  "18 miles this morning. Legs: gone. Spirit: high. #running",
  "Early voting starts Monday. Know your polling place before you go. #election2026",
  "Unpopular opinion: meetings should have a hard 30-minute cap.",
  "Somebody explain why my phone needs an update every three days. #tech",
  "Made my grandma's tamale recipe for the first time. Called her twice. Worth it. #food",
  "The new bike lanes downtown are great, but the signage is confusing. #localnews #traffic",
  "Watching the markets today like it's a thriller movie. #economy",
  "Can we bring back the town fair? It used to be the best weekend of the year.",
  "Library has free museum passes now. Most people don't know this! #books",
  "If your car makes a grinding noise when you brake, don't wait. That's your rotors talking.",
  "Kids asked me what the internet was like in 1998. I told them it screamed at you to connect.",
  "Our church food drive collected over 2,000 cans this month. Thank you, neighbors.",
  "Coffee shop on 5th is closing after 22 years. End of an era. #localnews #smallbusiness",
  "Debate night is coming. I'll be watching with the sound on and my expectations low. #election2026",
  "Saw a meteor so bright it lit up the whole yard. Anyone else see it around 11? #space",
  "Hydrate. Stretch. Text your mom. That's the post.",
  "Our high school robotics team made it to state! So proud of these kids. #schoolboard #tech",
  "Weather app said 0% chance of rain. I am currently soaked. #weather",
  "Rosa's food truck is at the park today. The birria tacos are not optional. #food",
  "Finally got the farming game demo working on a phone. Small win, big smile. #tech",
  "Property taxes are up again and nobody can explain why in plain English. #localnews #economy",
  "Night shift tip: freeze your water bottle, it'll still be cold at 4am. #health",
  "Fourth straight week without rain. Pastures are hurting. #weather",
  "Read the whole infrastructure bill summary so you don't have to. Thread coming tomorrow. #election2026",
  "Sunset from the ridge trail tonight. No filter needed.",
];

const REPLIES = [
  "Totally agree.", "Hard disagree, but I respect it.", "Source?", "This is the post of the day.", "Wait, really? I had no idea.",
  "Same thing happened to me last week!", "Thanks for sharing this.", "Can confirm.", "Okay but have you tried the other place?", "😂😂",
  "Respectfully, no.", "Following for updates.", "This needs more attention.", "Underrated take.", "I was there too!", "Great point about the details.",
];

const POLLS: [string, string[]][] = [
  ["Best time for the city council meetings? #localnews", ["Weekday evenings", "Saturday mornings", "Stream them online"]],
  ["How do you get your news? ", ["Social media", "TV", "News websites", "Friends and family"]],
  ["Should the town fair come back next summer?", ["Yes!", "No", "Only if it's cheaper"]],
  ["Pineapple on pizza? #food", ["Yes", "Absolutely not"]],
  ["Who wins Friday's game? #football", ["Eagles", "Wildcats"]],
  ["What should the empty lot downtown become?", ["Park", "Housing", "Parking", "Farmers market"]],
];

const NEWS_SOURCES = [
  ["src1", "Example Daily Wire", "https://example.com/daily-wire"],
  ["src2", "Sample Tribune", "https://example.org/tribune"],
  ["src3", "Placeholder Network News", "https://example.net/pnn"],
  ["src4", "Demo Herald", "https://example.com/herald"],
  ["src5", "Mock Metro Ledger", "https://example.org/ledger"],
];

const NEWS: [string, string, string][] = [
  ["Politics", "State lawmakers advance budget bill after late-night session", "budget"],
  ["Politics", "Budget bill clears key vote; both parties claim a win", "budget"],
  ["Politics", "What's actually in the state budget, in five charts", "budget"],
  ["Politics", "Early voting turnout tops last cycle in first three days", "turnout"],
  ["Politics", "Record early turnout reported; officials urge patience at polls", "turnout"],
  ["Politics", "Candidates spar over taxes and schools in first debate", "debate"],
  ["Politics", "Fact-check: claims from the first gubernatorial debate", "debate"],
  ["World", "Leaders gather for regional trade summit", "summit"],
  ["World", "Trade summit ends with agreement on shipping routes", "summit"],
  ["World", "Severe flooding displaces thousands in coastal region", null as never],
  ["World", "Aid groups scale up response as floodwaters recede", null as never],
  ["World", "Elections in three countries this weekend: what to watch", null as never],
  ["Business", "Gas prices rise for third straight week", "gas"],
  ["Business", "Why gas prices are climbing again, explained", "gas"],
  ["Business", "Local grocery chain announces 12 new stores", null as never],
  ["Business", "Small-business owners say rent increases are the top worry", null as never],
  ["Business", "Stocks close mixed as investors weigh rate outlook", null as never],
  ["Business", "Mortgage rates dip slightly, offering buyers small relief", null as never],
  ["Sports", "Eagles rally in fourth quarter to stay unbeaten", "eagles"],
  ["Sports", "Eagles' comeback: the five plays that turned the game", "eagles"],
  ["Sports", "State marathon draws record field of runners", null as never],
  ["Sports", "Basketball preview: the region's top five teams", null as never],
  ["Sports", "Local wrestler signs with state university", null as never],
  ["Tech", "New phone update brings battery fixes, users report", null as never],
  ["Tech", "Schools weigh rules for AI homework helpers", "ai-schools"],
  ["Tech", "Teachers split on AI tools in the classroom, survey finds", "ai-schools"],
  ["Tech", "Regional broadband expansion reaches rural counties", null as never],
  ["Tech", "Startup builds farming app for small ranchers", null as never],
  ["Tech", "How to spot a scam text, according to security experts", null as never],
  ["Entertainment", "Summer music festival announces lineup", null as never],
  ["Entertainment", "Local author's debut novel hits bestseller list", null as never],
  ["Entertainment", "Historic theater reopens after two-year renovation", null as never],
  ["Entertainment", "Film festival to spotlight hometown directors", null as never],
  ["Local", "City council to vote on downtown bike lanes", "bikelanes"],
  ["Local", "Bike lane plan draws packed crowd at council meeting", "bikelanes"],
  ["Local", "Coffee shop on 5th Street to close after 22 years", null as never],
  ["Local", "County clinic offers free flu shots through Saturday", null as never],
  ["Local", "School board approves later start times in 4-3 vote", "starttimes"],
  ["Local", "Parents react to new school start times", "starttimes"],
  ["Local", "Highway 9 construction to cause delays through December", null as never],
  ["Local", "Library launches free museum pass program", null as never],
  ["Local", "Drought conditions worsen for area ranchers", null as never],
  ["World", "Scientists report progress on long-lasting vaccine", null as never],
  ["Business", "Holiday hiring expected to slow this year", null as never],
  ["Sports", "Youth soccer league expands to two new fields", null as never],
  ["Tech", "Meteor shower peaks this week; best viewing after midnight", null as never],
  ["Politics", "Town hall on property taxes set for next Tuesday", null as never],
  ["Local", "Food drive collects 2,000 cans for families in need", null as never],
  ["Entertainment", "Community theater casts kids for winter show", null as never],
  ["World", "Global shipping costs ease ahead of holiday season", null as never],
];

const COMMUNITIES: [string, string, string][] = [
  ["localnews", "Local News", "What's happening in town: council, schools, roads, and businesses."],
  ["politics", "Politics", "Debate policy from any side. Same rules for everyone. Be civil."],
  ["football", "Friday Night Football", "High school and college football, scores, and trash talk."],
  ["gardening", "Gardeners", "Vegetables, flowers, bees, and dirt under the nails."],
  ["tech", "Tech Talk", "Gadgets, software, AI, and help with your devices."],
  ["food", "Food & Recipes", "Recipes, restaurants, and food truck sightings."],
  ["veterans", "Veterans Network", "Jobs, benefits, and community for those who served."],
  ["books", "Book Club", "What are you reading? Monthly picks and discussion."],
  ["parents", "Parents", "School, sports, schedules, and surviving it all."],
  ["space", "Night Sky", "Astronomy, launches, and what to look for tonight."],
];

const COMMUNITY_POSTS: Record<string, string[]> = {
  localnews: ["The bike lane vote passed 5-2. What does this actually change for drivers on Main?", "Anyone know why the water main on 3rd keeps breaking?", "Coffee shop on 5th closing after 22 years — let's do a send-off this Saturday"],
  politics: ["Read the full state budget summary. Ask me anything about where the money goes.", "Early voting turnout is up 18%. Good sign or just convenience?", "Debate night megathread: keep it civil"],
  football: ["Eagles 28, Wildcats 24 — game thread recap", "Who's the best QB in the conference this year?", "Playoff bracket predictions"],
  gardening: ["My tomatoes split after the rain. Anything I can do?", "Show your fall harvest 🎃", "Bees swarmed my shed. Who do I call?"],
  tech: ["Is the new phone update worth installing yet?", "How do you explain two-factor auth to your parents?", "Best budget laptop for a high schooler?"],
  food: ["Best tacos in town — final answer?", "Rosa's truck is at the park today 🌮", "Grandma's recipes you still make"],
  veterans: ["Job fair Thursday at the community center — who's going?", "VA appointment wait times this month?"],
  books: ["November pick: what did everyone think of the ending?", "Books that made you cry on a plane"],
  parents: ["New school start times: how are mornings going?", "Rainy day ideas for under-10s"],
  space: ["Jupiter is huge tonight, look southeast after 9", "Meteor shower peak this week — best dark spots nearby?"],
};

const COMMENTS = [
  "This is the right call, honestly.", "I disagree, and here's why: the numbers don't add up.", "Source? Genuinely asking.", "Lived here 30 years, this comes up every decade.",
  "Great thread, thanks for organizing it.", "Can someone summarize for those of us who missed the meeting?", "Same experience here.", "Hard agree.",
  "Counterpoint: it depends a lot on the neighborhood.", "Update: they posted the minutes online.", "😂 accurate", "Following this one.",
];

const STORY_TAKES = ["Watching this closely.", "This affects my commute directly.", "Glad they finally voted.", "Big day for downtown.", "Not sure about this one.", "Here's what my neighbors are saying:"];

const STORIES: [string, string, string, string, string | null, "live" | "developing" | "ended", [string, "update" | "key" | "quote"][]][] = [
  ["bikelanes", "City council passes downtown bike lane plan 5-2", "After a four-hour meeting, the council approved protected bike lanes on Main and 5th. Construction starts in spring.", "Local", "bikelanes", "live", [
    ["Council meeting opens; more than 200 residents signed up to speak.", "update"],
    ["Public comment runs past two hours, split roughly evenly for and against.", "update"],
    ["\"We've studied this for three years. It's time.\" — Council member Ortiz", "quote"],
    ["Amendment to keep 40 parking spaces on 5th passes 6-1.", "key"],
    ["Final vote: 5-2 in favor. Construction expected to begin in April.", "key"],
    ["Business owners on Main plan a meeting next week about delivery zones.", "update"],
  ]],
  ["budget", "State budget clears key vote after late-night session", "Lawmakers advanced the spending plan 61-38. Both parties claim wins on schools and roads.", "Politics", "statebudget", "developing", [
    ["House convenes for a rare late-night session.", "update"],
    ["Bipartisan deal adds $40M for rural roads.", "key"],
    ["Budget clears the House 61-38; Senate vote expected Thursday.", "key"],
  ]],
  ["eagles", "Eagles rally in fourth quarter to stay unbeaten", "A late touchdown sealed a 28-24 win over the Wildcats.", "Sports", "football", "ended", [
    ["Wildcats lead 24-14 entering the fourth.", "update"],
    ["Eagles score twice in four minutes to take the lead.", "key"],
    ["Final: Eagles 28, Wildcats 24.", "key"],
  ]],
  ["gas", "Gas prices rise for a third straight week", "Average price up 20 cents locally; analysts point to refinery maintenance.", "Business", "economy", "developing", [
    ["Average local price hits $3.61.", "update"],
    ["Analysts expect prices to ease by mid-December.", "update"],
  ]],
];

const LIVE: [string, "stream" | "audio" | "debate", string, number, string, string, number][] = [
  ["Friday Night Lights: Eagles postgame", "stream", "coach_dave", -35, "Highlights, interviews, and your questions after the big comeback.", "football", 1243],
  ["City Hall Live: bike lanes explained", "audio", "maria_lopez", -12, "Maria breaks down the vote and takes calls.", "bikelanes", 386],
  ["Markets at the open", "stream", "markets_mike", 95, "What's moving and why, in 20 minutes.", "economy", 0],
  ["Debate night: should the town fair come back?", "debate", "tom_on_policy", 60 * 26, "Two neighbors, two sides, five-minute rounds. You vote.", "townfair", 0],
  ["Night Sky Q&A", "audio", "astro_omar", 60 * 50, "Bring your telescope questions.", "space", 0],
];

/** A simple generated picture (gradient + shapes) so media grids have something to show. */
async function makeImage(ownerId: string, i: number): Promise<string> {
  const hue = (i * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,30%)"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="${300 + (i * 97) % 600}" cy="260" r="110" fill="hsl(${(hue + 180) % 360},90%,85%)" opacity=".9"/>
    <path d="M0 620 L260 420 L470 560 L720 330 L1000 540 L1200 430 L1200 800 L0 800 Z" fill="hsl(${hue},40%,18%)" opacity=".85"/></svg>`;
  const data = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const id = newId();
  mkdirSync(uploadDir(), { recursive: true });
  writeFileSync(path.join(uploadDir(), `${id}.webp`), data);
  run("INSERT INTO media (id, owner_id, kind, mime, width, height, bytes, path, alt, blur, created_at) VALUES (?, ?, 'image', 'image/webp', 1200, 800, ?, ?, ?, ?, ?)", [
    id, ownerId, data.length, `${id}.webp`, "Illustrated landscape with hills and a bright sun", await blurPlaceholder(data), NOW,
  ]);
  return id;
}

async function main() {
  console.log("Seeding…");
  const adminPw = await hashPassword("townsquare-admin");
  const demoPw = await hashPassword("townsquare-demo");
  const otherPw = await hashPassword("townsquare-user");
  const images: string[] = [];

  const users = PEOPLE.map(([handle, name, bio], i) => ({
    id: newId() + i,
    handle,
    name,
    bio,
    created: NOW - int(30, 400) * 24 * HOUR,
  }));
  const byHandle = new Map(users.map((u) => [u.handle, u]));

  tx(() => {
    for (const [i, u] of users.entries()) {
      const pw = u.handle === "admin" ? adminPw : u.handle === "demo" ? demoPw : otherPw;
      run(
        `INSERT INTO users (id, email, password_hash, handle, display_name, bio, links, role, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, `${u.handle.replace(/\W/g, "")}@townsquare.test`, pw, u.handle, u.name, u.bio, i === 2 ? JSON.stringify([{ label: "Portfolio", url: "https://example.com/maria" }]) : "[]", u.handle === "admin" ? "admin" : "user", [0, 2, 16].includes(i) ? 1 : 0, u.created],
      );
    }
    // Follow graph: everyone follows a handful; popular accounts get more.
    for (const u of users) {
      const n = int(4, 14);
      for (let k = 0; k < n; k++) {
        const t = rand() < 0.4 ? users[int(2, 8)] : pick(users);
        if (t.id !== u.id) run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [u.id, t.id, NOW - int(1, 600) * HOUR]);
      }
    }
    // Make sure the demo account has a full Following feed.
    for (const h of ["maria_lopez", "jwashington", "priya_codes", "coach_dave", "markets_mike", "tom_on_policy", "chef_rosa", "astro_omar"]) {
      run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [byHandle.get("demo")!.id, byHandle.get(h)!.id, NOW - 100 * HOUR]);
    }
  });

  for (let i = 0; i < 14; i++) images.push(await makeImage(pick(users.slice(2)).id, i));

  const posts: { id: string; author: string; created: number }[] = [];
  const insertPost = (author: string, body: string, created: number, extra: { reply?: { id: string; root: string | null }; quote?: string; community?: string } = {}) => {
    const id = newId() + posts.length;
    run(`INSERT INTO posts (id, author_id, body, reply_to_id, root_id, quote_of_id, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, author, body, extra.reply?.id ?? null, extra.reply ? (extra.reply.root ?? extra.reply.id) : null, extra.quote ?? null, extra.community ?? null, created,
    ]);
    for (const t of extractHashtags(body)) run("INSERT OR IGNORE INTO post_hashtags (post_id, tag, created_at) VALUES (?, ?, ?)", [id, t, created]);
    for (const h of extractMentions(body)) {
      const m = byHandle.get(h);
      if (m) run("INSERT OR IGNORE INTO mentions (post_id, user_id) VALUES (?, ?)", [id, m.id]);
    }
    posts.push({ id, author, created });
    return id;
  };

  tx(() => {
    const authors = users.slice(2);
    // 128 top-level posts spread over the last 5 days
    for (let i = 0; i < 128; i++) {
      const a = pick(authors);
      let body = pick(LINES);
      if (rand() < 0.15) body += ` cc @${pick(authors).handle}`;
      if (rand() < 0.1) body += ` More here: https://example.com/story/${pick(TAGS)}-update`;
      const id = insertPost(a.id, body, NOW - Math.floor(rand() * 120 * HOUR));
      if (body.includes("https://")) {
        const u = new URL(body.match(/https:\/\/\S+/)![0]);
        run("UPDATE posts SET link_url = ?, link_domain = ?, link_title = ? WHERE id = ?", [u.toString(), u.hostname, u.pathname.split("/").pop()!.replace(/-/g, " "), id]);
      }
    }
    // Attach images to some posts (1 to 4 per post)
    let im = 0;
    for (const p of posts.slice(0, 8)) {
      const n = Math.min(images.length - im, int(1, 4));
      for (let k = 0; k < n; k++) run("UPDATE media SET post_id = ?, owner_id = ?, position = ? WHERE id = ?", [p.id, p.author, k, images[im++]]);
      if (im >= images.length) break;
    }
    // 6 polls
    for (const [q, opts] of POLLS) {
      const created = NOW - int(1, 60) * HOUR;
      const id = insertPost(pick(authors).id, q, created);
      const pid = newId();
      run("INSERT INTO polls (id, post_id, closes_at) VALUES (?, ?, ?)", [pid, id, created + int(24, 96) * HOUR]);
      const optionIds = opts.map((label, idx) => {
        const oid = newId() + idx;
        run("INSERT INTO poll_options (id, poll_id, idx, label) VALUES (?, ?, ?, ?)", [oid, pid, idx, label]);
        return oid;
      });
      for (const u of users.slice(2)) if (rand() < 0.6) run("INSERT INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", [pid, u.id, pick(optionIds), created + HOUR]);
    }
    // 52 replies and 12 quotes (total 200 posts)
    const tops = [...posts];
    for (let i = 0; i < 52; i++) {
      const parent = pick(tops.slice(0, 60));
      const pa = all<{ root_id: string | null }>("SELECT root_id FROM posts WHERE id = ?", [parent.id])[0];
      insertPost(pick(authors).id, pick(REPLIES), Math.min(NOW - 60_000, parent.created + int(5, 600) * 60_000), { reply: { id: parent.id, root: pa?.root_id ?? null } });
    }
    for (let i = 0; i < 12; i++) {
      const q = pick(tops);
      insertPost(pick(authors).id, pick(["This. 👇", "Worth reading.", "Not sure I agree with this one.", "Big if true.", "Sharing for anyone in town."]), Math.min(NOW - 60_000, q.created + int(10, 900) * 60_000), { quote: q.id });
    }
    // Likes, reposts, bookmarks: popular-ish distribution
    for (const p of posts) {
      const likes = Math.floor(Math.pow(rand(), 2.2) * 28);
      for (let k = 0; k < likes; k++) run("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", [pick(users).id, p.id, Math.min(NOW, p.created + int(1, 300) * 60_000)]);
      if (rand() < 0.25) {
        const r = int(1, 5);
        for (let k = 0; k < r; k++) {
          const u = pick(users);
          if (u.id !== p.author) run("INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)", [u.id, p.id, Math.min(NOW, p.created + int(10, 600) * 60_000)]);
        }
      }
    }
    // Recompute counters from the real rows
    run(`UPDATE posts SET
      like_count = (SELECT count(*) FROM likes WHERE post_id = posts.id),
      repost_count = (SELECT count(*) FROM reposts WHERE post_id = posts.id),
      reply_count = (SELECT count(*) FROM posts c WHERE c.reply_to_id = posts.id),
      quote_count = (SELECT count(*) FROM posts c WHERE c.quote_of_id = posts.id)`);
    run("UPDATE poll_options SET votes = (SELECT count(*) FROM poll_votes WHERE option_id = poll_options.id)");

    // Notifications for the demo account so the badge has something to show
    const demo = byHandle.get("demo")!;
    const demoPost = insertPost(demo.id, "Hello, Townsquare! Trying out my first post. #localnews", NOW - 3 * HOUR);
    for (const h of ["maria_lopez", "chef_rosa", "astro_omar"]) {
      run("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", [byHandle.get(h)!.id, demoPost, NOW - 2 * HOUR]);
      run("INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, 'like', ?, ?)", [newId() + h, demo.id, byHandle.get(h)!.id, demoPost, NOW - 2 * HOUR]);
    }
    run("UPDATE posts SET like_count = 3 WHERE id = ?", [demoPost]);
    run("INSERT INTO notifications (id, user_id, actor_id, type, created_at) VALUES (?, ?, ?, 'follow', ?)", [newId() + "f", demo.id, byHandle.get("maria_lopez")!.id, NOW - HOUR]);

    // Communities + memberships
    for (const [slug, name, desc] of COMMUNITIES) {
      const cid = newId() + slug;
      run("INSERT INTO communities (id, slug, name, description, rules, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        cid, slug, name, desc, JSON.stringify(["Be civil", "Stay on topic", "No spam or self-promotion without context"]), users[int(2, 29)].id, NOW - int(10, 200) * 24 * HOUR,
      ]);
      for (const u of users) if (rand() < 0.45 || u.handle === "admin" || u.handle === "demo") run("INSERT OR IGNORE INTO memberships (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", [cid, u.id, NOW]);
      // Threaded discussions with votes
      for (const [ti, title] of (COMMUNITY_POSTS[slug] ?? []).entries()) {
        const created = NOW - int(2, 90) * HOUR;
        const root = insertPost(pick(users.slice(2)).id, title, created, { community: cid });
        const thread: { id: string; depth: number; at: number }[] = [{ id: root, depth: 0, at: created }];
        const n = int(3, 9) + (ti === 0 ? 6 : 0);
        for (let k = 0; k < n; k++) {
          const parent = rand() < 0.45 ? thread[0] : pick(thread.filter((x) => x.depth < 4));
          const at = Math.min(NOW - 60_000, parent.at + int(3, 240) * 60_000);
          const id = insertPost(pick(users.slice(2)).id, pick(COMMENTS), at, { reply: { id: parent.id, root }, community: cid });
          thread.push({ id, depth: parent.depth + 1, at });
        }
        for (const t of thread) for (const u of users) {
          const r = rand();
          if (r < (t.depth === 0 ? 0.55 : 0.22)) run("INSERT OR IGNORE INTO community_votes (user_id, post_id, value, created_at) VALUES (?, ?, ?, ?)", [u.id, t.id, r < 0.04 ? -1 : 1, NOW]);
        }
      }
    }
    run("UPDATE posts SET score = (SELECT coalesce(sum(value), 0) FROM community_votes v WHERE v.post_id = posts.id), reply_count = (SELECT count(*) FROM posts c WHERE c.reply_to_id = posts.id) WHERE community_id IS NOT NULL");

    // News: fictional outlets on example.* domains
    for (const [id, name, home] of NEWS_SOURCES) run("INSERT INTO news_sources (id, name, homepage, verified) VALUES (?, ?, ?, 1)", [id, name, home]);
    NEWS.forEach(([section, title, story], i) => {
      const src = NEWS_SOURCES[i % NEWS_SOURCES.length];
      run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        newId() + i, src[0], section, title, "Sample summary for development. Real items will show a short snippet from the outlet with a link back.", `${src[2]}/story-${i + 1}`, story ?? null, NOW - int(1, 72) * HOUR,
      ]);
    });

    run("INSERT INTO site_settings (key, value) VALUES ('banner', ?)", [JSON.stringify({ text: "City council passes downtown bike lane plan 5-2 after four-hour meeting", url: "/news/story/bikelanes", level: "breaking", setAt: NOW })]);

    // Live story pages with timelines (sample content from fictional outlets)
    const reporter = byHandle.get("maria_lopez")!.id;
    for (const [key, title, summary, section, tag, status, updates] of STORIES) {
      run("INSERT INTO stories (key, title, summary, section, tag, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [key, title, summary, section, tag, status, NOW - updates.length * 40 * 60_000, NOW - 4 * 60_000]);
      updates.forEach(([body, kind], i) =>
        run("INSERT INTO story_updates (id, story_key, body, kind, author_id, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
          newId() + key + i, key, body, kind, i % 3 === 2 ? null : reporter, i % 3 === 2 ? NEWS_SOURCES[i % NEWS_SOURCES.length][0] : null, NOW - (updates.length - i) * 35 * 60_000 + 60_000,
        ]),
      );
      if (tag) for (let k = 0; k < 4; k++) insertPost(pick(users.slice(2)).id, `${pick(STORY_TAKES)} #${tag}`, NOW - int(5, 300) * 60_000);
    }

    // Live: two shows on air now, three scheduled
    for (const [title, kind, handle, startMin, desc, tag, viewers] of LIVE) {
      run("INSERT INTO live_events (id, kind, title, host_id, starts_at, ends_at, created_at, description, tag, viewers) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)", [
        newId() + handle, kind, title, byHandle.get(handle)!.id, NOW + startMin * 60_000, NOW, desc, tag, viewers,
      ]);
    }

    // A few open reports so the admin queue isn't empty
    const spamId = insertPost(byHandle.get("night_owl_ike")!.id, "Sample reported post for the admin queue (pretend this was spam).", NOW - 5 * HOUR);
    for (const [who, reason] of [["sarah_k", "spam"], ["bookish_beth", "spam"], ["jwashington", "harassment"]]) {
      run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, 'post', ?, ?, '', ?)", [newId() + who, byHandle.get(who)!.id, spamId, reason, NOW - 4 * HOUR]);
    }
    run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, 'user', ?, 'impersonation', 'Says they are the mayor but they are not.', ?)", [
      newId() + "imp", byHandle.get("jess_votes")!.id, byHandle.get("pixel_pete")!.id, NOW - 2 * HOUR,
    ]);
  });

  const counts = Object.fromEntries(["users", "posts", "communities", "news_items", "follows", "likes"].map((t) => [t, get<{ n: number }>(`SELECT count(*) n FROM ${t}`)!.n]));
  console.log("Done:", counts);
  console.log("\nLog in with:\n  admin@townsquare.test / townsquare-admin  (admin)\n  demo@townsquare.test  / townsquare-demo\n  any other seeded user: <handle>@townsquare.test / townsquare-user");
}

main();
