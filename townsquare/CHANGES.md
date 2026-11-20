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

## Quality
- 107 unit tests (feed tabs, sponsored slots, messages, lists, history, the side-menu drawer, ranking, For You, teams and badges, the logo fallback component, profiles and privacy, follows, reactions, Flash, streaks, achievements, suggestions), 25/25 end-to-end steps, 44/44 visual regression screenshots, accessibility 100 on audited pages.
- Database changes are numbered migrations (`src/lib/db/migrations.ts`, 1–7), mirrored in `supabase/schema.sql`.
- Decisions made along the way: see `DECISIONS.md`.
