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

### G. Graphics pass ("10× more real")
- **Facades** (`world/WorldShader.js`): every window now has a room behind it (interior mapping: back wall, side walls, floorboards, ceiling, furniture silhouettes, doors, curtains, flooded rooms below the waterline, lit by the daylight that falls in), real window frames with mullions and transoms, sills, recessed reveals, sill drip stains, floor-slab seams, long rain streaks, patchy cure marks, grime at street level and bleaching higher up, street-canyon occlusion. Glass is dark, physically reflective (fresnel, F0 0.04), hazy with dirt, and no longer picks up the concrete normal map. No windows on roofs any more.
- **Post pipeline** (`render/Pipeline.js`, medium/high): opaque world, water and effects all go through one HDR buffer, then: multi-level bloom (bright pass + separable blurs at ½, ¼, ⅛ resolution), **sun shafts** marched through gaps between towers, **low mist that hugs the water** (exponential height fog integrated along each view ray, tinted toward the sun), subtle chromatic aberration, and a filmic grade (cool lifted shadows, warm highlights, gentle S-curve).
- **Sky**: domain-warped cloud deck with self-shadowing, silver linings toward the sun, high cirrus, distance haze; the water reflects the clouds (and so does glass, via the environment map).
- **Architecture**: stepped towers (podium, setback shaft, second setback, crowns with plant rooms and masts), roof plant.
- **Trees**: lumpy multi-blob canopies with baked ambient occlusion instead of single spheres.
- **Textures** at 512 px: cast concrete with aggregate, formwork lines and pitting; finer wood and asphalt.
- **Shadows** cover ±110 m (medium, 2048) / ±180 m (high, 4096) instead of ±70 m, so towers down the street cast shadows.
- Low quality (phones) gets the facade, sky, tree and texture upgrades; the post pipeline stays medium/high only.

### H. Maximum realism push
- **Renderer decision — WebGL2, not WebGPU.** Every world surface uses `onBeforeCompile` GLSL patches (facades with interior mapping, waterline staining, caustics, wetness, cloth, bob) and the water/sky/post are GLSL `ShaderMaterial`s. three's `WebGPURenderer` runs neither; porting would mean rewriting all of it in TSL for no visual gain on the devices that matter (WebGL2 is what phones run reliably). The debug overlay reports WebGPU availability. Ultra-tier effects were built on WebGL2 instead.
- **Presets** Phone / Standard / Ultra / Auto (GPU-name detection), **dynamic resolution** governor (30 fps Phone, 60 Standard/Ultra, hysteresis, 5–10 % steps), extended **debug overlay** (fps, frame ms, draw calls, triangles, GPU texture memory, render size/scale, downloaded MB, scanned-prop LOD counts, active post effects).
- **Ultra post**: half-res SSAO with depth-aware blur; SSR on wet, upward-facing ground (puddles) blended with fresnel; shadow-mapped **volumetric sunlight** (24-step march through height fog with Henyey-Greenstein phase); **TAA** (Halton jitter, depth reprojection, YCoCg variance clipping); camera **motion blur** (reprojection, 6 taps, clamped); **two shadow cascades** (2048 near 26 m + 4096 wide 180 m, blended at the edge); DOF focus pulls onto whoever is speaking. Standard gets SSAO and FXAA.
- **CC0 assets** (`assets/manifest.json` → `scripts/assets/fetch.mjs` → `build.mjs` → `public/assets/`, credited in `CREDITS.md`):
  - 12 Poly Haven scanned PBR materials (albedo/normal/ARM) as KTX2, 1k for everyone, 2k streamed in on Ultra; anti-tiling (second rotated sample + noise) in the shader.
  - 5 Poly Haven HDRIs (dawn/day/dusk/night/overcast) feed image-based lighting: cross-faded by hour, overcast blended by cloud cover, rotated so their sun sits on ours, normalised to the procedural sky, sun clamped out.
  - 48 Poly Haven models (lanterns, barrels, crates, jerrycans, buoys, lifebuoys, life jackets, tyres, AC units, street lamps, hydrants, barriers, a covered car, wheelchairs, med boxes, shelving, a rowboat, shrubs, ferns, roots, dead trunks, coastal rocks …): meshes joined per material, simplified to a triangle budget, LOD1 at ≈18 % added in the same file, meshopt + KTX2.
  - Quaternius Universal Base Characters + Modular Outfits (peasant, ranger) + Universal Animation Library (CC0, fetched from public GitHub mirrors since the originals are on Google Drive).
