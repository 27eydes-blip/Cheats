# Glydrift

© 2026 Sam Eyde III. All rights reserved. Not open source: no permission is granted to copy,
modify, distribute or publish this code, art, music or characters. See [LICENSE](LICENSE).

A one-tap, portrait, neon-cosmos arcade flyer built with **Phaser 3 (WebGL)** and **Vite**,
structured to be wrapped as an iOS app with **Capacitor**. Every visual is procedurally
generated at boot (Canvas2D + GLSL), so the game ships with zero image assets.

```bash
cd glydrift
npm install
npm run dev        # http://localhost:5173 (use your phone on the same network)
npm run build      # production build in dist/
npm run preview
```

Debug / review:
- `?god` — invincible player (handy for capturing biomes)
- `?style=grid|space|horizon` — preview the three backdrop styles (also in Settings)
- `?music` — opens the hidden **music test page** (also: tap the GLYDRIFT logo 5 times)

## Play online (GitHub Pages app)

Live at **https://27eydes-blip.github.io/Cheats/glydrift/** — installable (Add to Home
Screen) and playable offline, like the other games on the `gh-pages` branch.
Publish a new version with `npm run deploy:pages` (builds and copies `dist/` into
`gh-pages/glydrift`).

## Online leaderboard (Supabase)

- Config in `src/config.js` (project URL + **publishable** key only — RLS does the access
  control; never add a secret/service_role key).
- Anonymous sign-in on launch; the session is persisted so a device keeps one `player_id`.
- First launch asks for a 3–12 character name (letters/numbers, profanity-filtered); change
  it in Settings → Name (existing rows are renamed).
- After each run the score goes into a persistent local queue and uploads in the
  background (`src/online/leaderboard.js`): only personal bests are upserted (with
  `created_at` = now), `character` and `run_time_ms` are always sent, implausible scores
  (too high for the run time) are rejected, and the queue retries when back online.
  Levels: `endless` and `daily-<number>`.
- Leaderboard screen: Endless (All Time / This Week / Today) and today's Daily, top 100,
  gold/silver/bronze top 3, your own row pinned with your real rank.
- `?lbtest` routes reads/writes to `test-…` levels; `npm run test:rls` runs a two-player
  Row Level Security check (uses level `test-rls`).

## Shipping to iOS (Capacitor)

```bash
npm run ios:add    # first time: builds and creates the ios/ Xcode project
npm run ios:sync   # after every web change
npm run ios:open   # opens Xcode → set your team, lock orientation to Portrait, run
```

In Xcode, set *Deployment Info → iPhone Orientation* to **Portrait** only and enable
*Requires full screen*. The HTML already handles the notch (`viewport-fit=cover` and a
safe-area probe that feeds the HUD offset). Persistence uses `localStorage`, which survives
in WKWebView; swap `src/data/save.js` to `@capacitor/preferences` if you want iCloud
backup semantics. Sharing uses the Web Share API with a long-press/save fallback; for a
native sheet, call `@capacitor/share` from `src/online/shareCard.js`.

## Gameplay

- Tap to flap. Gravity is asymmetric (lighter rising, heavier falling) with terminal
  velocities and a smoothed tilt, tuned in `src/config.js → PHYSICS`.
- The world scrolls right and the speed ramps asymptotically (`speedForMeters`), with
  camera zoom-out, speed lines and chromatic aberration as it climbs.
- One hit = death. The results overlay accepts a tap anywhere and restarts in place
  (pooled objects are re-armed, nothing is rebuilt), so you are flying again instantly.
- Obstacles: pendulum blades on chains, slamming crushers, sliding gates, spinning saws
  (static, on rails, or in pairs), blinking lasers (vertical gaps and horizontal beams,
  with a non-lethal charge-up flicker so they are always readable).
- Portals: gravity flip (always followed by a restore portal) and mini (shrink, timed).
- Near-miss: brief slow-mo, white flash, "CLOSE!", combo multiplier and bonus points.

## Visual rules

Clean, high-contrast neon (Tron / vector arcade), not a photo filter:

