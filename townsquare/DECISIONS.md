# Decisions log

Choices made while building unattended on `design-v2`, with the reason for each.

## Part A — For You feed

- **Where the tabs live:** the home page keeps the hero lead story, then a sticky **For You | Following** switch, then an infinite feed. The previous "Top stories" grid became part of For You (stories appear as large image cards inside the feed). Channel pages (`/?c=Politics` …) keep the grid layout.
- **What For You ranks:** recent top-level dispatches (7 days, newest 400) **and** stories (top 40). Logged-out and brand-new users have an empty interest profile, so the same ranker produces a trending + breaking mix.
- **Scoring** (`src/lib/ranking.ts`, pure and unit-tested): `freshness × engagement × personal`, with
  - engagement = log of recency-weighted activity: reactions/agree stances ×1, responses ×1.5, relays/quotes/shares ×2.5, views ×0.04; activity in the last 6h counts 3×, last 24h 1.5×;
  - freshness = 1/(ageHours+2)^1.25;
  - personal = interests (topic ×0.25, account ×0.35, tag ×0.15, clamped −0.85…+1.5) × social proof (+0.25 per followed account that engaged, max +1.0) × breaking (×1.6 for live stories or the story linked from the Breaking banner).
  - **Outrage guard:** when responses + disagreement exceed 2× positive engagement, the engagement is damped (down to ×0.35). Disagreement never adds score.
  - **Boost cap:** no item can score more than 8× its freshness baseline.
  - **Promoted items** never receive ranking help and always show a "Promoted" label. None exist yet; `posts.promoted` is the switch.
- **Variety:** at most 2 in a row from the same account or topic; every 6th slot pulls in the best item from a topic the viewer hasn't shown interest in ("Something new").
- **Interests** are stored per user as weights for topics, accounts and tags (clamped −4…+6). Signals: view +0.05, click +0.3, dwell ≥8s +0.4, react/agree +0.5, response +0.6, relay/share +0.7, vault +0.6, follow +2 (account), Show more +1.5, Not interested −1.5, onboarding beat +2.
- **Topics** are Politics, Markets, Sports, Tech, World, Culture, National (mapped from story sections; Business → Markets). Onboarding lists Politics, Markets, Sports, Tech, World first.
- **Tracking:** the feed records a view after 1s at ≥60% visible, dwell time when a card leaves, and clicks; batches go to a rate-limited server action every 10s and on page hide. Logged-out events are stored without a user id.
- **Migrations:** added a numbered, append-only migration runner (`src/lib/db/migrations.ts`, table `schema_migrations`). Migration 1 = interests, engagement_events, feed_dismissals, muted_topics, posts.promoted. Migration 2 = reactions table and users.is_private (needed by the ranker for later parts). Postgres versions appended to `supabase/schema.sql`.
- **Pagination:** offset cursor over the ranked list; the client de-duplicates, so a re-rank between pages can't show an item twice.
- **Muting:** topics are muted from any item's menu or in Settings → Your feed; account mutes reuse the existing mute.

## Part B — Sports teams and logos