- **Scanned props** replace the procedural box props where a scan exists and dress rooftops, floors, the seabed, raft decks, St Aldren's ward and the Calla Morrow's deck. A **global instancer** draws each scanned part with two InstancedMeshes for the whole world (LOD0 near with shadows, LOD1 farther, culled beyond), so the asset upgrade costs about the same draw calls and triangles as before (≈900 calls / 0.8 M triangles across all passes at the start on Ultra).
- **People**: rigged, textured bodies with faces, eyes and hair; outfits re-bound to the body skeleton (pushed out a few mm to avoid poke-through, body triangles under clothes removed); clips for idle, walk, jog, talk, sit, sit-and-talk, kneeling work, carrying a lantern, pushing; head-and-neck look-at, blinking, per-person skin/hair/cloth variation, cheap animation for distant people, distance culling.
- **Lighting**: lantern pool sized by preset (2/6/12) with a layered flame flicker; cook-fire flicker; moonlight + night HDRI; wetness darkens and smooths every patched surface and puddles reflect on Ultra.
- **Water**: six GPU-only fine wave octaves, subsurface scattering through crests, wind-streak foam; floating debris now wanders on the current.
- **Life**: fish schools (instanced, swimming wave down the body, countershaded), leaping fish with splashes, dusk midges; tarps and laundry flutter in the wind (vertex shader); handheld camera drift, breathing tied to exertion, stride roll/yaw.

### I. Realistic people
- **Source**: MakeHuman's CC0 system assets (base mesh hm08, targets, default rig + weights, skins, eyes, brows, lashes, teeth, tongue, hair, clothes, LOD proxy) packed by `scripts/humans/build.mjs` into `public/assets/humans/` (13.6 MB binary kit, ~8 MB gzipped; 17 MB of KTX2 textures). Animation: the Quaternius Universal Animation Library (CC0), retargeted at runtime. No Ready Player Me, Mixamo or Sketchfab assets (Mixamo's terms forbid redistributing raw files; Sketchfab wasn't reachable from the build machine).
- **People from parts** (`src/humans/Roster.js`): sex, age 13–85, muscle, weight, mixed ancestry, height, ~20 random face/head dials from 454 targets (nose, mouth, chin, cheeks, eyes, ears, forehead, head shape, neck), symmetric eye/cheek/ear pairs plus a little asymmetry, 21 skin sets tinted across the full tone range, 10 iris colours, 12 brow and 4 lash sets, 9 hairstyles (afro, braid, ponytail, bob ×2, long, short ×3) or shaved, beards/stubble, freckles, scars, forearm tattoos, faded community-dyed clothes with salt lines and patches, Standing wristband. Seeded by NPC id, so the same person is always the same.
- **Heroes**: Wren, Teo, Madam Oru Vance, Elder Tamsin Koa, Bram Hollis, the Keeper, Captain Marlow, Madame Ondine, Chancellor Idris Calloway, Director Halden Voss, Mother Ansel — fixed faces, styling and default mood.
- **Faces**: 34 FACS-style expression blendshapes evaluated from one shared delta texture (no per-person morph memory), driven by emotion presets (calm, worried, angry, amused, tired, suspicious, sad), text-driven lip-sync (visemes with co-articulation), blinks (single/double, faster while talking), saccades, gaze on the player, lids that follow the eyes, pupils that react to light, micro-expressions, idle drift and resting asymmetry. Brows, lashes, teeth and tongue get the same deltas through their fitting references, so blinks close the lashes and speech moves the teeth.
- **Shading**: skin with procedural pores, backlit translucency through thin areas (baked per-vertex thickness), a faint scatter at the light edge, blush/under-eye/lip zones, oily T-zone, age/weathering, rain wetness and sweat; eyes with re-centred iris, pupil dilation, limbal ring, warm sclera, lid shadow and an additive wet cornea; hair as an opaque core + soft blended fringe with volumetric normals, Kajiya-Kay highlights, wind sway and wet darkening; cloth re-dyed and sun-faded, logos removed, salt lines, patches, rain darkening.
- **Bodies and motion**: skeleton rebuilt per person from the morphed joint landmarks; clips (idle, walk, jog, talk, sit, sit-talk, kneeling work, carry lantern, push, swim) retargeted with rest-pose alignment toward the next mapped joint; breathing, personal head tilt and shoulder set, idle weight shift, a world-space head/neck aim for eye contact; walk speed matched to the clip to avoid foot sliding.
- **Crowds/LOD**: people are built lazily (one per frame) as you approach; full detail near, LOD body (741-vertex proxy) and no small face parts beyond 20 m (8 m on Phone); distant people animate at 10 Hz; culled beyond 90 m (45 m on Phone).
- **Character viewer**: `?viewer=1` (`&who=bram&light=dusk&shot=close&emotion=angry&talk=1&row=1&pose=rest`), and `node scripts/viewer-shots.mjs` for galleries.
- **Honest limits**: no hair-strand physics (sway is a vertex shader), no cloth simulation on coats/scarves (MakeHuman clothes are skinned meshes), no IK foot placement (raft decks are flat; walk speed is matched instead), no hats or head wraps (the one CC0 hat fitted badly), no locs, wet-skin droplets are a shading change rather than geometry. The source skins are 2K albedo only; detail normals and roughness are procedural.

