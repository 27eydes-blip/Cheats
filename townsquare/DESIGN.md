# Townsquare design system: "The Front Page" (national edition)

## 1. Audit: what looked like Twitter/X (before this remodel)

Screenshots: 20 routes × 390 / 768 / 1440 px × light / dark (120 images).

1. **Three-column shell:** a left icon sidebar with a big "New post" pill, a center stream, and a right rail. That is Twitter's skeleton, almost pixel for pixel.
2. **Right rail modules named "Trending" (hashtags) and "Who to follow"**, with black "Follow" pills. Pure Twitter.
3. **A reverse-chronological stream of identical post cards** as the home screen, with Following / For You tabs on top (Twitter and Threads).
4. **The action row:** reply bubble · retweet arrows · heart · bookmark · share icons with counts. These are Twitter's exact glyphs and their exact order.
5. **"@handle · 7h" author lines** with a round avatar on the left of every post.
6. **"Frank Williams reposted"** social context lines above posts.
7. **Pill-shaped everything:** buttons, chips, the search field, and the composer's Post button (Twitter and Bluesky).
8. **The blue/indigo accent on white:** Twitter and Bluesky blue.
9. **Round avatars with rings** (Instagram/Threads stories).
10. **Hashtag-ranked "Trending"** with post counts.
11. **"What's happening?"** composer placeholder: Twitter's literal copy.
12. **The floating compose button / bottom tab bar with Home · Search · Bell · Profile** rhythm (Twitter mobile).
13. **The profile:** banner, overlapping round avatar, bio, Following/Followers counts, and Posts / Replies / Media / Likes tabs. This is Twitter's profile one to one.
14. **Notifications as a flat list** of likes, follows, and reposts with a little colored icon (Twitter).
15. **Local-first sample content** (city council, school board), while the product is a national news network.

## 2. The big idea

Townsquare is organized around **Stories**, not a stream of posts. Every national event is a Story.
People add **Takes** to a Story and pick a **stance** (Agree, Disagree, Context, Question).
Readers cast their own stance on Stories and Takes; the **stance meter** replaces likes.
The home screen is a **front page** (bento tiles sized by importance), not a timeline.

| Twitter primitive | Townsquare replacement |
|---|---|
| Post | **Take** (with a stance chip, optionally attached to a Story) |
| Like ♥ | **Stance meter**: agree / unsure / disagree split, tap to cast |
| Retweet | **Amplify**: a quiet pin to your Rundown |
| Reply | **Answer**: shown side by side with the original as a debate pair |
| Bookmark | **Save to Rundown** |
| Trending hashtags | **Hot Stories**, ranked by take velocity, with sparkline and stance meter |
| Who to follow | **Voices**: curated people with a credibility line |
| Home timeline | **Front Page** (bento) + **Rundown** (your lineup: Now / Next / Later today / Earlier) |
| Profile | **Byline page** |
| Communities | **Desks**, run by **Editors** |
| Notifications | **Newsdesk** inbox, grouped by Story |
| Admin | **Control Room** |

## 3. Structure

- **Desktop:** a masthead (edition date and number, serif wordmark, search, Newsdesk, Take it button, byline chip), a double rule (navy, then gold hairline), a horizontal **channel dial** (Front Page, Politics, World, Business, Tech, Sports, Culture, Live, Desks), and the **Live Wire** ticker. The body is a full-width 12-column grid. There is no sidebar and no rail.
- **Phone:** a compact masthead, the dial as a swipeable strip, and the Front Page as a **story deck**: full-height Story cards that snap one per swipe. Swiping sideways changes channel. A slim navy **dock** has a raised gold Take it button in the center slot of the layout, so it never sits on content.
- **Navigation:** the dial, the search overlay (⌘K / Ctrl K), and the **Rundown drawer**.

## 4. Tokens (`src/styles/tokens.css`)

Navy, gold, and white dominate. Red appears only as the functional Live / Breaking signal.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #FFFFFF | #070C18 | page |
| `--paper-2` | #F5F6F9 | #0C1426 | wells, tiles |
| `--paper-3` | #EBEEF4 | #13203A | pressed, tracks |
| `--ink-1` | #0A1630 | #F4F6FB | headlines, body |
| `--ink-2` | #3A4560 | #C3CADB | secondary |
| `--ink-3` | #5D6780 | #8C97AE | meta (AA on both papers) |
| `--navy` | #0B1F4B | #0B1F4B | masthead, primary buttons, dock |
| `--navy-ink` | #0B1F4B | #9DB4E8 | navy as text / links |
| `--gold` | #C8A24A | #D9B65E | rules, verified, editor picks, active dial |
| `--gold-ink` | #7C5F14 | #E2C677 | gold as text (AA) |
| `--live` | #C8102E | #FF4D5E | ON AIR, breaking dot |
| `--agree` | #0F6B4F | #4FD1A1 | stance: agree |
| `--disagree` | #A3242F | #FF7A85 | stance: disagree |
| `--unsure` | #8C97AE | #5D6780 | stance: unsure / neutral |

