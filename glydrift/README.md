# Glydrift

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

Debug: append `?god` to the URL to make the player invincible (handy for capturing biomes).

## Shipping to iOS (Capacitor)

```bash
npm run ios:add    # first time: builds and creates the ios/ Xcode project
npm run ios:sync   # after every web change
npm run ios:open   # opens Xcode → set your team, lock orientation to Portrait, run
```

In Xcode, set *Deployment Info → iPhone Orientation* to **Portrait** only and enable
*Requires full screen*. The HTML already handles the notch (`viewport-fit=cover` and a
safe-area probe that feeds the HUD offset). Persistence uses `localStorage`, which survives
in WKWebView; swap `src/systems/save.js` to `@capacitor/preferences` if you want iCloud
backup semantics. Sharing uses the Web Share API with a long-press/save fallback; for a
native sheet, call `@capacitor/share` from `src/systems/shareCard.js`.

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

## Visual direction — "living neon cosmos"

- Parallax: shader sky (gradient + drifting fbm nebula, rendered low-res and upscaled) →
  two star fields → drifting planets with light halos → nebula dust → two layers of floating
  crystal islands → near-field biome particles → foreground motes and speed lines.
- Post-FX (single pass, `src/gfx/shaders.js`): cheap bloom, chromatic aberration (speed-ups,
  portals, biome changes), glitch row-shift/pixelation, heartbeat vignette, flash.
- Lighting: every obstacle has an additive halo that tints the background; the player emits
  a large light that brightens the sky and nearby obstacles (`lit` factor per obstacle).
- Biomes every 500 m with a 90 m smooth palette morph (`src/biomes/biomes.js`):
  Neon Void → Solar Storm (embers) → Frozen Nebula (snow, crystals) → Glitch Realm (RGB
  split, flicker) → Abyss (black/red, heartbeat pulse) → loops.

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
- **Ghost run**: your best run is replayed as a translucent ghost alongside you.
- **"Almost there"**: distance to your best and progress to the next unlock on game over.
- **Share card**: 1080×1350 PNG with score, biome, hero and stats.
- **Achievements**: 16 badges.
- Everything persists locally (`src/systems/save.js`).

## Performance

- Fixed 60 fps cap, `dt` clamped, no per-frame allocations in hot paths.
- Pools for every obstacle type, coins, rings, floating text; Phaser particle emitters with
  hard `maxParticles` caps.
- **Low Graphics** (Settings): disables the post-FX pass, lowers sky detail, removes a
  parallax layer, shortens trails and cuts particle budgets to ~35–40 %.

## Code map

```
src/
  main.js                 Phaser config, font loading, safe-area
  config.js               physics / world / near-miss tuning
  scenes/                 Boot, Sky (shader RTT), Menu, Game, Hud, GameOver, Characters, Progress
  player/                 Player physics, CharacterRig visuals, character data
  obstacles/              ObstacleManager (seeded patterns, pooling, collisions), types, geometry
  biomes/                 palettes + morph, parallax Background
  effects/                pooled particles, rings, lightning, floating text
  gfx/                    procedural textures, GLSL shaders
  systems/                save, progression, rng, audio synth, share card
  ui/                     buttons, counters, progress bars, toasts
```
