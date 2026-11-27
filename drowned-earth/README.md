# Drowned Earth

A quiet, first-person exploration-survival game set on a flooded future Earth.
Runs in the browser on phones and desktops (three.js + Vite). No image or audio
files: every texture is drawn procedurally at boot and every sound is
synthesized with WebAudio.

> Decades ago the Hush killed more than half the world. Then the Rise took the
> coasts and the low cities. One island stayed dry: Highmark. Everyone else
> lives on the water.

**Stage 1, "The First Drowned District"** (about 15 minutes): you wake at dawn
in a small repair boat tied to Linden Court, an apartment tower in the drowned
Lantern Ward of Orrin Bay. Explore the ward by boat, climb into buildings, dive
into flooded interiors, trade at the raft community of Kettle Drift, listen to
the radio, and find out what is at the bottom of the Sounding.

## Run it

```bash
cd drowned-earth
npm install
npm run dev          # http://localhost:5173 (also served on your LAN for phones)
npm run build        # production build in dist/
npm run preview      # serve the build
npm run validate:data  # check the JSON content for broken references
npm run test:shots     # headless Chromium screenshots + console-error check (needs Playwright)
npm run test:smoke     # drives the stage-1 loop (tie-up, loot, craft, trade, dive, radio, save, finale)
```

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move / steer the boat | WASD | Left stick |
| Look | Mouse (click to capture) | Drag on the right half |
| Sprint / boat boost | Shift | Sprint |
| Crouch / swim up | C | Crouch |
| Jump / dive / swim down | Space | Dive |
| Use, talk, tie up, board | E | Use |
| Flashlight (boat lantern when piloting) | F | Light |
| Boat camera (first/third person) | V | View |
| Boat radio | R | Radio |
| Pack, craft, journal, pause | Tab, Q, J, Esc | Pack, Menu |

### Quality

Low / medium / high is chosen in the pause menu (or `?quality=low|medium|high`).
Phones default to low, desktops to medium.

| | low | medium | high |
| --- | --- | --- | --- |
| Pixel ratio cap | 1 | 1.5 | 2 |
| Render path | single pass, no refraction | HDR target + refraction, depth foam, underwater shafts | same, bigger shadows |
| Sun shadows | off | 1024 | 2048 |
| Planar water reflections | off (sky only) | 35 % res | 50 % res |
| Streaming radius (near / far) | 200 / 900 m | 260 / 1200 m | 320 / 1500 m |
| Water grid | 48×64 | 72×96 | 96×128 |
| Debris, particles, rain, birds | reduced | medium | full |

### Debug URL parameters

`?skipintro=1&time=21.5&freeze=1&weather=storm&quality=high&stats=1&pause=1&touch=1`
plus `pos=x,y,z&mode=foot|swim|boat`, `boat=x,z,heading`, `yaw=`, `pitch=`, `tp=1` (third-person boat
camera), `flashlight=1`, `patrol=1` (Tide Warden patrol at any hour), `pause=1` (start paused; step with
`__game.step(n)`), `touch=1` (force the touch UI). `window.__game` exposes everything; `scripts/probe-eval.mjs`
evaluates an expression in a headless page.

## Architecture

```
src/
  main.js               boot
  core/                 Game loop + ctx, EventBus, seeded RNG/noise, Input, Settings (quality presets), Debug params
  render/               Pipeline (far layer, planar reflection, HDR target, composite, water/FX pass), FogChunk, Effects (rain, smoke, motes, breath, flashlight)
  world/                WorldMap (atlas → regions, seabed), ChunkManager (streamed LOD chunks), Builder (merge-by-material),
                        Collision (AABB hash + moving bodies), Interactables, Materials, WorldShader (windows, vines, waterline, caustics),
                        Textures (procedural canvas textures), Props (instanced prop geometry), Architecture (towers, storeys, ladders, containers),
    generators/         city.js (drowned blocks), ruins.js (outskirts + open ocean), seabed.js
    landmarks/          Linden Court, St. Aldren General, Cask Street station, MV Calla Morrow, The Sounding, Vesper House, Highmark (far layer)
    LandmarkManager.js  streams hand-built scenes by distance
  water/                Waves (shared CPU/GPU wave model), Water (surface shader, far ocean, ripples)
  weather/              TimeOfDay (color script), Weather (state machine), Sky, Atmosphere (lights, fog, env map, underwater)
  player/               Player (walk, stairs, platforms, swim, dive, climb), Boat (buoyancy, thrust/paddle, damage, tie-up), CameraRig
  raft/                 RaftKit (modular pieces + deck structures), Raft (floating body), RopeBridge, RaftCommunity (Kettle Drift)
  ai/                   NPC (schedules, distance-keeping), Birds, Patrol (Tide Wardens), DeepShapes
  survival/             Survival (needs), Inventory, Loot (deterministic), Crafting, Trade
  story/                Story (flags, objectives, triggers, finale), Radio, Dialogue
  audio/                AudioEngine (beds, streamed spatial emitters, buses, reverb), Synth (all sound recipes)
  ui/                   UI (HUD, wrist gauge, panels, title, end card), TouchControls, style.css
  save/                 SaveSystem (versioned localStorage + migrations)
  data/                 JSON content (see below)
```

