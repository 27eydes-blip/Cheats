# Stability first, then real sky and water — report

**Live:** https://drowned-earth.27eydes.workers.dev

## What was fixed

### The freezes

- **Grey 3D view with the HUD still up.**
  - Most likely cause: a lost WebGL context, the normal failure on integrated graphics when the GPU runs out of
    memory or hits a driver timeout.
  - The game now pauses and saves on the spot. If the browser restores the context, it carries on.
  - If the context isn't back within 4 s, or is lost twice in 2 minutes, it reloads one preset lower with a
    message.
- **Boat stopped against a raft with the hull nearly empty.** That was real.
  - Pinned with the throttle open, the boat ran a 256-probe escape search every frame and lost hull every frame.
  - Now:
    - the escape search runs at most twice a second, over 96 probes
    - hull damage lands at most every 0.4 s
    - sub-steps are capped at 8
    - hull at 0 swamps the boat with a message (engine drowned, paddle to a dock) instead of draining forever
- **A hard freeze the new test found.**
  - A NaN in the boat's velocity reached the camera, and the audio engine then threw an error every frame.
  - Now:
    - the boat and camera reset when their position goes bad
    - the audio listener ignores bad values
    - a system that throws is logged instead of stopping the frame
- **Watchdog.**
  - Main-thread blocks over 2 s, and frames over 500 ms, are written to the F4 log with a stack, the last 40
    things that happened, and the slowest systems.
  - F3 now shows a graphics-memory estimate.

### Laptop preset (new, below Light)

- **Who gets it automatically:**
  - integrated GPUs (Intel, AMD APU graphics, MX parts)
  - software rendering, which also gets the message "Turn on hardware acceleration in Chrome settings"
  - anything averaging under 22 fps in its first 10 s of play
- **Rendering:**
  - 60 % resolution with the sharpen pass, a 30 fps cap
  - no shadows, AO, reflections, volumetrics or bloom
  - a 360 m foggy view, fewer props
  - at most 12 people and 6 creatures drawn
- **Simpler sky and water.**
- **Textures:** capped at 512 by dropping their top mip at load (a quarter of the memory).

**Cheaper for everyone:**
- the 98 floating bottles were drawn across the whole map (about 99k triangles); now only nearby ones
- bar interiors aren't drawn from outside

**Cheaper on Light and Laptop:**
- the glowing deep growth isn't drawn from above the surface (about 100k triangles)
- distant vines are hidden

**Bars:** the plain block and flat red cushions are replaced by a cask arm-wrestling table and proper cushions.

### Sky

- A Preetham-style physical sky blended over the existing one: deep blue overhead, warm hazy horizon, red
  sunsets, a halo round the sun.
- The sun is a soft, limb-darkened disc that widens in haze.
- A faint galaxy band at night.
- The horizon fades into the fog colour, so there's no seam.

### Water

- **Quality tiers:**
  - Laptop: simple shader
  - Light: two normal layers and Fresnel
  - Standard: everything
  - Ultra: adds screen-space reflections
- **New:** a moon path on the water, murky green in the shallows.
- **Existing, kept:** foam, rain rings, wakes and the never-white cap.

## Before and after

All figures are from the scripted route on this machine.

| Preset | Stop | Draw calls (before → after) | Triangles (before → after) | Worst frame (before → after) |
|---|---|---|---|---|
| Light | standing | 585 → 572 | 627k → 330k | 2.2 → 1.5 s |
| Light | boat | 666 → 656 | 693k → 333k | 2.5 → 1.6 s |
| Light | raft city | 560 → 569 | 556k → 255k | 2.3 → 2.0 s |
| Light | cask street | 456 → 536 | 540k → 294k | 2.1 → 1.9 s |
| Standard | standing | 1845 → 1841 | 2.33M → 1.92M | 1.8 → 1.7 s |
| Standard | boat | 1988 → 1981 | 2.42M → 2.12M | 2.3 → 2.5 s |
| Standard | raft city | 1454 → 1334 | 1.75M → 1.43M | 2.4 → 2.1 s |
| Laptop (new) | standing | — → 289 | — → 163k | — → 0.7 s |
| Laptop (new) | boat | — → 260 | — → 190k | — → 0.7 s |
| Laptop (new) | raft city | — → 357 | — → 137k | — → 1.3 s |

- **Graphics memory estimate (after):** Laptop about 200 MB, Light about 280 MB, Standard about 300 MB.
- **CPU-rendered frame rate on Laptop:** about 1.6–4 fps, against about 0.6 fps on Light. On a real GPU only the
  ratio means anything.
- **Laptop targets:** triangles meet the under-250k target everywhere. Draw calls are 260–357, against a target
  of 250 (missed at raft city and cask street).

## Tests

- **All pass:** build, validate, boat 7, weapons 8, controller 7, portage 5, raft-collision 7, npc-traits 9,
  npc-life 9, killers 13, people, life-smoke, smoke.
- **New:** freeze-test 9/9. It covers being jammed in a raft corner, between rafts and against a parked boat;
  hull 0; fuel 0; a NaN position; 200 ms frames (worst 17 ms of logic); context loss and restore; the watchdog;
  and the memory estimate.
- **Still failing:** the creature test's `raid` scenario. It fails the same way as before this pass.

## What was reverted

Nothing.

## Not judged by eye (no GPU here)

- Whether the new sky reads as real. The first version washed midday out to white, so I toned it down and
  re-shot it. It's now a greyer blue than before with weaker clouds, and the last tweak wasn't re-rendered.
- The water tiers, and whether Laptop water looks acceptable.
- Real frame rates and frame pacing at the 30 fps cap.
- Whether context-loss recovery works on a real driver reset. The test uses the browser's simulated loss.

## Check first

1. On the laptop: does it start on **Laptop** (Options → Quality)? Does F3 show a steady 30 fps and a memory
   figure?
2. Drive into raft corners and against parked boats at full throttle. There should be no freeze and no hull
   drain while pinned.
3. Look at midday, sunset and night skies, and at the water from the boat. Is anything blown out, banded or
   seamed?
4. If it ever freezes again, press F4 (if it responds) and send the log. It now includes a watchdog section.
