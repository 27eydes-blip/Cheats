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
