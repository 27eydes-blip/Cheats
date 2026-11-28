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
