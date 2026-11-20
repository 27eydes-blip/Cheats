# Townsquare

A social + news platform by **Gleyde Technologies, LLC**: follow people, join communities, and get live
news in one feed you control. *Townsquare* is a working name — change `APP_NAME` in `src/config.ts`.

This folder holds **Stage 1 (MVP)** plus the **"modern newsroom meets social" design remodel**.
See [PLAN.md](PLAN.md) for architecture and roadmap, and [DESIGN.md](DESIGN.md) for the design
system (audit, tokens, type, components, motion). Every component and state is on the live
**`/design`** page, in light and dark.

## What works today (Stage 1)

| Area | Included |
|---|---|
| Accounts | Email + password sign-up/login (13+ age gate, terms checkbox, bot honeypot), Google sign-in (needs keys), sessions in httpOnly cookies |
| Profiles | Avatar, banner, bio, up to 4 links, joined date, pinned post, follower/following lists (can be hidden), Posts / Replies / Media / Likes tabs |
| Posts | 500 characters, up to 4 images with alt text, polls (2–4 choices, 1h–7d), link cards, reply, repost, quote, like, bookmark, share, edit within 15 min (shows "edited", old version kept), delete |
| Feeds | Home → **Following** (newest first, no algorithm) and **For You** (engagement × recency × who you follow), infinite scroll, "new posts" pill, pull-to-refresh, optimistic likes/reposts |
| Notifications | Mentions, replies, quotes, likes, reposts, follows, moderation notices; filters; unread badge |
| Discovery | Search posts and people, `#hashtag` pages, trending topics, who to follow |
| Safety | Report any post or profile, block, mute, rate limits (posting, sign-ups, logins, likes, follows, reports), spam checks (scam phrases, link floods, repeats), admin page with a prioritized report queue (remove / warn / suspend / dismiss), action log, breaking-news banner control |
| Settings | Dark/light/auto theme, larger text, handle, password, hide follower lists, blocked/muted lists, **download my data** (JSON), **delete account** |
| Legal | Terms, Privacy, Community Guidelines placeholders — **clearly marked as drafts a lawyer must review before launch** |
| PWA | Installable (manifest, icons, offline page, service worker in production) |
| News hub | Magazine layout (lead story, 2-column grid, ranked headlines), section chips, outlet labels on every item, live story pages with timeline, key moments, "How it is covered" outlet strip, and the community thread |
| Communities | Community pages with banner, join, Hot / New / Top, up/down votes, threaded comments with colored depth lines and collapse |
| Live | Live-now cards, scheduled shows with countdown and Remind me (per device), player page with live chat (posts tagged with the show's hashtag); video/audio streaming itself is Stage 4 |
| Onboarding | Sign-up → pick interests → follow suggestions → home town for Local |
| Desktop extras | Command palette (⌘K / Ctrl K), keyboard shortcuts (j/k move, l like, r reply, n new post, ? help) |

## Run it

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`).

```bash
cd townsquare
npm install
cp .env.example .env.local      # optional; defaults work for local use
npm run seed                    # 30 users, 10 communities, 200 posts, 50 news items
npm run dev                     # http://localhost:3000
```

Seeded logins:

| Account | Email | Password |
|---|---|---|
| Admin | `admin@townsquare.test` | `townsquare-admin` |
| Demo user | `demo@townsquare.test` | `townsquare-demo` |
| Any other seeded user | `<handle>@townsquare.test` (e.g. `maria_lopez@townsquare.test`) | `townsquare-user` |

`npm run reset` wipes `./data` and seeds again. To make your own account an admin, put your email in
`ADMIN_EMAILS` in `.env.local` before signing up.

### Open it on your phone

1. Run the app on your computer (`npm run dev` already listens on your local network).
2. Find your computer's local IP address:
   - Mac: System Settings → Wi-Fi → Details → IP address (or run `ipconfig getifaddr en0`)
   - Windows: run `ipconfig` and look for "IPv4 Address"
3. With your phone on the **same Wi-Fi**, open `http://<that-ip>:3000` (for example `http://192.168.1.23:3000`).
4. Add it to your home screen: Safari → Share → **Add to Home Screen**; Chrome → ⋮ → **Add to Home screen**.
   It opens full-screen with the Townsquare icon and a dark splash screen, and respects the notch and home indicator.

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
- Lighthouse (production build, home page): **mobile 98 performance / 100 accessibility / 100 best practices**, desktop 100 / 100 / 100, layout shift 0.

## Tests

```bash
npm test          # vitest: sign up, log in, sessions, post, edit window, replies/quotes/likes/reposts,
                  # polls, follow + Following/For You feeds, block/mute, search/trending,
                  # report → admin queue → remove/suspend, rate limits, spam, XSS-safe links
npm run typecheck
npm run test:visual          # Playwright screenshots of 10 pages × phone/desktop × light/dark vs. baselines
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
