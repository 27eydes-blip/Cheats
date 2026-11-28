# Overnight pass — decisions and log

Unattended run. Rules: no new features; tag before each phase; revert a phase that breaks the build, fails a test twice, or costs >10% draw calls / triangles on the Light preset; record numbers after every phase.

## Setup decisions
- **Tags are local only.** The sandbox's git proxy only accepts pushes to the working branch (`claude/drowned-earth-setup-qrbtm7`); pushing tags was refused. Rollbacks use the local tags; every phase is also its own commit on the branch, so any phase can be reverted from GitHub history too.
- **Measuring without a GPU.** Headless Chromium renders on the CPU (SwiftShader). Frame rates measured here (~1 fps) only compare builds roughly. The budget is enforced on **draw calls and triangles** (exact, from `renderer.info`) and shader compiles, plus logic time; visual quality cannot be judged here beyond screenshots.
- **Route** (`scripts/route-perf.mjs`): menu → standing at Linden Court → walking on the Portage market deck → boat across open water → sailing into Portage → sailing to Cask Street. Light preset, 640×360.
- **Per-phase test set:** build, data validation, boat-test, weapons-test, controller-test, route-perf. Full set (smoke, life-smoke, people, creature) at the end.

## Added by the player mid-run
- After the last phase: a **major bug sweep** (independent code reviews of the systems changed tonight, then every test script, fix what's found) and a **full smoothness test** (route-perf + the 5-minute stall probe), reported in MORNING_REPORT.md.

## Phase 1 — smoothness ✅ kept
- Changes: background shader warm-up per place as you approach (≤380 m, one per frame, hidden people/LOD meshes included); first-run default = Standard on a dedicated GPU, Light otherwise (rule 4; safe mode still drops to Light); scratch vectors instead of per-frame allocations in swimming/raft riding. Title screen was already cheap from the previous pass (own backdrop, 30 fps, 50% res, world loads after the menu).
- Mid-play shader compiles on a Portage walk + boat + dive: 9 frames with up to 7 programs → 4 frames with 1–2 (the rest are objects created on arrival).
- Gate: build, data, boat 7/7, weapons 8/8, controller 7/7 — all pass.
- Route (Light, draw calls / triangles), baseline → after: standing 589/628k → 571/622k · Portage walk 401/647k → 420/706k (+9% tris, camera-path variance, under the 10% budget) · boat 684/703k → 548/674k · raft city 563/553k → 550/578k · Cask Street 559/706k → 454/619k. Worst frame (CPU rendering) 2.3–2.9 s → 1.2–1.6 s (baseline was measured with a dev server competing for CPU, so part of that is noise).

## Phase 2 — water, sky, light ✅ kept, deployed as checkpoint
- Decision: the water shader already had a depth/scatter colour gradient, three normal scales, foam at walls/crests/wake/wind streaks, rain rings, sun glitter and point-light streaks, and the sky already had cloud layers and time-of-day colour. The real defect was **water blowing out to white** at mid-distance on hazy days (grazing Fresnel reflecting a bright haze sky, then fog adding more haze). Fixed that instead of piling on effects: Fresnel capped at 74%, reflected sky darkened/tinted, sun glint clamped, final colour clamped before tone mapping, fogged water slightly darker than the haze so the horizon reads.
- Light preset: dynamic resolution never drops below 80% (it was 60%). **No sharpen added on Light:** Light has no post-processing pass, and adding a full-screen pass just to sharpen would cost more than it gives; Standard/Ultra already have the CAS sharpen. Light applies no blur pass of any kind.
- Judged visually from software-rendered screenshots (midday + dusk, before/after): midday water now stays blue-grey to a visible horizon; dusk keeps its warm sun path. Exposure/tone mapping left as is (ACES; no blown highlights visible in the shots). **Not judged:** how it looks on a real GPU at 1080p+, and Standard/Ultra's refraction/reflection passes (not exercised in the shots).
- Gate: all pass. Route draw calls/triangles unchanged from phase 1 (572/622k, 420/706k, 548/674k, 550/579k, 457/621k).

## Phase 3 — buildings and docks ✅ kept
- Decision: shader-only (no new geometry) to stay inside the budget. The facade shader already had weathering, rain streaks, sill drips, framed windows with interiors, broken/lit/curtained windows, vines and waterline bands. Added: boarded-up windows (planks across the pane, ~6% of windows high up rising to ~36% on the lowest floors), rust streaks under window fixings on some buildings, sparse hairline cracks, moss on ledges and roofs. Wood decks (already separate plank boxes with gaps and tone) got board-end joints, the odd patched board, water stains and worn walkways, in the box's own coordinates so they ride with bobbing rafts.
- "Flat grey box up close": checked — distant towers use the same facade shader (windows fade with distance and haze); no missing-texture case found on the route. Steel and asphalt barge decks (e.g. the Portage market) are deliberately not planked.
- Not done (would add geometry or new props): balconies, rooftop tanks/antennas/laundry, collapsed corners, extra dock props (rope, crates, nets, lamps) beyond what the raft kit already places.
- Judged: the plank deck in a software-rendered close-up (reads as boards; worn spots slightly busy). **Not judged:** the facade additions up close — the test shots only caught towers at a distance.
- Gate: all pass. Route draw calls/triangles unchanged (shader-only).

## Phase 4 — people ✅ kept (with one budget judgment call)
- Panic removed: the "keep a polite distance" step-aside used the jog animation at 1.4 m/s, which read as fleeing. Now a calm walk at 0.8 m/s. NPCs only run when they have a real reason (`npc.fleeing`, set when a drawn weapon scares them). Head/eye tracking toward the player within ~6 m already existed and is unchanged.
- Hovering sitters fixed: the raft kit has **no seat geometry at all**, so every sit/fish pose floated. Sitters now stand (idle), fishers stand watching the water, sleepers are inside their shelters (hidden) instead of lying on air.
- Animations that exist (15 clips): Crouch_Idle, Driving, Fixing_Kneeling, Idle, Idle_Talking (talks with hands), Idle_Torch, Interact, Jog, PickUp_Table, Push, Sitting_Idle, Sitting_Talking, Swim_Fwd, Swim_Idle, Walk. **Missing** (would need new animation assets, which tonight excludes): leaning, laughing, sweeping, carrying crates, a standing fishing pose, a proper sit-on-edge pose.
- **Not done:** skin/eye/hair/clothing shading changes. A software-rendered face close-up wasn't good enough to judge subtle shading, and blind changes to faces risk making them worse — left for a session with a GPU and real screenshots.
- Gate: all pass + people-test (3 scenarios, no errors; outcomes escaped/killed/escaped as before).
- Budget call: raft-city draw calls 550 → 609 (+10.7%) while the other route phases fell 10–25% in the same run (Cask Street 456 → 340); route total 2546 → 2396 (−6%). Nothing in this phase adds geometry (it hides sleepers and swaps poses), so this is the route's real-time variance (phases are timed, the boat ends in different spots). Kept; flagged here.

## Phase 5 — boats ✅ kept
- Handling (most already existed: wave pitch/roll, bow-up under throttle, lean in turns, airtime off ramps): added a planing hump (bow climbs at 2–5 m/s, levels once planing past ~7 m/s) and a drift on hard turns above 6 m/s (side grip drops so the stern slides).
- Camera: FOV widens up to +9° with speed and a slight wave judder scaled by how hard the hull pitches; both off with Reduce motion, and FOV is left alone while a weapon is drawn (ADS owns it).
- Look: a weathering shader on every hull (patched panels, grime/weed band at the waterline, rust bleeding from the gunwale, paint worn through on the top edge). The canopy was already hidden in first person. **Not done:** a new detailed boat model (rope coils, lantern rework, deck detail) — that's modelling work beyond "improve what exists"; wake/bow spray stay as the existing water ripples + wake foam.
- Sound (engine with RPM, paddling, hull creak, foghorn already existed): added a wake hiss that rises with speed, water slapping the hull (faster in waves/wind), engine strain under boost and when the throttle outruns the hull, and a splash when you dive or drop off the boat. **Not heard** — no audio output here; only checked that it runs without errors.
- Bug caught by the screenshot run and fixed before the gate: the new wake hiss used the wrong node field and threw every frame.
- Gate: all pass, boat-test 7/7 (E/Triangle still leaves the boat). Route: standing 571/622k · walk 390/596k · boat 386/581k · raft city 455/541k · Cask 442/599k (all at or below phase 4).

## Phase 6 — Portage life ✅ kept
- Already existed: schedules by time of day for 20 named people + crowds, a living-NPC society with incidents and chatter, gulls, bar bands and crowd murmur, boat traffic (fleet), bartender talk.
- Added (`src/world/PortageLife.js`): market vendors calling out in daylight near the market raft (voiced murmur + subtitle every 18–38 s), and three hidden things — a note under the chapel raft's bell (points to the next one), a stash tin on the sleeping pontoon (6 scrap, a bandage, a flare), and a hooded figure on the water-barrel raft that only stands there 01:00–04:00 and vanishes after speaking. Saved in the save file, reset on a new story. One mesh each.
- **Not done:** kids running along the dock, haggling exchanges, new small events (a boat arriving, an argument, a delivery) — each needs new NPC behaviour/animation, which tonight excludes. Area ambience was already handled by the positional emitters (bars, crowd, generators).
- Tests: new `scripts/portage-test.mjs` 5/5 (each secret found, figure absent at 10:00 and present at 02:00, callouts heard, secrets survive save/load), added to the phase gate. Gate all pass.
- Route: standing 574/622k · walk 388/592k · boat 509/663k · raft city 613/562k · Cask 343/537k. Note: raft city and boat alternate between two values run to run (≈455 vs ≈610, ≈390 vs ≈510) independent of the code — it was 609 in phase 4 and 455 in phase 5 — because phases are timed in real time on a CPU renderer and the boat ends in different spots. This phase adds at most 3 draw calls. The final check runs the route twice.

## Bug sweep (requested mid-run) — 20 fixes
Two independent code reviews of everything changed tonight and in the previous passes; every confirmed finding fixed.
- Gameplay (10): emergency exit could drop you at the world origin or a previous game's spot (now only real, saved-this-session safe ground, else into the water by the boat), and is off in life-sim scenes and on the death card; E could leave the boat behind open panels, while dead or mid-struggle; the gull's "share some" prompt stole E/Triangle from leaving the boat until fed; dropping/diving off placed you blindly to starboard (now the first clear side); leaving untied a moored boat so it drifted off; loading didn't restore Portage secrets (a found stash could be lost); subdued NPCs stood back up; the hooded figure vanished before speaking; the leave prompt ran ~100 allocating collision probes every 300 ms (now cached by position, allocation-free).
- Boot/menu/rendering (10): the shorter far plane left a band of sky below the horizon (far ocean ring now starts where the near camera stops); landmark warm-up compiled the whole scene for a light count never used (now compiles only the new place, with its lights already pooled); the first flare added a real light and rebuilt every lit shader (flares now pooled); the viewmodel light took a pool slot; safe mode could loop forever on a `?quality=` URL, reload without a successful save, and switched presets live on the menu (now strips the parameter, only reloads after saving, always reloads to rebuild the renderer); a failed world load hung on the loading bar (now shows an error); dynamic resolution ignored the Light preset's 30 fps target and counted menu frames (now uses the preset's target and play frames only); players who had chosen a preset before tonight lost it.