- **Hierarchy:** background dim → hazards bright → hero brightest.
- **Background** (`src/scenes/BackdropScene.js`, `src/biomes/Background.js`): near-black skies,
  very faint nebula, one of three styles (Tron **grid** = default, **deep space**, synthwave
  **horizon**). At most one planet + one island, painted at 35% resolution (soft focus),
  dark and desaturated, confined to the top/bottom bands and faded out whenever a hazard
  passes in front of them. Menus dim the backdrop and hide scenery.
- **Bloom only on gameplay:** the backdrop is its own scene without post-FX; the gameplay
  camera is transparent with an alpha-preserving post pass (bloom, aberration, glitch).
- **Colour rules** (`src/config.js`): every hazard (saw, laser, crusher, blade, pillar,
  edge barrier) uses a danger colour — red / orange / hot pink — with the same glow; any danger
  colour too close to the selected hero's hue is swapped out. Portals are round purple/white
  swirls (never hazard-shaped), coins are gold, heroes keep their own colours.
- **Hazards** are crisp vector neon (`src/obstacles/neon.js`): dark body, inner tint,
  thick saturated outline, soft outer glow and a white core line.
- **Heroes** are ~2.7x their original size, painted at 3x density with a bright rim outline
  so dark heroes (Shade) stay readable anywhere; the hitbox grew moderately and gaps widened.
- **Sharpness:** the canvas renders at the device pixel ratio (cameras zoom a logical
  720-wide view), text renders at that resolution, numbers use Rajdhani (clean zeros).

## Music (Tone.js, fully synthesized)

`src/audio/music.js` + `src/audio/musicTracks.js` — no audio files, all original.

- House at 124 BPM: four-on-the-floor kick, offbeat open hats, clap on 2 & 4, rolling bass,
  chord stabs, a lead motif; pads/bass duck on every kick (sidechain pump); synths go to a
  shared reverb + dotted-eighth delay while kick and bass stay dry.
