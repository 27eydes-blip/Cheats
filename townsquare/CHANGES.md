# What changed (sections-v1)

Two jobs, each shipped to `news-v1` as its own commit so it can be rolled back on its own.

| Job | What | Commit on news-v1 |
|---|---|---|
| 1 | World, Business, Tech and Culture get the Politics treatment | the "Sections: World, Business, Tech and Culture pages" commit |
| 2 | Sports hub upgrade | the "Sports hub" commit |

## Job 1: World, Business, Tech and Culture pages
- **New pages**: `/world`, `/business`, `/tech` and `/culture`, built from the same component as `/politics`. Each has:
  - a masthead and sub-section chips;
  - a lead story with the coverage bar;
  - two featured cards and a numbered list of top stories;
  - a sidebar with **Trending in …**, **Where readers stand** and the sub-sections;
  - "The conversation" (readers' dispatches), and the matching AI desk's posts when the AI newsroom is on.
- **Tailored**:
  - **World** by region: Americas, Europe, Middle East, Asia, Africa (`/world?region=asia`).
  - **Business** by Markets, Companies and Economy, with a small Markets card in the sidebar (labeled "Demo prices" when prices are simulated).
  - **Tech** by AI, Gadgets and Cybersecurity.
  - **Culture** by Film, Music, TV and Books. The news intake has no Culture category, so clearly cultural stories are also pulled in from other sections (never Sports or Politics).
- **Every side of the story** (Left / Center / Right headlines, blindspots, opinion across the spectrum, today's balance) is on for World and Business, where outlets' political lean says something useful. It is off for Tech and Culture.
- Politics now also shows **Trending in politics**.
- **Top nav**: World, Business, Tech and Culture open the new pages; "Your Topics" links do too. Old addresses (`/topics/world`, `/topics/business`, `/topics/tech`, `/topics/culture`, `/topics/politics`) redirect permanently. Sports is unchanged.
- Fixed while there: the sidebar is drawn twice (phone and desktop), which repeated element IDs; each copy now has its own.
- Railway: nothing to add. Database: no changes.
- Screenshots (TEST outlets only, on `sections-v1`): `screenshots/sections-{phone,desktop}-{world,business,tech,culture,world-region,politics}.png`.

---

# What changed (team logos, take two)

Shipped to `news-v1` as one commit ("Team logos: Control Room page…"). Screenshots are on the `logos-v1` branch only.

- **Control Room → Sports data → Team logos** (`/admin/sports/logos`):
  - Every team in one table: logo thumbnail, team and slug, league, what it shows now (Uploaded, TheSportsDB or Letter badge), and a thumbnail of each logo you have for it.
  - Filters: search, league, **No real logo** and **College teams**.
  - **Upload** per team: PNG, SVG, JPG or WebP, up to 2 MB. The file type is checked from the file's contents, not its name. Each upload is converted to WebP at 128 and 512 pixels and stored on the volume (`/data/uploads/team-logos`). SVGs are drawn into images and never served as SVG; SVGs that load outside files or contain scripts are refused.
  - A choice per team: **Automatic**, **Use uploaded logo**, **Use TheSportsDB badge** or **Use letter badge**, plus **Remove upload**. The same choices apply in one click to every team the filters show (for example, all college teams to letter badges).
  - **Bulk upload**: a ZIP of images named by team slug (for example `ncaaf-ala.png`), with a list of which files matched a team and which didn't, and why.
  - **Name aliases**: add or remove how the data feed spells a team (for example "Miami (FL)"). They are used for scores, standings and badges.
  - The note: "Official college and pro logos are trademarked. Only upload images you have permission to use."
- **One priority order everywhere**: uploaded logo, then TheSportsDB badge, then the letter badge, unless you pick one for a team.
- **New letter badge**: a circle in the team's color (TheSportsDB's color if it has one, otherwise our reference color, otherwise neutral slate) with 1 to 3 letters in white or near-black. Every team's badge is checked to be at least 4.5:1 contrast. Teams the feed names but we can't match get a neutral circle with their initials instead of a plain gray letter.
- **Better name matching**: "Miami (FL)", "Miami (OH)", "Arkansas State", "Louisiana Tech", "Colorado State", "Fresno State" and "UTSA" now find the right team. "Arkansas State" no longer becomes Arkansas. Six college teams were added: Arkansas State, Louisiana Tech, Colorado State, Fresno State, UTSA and Miami (OH).
- Logos you uploaded and badges fetched before this version keep working: old uploads show as "Uploaded", old provider logos as "TheSportsDB".
- Database: additive migration 13 (logo choice and source columns, TheSportsDB colors, an aliases table). Nothing deleted; checked on a copy of a live-style database.
- Railway: nothing new to add.
- Screenshots (TEST teams only, on `logos-v1`): `screenshots/logos-{phone,desktop}-team-logos.png` (the Team logos page) and `screenshots/logos-{phone,desktop}-score-cards.png` (score cards showing an uploaded logo, a TheSportsDB badge and a letter badge).

---

# What changed (team logos)

Shipped to `news-v1` as one commit ("Team logos from TheSportsDB…").

- **Real team logos** for every NFL, NBA, MLB, NHL, college football, MLS and Premier League team now come from **TheSportsDB**, the same provider as schedules and scores (not ESPN: its image server isn't licensed for other sites, see DECISIONS.md).
- About a minute after the deploy, the app fetches every team's badge once, resizes it, and stores it on the Railway volume, so pages stay fast and keep working if the provider is down. Teams it couldn't get are retried once a day. Until a team's logo arrives, it keeps the colored badge.
- Logos you upload in **Control Room → Team logos** always win and are never overwritten.
- Railway: nothing new to add. Your `SPORTS_DATA_KEY` (if set) is used; otherwise the free key. If the free key returns only some teams, the paid key fills in the rest. `SPORTS_LOGO_PROVIDER=none` switches provider logos off.
- To re-fetch every logo on demand: `npm run teams:refresh -- --force` (in a Railway shell).

---

# What changed (Politics section)

Shipped to `news-v1` as one commit ("Politics: a dedicated section…"), so you can roll it back in Railway on its own. No new Railway variables, no database changes.

- **Politics now has its own section at `/politics`**, opened by Politics in the top nav:
  - A big masthead and **beats**: All, Congress, White House, Courts, Elections, States (stories are filed by the words in their headlines).
  - **The lead story** large, with its summary, the coverage bar, and **"How it's covered"**: the newest headline from a Left, a Center and a Right-leaning outlet, side by side, each linking to the outlet.
  - **Top stories**: two featured cards, then a numbered list, each with its coverage bar.
  - **Blindspots**: stories covered mostly by one side, so readers of the other side may have missed them.
  - **Opinion across the spectrum**: the newest columns and editorials in Left, Center and Right columns (clearly labeled opinion).
  - **From the AI politics desk**: the latest dispatches from @ai_capitol and @ai_lawdesk, when the AI newsroom is on (with the AI badge and sources).
  - **The conversation**: readers' political dispatches.
  - A sidebar (below the top stories on phones): **Today in politics** (stories, outlets, articles and the left/center/right share of all political coverage in the last 24 hours), **Where readers stand** (agree/disagree splits), and the beats.
- **Every story page** now has "How each side is covering it" (one headline per side) above the full outlet list.
- The old topic feed is still at `/topics/politics`.
- Everything is built from the real ingested articles and the outlets' existing lean ratings; nothing is invented. Sections with nothing to show stay hidden.

---

# What changed (sports upgrade)

Shipped to `news-v1` as one commit ("Sports: scores, schedules, standings…"), so you can roll it back in Railway on its own.

- **Sports is now a real section.** The Sports tab in the top nav opens `/sports` with three views:
  - **Scores**: Live now, Today, Upcoming (the next 7 days, by day) and Results (the last 3 days), for all leagues or one (NFL, NBA, MLB, NHL, College Football, MLS, Premier League). Signed-in readers who picked teams in Your Topics see **Your teams** with each team's next game first.
  - **Standings**: league tables (wins, losses and win share; draws, goal difference and points for soccer).
  - **Teams**: the team directory that used to be the Sports page.
- **Game pages** (`/sports/game/…`): the matchup with logos and records, the score or the local start time and venue, both teams' last five results, earlier meetings, and related stories.
- **Team pages** now show the record and league rank, the schedule, recent results, then the team's stories.
- **Sports news** (`/topics/sports`) has a scrolling score strip on top, and links to the scores page.
- **Local times**: game times and "Today" follow each reader's own time zone (US Eastern until the browser reports it).
- **Control Room → Sports data**: each league's last sync, games stored, any errors, and a **Sync now** button.
- **Where the data comes from**: TheSportsDB, every 15 minutes. On the **free key** you get a limited number of upcoming and recent games per league and partial tables, with no live scores. Add a **paid key** (about $9 a month, thesportsdb.com) as `SPORTS_DATA_KEY` for full schedules, full tables, and live scores every 2 minutes during games.
- **Not tested live**: this workspace can't reach TheSportsDB, so the first real sync happens on Railway about 30 seconds after the deploy. Open Control Room → Sports data a minute later: every league should say OK. If one says Failed, its error is listed there.
- Database: two new tables (`games`, `standings`), added by an additive migration. Nothing existing is changed.

## Railway variables (sports)

| Variable | Needed? | What to put |
|---|---|---|
| `SPORTS_DATA_KEY` | Optional, recommended | Your TheSportsDB API key. Without it the free test key is used (limited data, no live scores). |
| `SPORTS_SYNC_INTERVAL_MIN` | Optional | Minutes between full syncs. Default `15`, minimum `5`. |
| `SPORTS_SYNC` | Optional | `off` stops the sports sync entirely. |

---

# What changed (polish-v1)

Built on `news-v1`, in six parts. Railway deploys `news-v1`; the variables to add are listed under "Railway variables (polish-v1)" below. Each part is one commit on `news-v1` (the live branch), so you can roll back a part in Railway on its own. Screenshots are in `screenshots/` on the `polish-v1` branch only.

| Part | What | Commit on news-v1 |
|---|---|---|
| 1 | Feed fixes, outlet changes, Control Room feed status | `7572c29` |
| 2 | Search crash fix, error boundary, client error logging | `f64b71f` |
| 3 | One feed tab row, topics in the top nav, Your Topics | `14d8e8f` |
| 4 | Sponsors with images, editor with preview, Glydrift | `aa7e47c` |
| 5 | Quality pass: tap targets, contrast, headings, calmer search | `22db479` |
| 6 | AI newsroom accounts (ships switched off) | the "Part 6: AI newsroom accounts" commit |

## Part 1: Failing feeds and more outlets
- HuffPost's feed address fixed; MSNBC and any other feed that starts returning a web page now finds the outlet's official feed by itself (robots.txt checked for every candidate).
- Fox Business and Axios removed from the default outlets (their robots.txt disallows us); on the live site they're switched off, their old articles kept.
- Newsmax's "robots.txt unavailable" now really retries on the next sync.
- New outlets WSJ Opinion, The Daily Signal, Townhall and TheBlaze start switched off and turn on only after their robots.txt allows us and their feed works.
- Control Room → News feeds shows each feed's last result and flags feeds that fail 3 times in a row.
- Railway: nothing to add.
- Screenshots: `screenshots/part1-phone-newsfeeds.png`, `part1-phone-newsfeeds-list.png`, `part1-desktop-newsfeeds.png`, `part1-desktop-newsfeeds-list.png` (Control Room → News feeds, with TEST outlets and one TEST feed failing 3 times).

## Part 2: The search crash
- Search can no longer take down the page: bad or empty replies from the search API are handled, browsers that can't open a modal still work, and an error boundary contains anything else (the rest of the page keeps working).
- Any client-side crash is now written to the server log as `[client-error] …`, so if it ever happens again you'll see the exact error in Railway → Logs.
- Zero results now say "Nothing on the wire for …".
- I couldn't reproduce the crash here; see DECISIONS.md (Part 2) for the likely causes and what changed for each.
- Railway: nothing to add.
- Screenshots: `screenshots/part2-phone-home.png`, `part2-phone-search.png`, `part2-desktop-home.png`, `part2-desktop-search.png`.

## Part 3: One tab row
- The home page has one tab row: **For You** (default) and **Friends**.
- Topics (Politics, World, Business, Tech, Sports, Culture) plus Markets, Live and Desks are in **one top nav** on phones and desktop; each topic opens its own compact page (`/topics/politics` and so on).
- The topics and teams you pick are now **Your Topics** in the side menu and desktop rail, with an Edit button.
- The ticker shows once and no longer repeats category labels.
- Old links (`/?c=Politics`, `/?tab=t-tech`, `/?tab=team-…`) redirect to the new pages.
- Railway: nothing to add.
- Screenshots: `screenshots/part3-{phone,desktop}-{home,tabs,menu,topic}.png` (home, tab layout, side menu with Your Topics, a topic page).

## Part 4: Sponsor images
- **Control Room → Sponsors**: create and edit sponsors with name, headline, body, link, button label, image upload (JPG, PNG or WebP up to 5 MB) with alt text, start and end dates, an on/off switch, and view and click counters, with a live phone and desktop preview.
- Uploads are resized on the server to 1200×630 and 600×315, metadata stripped, and saved on the Railway volume.
- Sponsored cards keep the quiet "Sponsored" label and show the image under the text; with no image they're a clean text card with the sponsor's initial.
- A **Glydrift** sponsor is ready with a placeholder graphic. Sponsored cards are still **off** until you switch them on at the top of the Sponsors page.
- Railway: nothing to add (images use the existing `UPLOAD_DIR` volume).
- Screenshots: `screenshots/part4-{phone,desktop}-{sponsored,sponsor-editor,sponsor-list}.png` (a sponsored card with its image in the feed, the editor with live previews, the sponsor list with counters).

## Part 5: Quality pass
- Checked phone and desktop sizes, contrast and tap targets on all the main pages and the new Control Room pages: accessibility 100 and best practices 100 everywhere checked.
- Every control now has at least a 44px tap area (invisible padding where the compact look should stay), except the thin ticker (32px) and links inside dispatch text; see DECISIONS.md.
- Fixed two contrast problems (paused feeds, the active profile tab) and two heading-order problems.
- The search overlay now matches the compact feed (no big display headings, no odds-style "0/0" numbers).
- "Business" and "U.S." are labeled consistently everywhere.
- Railway: nothing to add.
- Screenshots: `screenshots/part5-{phone,desktop}-{home,search,tabs,sponsored,sponsor-editor,newsfeeds-list}.png`.

## Part 6: AI newsroom accounts
- **Ten AI analyst accounts**, one per desk: @ai_capitol (U.S. Politics and Congress), @ai_worlddesk (World Affairs), @ai_markets (Markets and Economy), @ai_techdesk (Tech and AI), @ai_sportsdesk (Sports), @ai_sciencedesk (Science and Space), @ai_energydesk (Energy and Climate), @ai_defensedesk (Defense and Security), @ai_lawdesk (Law and Courts), @ai_culturedesk (Culture and Media). Each has an invented name, an illustrated portrait, a bio that says it is an AI analyst, and its own voice.
- **Always labeled**: an **AI** badge on posts, profiles, search, lists and notifications; an "This is an AI account, not a person" box on each profile; an About page at **/about/ai** explaining how they work and what they read; and an "AI-generated from these sources" line under every AI post that expands to the list of articles.
- **Readers' controls**: one tap to **Mute all AI accounts** (on any AI profile or the About page), and a **Human only** switch at the end of the Home tab row.
- **Hourly posting**: each account reads the newest real stories in its niche from the news intake and writes 1 to 2 short dispatches (quick take, explainer, what to watch, or a question, rotating) with a link to the original reporting. No material, no post.
- **Grounding**: posts use only the ingested headlines and snippets. A second check compares every claim with the sources, and numbers and quotes must appear in them word for word; anything unsupported is blocked and logged. Breaking violence, emergencies and unconfirmed claims wait until two outlets report them. Each story is covered once, ever. Neutral tone, viewpoints attributed, no endorsements.
- **Control Room → AI newsroom**: global kill switch, auto-post or manual approval with an approval queue, per-account pause, style guide, posting hours, posts per hour and portrait upload, a log of every generated post with its sources and verification result (filter by posted, blocked, held…), Delete on published posts, spending totals against your caps, and "Run this hour now".
- **Safe by default**: the kill switch is **off**, so nothing posts or spends money until you add the variables below and switch it on. Restarts never repeat an hour or a story.
- **How to switch it on**: add `ANTHROPIC_API_KEY`, `AI_DAILY_CAP_USD` and `AI_MONTHLY_CAP_USD` in Railway, wait for the redeploy, open Control Room → AI newsroom, check the list at the top shows ✓ for the key and caps, consider "Hold every post for my approval" for the first day, turn the switch on, press "Run this hour now", and read the log.
- **Swapping in generated portraits**: Control Room → AI newsroom → an account → "Style guide, hours and portrait" → Upload (JPG, PNG or WebP up to 5 MB; cropped to 400×400, metadata stripped). Use pictures of invented people only. "Use illustration" goes back to the drawn portrait.
- Screenshots: `screenshots/part6-{phone,desktop}-{ai-profile,ai-post,ai-newsroom,home}.png` (an AI profile, an AI post with its sources open, Control Room → AI newsroom, and Home with the Human only switch).

## Railway variables (polish-v1)

Service → Variables. Never put keys in code or in chat.

| Variable | Needed? | What to put |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes, for the AI newsroom** | An API key from console.anthropic.com (API keys). Nothing AI runs without it. |
| `AI_DAILY_CAP_USD` | **Yes, for the AI newsroom** | Most it may spend per day (UTC), in dollars, e.g. `3`. Posting stops for the day when reached. Unset means $0: nothing runs. |
| `AI_MONTHLY_CAP_USD` | **Yes, for the AI newsroom** | Most it may spend per calendar month, e.g. `60`. Posting stops for the month when reached. Unset means $0. |
| `AI_MODEL` | Optional | Defaults to `claude-opus-5-5`. Only change it if you want a different Claude model. |
| `AI_TIMEZONE` | Optional | Time zone for the posting hours you set per account, e.g. `America/New_York`. Defaults to `UTC`. |
| `AI_NEWSROOM` | Optional | Set to `off` to stop the AI scheduler entirely (the kill switch in the Control Room is the normal way). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Yes, for push alerts (from news-v1) | See the news-v1 table below. |
| `APP_URL` | Recommended (from news-v1) | Your public address, e.g. `https://worldnet.up.railway.app`. |
| `NEWS_API_KEY` | Optional (from news-v1) | A licensed news API key for AP and Reuters. |
| `NEWS_DEMO` | **Do not set** | Keeps the fictional demo stories off. |

Parts 1 to 5 need no new variables. Keep one replica and the existing volume.

---

# What changed (news-v1)

Branch `news-v1`, built on `design-v2`. Every earlier feature still works. Details and reasons: `DECISIONS.md`, Parts H–K.

## What you need to add in Railway

Service → Variables. Never put these in code.

| Variable | Needed? | What to put |
|---|---|---|
| `VAPID_PUBLIC_KEY` | **Yes, for push alerts** | Run `npm run push:keys` on your computer (in the `townsquare` folder) and copy the first line. |
| `VAPID_PRIVATE_KEY` | **Yes, for push alerts** | The second line from the same command. Keep it secret. |
| `VAPID_SUBJECT` | **Yes, for push alerts** | `mailto:` plus an email you read (e.g. `mailto:alerts@yourdomain.com`), or your site's `https://` address. |
| `APP_URL` | Recommended (you may already have it) | Your public address, e.g. `https://worldnet.up.railway.app`. Used in the feed reader's contact line and as the push contact fallback. |
| `NEWS_API_KEY` | Optional | A licensed news API key (NewsAPI.org format) to add AP and Reuters. NewsAPI's free plan is for development only; production needs a paid plan. Without it, the other 51 outlets still work. |
| `NEWS_DEMO` | **Do not set** | Leave it unset on Railway so the fictional demo stories stay off. |

Optional tuning (defaults are fine): `NEWS_INGEST_INTERVAL_MIN` (10), `NEWS_API_INTERVAL_MIN` (20), `BREAKING_AUTO_SCORE` (85), `FOLLOW_ALERT_SCORE` (55), and `NEWS_INGEST=off` (only if you run `npm run news:ingest` as a separate cron service).

Also:
- Keep **one replica** and the existing volume for the database (the news scheduler runs inside the app).
- To try this version, point the Railway service's branch at `news-v1`.
- After the first deploy, open **Control Room → News feeds**. The first sync runs about 15 seconds after start. Feeds that fail show their error there; pause, fix or remove them. Feed fetching could not be tested from my workspace (the network blocks those sites), so check this page first.

## 1. Real news
- Every 10 minutes the app reads the official RSS feeds of 51 outlets across the spectrum (wire, national papers, TV, public media, left, center and right sites, international, sports, tech), plus AP and Reuters through a licensed API when `NEWS_API_KEY` is set.
- Only the headline, a snippet under 280 characters, the outlet, the time, a link out, and a feed-supplied image (credited) are stored. robots.txt is checked, feeds are cached with conditional requests, and failing feeds back off.
- Articles about the same event are grouped into one Story with a neutral headline built from what the outlets agree on, a category (US, World, Politics, Markets, Sports, Tech), and importance and freshness scores. Real stories now fill For You, the topic tabs, story pages and the ticker.
- The fictional sample stories are now demo data: off in production, with a switch in the Control Room for local testing.
- **Control Room → News feeds**: add a feed (with a Test button that shows the first headlines), test, sync, pause or remove any feed, edit lean ratings and their sources, see the last sync time, per-feed errors and recent runs.

## 2. Coverage spread
- Each story shows a slim bar: the share of left, center and right outlets covering it, plus the outlet count ("L 40 · C 30 · R 30 · 10 outlets").
- Tap it to see every outlet grouped by lean, each linking to its own article. The story page shows the same list under "Who's covering this".
- Neutral flags such as "Mostly covered by Right-leaning outlets" or "Few Left-leaning outlets covering this". Lean labels are approximate, from public third-party ratings, and editable.

## 3. Context notes
- Signed-in people (accounts 3+ days old) can add a short note with a required source link to any dispatch or story. Others rate it Helpful, Somewhat helpful or Not helpful, with a reason.
- A note goes public only when raters who usually disagree both find it helpful (a bridging score from past rating patterns). It shows under the dispatch with its source and a "Why am I seeing this?" page, and can lose public status if ratings change.
- Rate limits, new-account limits, reporting, and **Control Room → Context notes** to review reports and suspicious activity.

## 4. Push alerts
- **Settings → Alerts**: turn alerts on per device (the browser only asks for permission then), choose breaking news, responses, mentions, new followers, and big stories on your pinned topics and teams; set quiet hours and a daily breaking limit; send yourself a test alert.
- **Control Room → Breaking alerts**: pick a story or write custom text, preview it as it will look on a phone, and send. A story can never be sent twice. Very big stories are sent automatically (at most one per sync, six a day).
- Expired subscriptions are removed automatically. On iPhone, people add the site to the Home Screen first.

## Quality
- 152 unit tests (new: feed parsing, clustering and headlines, ingest with a fake network, coverage and flags, the bridging score, notes rules, the push sender), 28/28 end-to-end steps, 44/44 visual snapshots (updated for the coverage bar and notes), accessibility 100 on the home, story, help, alerts and new Control Room pages.
- Database: migration 8, mirrored in `supabase/schema.sql`.

---

# What changed (design-v2)

All of this is on the `design-v2` branch. Every earlier feature still works.

## 1. For You feed
- Home has **For You** (default) and **Following** tabs above an infinite, paginated feed with skeleton loading and pull-to-refresh on phones.
- For You mixes stories and dispatches with a transparent scoring system: recency-weighted engagement, freshness decay, your interests (topics, accounts, tags), social proof from people you follow, and a breaking-news boost. Outrage is damped, no item can be boosted more than 8×, and promoted items (none yet) are always labeled and never boosted. No more than two in a row from the same account or topic, plus a "something new" slot every six items.
- Every item has **Show more like this**, **Not interested** and **Mute topic**; topics can also be muted in Settings → Your feed. Sign-up beats seed your interests; logged-out visitors get trending + breaking.

## 2. Sports teams and logos
- 220 teams: NFL, NBA, MLB, NHL, MLS, Premier League and 46 major college football programs, with names, abbreviations and team colors.
- A logo-provider adapter (`SPORTS_LOGO_PROVIDER` + `SPORTS_API_KEY`, from environment variables only), local caching, a `npm run teams:refresh` script, and a Control Room screen to upload a logo by hand.
- Until a licensed logo exists, every team shows a generated shield badge in its colors (contrast-checked). Stories that mention a team are tagged and show its badge on cards, the hero, story pages, the ticker and search. New **/sports** directory and team pages.

## 3. WorldNet profiles
- New vocabulary: **Dispatches**, **Responses**, **Relays**, **Boosts**, **Vault**.
- Card layout: full-width banner, a left identity panel (avatar, name, handle, verified seal, bio, location, link, join date, Beat chips, Credibility Meter, Followers/Following/Friends), and tabs on the right (Dispatches, Responses, Media, Boosted, Debates) with up to 3 pinned dispatches.
- Credibility Meter (rises with sourced dispatches; transparent breakdown), source links on any dispatch, profile accent themes, private accounts with follow requests, change email, notification settings.

## 4. Fun posting and friends
- Five reactions (Fire, Mind Blown, Respect, Facepalm, Facts) with animation; Friends badge and friend suggestions; Flash dispatches that disappear after 24 hours; emoji picker, @mentions, #tags and image crop in the composer; streaks and achievements with confetti and glow; a fuller Newsdesk.
- Safety: block, mute and report (existing) plus tighter rate limits on follows and reactions.
- A polish pass across phone and desktop, dark and light.

## 5. For You feed and side menu upgrade
- **Top bar (phones):** your avatar on the left opens the side menu, the WorldNet logo sits in the center, and a small live market ticker on the right opens the Market Board.
- **Tab strip:** For You, Friends, then your own topics and teams, each with a small badge. Swipe the feed to change tabs; "+" pins topics and teams (up to 12).
- **Cards:** dispatches and stories are soft glass panels. The action row is Respond, Relay, Boost (hold for five reactions), Vault and Share, with counts that pop when they change. Story cards have a large image, category tag, headline, source and a "Rising" flame when a story is gaining fast.
- **Sponsored cards:** clearly labeled, amber-bordered, and **off unless switched on in the Control Room**.
- **Feel:** floating glowing compose button with a bottom-sheet composer, skeleton loaders, branded pull-to-refresh, infinite scroll, fade-in, and a "new dispatches" pill.
- **Bottom tab bar:** Home, Discover, Markets, Alerts, Messages, with a sliding indicator and unread badges.
- **Side menu:** profile card (avatar, name, handle, Followers / Following / Friends, theme button), then Profile, Vault, History, Lists, Rooms, Groups, Markets, Creator Hub, Settings, Help, plus Switch account and a Dark / Light / Auto toggle. It slides in with blur and dim, and closes on swipe, outside tap or Escape. On desktop it is a persistent left rail that collapses to icons.
- **New pages:** Messages (private, followers-only), History, Lists, Creator Hub, Help, and a Wallet placeholder that stays hidden unless `NEXT_PUBLIC_FEATURE_WALLET=1`.

## 6. One palette
- Removed the multi-colored decoration: avatars, topic badges, Beat chips, story art, reply-depth lines, confetti and amber accents are now all blue/cyan. Red stays for LIVE/BREAKING, and green/red stay where they mean up/down or agree/disagree.

## 7. Dense timeline
- **Flat rows instead of cards.** Dispatches sit directly on the dark background, separated by one faint hairline. No glass, glow, gradients, shadows or gaps.
- **Compact dispatches:** 40px avatar, name/handle/time on one line, 15px text, small gray action icons with tiny counts, "Show more" after six lines, small images and link previews with 12px corners.
- **Actions:** Respond, Relay, Boost, Agree, Disagree, Vault, Share. Gray until pressed; only Boost and Relay turn blue. Reactions appear on press-and-hold only.
- **Stories** are rows with a small side thumbnail; the giant hero is now a "Top story" row.
- **Calmer look:** no pulsing, neon or odds-style numbers on the home page; blue is the one accent; red is only the small BREAKING tag. Sponsored rows and polls are labeled and quieter than dispatches.
- **Slim chrome:** thin dark top bar, text tab strip with a small underline, thin gray ticker, thin icon-only bottom bar, smaller compose button without the glow.
- **Fast long feeds:** the list is virtualized past 30 rows, and rows keep their state when they scroll away and back.

## Quality
- 107 unit tests (feed tabs, sponsored slots, messages, lists, history, the side-menu drawer, ranking, For You, teams and badges, the logo fallback component, profiles and privacy, follows, reactions, Flash, streaks, achievements, suggestions), 25/25 end-to-end steps, 44/44 visual regression screenshots, accessibility 100 on audited pages.
- Database changes are numbered migrations (`src/lib/db/migrations.ts`, 1–7), mirrored in `supabase/schema.sql`.
- Decisions made along the way: see `DECISIONS.md`.
