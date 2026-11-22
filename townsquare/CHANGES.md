# What changed (polish-v1)

Built on `news-v1`, in six parts. Each part is one commit on `news-v1` (the live branch), so you can roll back a part in Railway on its own. Screenshots are in `screenshots/` on the `polish-v1` branch only.

| Part | What | Commit on news-v1 |
|---|---|---|
| 1 | Feed fixes, outlet changes, Control Room feed status | `7572c29` |
| 2 | Search crash fix, error boundary, client error logging | `f64b71f` |
| 3 | One feed tab row, topics in the top nav, Your Topics | `14d8e8f` |

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
