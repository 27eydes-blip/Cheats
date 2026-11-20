# Townsquare design system: "Modern newsroom meets social"

## 1. Audit of the Stage 1 UI (before the remodel)

Screenshots were taken of 18 routes at 390, 768, and 1440 px, in light and dark (114 images).
The 15 biggest problems:

1. **No identity.** Default system font, flat white, one stock blue, and an "T in a square" logo. It reads as a Twitter clone, not a news brand.
2. **No news voice.** Headlines use the same sans as UI chrome, and nothing feels editorial. The News tab is a plain list with "DEMO HERALD" pills.
3. **The floating + button covers content** on every phone screen: post actions, the admin "Suspend" button, and article text.
4. **The tablet (768 px) shell is broken.** The wordmark is clipped ("Towr") and collides with the page title, and the icon rail has no labels or active state.
5. **Initials-in-a-circle avatars** with random flat colors look unfinished, and on the profile the avatar is cut off by the banner edge.
6. **The breaking bar is a static red strip** that truncates mid-word ("bi…") on phones. It can't be opened and has no motion or "live" signal.
7. **Polls are lifeless:** gray boxes, "0%", no fill animation, no winner, no countdown.
8. **The action bar is flat.** Tiny 13 px counts, no feedback on press, and a muddy liked color in dark mode.
9. **The hierarchy is weak.** Page titles, tab bars, and section headers all have similar weight, and the sticky headers are opaque slabs.
10. **The right rail is a list of gray boxes.** Trending has no ranking visuals or momentum, and "Who to follow" is clipped at the bottom.
11. **The admin page is a form,** not a dashboard. Stats are bare numbers, the queue has no severity color, destructive actions have no confirmation, and the banner editor has no preview.
12. **Communities and Live are placeholder lists.** There are no community pages, no voting, no threads, and no live cards or schedule.
13. **Empty and loading states are plain text** ("Nothing here yet."), and skeletons don't match the real layouts.
14. **Dark mode is an inverted afterthought:** pure-black slabs, washed-out red banner, and low-contrast muted text on surfaces.
15. **Motion and keyboard support are missing:** no page transitions, no sliding tab indicator, no command palette, and no j/k navigation.

## 2. Tokens

All tokens live in `src/styles/tokens.css` (CSS variables), with a typed mirror in `src/design/tokens.ts`.
Tailwind 4 reads them through `@theme inline` in `globals.css`, so utilities like `bg-surface`
and `text-ink-2` always follow the active theme.

| Group | Tokens |
|---|---|
| Ink scale (text) | `--ink-1` (primary) · `--ink-2` (secondary) · `--ink-3` (tertiary/meta, AA ≥ 4.5:1 on both canvases) |
| Surfaces | `--canvas` (page) · `--surface` (cards) · `--surface-2` (wells, inputs) · `--surface-3` (pressed) · `--line` (hairline, low-opacity) · `--line-strong` |
| Accent | `--accent` (indigo-blue, AA on canvas) · `--accent-2` · `--accent-grad` (electric blue → indigo, used sparingly: primary button, active glow, logo) · `--accent-soft` · `--on-accent` |
| Signals | `--breaking` · `--live` (pulse) · `--success` · `--warning` · `--danger` |
| Radius | `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · pill 999` |
| Space | 4-pt scale through Tailwind (`1` = 4 px). Page gutter: 16 px on phones, 24 px on tablets and up |
| Shadow | `--shadow-1` (hairline lift) · `--shadow-2` (cards, popovers) · `--shadow-3` (sheets, dialogs) · `--glow` (active accent) |
| Glass | `--glass` background with `backdrop-filter: blur(18px) saturate(1.6)` on sticky bars and the tab bar |
| Motion | `--dur-micro 120ms` · `--dur-std 220ms` · `--dur-emph 380ms` · `--ease-spring cubic-bezier(.2,.9,.25,1.15)` · `--ease-out cubic-bezier(.16,1,.3,1)`. Everything is disabled under `prefers-reduced-motion` |

Light canvas is a warm off-white (`#f7f6f3`) with white cards. Dark is a near-black blue-gray
(`#0b0e14`) with layered surfaces (`#121722`, `#182030`), never pure black.

## 3. Type