## K. Nightlife, underworld and attitude
- Bars and night economy: five bars with personalities, bartender memory and dialogue trees, regulars, crowds and bands on schedules, drinks economy (homebrew = smuggling product, Highmark-banned drinks), tabs, house games, shifts and courier jobs, drunk/hangover/habit with the Vigil as the way back, brawls/pickpockets/recruiters. Two new raft cities: Lowlight (fog bank) and the Vigil.
- Heat as 0–5 stars with escalating Ward response (boats, ramming and boarding, blockade, drone), escape routes (line of sight, hiding, diving, hull swaps, bribes, safehouses).
- Boats: lofted hulls and seven types with arcade-readable handling, boost, ramps, damage, hidden hold; parked boats to steal/swap.
- Radio: eight stations with hosts, segments, procedural songs/jingles, call-ins and the coded channel.
- The Gentleman's Club: drowned-lighthouse hatch, amber lanternfish signal, the Under the Lamp quest, door check, masks, eavesdropping minigame, Ondine's favours, Club jobs, the raid-and-flood escape, the overheard Cathedral scene, the vault (mature-flagged art with clean versions).
- Crews, feed, property and heists (Highmark barge, harbour escape).
- Age gate + Mature toggle. "Gilded Gill" appears nowhere in the codebase; the Club's nickname is "the Gill".
- Honest limits: the Club's sea view is a painted window shader; raid guests are counted through the tunnel rather than individually animated; heists are stage-based objectives, not scripted cinematics; boat chases use the existing physics plus ramps and boost.

## L. Living NPCs
- Personality model (10 trait sliders, seeded where not authored), jobs, bunks, friends/rivals/partners/family, habits, fears, wants, secrets, speech styles for 20 Portage residents (9 new). Needs and moods drive the routine through NPC overrides; storms, hunger, injury and grief bend it.
- Risk decisions with an incident budget; NPCs are prey for creatures (Creature perceives actors with the same senses as the player); 3 system-driven scenarios (Siltwolf roof, Net-Weaver dive, Tide Crab nest — the Tide Crab is now a real creature). Player interventions: warn, distract (existing tools), rescue.
- Outcomes, memory, learning (caution up, or down if proud), injuries with recovery, death → grief, funeral, replacement, rumours, reputation; dialogue lines from memory in each speech style; NPC-to-NPC chatter.
- LOD: visible actors only near the player and capped at 2; abstract resolution elsewhere; NPC sim quality toggle (Light on Phone).
- Headless test (`scripts/people-test.mjs`): wolf → killed (grief for friends), Net-Weaver → killed, crab → escaped with a scare. After that run, territorial creatures were changed to usually break off once the intruder is down.
- Stubbed in data: Greentide and Rusthold residents' personalities; NPC excursions between rafts (bar visits) are not walked, only scheduled.