- **Shape:** radius 2 / 4 / 6 / 8 px. Hairline rules (`--rule`), column dividers, and folio labels. No pills, except tiny count badges.
- **Type:** Newsreader (headlines, bylines, optical sizing, -0.025em tracking). Inter (UI, Take text). JetBrains Mono (timestamps, stance numbers, folios). Small-caps section labels (`.folio`).
- **Depth:** flat paper with hairlines, and a faint grain on the masthead. Shadows only on floating layers (dock, sheets, overlay).
- **Motion:** 120 / 220 / 380 ms with a spring easing. Stance bars animate width, tiles fade-rise in order, Live Wire items slide in, and pages enter with a short slide. Everything collapses under `prefers-reduced-motion`.

## 5. Components (`src/components/ui`)

Masthead · ChannelDial · LiveWire · Dock · SearchOverlay · RundownDrawer · Button (navy, outline, ghost, gold, danger) ·
Byline portrait (square-rounded, stance-colored ring, generated art) · Folio · Rule · StanceMeter (compact and large,
interactive) · StanceChip · Sparkline · CountdownRing · Tile (lead / medium / small / wide) · TakeCard · DebateCard ·
StoryTile · DeckCard · Sheet · Menu · Confirm · Skeletons (bento-shaped) · EmptyState · ErrorState.

## 6. Originality check (done before sign-off)

Final screenshots were compared against Twitter/X, Threads, Bluesky, Reddit, and Truth Social:

| Piece | Them | Townsquare now |
|---|---|---|
| Shell | Left icon sidebar + center stream + right rail | Newspaper masthead, channel dial, Live Wire; full-width bento; no sidebars |
| Home | Reverse-chron stream of identical cards | Front Page bento sized by importance; phone story deck with snap |
| Card actions | Reply · Retweet · Heart · Bookmark | Agree / Disagree stance meter · Answer · Amplify · Save to Rundown |
| Buttons | Pills | Square 4px buttons with a gold underline on primary |
| Color | Blue on white (or black) | Navy, gold, and white; red only for ON AIR |
| Avatars | Circles | Square-rounded byline portraits with stance-colored rings |
| Trending | Hashtags and post counts | Hot Stories by take velocity, sparkline, stance split |
| Who to follow | Follow pills | Voices with a credibility line (verified, tenure, context notes) |
| Profile | Banner, round avatar, Posts/Replies/Media/Likes | Byline page: editorial name, credibility record, pull-quote, Takes/Debates/Rundown |
| Reddit-style voting | Orange arrows in a pill | Square vote control in navy; Desks with Editors and a pinned Story |

Pieces redone during the check: the profile banner and round avatar (now the byline page),
pill chips (now square), the blue accent (now navy and gold), the heart row (now the stance
meter), and the floating "+" (now Take it, docked in its own slot).

## 7. What changed in this remodel

- **National, not local:** 12 fictional national Stories (Congress, the Fed, the Supreme Court, a hurricane, an antitrust trial, trade, a rail strike, a championship, and more), national Desks, and no town step in onboarding.
- **Stories and Takes:** Takes carry a stance and optionally a Story; Answers inherit the Story and, with the opposite stance, become head-to-head debate cards.
- **Stance meter instead of likes,** on every Story and Take, with optimistic updates and animation.
- **New structure:** masthead, channel dial, Live Wire, Front Page bento, phone story deck, Rundown (page and drawer), search overlay, desktop inline composer, and a phone dock with a docked Take it button.
- **New screens:** Story page (timeline rail, coverage strip, split, Agree | Disagree takes, context notes), Byline, Morning Edition (offline save), Live Studio (monitors, schedule grid), Desks with an Editor toolbar, Newsdesk grouped by Story, Control Room, sign-up with a sample Front Page.
- **Brand:** navy/gold/white tokens, Newsreader + Inter + JetBrains Mono, a stamp mark and serif wordmark, icons, splash.

## 8. Markets board (`/markets`)

The one always-dark screen: a terminal grid (navy-black, 32 px grid lines, navy and gold glows) under a gold-ruled ticker tape.
Gains are mint `#2EE6A6`, losses coral `#FF5C7A`, both with a soft glow; gold marks the selected symbol, the day-range marker and labels.
Prices flash on every tick; the tape pauses on hover and stops under reduced motion. A DEMO / LIVE badge always says where prices come from.

## 9. Next five improvements

1. **Real content pipeline:** RSS ingest that clusters headlines into Stories automatically (the "How it is covered" strip then fills itself), plus an editor tool to write timeline updates.
2. **Context notes with cross-viewpoint rating:** only show a Context take as a "note" once readers who usually disagree both rate it helpful (the stance history already gives the signal).
3. **Real-time stance meters and Live Wire** via Supabase Realtime, instead of refresh-on-action and polling.
4. **Personalized Front Page:** use saved beats and follows to reorder tiles (Rundown already uses follows), with a visible "why this tile" note.
5. **True list virtualization and push alerts** for long Rundowns and Story-specific breaking updates.
