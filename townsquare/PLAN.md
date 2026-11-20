# Townsquare — build plan

Working name **Townsquare** (one constant in `src/config.ts`; change it before Stage 2).
Built by Gleyde Technologies, LLC. Accent color: deep blue, one CSS variable (`--accent`).

## Architecture

```
Browser (PWA, mobile-first)
   │  React Server Components render pages; client components handle
   │  composer, optimistic likes/reposts, infinite scroll, menus
   ▼
Next.js App Router (Node runtime)
   ├─ Server Actions  → all writes (Next checks Origin = CSRF protection)
   ├─ Route handlers  → GET only: feed pages, media, data export, OAuth
   └─ src/lib/*       → the only code that touches the database
         ├─ db/        connection + migrations (SQLite today)
         ├─ auth       scrypt passwords, hashed session tokens, Google OAuth
         ├─ posts, social, feed, notifications, search, moderation
         ├─ ratelimit, spam, validate (zod), text (safe tokenizer), media (sharp)
         ▼
SQLite file (data/app.db) via built-in node:sqlite
   └─ swap target: Supabase Postgres — schema + RLS in supabase/schema.sql
```

Why SQLite first: the prompt says to use a local data layer until Supabase is connected.
Every query lives in `src/lib/*`, and pages never write SQL, so moving to Supabase means
rewriting those modules against `supabase-js`, not touching the UI.

## Folder structure

```
townsquare/
  src/config.ts            app name, limits, accent
  src/app/                 routes (/, /u/[handle], /p/[id], /search, /explore,
                           /notifications, /bookmarks, /settings/*, /admin,
                           /news, /communities, /live, /legal/*, /login, /signup)
  src/app/api/             feed, media, export
  src/actions/             server actions (auth, posts, social, moderation, settings)
  src/components/          PostCard, Composer, Feed, nav, menus, modals
  src/lib/                 data + domain logic (see above)
  scripts/seed.ts          30 users, 10 communities, 200 posts, 50 news items
  supabase/schema.sql      Postgres schema + row-level security (swap-in target)
  tests/                   vitest: sign up, post, follow, feed, report, safety
```

## Database schema (core)

users (profile fields live here in SQLite; `auth.users` + `profiles` in Postgres) ·
sessions · posts (replies and quotes are posts; `reply_to_id`, `root_id`, `quote_of_id`) ·
post_edits · media · polls / poll_options / poll_votes · follows · likes · reposts ·
bookmarks · blocks · mutes · post_hashtags · mentions · notifications · reports ·
moderation_actions · rate_events · site_settings (breaking banner)

Already created for later stages so they fit without rework: communities, memberships,
news_sources, news_items, live_events (+ `posts.community_id`, `users.verified`).

## Build order

1. **Stage 1 (now):** auth (email + Google) → profiles → posts (images, polls, link cards,
   edit window, delete) → reposts/quotes/replies/likes/bookmarks/share → follows +
   Following/For You feeds → notifications + badge → search + trending → report/block/mute,
   rate limits, spam checks, admin queue → settings (theme, account, privacy, export,
   delete) → legal placeholders → seed → tests.
2. Stage 2: communities with voting + threads, news hub with RSS intake, live blogs,
   coverage view, verification.
3. Stage 3: briefing, DMs, creator channels, Stripe premium, ads, context notes.
4. Stage 4: live video, audio rooms, prediction polls, local mode, AI helpers, Expo apps.
