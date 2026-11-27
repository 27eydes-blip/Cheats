# PROGRESS — Drowned Earth

Overnight build log. Newest stage at the bottom of "Stages"; final report at the end.

## Stages
### A. World bible, Standing, raft cities, economy, heat, patrol — done
- `WORLD.md` holds the full bible (map rings, five raft cities, Highmark, the truth, Standing tiers, creatures, radio, endings, set pieces).
- Renamed Kettle Drift → **Portage** (Madam Oru Vance). Added two satellite rafts built by the same data-driven raft system: **Greentide Seedboat** (Elder Tamsin Koa) and **Rusthold Tender** (Bram Hollis). 14 named NPCs.
- **Standing** (`data/standing.json`, `society/Standing.js`): tiers 1–7, wristband HUD with dive tally, reputation per faction, Standing steps (Drifter tag from Sal, Trader permit from Vance) with costs and reputation tradeoffs, forged tags that can be exposed.
- Standing in the world: coloured dock lamps; the Exchange Dock refuses Deep-Born (dockmaster line); Odile overcharges Deep-Born (×1.45); the Keeper, Vance, Koa and Bram treat you the same regardless; NPCs keep a wider distance from Deep-Born; Ward stops search/seize by tier.
- **Economy** (`society/Economy.js`): four currencies (scrap, seals, salt, glass), per-raft price multipliers by item tag for Portage/Greentide/Rusthold, supply & demand from your trades, rumours (storms, harvests, crackdowns, ration cuts), a weekly ration level shown on a ration board on every raft.
- **Heat** (`society/Heat.js`) + **Tide Ward patrol state machine** (patrol → suspicious → search → chase → stop): searchlight cone with line of sight, boat noise (C cuts the engine), lamps, fog. Boarding inspection with comply / bribe / flee.
- **Boat upgrades** at Rusthold: baffled engine (quiet), rebored engine (fast/loud), hull plating, bow spotlight.
- Set pieces wired: lantern-boat festival at dusk on Portage, fog-bound patrol run on the first night, midnight storm that tears Low Row loose (tow it home), the Beacon's sweep answered by a tone from the Deep, Ward 9's flooded basement with glowing growth, a Bloomwalker and Teo's dive tag.
- Teo thread: recordings at Linden Court and in his dive bag at Rusthold, his tag in Ward 9, a request on the Night Songs radio station.
- Radio: 6 stations (Highmark Official, Raft Free Voice, Vigil Evensong, Lowlight 3.3, Night Songs, static) with broadcast hours and lines that change with flags and heat.
- Procedural music (`audio/Music.js`): sparse by default, regional colour, swells on discoveries and the festival, silence under danger.

### B. Life-sim layer — done
- `life/Life.js`: seeded life simulation (same seed → same life). 12 stats, 5 resources, reputation with 8 factions, Standing tier, careers with ranks/pay/promotions/hazards, relationships that age and die, world simulation (glow, rations, uprising, leaders who die and are replaced), death from health/old age/events, life summary, continue as your child with inherited traits.
- Content (`data/life_core.json`, `data/life_events.json`): 8 birth origins (Portage, Greentide, Rusthold, the Vigil, Lowlight, a Drifter boat, the Deep-Born crews, and a rare 4% Highmark lower-ring birth), **24 careers** (raft, outlaw, Highmark, Ward, deep), 9 activities, **156 event cards** across childhood, teens, adulthood and old age, plus repeatable career cards and rare cards. Four ending cards (shut down / expose / join the Concord / free the Cathedral).
- `life/LifeUI.js`: phone-first UI (390×780 tested): profile bar with wristband, stat bars, tabs (Life log, You, People, Work, Do, World), big AGE UP, worn-paper event cards, a timing-needle mini-game for skill choices (with Auto), death summary.
- `life/Scenarios.js`: **6 hybrid 3D moments** launched from cards — first dive (Linden basement), lantern festival, fog patrol stop, the storm breakaway, the Ward 9 quarantine dive, and free time on the water. The 3D world is snapshotted, staged, judged and restored; the result returns to the life log. "Skip — let fate decide" rolls against the relevant stat.
- Title screen now offers Continue / The Drowned District (story) / A Life on the Water / Options, over a slow cinematic dawn flight across the district, with a procedural stencil logo.
- Options: quality, difficulty (Calm/Standard/Harsh), text size, sound captions, subtitles, reduce motion, colour-safe indicators, high contrast, one-handed touch layout, lens effects, music level.
- Tests: `scripts/life-smoke.mjs` plays whole lives through the UI with random choices and fails on console errors (4 lives to old age, clean).

