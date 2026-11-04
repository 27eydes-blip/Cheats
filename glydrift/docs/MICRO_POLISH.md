# Micro-polish pass: what changed

The values live in `src/tuning.js` (`HAZARD`) unless another file is named. Scoring rules, world speed, flap physics, art and features are unchanged.

| What | Before | After |
|---|---|---|
| **Hazard hitboxes** | mostly the drawn shape: saws at 88%, pillars inset 4 px across | every hazard is about 12% smaller than its art (`HAZARD.hitbox` 0.88), the same for every hazard and every hero. Circles and beams use 88% of their radius or thickness; rectangles are inset by 12% of their smaller half-size on each side. This is set in one place, the shared geometry helpers (`src/obstacles/geometry.js`). Near-misses are measured against the new hitbox, with the same 24 px threshold. |
| **Retry grace** | the first obstacle at the same distance every run | after RETRY, the first obstacle starts 240 px farther away (`HAZARD.retryLead`). A fresh run and the Daily are unchanged (the Daily keeps its fixed course). |
| **Buttons** | shrink on press, click, spring back | squish on press (wider than tall: 93% × 86%), a crisp haptic tick on press, a click on release, then an elastic spring back (`src/ui/ui.js`) |
| **Number roll-ups** | roll up, small bounce at the end | roll up as before; a big gain (100+, or 25%+ more) lands with a bigger, springier bounce. Bounces always settle back to the exact size, with no drift after repeated gains. |
| **Death slow-mo** | 0.5 s | ~0.3 s (`HAZARD.deathSlow`) |
| **Loading** | a near-black page while the game loaded | a GLYDRIFT splash with a moving loading bar, shown the instant the page opens and faded out once the home screen has drawn. It never takes taps and respects Reduce Motion. All game art for the first realm is built before the home screen appears, so PLAY never waits. |
| **Menu transitions** | fades between screens | unchanged: every screen change already fades (`fadeTo`) |
| **Home hero** | taps start a loop-the-loop, but taps made mid-loop were ignored | every tap gets a reaction: a squashy flap, sparks and a haptic tick mid-loop |
| **Pause / resume sound** | music muffled on pause | the music also eases down by 9 dB over 0.3 s and back up on resume. The wind bed fades out while paused. |

## Tests

New: **"micro-polish: hazard hitboxes ~12% inside the art, retry grace, short death slow-mo, no blank load"**. It checks five things:
- a point 3 px inside a drawn pillar is no longer a hit, but 20 px inside still is;
- RETRY starts the first obstacle at least 200 px farther away;
- the crash slow-mo is 0.2–0.35 s;
- the splash is gone once the home screen shows;
- no console errors.