- **No logo files are committed and nothing is scraped.** Logos come only from (1) a Control Room upload, where the admin must tick "we have a license or written permission", or (2) a licensed provider configured by environment variables. Otherwise every team shows a generated badge.
- **Provider adapter** (`src/lib/sports/logo-provider.ts`): `SPORTS_LOGO_PROVIDER` picks the adapter, `SPORTS_API_KEY` is the key (env only). Shipped adapters: `none` (default) and `manifest`, a generic "licensed JSON feed" adapter (`SPORTS_LOGO_MANIFEST_URL` returns `{ "nfl-kc": "https://…png" }`, called with the key as `Authorization: Bearer` and `X-API-Key`). I did **not** ship vendor-specific adapters I couldn't verify against a live contract; adding one is one class plus one line in `PROVIDERS`.
- **Caching:** each logo is fetched once, validated (PNG/WebP/JPEG/GIF only; **SVG refused** because it can carry script), re-encoded to PNG (≤512px, transparency kept), and stored under `UPLOAD_DIR/team-logos`. Status lives in the `teams` table. If the provider is down, the cached file keeps serving. Manual uploads always win and are never overwritten by a refresh. `npm run teams:refresh [-- --force]` re-fetches by hand; pages also warm missing logos in the background when a provider is configured.
- **Fallback badge:** a shield (US leagues) or crest (MLS/EPL) in the team's primary color, a secondary-color chevron at the base, and the abbreviation in the secondary color if it reaches 4.5:1 on the fill, else black or white (whichever is higher; one of them always clears 4.5:1). Tested for every seeded team. An outline appears automatically when the fill is close to the dark or light page background.
- **Teams seeded:** NFL 32, NBA 30, MLB 30 (Athletics listed as Sacramento), NHL 32 (incl. Utah Mammoth), MLS 30 (incl. San Diego FC), Premier League 2025–26 (20), and 46 major college football programs (SEC, Big Ten, Big 12, ACC power programs, Notre Dame, Boise State). Colors are the clubs' published primary/secondary values to the best of my knowledge; spot-check a few against brand guides before print use (noted in the data file).
- **Story tagging:** full team names match anywhere; bare nicknames ("Chiefs", "Huskies") match only in Sports stories, only when unique across all leagues, and case-sensitively (so "senators" in a politics story doesn't tag the Ottawa Senators: a test caught this). Shared nicknames like "Tigers" never tag on their own.
- **Where teams appear:** story cards and the hero (badges on the image), the story page header, the ticker (badges next to sports items), the ⌘K search overlay and /search (a Teams group), a new **/sports** directory (filter by league) and **/sports/[team]** pages listing tagged stories, and the Sports channel ("All teams").
- **Not built:** scoreboards, game pages and betting/picks pages, because the app has no scores or odds data source yet. `TeamLogo` (sizes sm/md/lg, lazy, auto-fallback) is ready for them. I did not add new sample stories about real teams, to avoid inventing news about real clubs; the existing fictional "Huskies win the national title" sample story gets tagged and shows how it works.

## Part C — WorldNet profiles

- **Vocabulary:** posts are **Dispatches**, replies **Responses** (button: "Respond"), reposts **Relays**, likes **Boosts** (the profile tab "Boosted" lists dispatches you reacted to; Part D's reactions are the Boost), bookmarks the **Vault**. Renamed across the interface, notifications and error messages. Code identifiers, URLs (`/bookmarks`, `/p/…`) and database names are unchanged, so links and data keep working. "Story", "Stance" and "Rundown" keep their names; they're WorldNet concepts, not Twitter ones.
- **Layout:** full-width banner (accent-colored gradient when there's no photo), a **left identity panel** (avatar, name, verified seal, @handle, Friends / Follows you / Private badges, bio, location, link, join date, Follow or Edit, Beat chips, Credibility Meter, Followers / Following / Friends tiles), and the content column on the right with pinned dispatches and tabs **Dispatches · Responses · Media · Boosted**, plus **Debates** (kept from the old byline page so no feature is lost). On phones the panel stacks above the tabs.
- **Beat:** up to 6 topics from a fixed list of 12, shown as colored chips (deeper colors in light mode for contrast).
- **Credibility Meter (0–100):** baseline 20; up to +40 for the share of dispatches with a source link (counts fully after ~10 dispatches, so one sourced post can't max it); +2 per sourced context note (max 10); +15 verified; +1 per ~5 weeks on WorldNet (max 10); −15 per dispatch removed by moderators (max −45). Levels: Building <40, Solid 40–69, Trusted 70–89, Exemplary 90+. The breakdown is shown on the profile ("How this is scored"). We don't fact-check sources automatically; "accurate" means sourced and not removed.
- **Source links:** any dispatch can carry one https link (composer link button). Shown as a "Source: domain" chip.
- **Pins:** up to 3 dispatches (was 1). Existing single pins migrate automatically.
- **Profile themes:** six accents from the app palette (electric blue, cyan, violet, emerald, amber, rose) color the banner glow, panel glow, active tab, Credibility gauge and badges on that profile only.
- **Private accounts:** follow becomes a request (notification with Approve/Decline, also listed in Settings → Privacy). Non-followers and logged-out visitors can't see private dispatches anywhere (profile, feeds, search, For You, direct links show "unavailable"), nor follower/following/friend lists. Turning private off approves everyone waiting.
- **Account:** change email (password accounts confirm with their password), notification settings per type (safety notices always arrive), plus the existing sign up/in, edit profile, password, block, mute, report and delete account.
- **Notifications table** was rebuilt (migration 5) to allow the new types: reactions, follow requests and acceptances, achievements.
