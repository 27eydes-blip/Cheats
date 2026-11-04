# Running Glydrift Seasons (no app update needed)

Every season is plain data. The game reads it from your Supabase project, so you can start,
change or end a season from the Supabase dashboard. Players get the change the next time they
open the game.

Until you do the one-time setup below, the game uses the seasons built into the app
(`src/data/seasonDefs.js`, the same data as `seasons/seasons.json`), so Season 1 already
runs without any setup.

---

## One-time setup (about 2 minutes)

1. Open your project at <https://supabase.com/dashboard> and go to **SQL Editor** → **New query**.
2. Paste the SQL below and press **Run**.

```sql
-- Glydrift seasons: one row ("live") holds the whole season schedule as JSON.
create table if not exists public.season_config (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.season_config enable row level security;

-- Everyone (the game) may READ the config. Nobody can write it from the app:
-- there are no insert/update/delete policies, so only you (in the dashboard) can edit it.
drop policy if exists "season config is readable" on public.season_config;
create policy "season config is readable"
  on public.season_config for select
  using (true);
```

3. Add the starting schedule. Go to **Table Editor** → `season_config` → **Insert row**:
   - `id`: `live`
   - `data`: paste the whole contents of `glydrift/seasons/seasons.json`

   This step uses only the dashboard, so the app never needs a secret key. Never paste a
   `service_role` key anywhere in the game.

---

## Everyday changes

Open **Table Editor** → `season_config` → the `live` row → edit `data`, then **Save**.
Players see the change the next time they open the game. The game also keeps a copy, so it
still works offline.

| I want to… | Do this in `data.seasons` |
|---|---|
| **Start a season now** | Set its `start` to now, e.g. `"2026-11-04T00:00:00Z"`, and its `end` 4 weeks later. |
| **End a season early** | Set its `end` to now. Players' unclaimed tiers are auto-claimed and they see the recap. |
| **Change dates** | Edit `start` / `end` (UTC, ISO format). Seasons shouldn't overlap. |
| **Rename / recolour** | Edit `name`, `tagline`, `theme.primary`, `theme.accent`, `theme.dark` (hex colours). |
| **Change the home look** | `theme.home`: `"crimson"`, `"prism"`, `"garden"` or `"storm"`. |
| **Change pass rewards** | Edit `pass.tiers` (30 entries). See the reward types below. |
| **Pass speed** | `pass.tierXp` = XP per tier (350 ≈ 1–2 runs). |
| **Change the new hero** | `featuredHero` = a hero id, and put `{ "hero": "<id>" }` at tier 30. |
| **Price after the season** | `heroPriceAfter` = coins to buy the featured hero once the season ends. |
| **Edit event challenges** | `event.challenges`, as below. |
| **Season shop items** | `event.shopItems` = cosmetic ids that sell only during the season. |
| **Add a season** | Copy a season object, give it a new `id` (`"s5"`), `number`, dates and content. |

### Pass reward types
```json
{ "coins": 300 }
{ "item": "trail_hearts" }
{ "pod": true }
{ "hero": "levijr" }
```

### Event challenge types
```json
{ "id": "abyss5", "text": "Reach the Abyss 5 times", "type": "count",
  "metric": "reachedAbyss", "value": 5, "reward": { "coins": 500, "xp": 700 } }

{ "id": "abyss300", "text": "Survive 300m in the Abyss", "type": "best",
  "metric": "abyssM", "value": 300, "reward": { "coins": 800, "xp": 1000 } }

{ "id": "abyssall", "text": "Die to every Abyss hazard", "type": "collect",
  "metric": "abyssKiller", "values": ["tendril", "slammer", "walls"], "reward": { "coins": 1000, "xp": 1200 } }
```
- `count` adds the metric up over the whole season.
- `best` is the best single run.
- `collect` needs every listed value at least once.
- `xp` goes into the season pass.

**Metrics:** `runs`, `score`, `meters`, `nearMiss`, `coins`, `reachedAbyss`, `abyssM`,
`reachedPrism`, `prismM`, `prismClear`, `abyssClear`, `abyssKiller`.

### What has to exist in the app already
The config can only use heroes and cosmetics whose art is in the game. Anything unknown is
skipped safely; a season with broken dates or an empty pass is ignored, so it can't crash the
game.

- **Heroes:** every hero id in `src/player/characterDefs.js` and `src/player/animalDefs.js`.
- **Season cosmetics:** `trail_bloodmoon`, `trail_abyssal`, `hat_bloodcrown`, `hat_abysseye`,
  `trail_prism`, `trail_zen`, `trail_storm`.

New art (a brand-new hero or item) still needs an app update. After that, everything about
it can be scheduled from here.

---

## What players see
- **Home screen:** a season banner with a countdown and pass tier, and the season's colours.
  Tapping the banner opens the pass.
- **First open of a season:** a NEW HERO reveal of the featured hero.
- **Shop → Featured:** the Season Pass (30 tiers), the event card with challenge progress,
  and the season-only items.
- **Season end:** unclaimed tiers are auto-claimed, a Season Recap shows their stats and
  rewards, and the next season's pass starts fresh.
- **After the season:** the featured hero can be bought for `heroPriceAfter` coins.

## Analytics events
`season_started`, `pass_tier_reached`, `new_hero_viewed`, `season_event_challenge_completed`.

## Push notifications
The game doesn't have push notifications yet, so nothing is sent when a season starts.
Players learn about it from the NEW HERO reveal and the home banner the next time they open
the game.

## Testing (test builds only)
Add `?seasonNow=2026-12-03T10:00:00Z` to the URL to pretend it's that date, for example to see
the Season 1 recap and the Season 2 start.
