# Drowned Earth

A quiet, first-person exploration-survival game set on a flooded future Earth.
Runs in the browser on phones and desktops (three.js + Vite, WebGL2). Every
sound is synthesized with WebAudio. The look combines original procedural
work (architecture, water, sky, clouds, interiors seen through windows) with
CC0 photoscans: Poly Haven materials, props and HDRI skies, and rigged
Quaternius characters (see `CREDITS.md`). If the asset files are missing, the
game falls back to its procedural textures and box props and still runs.

> Decades ago the Hush killed more than half the world. Then the Rise took the
> coasts and the low cities. One island stayed dry: Highmark. Everyone else
> lives on the water.

The game has two halves that share one save and one world:

* **The Drowned District** (story mode, 3D): the playable stage 1 below.
* **A Life on the Water** (life sim): live a whole life a year at a time on the Drift — birth raft, family,
  careers, Standing, love, children, death, legacy — with key moments (first dive, lantern night, a Ward
  stop, a storm, Ward 9) launching into the 3D world and returning a result.

See `WORLD.md` for the world bible and `PROGRESS.md` for the build log, decisions and known issues.

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
npm run test:smoke     # drives the stage-1 loop (tie-up, loot, craft, trade, dive, radio, patrol, standing, save, finale)
node scripts/life-smoke.mjs 4   # plays 4 whole lives through the life-sim UI at phone size
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
| Cut / start the boat engine (quiet) | C (while piloting) | Crouch |
| Pack, craft, journal, photo, debug, pause | Tab, Q, J, K, \`, Esc | Pack, Journal, Photo, Menu |

A gamepad (standard mapping) also works: sticks move/look, A dive, B crouch, X use, Y light, LB view, RB sprint.

### Quality

Presets are **Phone**, **Standard** and **Ultra**, plus **Auto** (the default), which reads the
GPU name: phones and software renderers get Phone, discrete NVIDIA/AMD/Apple-silicon GPUs get Ultra,
everything else Standard. Change it in Options or with `?quality=phone|standard|ultra|auto`
(the old `low|medium|high` still work). A frame governor then scales render resolution between
the preset's minimum and 100 % to hold **30 fps on Phone, 60 on Standard/Ultra**
(`?dynres=0` turns it off).

| | Phone | Standard | Ultra |
| --- | --- | --- | --- |
| Pixel ratio cap / min dynamic scale | 1 / 60 % | 1.5 / 65 % | 2 / **85 %** |
| Render path | single pass, MSAA | HDR, refraction, FXAA | HDR, refraction, **TAA** |
| Sun shadows | off | 2048, 110 m | **2 cascades**: 2048 near (26 m) + 4096 wide (180 m) |
| Ambient occlusion | – | SSAO, half res | SSAO, half res, temporal |
| Reflections | sky + HDRI | planar water (35 %) | planar water (50 %) + **SSR** on wet ground |
| Volumetric light | – | screen-space shafts | **shadow-mapped volumetric sun** + shafts |
| Motion blur (Options toggle, **off by default**) | – | camera motion blur | camera motion blur |
| Sharpen (Options slider, **on, 50 %** by default) | – | CAS-style | CAS-style, slightly stronger after TAA |
| Texture mip bias | 0 | −0.25 | −0.4, plus log2(render scale) when dynamic res drops |
| Scanned textures | 1k | 1k | 1k at boot, **2k streamed in** |
| Lantern lights (pool) | 2 | 6 | 12 |
| Prop density / draw distance | 50 % | 80 % | 100 % |

### Assets

`assets/manifest.json` lists every third-party source (all CC0). To rebuild `public/assets/`:

```bash
NODE_USE_ENV_PROXY=1 node scripts/assets/fetch.mjs   # downloads into .asset-cache/ (git-ignored)
node scripts/assets/build.mjs                        # or: build.mjs textures|models|characters|hdri
```

The build transcodes textures to KTX2 (Basis ETC1S, normal-map mode for normals) at 1k and 2k,
compresses geometry with meshopt, simplifies every model to a triangle budget and adds an LOD1
(≈18 %), and trims the animation library to the clips the game uses. Download size: ≈ 6 MB of 1k
materials (+ ≈ 25 MB of 2k on Ultra), 6 MB of HDRIs, 23 MB of models, 9 MB of characters.

### People

Raft-folk and heroes are built at runtime from MakeHuman's CC0 assets (see `PROGRESS.md` §I).
Inspect them in the character viewer: `?viewer=1&who=bram&light=dusk&shot=close&emotion=amused&talk=1`
(`who` = a hero id or `npc1…npc24`; `light` = day, overcast, dusk, night, rain, backlit; `shot` =
close, mid, full; `row=1` for a crowd lineup). `node scripts/viewer-shots.mjs out/` renders a gallery.
Rebuild the kit with `MH_DATA=/path/to/makehuman/data node scripts/humans/build.mjs`.

### Nightlife, the underworld and attitude

The surface is loud: neon-and-lantern bars on every raft city, a wanted level, fast boats, eight radio stations, rival crews and one very hidden club. Everything is data-driven:
`src/data/nightlife.json` (bars, bartenders, regulars, drinks, games, jobs), `boats.json` (boat types, parked boats, ramps, safehouses, Heat tiers and crimes), `radio.json` (stations, hosts, ads, news, songs, call-ins, the coded channel), `club.json` (the Gentleman's Club and the *Under the Lamp* quest), `crews.json` (crews, the city feed, property, crew roles, heists).

- **Bars** (`src/night/`): The Brass Anchor (Portage), The Fermentary (Greentide), The Hot Rivet (Rusthold), The Quiet Cup (the Vigil — tea only), The Drowned Rat (Lowlight, hidden in fog). Bartenders remember visits, tabs and favours; regulars, a procedural live band (`audio/Band.js`), crowds that peak at the busy hour, house games (Tide Cards, Bones, Last Rope, the Bargaining Pit, arm-wrestling, Seed Count, confession), shifts and smuggling jobs. Drinking spends rations and has consequences: a drunk wobble, hangovers, brawls, pickpockets, recruiters, and a slowly building habit shown with care — the Vigil's circle is the way back.
- **Heat** (`society/Heat.js`, `crime/Ward.js`): 0–5 stars. ★ a warning boat, ★★ searchlight patrols, ★★★ boarding crews that ram, ★★★★ a blockade across your heading, ★★★★★ a drone hunt. Lose them by breaking line of sight, hiding under bridges or in fog, diving, swapping hulls unseen, bribing a stop (≤3★), or lying low in a safehouse.
- **Boats** (`vehicles/`): lofted hulls for a skiff, runabout, jet-ski, tug, hydrofoil, Lowlight runner and the Ward interceptor, each with its own speed, acceleration, turning, boost tank and hull; boost (Shift), collapsed-tower ramps, damage that slows you, a smuggler's hidden hold. Swap into parked boats (theft is a crime).
- **Radio**: Highmark Official, Raft Free Voice, Night Songs, Brass & Salt, Rustbelt Radio, The Evensong, Tide Talk, and the coded channel. Procedural songs and jingles, call-ins, fake ads, and news that reports what you did.
- **The Gentleman's Club** ("the Club", "the Gill"): a masked cabaret in the air-filled saloon of a sunken ferry, under the drowned Cape Orrin lighthouse. Most players will never find it. (No spoilers here: the quest data is in `club.json`.)
- **Crews and heists** (`crime/Crews.js`, Journal → Underworld): Lowlight Smugglers, the Welders' Syndicate, Portage Brokers, the Tideholders and the Sundials; wars and alliances, hiring a pilot/diver/forger/muscle/hacker, property income and risk, the Highmark barge heist and the harbour escape. The city feed (chalk, pamphlets, radio) makes you a legend, a villain or a ghost.
- Toggles: `?nightlife=off`, `?club=off`, `?creatures=off`.

### Mature content (18+, opt-in)

The first launch asks whether you are 18 or older. Mature content (alcohol, gambling, violence, brief non-explicit artistic nudity) is opt-in and can be switched in Options; declining swaps every flagged item for its clean version (data entries marked `"mature": true` carry a `"clean"` alternative). There are no sexual acts, nothing explicit, nothing interactive or rewarded, and the only artistic nudity is classical art in one deeply hidden late-game place.

**Publishing note:** app stores and platforms require an 18+ (or equivalent) age rating and review of mature content such as alcohol, gambling themes and nudity. Check each store's current rules and complete its rating questionnaire before publishing.

### Debug URL parameters

`?skipintro=1&time=21.5&freeze=1&weather=storm&quality=ultra&stats=1&pause=1&touch=1&debug=1&noassets=1&dynres=0`
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
  save/                 SaveSystem (versioned localStorage + migrations, export/import)
  society/              Standing (the Order of the World), Economy (per-raft prices, rations, rumours), Heat
  life/                 Life (seeded life simulation), LifeUI (phone-first cards), Scenarios (hybrid 3D moments)
  deep/                 Deep (depth zones, lanternfish, Listeners, the creeping glow)
  mods/                 JSON content packs merged at boot (see mods/README.md)
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
* **Standing** – `standing.json`: the seven tiers (wristband and dock-lamp colours, price modifiers, patrol
  behaviour, dialogue tone), Standing steps with costs and reputation tradeoffs, forgery rules.
* **The Deep** – `deep.json`: depth zones, lanternfish swarms, Listener areas, glow creep.
* **Life sim** – `life_core.json` (births, careers, activities, scenes, world text) and any `life_*.json`
  (event cards; all are merged). Card schema is documented at the top of `life_events.json` and in `life/Life.js`.
* **Bottles** – `bottles.json`: drifting messages. Lives that end in the life sim are added automatically.
* **Content packs** – drop JSON in `src/mods/` (items, recipes, events, logs, bottles, radio lines).
* `roadmap.json` documents the stubbed systems and the hook each will plug into.

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