### D. The Deep — done
- `deep/Deep.js` + `data/deep.json`: four depth zones (Sunlit Shallows, Drowned Streets, the Dark Shelf, the Abyss) each with its own water colour, fog density and pressure drain on your air (no pressure suit in stage 1, so the Abyss is a wall). The wrist gauge names the zone.
- **Lanternfish swarms** (GPU points) in the Sounding, the subway tunnel and Ward 9; each swarm goes dark when a Listener comes within ~28 m.
- **Listeners**: pale, many-limbed shapes that drift in two areas and hunt by sound only (fast swimming, a clinking spare tank, the boat engine overhead, the sonar pinger). They keep their distance from a still, quiet diver. Contact is dread, not damage: a shake, a moan, air knocked out of you, and it lets you go. The music falls silent when one is near.
- **The glow creeps**: 520 growth points from the Sounding pit out across the city; the depth they reach rises with a world glow level (+7%/day, +25% after the finale), so after day 2–3 it reaches the drowned streets.
- Dive gear: spare air bottle (double breath, louder), sonar pinger (finds salvage, wakes things), pressure suit stubbed.

### E/F. Journal, photo mode, debug, onboarding, lens — done
- **Journal** (J): tabs for On your mind (Teo thread + side threads + your own notes), a **hand-drawn chart** that fills in as you explore (fog of war, your pencil route, landmark doodles, compass, Highmark's bearing), Writing (logs), Photos, People met, Rumours, Help.
- **Photo mode** (K / Photo button): freezes the world, hides the HUD, free look, five filters (memory, silver, cold, lantern), depth of field focused on screen centre, photos kept in the journal (12, localStorage).
- **Debug panel** (\` or `?debug=1`): FPS, draw calls, triangles, memory, time, weather, Standing, heat, glow, patrol state, position; teleport to every landmark; time/weather/heat/scrap/glow/tier/finale buttons.
- **Onboarding**: no text dump; one-time context hints that adapt to touch or keyboard (look, climb in, stairs, dive, flashlight, board, steer, Standing, patrols, photo/journal). Help page holds all controls.
- **Lens & post**: droplets on the lens after surfacing and in rain, condensation at the edges when cold, tunnel vision on low air, soft bloom on lanterns and the Beacon, film grain (all behind the "Film grain & lens effects" option).

### Extras from the expansion packs (small, real versions)
- **Messages in bottles** (`world/Bottles.js`, `data/bottles.json`): seven bottles drift in the district. When a life in the life sim ends, its epitaph is set adrift and washes up in later story playthroughs.
- **Memory pool** in the Cask Street tunnels: touch the warm water, hear the last tram, in a sepia-blue filter.
- **Companion gull**: share fish with the bent-winged gull and it rides your bow; it flies off near the Deep.
- **Daily tide**: a date-seeded life ("Today's tide") so everyone can live the same life on the same day.
- **Gamepad** (standard mapping), **haptics** on phones (impacts, tremors, blackout), **save export/import** (pause menu), **content packs** (`src/mods/*.json` merged at boot, with an example pack).
- `data/roadmap.json` documents every stubbed system and the code hook it plugs into (Tide Clock, star navigation, Voice of the Deep, rituals, memory dives, Long Dark Night, ghost rafts, crews and boat classes, player rafts, societies, justice, NG+, cloud save, key rebinding).

### Polish passes
1. Fixed: boat teleporting 13 km on spawn inside a building (hull push-out bug), the far layer (Highmark) showing through from underwater, splash particles reading as smoke columns, underwater light shafts radiating from the floor and showing in tunnels, the title logo clipping, HUD showing over the title, patrol beam washing out the screen in fog, lanternfish too small to see, the glow material blowing out to white, festival lanterns drifting too far too fast, raft-city shot positions, the start view facing the tower wall.
2. Performance: growth instances drawn only up to the visible count (1.0M → 0.35M triangles at the title), small props on a detail layer skipped by the reflection pass, instanced props don't cast shadows. Audio: water footsteps in shallows, hull creaks with speed, a 3-second silence before the finale.

## Verification (final run)
- `npm run test:shots` — 12 scripted views (title dawn, dawn, midday, dusk festival, fog patrol, Dark Shelf dive, Portage from the Crow, Ward 9 basement, Beacon at night, midnight storm, phone 390×780 on low quality, third-person dusk): **0 console errors**. Images in `screenshots/`.
- `npm run test:smoke` — drives the story loop end to end (tie-up, loot, craft, logs, swim/dive, radio, docking at the red lamp, dialogue, trade, workbench, patrol inspection, Standing step, Listener hunt, journal + photo, life-sim ageing, sleep, save/load, the Keeper's decoding, storm, finale): **passes, 0 errors**.
- `node scripts/life-smoke.mjs 4` — four whole lives through the phone UI with random choices, including skipped 3D scenes: **passes**.
- `npm run build` and `npm run validate:data`: pass.

## Decisions (and why)
- **Story mode and life sim are two doors into one world.** The 3D stage is the immersive slice; the life sim is the long arc. Scenes launched from the life sim snapshot and restore the 3D world so neither corrupts the other's save, while both live in one versioned save file.
- **Seeded everything.** World chunks, loot, lives and the daily tide all derive from seeds, so content is reproducible for testing and shareable as a seed.
- **Standing is data, consulted everywhere** (docks, prices, dialogue, NPC distance, patrol behaviour), so new tiers or rules are a JSON change.
- **Listeners hunt by sound only, and contact is dread, not damage.** It keeps the tone guardrails (no gore, no cheap scares) while making noise a real choice.
- **Kept the 3D cost bounded on phones**: low quality skips reflections, shadows and the HDR pipeline (≈110–250 draw calls); desktop medium/high spend it on reflections.
- **Hand-drawn chart without real handwriting fonts**: the chart uses cursive fallbacks; it reads as hand-lettered on most systems.
- Kept the name **Highmark** (the bible uses it). The lighthouse is **The Beacon**.

## Known issues
- Frame rate was only measured in headless software rendering (~1–10 fps there). Real-device FPS still needs checking; low quality is the phone default.
- The life sim has 156+ cards; long lives can see a few repeat career cards. More content is the main lever.
- NPCs and buildings are stylised low-poly; faces are minimal by design but read as blank at very close range.
- The patrol pathing is straight-line with collision push-out; it can scrape along buildings in tight streets.
- Rope-bridge collision is a flat walkable strip; the visible sag means feet float a few centimetres at mid-span.
- Some interactions (climbing out onto rafts from the water) need you to swim straight at the deck edge.
- Sounds were verified to play without errors but were not listened to by ear in this environment.

## Next steps
1. Act 2 (Greentide) and a larger map: stream a second district and a Greentide raft city using the existing generators and raft data.
2. Player raft building on top of `Raft.addPiece()`; boat classes and crew.
3. The Voice of the Deep hydrophone decoding mini-game (unlocks ending d).
4. More life-sim content (target 500+ cards), relationships with memory of specific deeds, NPCs from the bible appearing as recurring characters across lives.
5. Real-device profiling pass (mid-range Android, iPhone) and a dynamic resolution scaler.
6. Rebindable keys UI, controller glyphs, localisation pipeline for the JSON text.