- One track per biome (Neon Void A minor, Solar Storm F minor, Frozen Nebula E minor,
  Glitch Realm C# minor with bitcrush + stutter, Abyss D minor/phrygian with sub bass) plus a
  slower lounge menu theme (112 BPM, 9th chords).
- 8-bar sections: intro → build → main → breakdown → drop → loop, with drum fills, motif
  swaps and phrase variations per loop. Extra layers (16th hats, arps, octave leads, brighter
  filters) fade in with player speed.
- Biome changes crossfade over 2 s starting on the next bar; death sweeps a low-pass down in
  0.5 s and retry opens it back up; pause muffles.
- Audio starts on the first tap (iOS). Settings: Music + SFX volume sliders, Mute, saved
  locally. SFX share Tone's AudioContext.

## Characters

| Hero | Rarity | Trail | Flap | Death | Unlock |
|---|---|---|---|---|---|
| Volt | Common | lightning | crackling sparks + arcs | electric burst | default |
| Ember | Rare | fire ribbon + embers | flame burst | bursts into flames | 750 coins or 3 shards |
| Frost | Rare | frost ribbon + flakes | ice flakes | shatters into snowflakes | 1000 coins, 3 shards, or reach Frozen Nebula |
| Shade | Epic | afterimages + shadow ribbon | smoke puff | dissolves into smoke | 2500 coins or 12 near-misses in a run |
| Glitch | Epic | stepped RGB-split ribbons | pixel burst + glitch frame | glitches out (screen glitch) | 3000 coins or reach Glitch Realm |
| Nova | Legendary | rainbow light ribbon + stars | rainbow shockwave | supernova | 8000 coins or 2500 m in a run |

The character screen has an orbiting turntable showcase with a live trail + flap preview
and a perspective card carousel with rarity-coloured glowing borders (animated rainbow for
Legendary).

## Retention systems

- **Daily Challenge**: seeded from the date (`dailySeed`), identical obstacles for everyone,
  its own best score and ghost, and a numbered shareable result card.
- **Login streak**: 7-day escalating rewards; day 7 grants a rare character shard.
- **Missions**: 3 rotating missions (e.g. "Pass 5 lasers in one run", "Get 10 near-misses",
  "Reach Solar Storm"), auto-claimed at the end of a run and replaced; in-run toasts.
- **Level & XP** with milestone rewards (coins / shards), animated fill on game over.
- **Ghost run**: best runs are still recorded; the on-screen ghost replay is currently turned off.
- **"Almost there"**: distance to your best and progress to the next unlock on game over.
- **Share card**: 1080×1350 PNG with score, biome, hero and stats.
- **Achievements**: 16 badges.
- Everything persists locally (`src/data/save.js`).

## Coin shop & economy

The **Shop** (bag button on the home screen) sells cosmetics only — trails, death effects,
hats, colour skins, flap effects and coin skins — plus heroes, a daily-rotating **Daily Shop**
(4 items, one 30% off), the **Mystery Pod** (500 coins, odds on screen, no duplicates, 250 back
if a tier is complete) and one-run **Boosts**. Owning a themed **Collection** (trail + hat +
death effect + skin) unlocks a title and glow. Catalog, prices and odds: `src/data/cosmetics.js`.

**Coins never buy leaderboard advantage.** Cosmetics are visual only, and any run that uses a
Boost earns coins and mission progress but is never submitted to the worldwide leaderboard or
the Daily Challenge (boosts can't be used there), never sets a personal best, and shows a
"BOOSTED RUN · NOT RANKED" badge on the results.

Earn rate (measured with a test bot that grabs about 60% of coins):

| Run | Coins picked up | Score → Lucky Spins | Typical total per run* |
|---|---|---|---|
| Short (~300 m, 18 s) | ~17 | ~0.5 spin | ~100 |
| Average (~600 m, 33 s) | ~83 (incl. 50 biome bonus) | ~1 spin | ~250 |
| Good (~1,000 m, 52 s) | ~150 | ~1.5 spins | ~400 |

\* plus spins (≈195 coins each on average), missions (~100 coins each) and level-ups.

| Tier | Price | ≈ runs at ~150 coins/run |
|---|---|---|
| Common | 200 – 300 | 1.5 – 2 |
| Rare | 400 – 1,200 | 3 – 8 |
| Mystery Pod | 500 | ~3 |
| Epic | 1,500 – 4,000 | 10 – 27 |
| Legendary | 8,000 – 15,000 | 55 – 100 (a few days) |
| Boosts | 200 – 750 | 1.5 – 5 |

## Performance

- Fixed 60 fps cap, `dt` clamped, no per-frame allocations in hot paths.
- Pools for every obstacle type, coins, rings, floating text; Phaser particle emitters with
  hard `maxParticles` caps.
- **Low Graphics** (Settings): caps rendering at 2x pixel ratio, disables the post-FX pass,
  lowers sky detail, drops the island silhouette, shortens trails and cuts particle budgets to ~35–40 %.

## Code map

```
src/
  main.js                 Phaser config, font loading, safe area, scale mode
  config.js               view, world speed, physics, near-miss, Supabase (publishable key)
  tuning.js               rewards, combo, biome pacing, Calm/Abyss, flashes, obstacle spacing
  scenes/                 Boot, Backdrop, Menu, Game, Hud, GameOver, Characters, Progress,
                          Leaderboard, Spin, MusicTest (?music)
  player/                 Player physics, CharacterRig (pixel sprite + trail), hero data
  obstacles/              ObstacleManager (seeded patterns, pooling, collisions), base,
                          shared (saw / gate / portal), biomes/<one file per biome>, geometry
  biomes/                 biome palettes + the smooth morph between them
  pixel/                  procedural pixel art: heroes, biomes, hazards, backgrounds, floors
  effects/                particles/rings/lightning/float text, ScreenFlash, ComboMeter
  gfx/                    smooth particle/UI textures, TileSprite memory fix
  audio/                  sfx synth, Tone.js music engine, music tracks
  data/                   save, progression (XP, missions, unlocks, spins), seeded rng
  online/                 Supabase leaderboard, usernames, share card
  systems/                frame guard (never freeze on an error), haptics, install prompt
  ui/                     buttons, sliders, counters, toasts, icons, reveals (unlock, chest)
```
