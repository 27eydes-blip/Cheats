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