## Phase 7 — final check ✅
- All test scripts: validate ✅ · build ✅ · boat 7/7 ✅ · weapons 8/8 ✅ · controller 7/7 ✅ · portage 5/5 ✅ · people (3 scenarios, no errors) ✅ · life-smoke 2 lives ✅ · smoke (whole story, 37 steps) ✅ · creature-test 9/10 ⚠️.
- **creature-test raid fails — pre-existing.** It fails identically on the `overnight-start` code (warning → attack "too close" at the same timings). Two fix attempts on the test (light them during the warning; aim from the eyes) didn't change it; a probe showed the flashlight beam only ever counts as "near" (0.14) even when aimed straight at the swarming gull-rats, so they're never driven off. Left as it was and logged as a known gap — the flashlight probably doesn't scare gull-rats in play either.
- Route, start-of-night code vs final code, run back to back with nothing else on the CPU (Light preset, draw calls / triangles / avg fps): standing 571/622k/0.9 → 574/622k/0.8 · Portage walk 424/719k/1.0 → 396/597k/0.9 · boat 489/652k/0.9 → 386/581k/1.0 · raft city 607/561k/0.9 → 456/541k/0.8 · Cask 339/537k/1.1 → 443/599k/0.8. Totals −7% draw calls, −5% triangles; frame rate unchanged within the noise of CPU rendering. Per-phase numbers swing ±20% run to run because phases are timed and the boat ends in different places.
- 5-minute stall probe: 0 logic stalls over 200 ms (avg 1.9 ms, max 45 ms); mid-play shader compiles 15 programs in 6 frames (was 17 in 7).
- Deployed and opened headless: menu → story → play with **0 console errors and 0 failed requests**.