- **Display / headlines:** Newsreader (variable, optical size), self-hosted. Tight tracking (-0.02em). Used for page titles, news headlines, story pages, profile names, and onboarding.
- **UI and post text:** Inter (variable), self-hosted. Counts use `tabular-nums`.
- **Fluid scale (clamp):** `--fs-display` 34→56 · `--fs-h1` 26→36 · `--fs-h2` 21→26 · `--fs-h3` 18→20 · body 15.5→16 · small 13 · micro 11.5 (uppercase, +0.06em, for kickers).

## 4. Components (`src/components/ui`)

Button (primary · secondary · ghost · danger · icon, sizes sm/md/lg) · Avatar (gradient ring,
generated abstract art, live ring, sizes) · VerifiedSeal · Chip / FilterChips · SegmentedTabs
(sliding indicator) · Sheet (bottom sheet on phones with drag-to-dismiss, centered dialog on
desktop) · Popover menu (sheet on phones) · ConfirmDialog · Toasts · Skeletons that match each
layout · EmptyState (illustrated) · ErrorState (inline retry) · Sparkline · CountdownRing ·
AnimatedNumber (roll-up) · Kicker / SourceLabel · LiveBadge · Logo (mark + wordmark).

Feature components: PostCard, ActionBar, Poll, MediaGrid + Lightbox (swipe, pinch, double-tap),
LinkCard, QuoteCard, Composer (expands in place), Feed, Ticker, CommandPalette, TabBar, SideNav, RightRail.

## 5. Motion

- Page enter: 220 ms fade + 6 px rise (`template.tsx`).
- Tab indicator: slides between tabs with the spring easing (380 ms).
- Heart burst (particles and scale), repost spin (360°), bookmark bounce, press scale 0.92.
- Counts roll up and down vertically when they change.
- Poll bars fill from 0 with the spring easing after a vote; the winner gets the accent gradient and a check.
- Ticker: an infinite marquee at ~40 px/s that pauses on hover, focus, or tap. It becomes static text under reduced motion.
- Sheets slide up 380 ms, follow the finger, and dismiss past 120 px or on a fast flick.
- The "N new posts" pill slides down from under the header.

## 6. What changed in the remodel

- **Brand:** a new logo mark (gradient tile, headline-rule "T", red live dot), a serif wordmark, favicon, maskable app icon, and iOS splash screens.
- **Tokens and type:** a warm off-white light theme and a layered blue-black dark theme, a single blue→indigo accent used sparingly, and dedicated Breaking, Live, success, warning, and danger colors. Newsreader for headlines, Inter for UI, a fluid type scale, and tabular numbers.
- **Shell:** a broadcast ticker; a slim desktop nav with active glow and an icon rail on tablets (fixes the clipped wordmark); a right rail with Live now, trending sparklines, and Who to follow; a glass phone app bar that hides on scroll; a floating glass tab bar with the compose button docked beside it, so nothing covers content; a ⌘K palette; keyboard shortcuts; and page transitions.
- **Posts:** generated Bauhaus avatars with gradient or live rings, a polished verified seal, a heart burst, repost spin, bookmark bounce, rolling counts, a smart media grid with a swipe/pinch lightbox and blur placeholders, rich link cards, nested quote cards, a smooth "Read more", animated polls with a winner highlight and countdown ring, and a composer that expands in place.
- **Screens:** Home tabs (including an in-place Breaking tab) with swipe, a magazine News hub, live story pages, community pages with votes and threads, a Live page with player and chat, a profile with parallax banner and stats, grouped notifications, Explore, Search, Settings, an admin dashboard (KPI sparklines, severity queue, confirm dialogs, banner preview, moderation log), redesigned auth, and a three-step onboarding.
- **States:** illustrated empty states, skeletons shaped like the real layouts, inline retry on errors, designed confirm dialogs instead of `window.confirm`, and bottom sheets with drag-to-dismiss on phones.

## 7. Next five improvements

1. **Real link previews and news images.** A sandboxed fetcher for Open Graph data (title, image, outlet) with an allowlist, size limits, and caching, replacing the generated cover art.
2. **True list virtualization** (windowing) for very long sessions, plus restoring the scroll position when navigating back to a feed.
3. **Shared-element transitions** (post card → thread, story card → story page) using the View Transitions API, now that the motion tokens exist.
4. **A per-user "tune your feed" panel** using the saved interests (topic weights, news vs. people mix) to drive For You and the Breaking tab.
5. **Real-time updates** (Supabase Realtime) for live chat, story timelines, vote counts, and notifications, replacing polling.