## M. Weapons
- `src/data/weapons.json`: 8 melee (rebar spear, boat hook, fire axe, galley cleaver, hand harpoon, chain-wrapped pipe wrench, oar club, sea-glass knife), 7 ranged (speargun, flare pistol, nail-gun rifle, truck-spring crossbow, sling, pipe shotgun, bolt-action scrap rifle), a thrown net, 7 ammo types, mods, five crew styles, three vendors (Hook & Barb and Sal's back room at Portage, the Anvil at Rusthold), the law.
- Look (`weapons/WeaponKit.js`): built from parts per weapon + its three mods (grip, head/barrel, wrap): ribbed rebar, lathe ferrules, extruded blades and jaws, tape bands, rope/wire helices, chain links, weld beads, sea-glass beads, rivets, crew tags, painted tally/scripture/stencil decals. Shared PBR materials per role and style with a wear layer (rust, salt crust, chipped paint, oil sheen) driven by condition and salt.
- Systems (`weapons/Arms.js`): viewmodel; light/heavy (hold) swings with weight-based speed and stamina, block (RMB), shove (Y), net (U); ranged fire with ammo counts, reload/clear jams (T), ADS zoom with sway from fatigue and injury; hit-stop, camera nudge, material sounds; noise radius → creature senses and Heat near the Ward / in Highmark waters; flare pistol feeds the creature light/flare system; wounded-creature reactions by species; jams and fouling from salt and wear; maintenance at vendors/benches; NPC reactions to drawn weapons (anger, fear, run, call for help); bar no-weapons rule with bouncer ejection; the Club confiscates at the door; unlicensed weapons draw Heat when the Ward sees them in Highmark waters; vendors reluctant with a villain reputation and refusing at 2+ stars; subduing vs killing named NPCs (grief, rumours, funeral, crews remember). Gamepad hook: `arms.pad.setTrigger/rumble` (DualSense adaptive triggers not implemented).
- `scripts/weapons-test.mjs`: 8/8 pass (damage, wounded reaction, noise waking a creature vs a quiet weapon, jams, wear, NPC reaction, bar rule + ejection, Club confiscation).

## N. Controller (PS5 DualSense)
- `src/input/Pad.js`: Gamepad API layer. Radial deadzone + power curve, look sensitivity X/Y, invert Y, aim assist (slow-down + capped magnetism, only while the stick moves). Remappable bindings (swap on conflict; Options cancels) saved in settings and the save file. Last-used device switching (`body.pad-mode`), connect toast, disconnect → pause. Hold-to timers for Triangle (inspect) and R1 (holster); L3 sprint latch; D-pad weapon wheel with time slowed; quick items; radio stations on the boat; touchpad chart; Create photo.
- Menus: one focus navigator for every DOM screen (panels, title, age gate, life sim screens and cards, photo bar): spatial D-pad / stick navigation with key repeat, sliders adjust on left/right, Cross confirm, Circle back, L1/R1 tabs, right stick scroll, a highlight and a prompt strip in pad mode.
- `src/input/glyphs.js`: original line-art glyphs (face buttons, shoulder pills, sticks, D-pad, touchpad) and keycaps; prompts, the HUD prompt bar, pause/options help and onboarding hints switch with the device.
- `src/input/DualSense.js`: WebHID output reports (USB 0x02 / Bluetooth 0x31 + CRC32) for triggers, motors and light bar; everything in try/catch; `weapons.json → triggers` defines each weapon's trigger feel.
- `scripts/controller-test.mjs` (mocked DualSense): **7/7 pass** — deadzone/curve (10 checks incl. live stick), button map (18 actions), device switching, disconnect pause, menu navigation (every control reachable on 14 screens + journal tabs via R1 + Club door answered with Cross), remap save/load, extras safe without hardware.

## O. Smoothness and boat exits
- Title menu: its own tiny backdrop scene (50% res, 30 fps, no lights/post/world); the world is built only after a menu choice, behind the loading bar with shader + texture warm-up (hidden creatures included). Menu 0.5 → 30 fps (headless).
- Fixed point-light pool (no shader rebuilds when lights stream in), camera far plane at the fog distance, Light preset view 600 m / sparser props, unsubdivided creature bodies on Light, submerged creatures not drawn when the water is opaque, one chunk built per frame, dynamic resolution (>20 ms for 1 s → −10%, floor 60%), safe mode (<25 fps for 5 s → one preset down, save and resume).
- F3 overlay (fps, 1% low, frame ms, draws, triangles, what you're doing, area) and F4 frame log download (per-frame ms, draws, triangles, shader compiles, texture uploads, chunk/landmark loads, likely GC, 10 worst spikes with causes).
- Leave the boat anywhere: E / Triangle (dock in focus wins); slow → nearest dock/raft edge within 6 m else into the water; fast → dive off. Emergency exit: hold Esc / Options 1 s. Canopy hidden in first person; creatures kept out of the hull.
- Tests: `scripts/boat-test.mjs` 7/7, `scripts/route-perf.mjs --limit=MS` (scripted route), `scripts/stall-probe.mjs` (first 5 minutes), `controller-test` 7/7, `weapons-test` 8/8.

## P. Overnight pass (smoother, more real, livelier) — see OVERNIGHT.md and MORNING_REPORT.md
- Smoothness: per-place background shader warm-up, Standard by default on dedicated GPUs, fewer per-frame allocations, light-pool and safe-mode fixes. Water no longer blows out to white. Facades: boarded windows, rust, cracks, moss; wood decks: joints, patches, stains. NPCs: calm step-aside, run only from real threats, no hovering sitters. Boats: planing, drift, FOV push, weathered hull, wake hiss / hull slap / strain / splash. Portage: vendor callouts and three hidden things. Bug sweep: 20 fixes. Tests: portage-test added; all pass except a pre-existing creature-test raid failure.

## Q. NPC realism + raft collision — see NPC_MORNING_REPORT.md
- Raft/dock/parked-boat collision with a swept three-point hull; face/body consistency (presentation, facial hair, voice pitch) with a 523-person trait test; skin/eye/hair/clothing shader passes; procedural work and body-language layers with seats and props; Manners (gaze, greetings with memory, pair chats, world reactions).

## R. The Hunters (two fictional serial killers) — see OVERNIGHT.md
- The Netmaker (Garrick Sole, net-mender at Rusthold; lair: a half-sunk barge) and the Lamplighter (Quillon Ferris, lamp-trimmer at the Portage chapel; lair: a sealed flooded floor of a drowned tower). Data in `src/data/killers.json`; logic in `src/killers/Killers.js` (slow 1 s tick); lairs in `src/killers/Lairs.js` (streamed within 140 m). Investigation journal tab with a theory board. Debug: `?killer=netmaker|lamplighter` (teleport to the stumbled-on entrance), `?killerdebug` or F6 (identity, plan, target, alibi, suspicion), `?killerlog`, `?killers=off`.
- Tests: `scripts/killers-test.mjs` (13 checks), shots: `scripts/killer-shots.mjs`.

## Known gaps
- **Hunters, untested in real play:** every behaviour is tested by driving the system directly (simulated days, forced strikes, forced witness moments). Nobody has played a multi-day investigation end to end; pacing (4+ days between events, ~3–5 events per 120 nights) is checked numerically, not by feel.
- Hunters: the killers' night figures are silhouettes (a dark capsule body and head; the Lamplighter's brass helmet and lamp), not the full human rig — by day they are full humans. The night-hunt figure walks over water at your height rather than rowing or swimming.
- Hunters: entering a lair is a cut (interact → you're inside), not a crawl through the grate or a dive through the window. Interiors are simple procedural geometry; the nets are wireframe planes.
- Hunters: the 'witness' line of sight is a single ray; the witness moment is a 6-second scripted drag. The "stay silent / run / hide / intervene" outcomes are classified from movement, light and distance, not from a crouch or a hiding spot.
- Hunters: victims come only from Portage's simulated residents (the Living-NPC pool); Rusthold and Greentide have no simulated residents to take. Framed NPCs are talked about (rumours, memory) but there is no mob scene.
- Hunters: the 'radio' clue is granted after 40 s of listening once something has happened; the news line is also added to the station's rotation but the clue doesn't wait for that exact line to play.
- Hunters: screenshot 4 (night approach, silhouette) missed its subject — the dock and its lamp are in frame but the figure is too small and the camera sits at the waterline among fish. Shots 1–3 are on subject. None judged on a GPU.
- creature-test `raid` fails (pre-existing, also at the start of the overnight pass): the flashlight never counts as "in the beam" for the gull-rat swarm, so they aren't driven off by light. Needs a look at Senses.lightOn vs the pack position.
- People: leaning, laughing, sweeping, carrying, mending, fishing and rope-hauling are procedural arm layers over the 15 mocap clips (no real mocap; legs don't take part; hands don't grip). Seats are crates placed under sitters. Face/skin/eye shading changes not judged on a GPU.
- **Boats (next boats pass):** the skiff is a flat green hull with little surface detail (no planking, wear or fittings); the canopy is hidden from the driver's seat rather than modelled for first person.
- **Performance, GPU-only:** every frame-rate figure in this repo comes from headless Chromium rendering on the CPU (SwiftShader), roughly 0.5–1 fps for the game. Draw calls, triangles, shader compiles and CPU-side logic times are real; frame rates on an actual GPU were never measured here. Use F3/F4 on a real PC to get them.
- Performance: the Light preset still draws ~590 draw calls / ~560k triangles at the start (large landmark meshes and nearby raft cities, single-mesh hospital and Sounding). Merging and LOD for landmarks and raft cities is the next lever.
- Performance: a few shader programs (≈1–5 per route) still compile the first time some effects appear mid-play; the F4 log names them.
- **Controller, untested on hardware**: no real DualSense was available. Adaptive triggers, motor haptics (footsteps, engine, heartbeat, rain, impacts), the light bar and the WebHID report layout (USB and Bluetooth/CRC) are written from the community-documented format and have never driven a real controller. Standard `vibrationActuator` fallback is only checked against a mock.
- Controller: stick feel (deadzone, curve, look speed, aim-assist strength) is untuned — values were chosen, not play-tested. Button labels assume a standard-mapping pad (Chrome/Edge/Firefox on PC report the DualSense this way; Safari and some Linux setups may not).
- Controller: WebHID linking needs a mouse click on “Link DualSense” (browsers require a user gesture; a pad button may not count). Audio unlock on the very first launch may also need one click or key press, because browsers may not treat gamepad input as a user gesture.
- Controller: the Underworld journal tab opens the crews board, which has no tab row, so L1/R1 stops there (Circle closes it). Text fields (journal notes) need a keyboard; there is no on-screen keyboard.
- Controller: Standing cards are not a separate screen in this build (the Investigation board is now a journal tab, shown once a case opens) (Standing is shown on the wristband and in the life sim, which is navigable); there is no lean action, so L1 is the flashlight.
- NPCs don't walk between rafts (bar visits are schedule-only; bar crowds are separate NPCs).
- Greentide and Rusthold residents have no personalities yet (data stubs).
- Phone frame rate not measured on a device or the Phone preset since the creature, nightlife and NPC passes; triangle counts in shots reach 2–3.5 M on Ultra.
- Weapons, untested in play: feel of melee timing and hit-stop, ADS sway values, the inspect turntable on real GPUs, ranged hit detection at range (uses a cone test, no ballistic projectiles except visual tracers), net throws, mods' look on every combination, vendor UI flows, saving/loading owned weapons, block reducing creature damage, unlicensed-weapon Heat, killing a named NPC end to end. DualSense adaptive triggers are now wired (see the controller gap above).
- Weapon wear shares materials per crew style, so two weapons of the same style show the same wear.
- No glTF export of weapons: they are built procedurally at runtime from cached part geometries (cheap, but not glTF assets).
- Jellyfish bell still shows a small gap at the top.
- Creature behaviour tests (`creature-test.mjs`) not rerun since the NPC-prey and creature changes.

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