Key ideas for scale:

* **Everything is a function of the atlas + seed.** `WorldMap` answers "what is at (x, z)?" for any point on
  the planet (region, seabed depth, landmark claims). Chunks (128 m) are generated deterministically in any
  order, in two LODs, time-sliced so streaming never spikes a frame. New regions are added in
  `data/locations.json` and a generator registered for their `type`.
* **Draw calls stay flat.** `Builder` merges all geometry in a chunk/landmark per material; props are
  `InstancedMesh`; floating debris bobs on the GPU using the same wave function as the physics.
* **One wave model.** `water/Waves.js` drives the water shader, debris shader, boat buoyancy, rafts and
  swimming, so everything sits on the same surface.
* **Far layer.** Highmark, the sky and the far ocean render with their own camera (20 m – 60 km) before
  the near world, so the island 13 km away needs no huge depth range. Positions are 64-bit on the CPU and
  `modelViewMatrix` is computed camera-relative, so precision holds for tens of kilometres; a floating origin can
  be added in `ChunkManager`/`LandmarkManager` if the map grows beyond that.
* **Moving collision bodies.** Rafts, bridges and the stranded ship are collision *bodies*: boxes in a parent's
  local space. The player rides them; this is the base for moving raft cities and player-built rafts
  (`Raft.addPiece()` rebuilds the raft).
* **Systems talk through `ctx` and the EventBus**, so new systems plug in without touching old ones.

## Adding content (no code changes)

All content lives in `src/data/*.json` and is validated at boot and by `npm run validate:data`.

* **Items** – `items.json`: name, description, value (scrap), weight, tags, `use` effects
  (`thirst`, `hunger`, `warmth`, `fatigue`, `sick`, `battery`, `boatFuel`, `hull`), `sealed` for Highmark goods.
* **Recipes** – `recipes.json`: `in`/`out` maps, optional `tool` (kept) and `station` (`workbench`, `boat`).
* **Loot** – `loot.json`: per container type, weighted entries, roll counts, guaranteed drops. Container contents
  are deterministic per container id.
* **Shops** – `trade.json`: what each trader sells (price, stock), which tags they buy, services.
* **NPCs** – `npcs.json`: raft, look, daily schedule (`from`/`to` hours, activity, spot), dialogue lines with
  optional flag requirements (`if`) and effects (`set`), and an optional shop.
* **Rafts** – `rafts.json` (platforms built from pieces, deck structures, bridges, moorings) and
  `raftPieces.json` (float types and structure types).
* **Logs** – `logs.json`: notes, boards, plaques and recordings (recordings play as synthesized murmur with
  subtitles). Place them in a landmark with `logItem(b, 'log_id', x, y, z)`.
* **Radio** – `radio.json`: stations, lines, gaps, and flags set when a line is heard.
* **Story** – `story.json`: objectives (quiet journal notes, never waypoints) and triggers
  (`when`: playTime, near, hourFrom, night, flags, chance → `do`: whisper, audio, event, flag, delay).
* **Weather** – `weather.json`: states (fog density, wind, waves, rain, lightning, warmth) and the opening schedule.
* **World** – `locations.json`: regions, landmarks (id, kind, position, cleared radius) and far landmarks.

To add a **new landmark kind**, write a builder in `world/landmarks/` (use `Builder`, `storey`, `ladder`,
`container`, `logItem`, `mooring` from `Architecture.js`) and register it in `core/Game.js`. To add a **new
region type**, write a chunk generator and register it with `chunks.registerGenerator(type, fn)`.

## Saves

`localStorage["drowned-earth.save"]`, versioned (`SAVE_VERSION` in `save/SaveSystem.js`). When the format
changes, bump the version and add a migration step; older saves are upgraded on load. Autosave every 60 s,
on sleeping and at the end of the stage; manual save/load in the pause menu.

## Lore names used

Orrin Bay (the drowned city), Lantern Ward (the district), the Hush (the illness), the Rise (the flood),
Highmark (the last dry island) and its Supply Authority, Health Authority and Tide Wardens, Kettle Drift
(the raft community, led by Mother Ansel), the Unmoored (a hidden raft group on 3.3), the Sounding (the
sinkhole), Linden Court, St. Aldren General and its sealed Ward 9, Cask Street station on the Ferrow Line,
the MV Calla Morrow, Vesper House.