---

# NPC realism + raft collision pass

## Phase 1 — raft collision (tag `npc-start` / `phase-1-start` → kept)

**Root cause.** The boat collided as one 1.3 m circle at its centre, with no sub-steps, so bow and stern overlapped
rafts by 1.5–2.8 m, and on small rafts the centre could get pushed out the far side. Floating raft boxes whose
bottom sat above 0.6 m (car deck, rig deck) were skipped by the static-wall height band. Parked fleet boats had
no collider at all.

**Fix.**
- The hull is now three circles along the keel (bow, middle, stern), swept in sub-steps of at most 0.25 m.
- Floating bodies use their own height band.
- Parked boats get a body.
- `hullBlocked` plus `unstick()` slide a hull that is left overlapping anything out to the nearest open water
  (rings of 1–16 m).
- Contact feedback: a scrape (0.25–1.2 m/s, rate-limited) or a thud plus hull damage (above 1.2 m/s). The damage
  factor is halved, so a top-speed ram costs 17–20 % hull.
- A broad-phase radius per body skips far rafts cheaply.
- The patrol and NPC boats use the same `resolveHull`, so they benefit too.

**Test.** `scripts/raft-collision-test.mjs` drives into 5 rafts (small sleeping pontoon to large dock) at
3/8/9 m/s from 6 angles each, plus a parked boat.
- Old code: fails all 5 rafts plus the parked boat.
- New code: 7/7 pass.

