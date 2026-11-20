# World Net News

A national social + news platform by **Gleyde Technologies, LLC**, organized around **Stories**,
not a stream of posts. Every national event is a Story; people add **Takes** with a stance
(Agree, Disagree, Context, Question); readers cast their own stance on a live **stance meter**.
*World Net News* is a working name — change `APP_NAME` in `src/config.ts`.

See [DESIGN.md](DESIGN.md) for the design system ("The Front Page": navy, gold, white), the
originality check, and what's next; [PLAN.md](PLAN.md) for the architecture. Every component and
state is on the live **`/design`** page in light and dark.

## What's in it

| Area | Included |
|---|---|
| Front Page | Masthead + channel dial (Front Page, Politics, World, Business, Tech, Sports, Culture, Markets, Live, Desks) + Live Wire. Desktop: bento tiles sized by importance (Lead Story, stories, Live Studio, Hot Stories, Hot Debate, Poll of the Day, Morning Edition, Quick Takes, Voices, outlets). Phone: a full-height story deck — swipe up through Stories, sideways between channels |
| Stories | Giant headline, timeline rail, "How it is covered" outlet strip, large stance meter, Takes split Agree \| Disagree (toggle on phones), Context notes as inline cards, head-to-head debates |
| Takes | 500 characters, stance chip, Story picker, images (alt text, EXIF stripped), polls, link cards, quote; Answer (reply), Amplify (to your Rundown), Save to Rundown, share, edit within 15 min, delete |
| Markets | `/markets`: an always-dark trading board with a scrolling ticker tape (S&P 500, Nasdaq-100, Dow, Russell 2000 via SPY/QQQ/DIA/IWM, your watchlist, top movers), market clock and countdown, index cards with intraday charts, a big interactive chart (1D / 5D / 1M / 1Y, line or candles, volume, OHLC crosshair), your saved watchlist (add/remove), a sector heatmap, a markets strip on the Front Page, "Market reaction" tickers on related Stories, top gainers/losers, and Business stories. Real quotes with `FINNHUB_API_KEY`; otherwise **DEMO** mode with clearly labeled simulated prices. Not investment advice |
| Real-time | Stance meters, new Story takes ("3 new takes · Show") and Live Wire breaking items update instantly over Server-Sent Events (`/api/stream`). One server process = one event bus; swap `src/lib/realtime.ts` for Supabase Realtime or Redis when running several instances |
| Story photos | Control Room → Story photos: upload a photo with required alt text and credit (EXIF stripped, re-encoded); shown with its credit on every view of the story. Stories without one keep the generated cover art |
| Phone app | Installable (manifest + offline page), "Get the app" card on a return visit, and in the installed app: pull-to-refresh, edge swipe-back, haptic ticks. Gold progress bar on every page change and page-shaped loading placeholders |
| Stance meter | On every Story and Take: agree / unsure / disagree split, tap to cast or change, optimistic and animated |
| Rundown | Your lineup as a TV rundown — Now, Next, Later today, Earlier — as a page and a drawer |
| Byline | Editorial name, credibility record (verified, tenure, context notes, takes, followers), pinned take as a pull-quote, tabs Takes / Debates / Rundown |
| Morning Edition | 10 stories, 3 debates, reading time, download for offline |
| Live Studio | ON AIR monitors, schedule grid with countdowns, Remind me (per device), player page with live chat |
| Desks | Communities with nameplate banner, pinned Story, members, Takes vs Stories tabs, Hot/New/Top, votes, threaded comments; **Editors** get a toolbar (pin a story, remove posts) |
| Newsdesk | Notifications grouped by Story, with filter chips |
| Search | Full-screen overlay (⌘K / Ctrl K) with Stories, Voices, Desks, Takes and filters; `/search` page |
| Control Room | KPI tiles with sparklines, severity-sorted report queue with confirmed one-click actions, Live Wire composer with live preview, moderation log, "same rules apply to every account" |
| Accounts | Email/password and Google (needs keys), sign-up beside a sample Front Page, onboarding (beats + 3 Voices), settings, data export, delete account |
| Safety | Report / block / mute, rate limits, spam checks, admin actions, legal drafts flagged for lawyer review |
| Keyboard | j/k move, a agree, d disagree, r answer, n new take, ? help, ⌘K search |

## Run it

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`).

```bash
cd townsquare
npm install
cp .env.example .env.local      # optional; defaults work for local use
npm run seed                    # national edition: 12 stories, 30 people, takes, stances, 10 Desks, Live shows
npm run dev                     # http://localhost:3000
```

Seeded logins:

| Account | Email | Password |
|---|---|---|
| Admin (Control Room) | `admin@worldnet.test` | `worldnet-admin` |
| Demo reader | `demo@worldnet.test` | `worldnet-demo` |
| Any other seeded user | `<handle>@worldnet.test` (e.g. `maria_lopez@worldnet.test`) | `worldnet-user` |

`npm run reset` wipes `./data` and seeds again. To make your own account an admin, put your email in
`ADMIN_EMAILS` in `.env.local` before signing up.

### Open it on your phone

1. Run the app on your computer (`npm run dev` already listens on your local network).
2. Find your computer's local IP address:
   - Mac: System Settings → Wi-Fi → Details → IP address (or run `ipconfig getifaddr en0`)
   - Windows: run `ipconfig` and look for "IPv4 Address"
3. With your phone on the **same Wi-Fi**, open `http://<that-ip>:3000` (for example `http://192.168.1.23:3000`).
4. Add it to your home screen: Safari → Share → **Add to Home Screen**; Chrome → ⋮ → **Add to Home screen**.
   It opens full-screen with the World Net News icon and a dark splash screen, and respects the notch and home indicator.

