# Flow & feel pass: what was tuned

**Unchanged:** difficulty, scoring, art and features.

These parts of the game are not touched:
- flight physics: gravity, flap strength and terminal speeds (`PHYSICS` in `src/config.js`);
- world speed;
- hitboxes;
- obstacle spawning;
- scores and leaderboards.

Every change below affects only the view, sound or timing of effects. The values are in `src/tuning.js` (`CAMERA_FEEL`, `TILT`) unless another file is named.

## Flight

| What | Before | After |
|---|---|---|
| Tilt steps (how finely the hero's angle is drawn) | 15° (visibly steppy) | 3° (`TILT.step`) |
| Nose-up on a flap | eased at 12/s | crisp, 16/s (`TILT.rise`) |
| Nose-down while falling | eased at 12/s | gentle, 7/s (`TILT.fall`), so the glide feels floaty |
| Input | handled on the tap (`pointerdown`) | unchanged: a flap is applied the moment the tap arrives, never a frame later |

## Camera

| What | Before | After |
|---|---|---|
| Zoom with speed | fixed | eases out by up to 3% at top speed (`zoomOut` 0.03, `zoomEase` 0.8/s). The walls are built for the widest view. |
| Vertical lead | none | leads 0.012 px per px/s of hero speed, at most 10 px, smoothed at 3/s (`lead`, `leadMax`, `leadEase`) |
| Shakes during a run | obstacle impacts, distance milestones, boost dash, rift entry, Abyss entry, death | **only death and the Abyss entrance** (with its title slam) |

## Frame pacing

| What | Before | After |
|---|---|---|
| Frame cap | 61 fps | none: the game runs at the display's own rate, a locked 60 on 60 Hz screens and 120 on ProMotion / 120 Hz screens (`src/main.js`) |
| Physics | ≤ 1/60 s steps | unchanged, so the game plays identically at 60 and 120 fps |
| Realm, background and music crossfades | already continuous, with no title pause (realm-flow update) | unchanged |

## Trails

| What | Before | After |
|---|---|---|
| Hero trail squares | one per frame, every other point drawn, so gaps appeared at top speed | laid at an even 6 px spacing along the path. No gaps at any speed, and the same look at 60 and 120 fps (`CharacterRig.drawTrail`) |

## Sound and haptics

| What | Before | After |
|---|---|---|
| Flap whoosh | none | a soft band-passed whoosh under every flap, pitched 700 → 2200 Hz as speed rises (`Sfx.flapWhoosh`) |
| Wind | none | a looping wind bed. Its level goes from 25% to 100% and its tone from 300 to 1200 Hz with speed, smoothed over about 0.25–0.4 s. It fades out on pause, death and leaving the run (`Sfx.wind`). |
| Flap haptic | none | the lightest tick on every flap (`Haptics.tap`), throttled so it never buzzes. It works in the iPhone app and on Android; iPhone Safari has no web vibration. |

## Pop-ups and retry (checked, already met)

- Centre pop-ups, the realm title, combo text and NEW BEST all ease in (`Back.easeOut`) and out (`Cubic.easeIn`).
- Retry takes under 1 s. The "game over and retry in under a second" test checks it.

## Tests

- New: **"flow: the camera shakes only on death and the Abyss entrance; zoom and lead ease"**. It flies a 3 km run and checks four things:
  - the only shake is at the Abyss entrance;
  - the view widens by 0.5–3.5% at speed;
  - no zoom step is bigger than 0.2% in a frame;
  - the lead never moves more than 1.5 px in a frame.
- The existing speed, hitbox, jump and score tests all pass unchanged, which confirms the gameplay is the same.