**Gate (n1).** All pass: build, validate, boat 7, weapons 8, controller 7, portage 5, raft-collision 7.

Route perf (SwiftShader, CPU; ±20 % run-to-run noise):

| Stop | Draw calls | Triangles |
|---|---|---|
| standing | 585 | 627k |
| walking | 373 | 550k |
| boat | 662 | 696k |
| raft city | 587 | 558k |
| cask | 567 | 708k |

Shader compiles: 0/5/0/0/0. Worst frames 1.9–2.7 s, which is CPU rendering, not meaningful as fps. These
numbers are in line with the end-of-overnight runs. Collision adds no draw calls.

## Phase 2: how NPCs look (tag `npc-phase-2-start`, kept)

**Face/body consistency.**
- Every named NPC in `npcs.json` now records `presents` (f/m), decided from names and pronouns in the data.
- `generatePerson` honours it, so skin texture, body, facial hair and clothing cut all follow one value.
- Facial hair:
  - Beards were already male-only, and only on people over 18.
  - Stubble only on males over 16.
  - Bald heads always show scalp stubble.
  - Age lines only on people over 50.
- New `voicePitch(p)`: female voices are above 1.08, male below 1.0, lowered a little with age, plus a per-person offset. Dialogue and the dockmaster's refusal line now use it.
- `scripts/npc-traits-test.mjs` checks 500 random people plus all 23 named NPCs against 9 rules. It passes 523/523, and it is now part of the phase gate.

**Look changes.** All are shader-only: no new meshes, textures or draw calls.
- **Skin:** every person (not only the weathered) gets low-frequency warm/cool/yellow colour variation, a cool cast where skin is thin, and uneven roughness, so highlights break up instead of reading as wax.
- **Eyes:** a tight corneal catch-light from the sky above the viewer, plus a faint wet sheen at grazing angles. Blinks (single, double, half), saccades, gaze and pupil response to light already existed.
- **Hair:** the scalp under the hair cards is lightly tinted with the hair colour, so skin doesn't show through between cards.
- **Clothes by job** (`role` passes through to the generator):
  - Mechanics, scavengers and fixers get oil/tar wipe marks, darker and a little shinier.
  - Dock, water and fishing hands get more salt.
  - Elders, leaders and traders are cleaner.
  - Labourers get an extra patch.
  - Crew colours were already chosen from the community palette.

**Cost.** A few extra noise lookups per skin, eye and cloth pixel; full-detail people within 20 m only use the SSS path. Route numbers are unchanged:

| Stop | Draw calls | Triangles |
|---|---|---|
| standing | 581 | 625k |
| walking | 373 | 551k |
| boat | 662 | 696k |
| raft city | 584 | 557k |
| cask | 565 | 706k |

**Not done (honest):**
- The hard hairline on long styles (e.g. Ondine) comes from the hair-card mesh edge itself. Fixing it needs new hair assets.
- Hair styles are limited to the 9 meshes that exist.
- I compared CPU-rendered close-ups before and after: the skin difference is subtle, and the catch-light is not visible at that resolution. Whether this reads as "less waxy" needs a look on a real GPU.

**Gate (n2):** all pass, including npc-traits 9/9.

**Checkpoint deploy:**
- Done, after making `deploy-worker.cjs` upload only changed files.
  - It keeps a hash manifest in the bucket, uploads `index.html` last, and backs off on Cloudflare's 429 throttling.
  - The first attempt was throttled partway through. The page kept the old `index.html` until the retry finished.
- A headless boot of the live site shows no console errors and no failed requests.