If the page doesn't load, allow Node through your computer's firewall. For the full installable
app experience (service worker) and to test away from home Wi-Fi, the site needs HTTPS: deploy it
(see below) or run a quick tunnel such as `npx cloudflared tunnel --url http://localhost:3000` and
open the `https://…trycloudflare.com` address it prints.

### Production build

```bash
npm run build && npm start
```

Set `APP_URL` to the public `https://` address so cookies are marked secure and Google sign-in
redirects correctly. The SQLite file and uploads live in `./data` (`DATABASE_PATH`, `UPLOAD_DIR`),
so the host needs a persistent disk until the Supabase swap — a VPS, Fly.io, or Railway volume
works; serverless hosts (Vercel) need the Supabase version.

### Google sign-in

Create an OAuth client at console.cloud.google.com → APIs & Services → Credentials (type: Web).
Authorized redirect URI: `<APP_URL>/auth/google/callback`. Put `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `.env.local`. Until then the button explains it isn't configured.

## Design and quality

- Tokens: `src/styles/tokens.css` (CSS variables, light + dark), mirrored in `src/design/tokens.ts`; Tailwind reads them via `@theme`.
- Components: `src/components/ui` (primitives) plus feature folders (`post/`, `news/`, `community/`, `live/`, `shell/`).
- Fonts are self-hosted (Inter + Newsreader variable), so no third-party font requests.
- Lighthouse (production build, home page): **mobile 96–98 performance / 100 accessibility / 100 best practices / 100 SEO**, desktop 100 / 100 / 100 / 100, layout shift ≈ 0.

## Tests

```bash
npm test          # vitest (31): stance voting, Rundown, debates, Voices, desk editors, sign up, sessions, posting,
                  # polls, follow + Following/For You feeds, block/mute, search/trending,
                  # report → admin queue → remove/suspend, rate limits, spam, XSS-safe links
npm run typecheck
npm run test:visual          # Playwright: Front Page, Story, Rundown, Byline, Control Room (+5 more) × phone/desktop × light/dark
npm run test:visual:update   # accept intentional visual changes
```

The visual suite seeds its own database (`data/visual`) and masks times and counts, so it is
repeatable. Baselines live in `tests/visual/__screenshots__` (rendered with Linux Chromium; a
different OS can differ by a few pixels).

## Security notes

- Passwords: scrypt with per-user salt. Sessions: random 256-bit tokens, stored only as SHA-256 hashes.
- CSRF: every write is a Next.js Server Action (Origin-checked by Next); route handlers are GET-only
  (except the OAuth callback, protected by a `state` cookie).
- XSS: post text is stored as plain text and rendered as React elements; only `http(s)` URLs become links;
  control and bidi-override characters are stripped. No `dangerouslySetInnerHTML` with user data.
- Injection: every SQL statement uses bound parameters.
- Uploads: type checked by file signature (not name), 8 MB cap, re-encoded to WebP (strips EXIF/GPS),
  served through `/api/media/:id` with an access check (post visibility, blocks); unattached uploads are owner-only.
- Privacy: bookmarks, blocks, mutes, notifications, and votes are visible only to their owner.
- Secrets live in environment variables only; `.env*` files are git-ignored. See `.env.example`.
- `supabase/schema.sql` is the Postgres version with **row-level security on all 24 tables**
  (verified to apply cleanly). It is not connected yet.

## Project layout

```
src/config.ts        name, limits, rate limits (accent color: --accent in src/app/globals.css)
src/lib/             all data access + domain rules (the only code that touches the DB)
src/actions/         server actions (writes)
src/app/             pages and GET route handlers
src/components/      UI (PostCard, Composer, Feed, Nav, modals, menus)
scripts/seed.ts      sample data
supabase/schema.sql  Postgres + RLS swap-in target
tests/               vitest suites
```

## Known limits (by design for Stage 1)

- Link cards show the domain and path with generated cover art; they don't fetch real page titles or images yet (a sandboxed fetcher comes in Stage 2 to avoid SSRF).
- Feed "virtualization" uses `content-visibility: auto` (offscreen posts skip layout and paint) rather than removing DOM nodes.
- Images use the app's own resizing route (`/api/media/:id?w=`) with blur placeholders instead of `next/image`, because the Next optimizer can't pass the viewer's cookie for private images.
- Two-factor auth and email verification arrive with Supabase Auth.
- News, Communities, and Live tabs are read-only previews of Stage 2–4.
- Search is substring + hashtag; Postgres full-text (already in the schema) replaces it on the swap.
