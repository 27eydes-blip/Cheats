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

Debug / review:
- `?god` — invincible player (handy for capturing biomes)
- `?style=grid|space|horizon` — preview the three backdrop styles (also in Settings)
- `?music` — opens the hidden **music test page** (also: tap the GLYDRIFT logo 5 times)

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

`src/systems/music.js` + `src/systems/musicTracks.js` — no audio files, all original.

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
- **Ghost run**: your best run is replayed as a translucent ghost alongside you.
- **"Almost there"**: distance to your best and progress to the next unlock on game over.
- **Share card**: 1080×1350 PNG with score, biome, hero and stats.
- **Achievements**: 16 badges.
- Everything persists locally (`src/systems/save.js`).

## Performance

- Fixed 60 fps cap, `dt` clamped, no per-frame allocations in hot paths.
- Pools for every obstacle type, coins, rings, floating text; Phaser particle emitters with
  hard `maxParticles` caps.
- **Low Graphics** (Settings): caps rendering at 2x pixel ratio, disables the post-FX pass,
  lowers sky detail, drops the island silhouette, shortens trails and cuts particle budgets to ~35–40 %.

## Code map

```
src/
  main.js                 Phaser config, font loading, safe-area
  config.js               physics / world / near-miss tuning
  scenes/                 Boot, Sky (shader RTT), Backdrop, Menu, Game, Hud, GameOver,
                          Characters, Progress, MusicTest
  player/                 Player physics, CharacterRig visuals, character data
  obstacles/              ObstacleManager (seeded patterns, pooling, collisions), types, geometry
  biomes/                 palettes + morph, parallax Background
  effects/                pooled particles, rings, lightning, floating text
  gfx/                    procedural textures, GLSL shaders
  systems/                save, progression, rng, music (Tone.js), sfx synth, share card
  ui/                     buttons, sliders, counters, progress bars, toasts, vector icons
```
