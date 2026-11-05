# Overnight check: 2026-11-05

No features were added and nothing about the design was changed. The only change from this check is one new test.

## 1. CI for the two removals

| Change | Live since | CI |
|---|---|---|
| Glitch wall (Corrupt Column) removed (fc3b118) | gh-pages 6d2c284 | Its own run was **cancelled** by the next push, which is GitHub's normal behaviour when a newer push to the same branch arrives. The next run includes it: **passed** |
| Neon Void vertical laser removed (088282e) | gh-pages 6a0ac19 | **Passed** on Chromium, Firefox and WebKit (run 41970983912) |

Nothing needed fixing or rolling back.

## 2. Abyss scenery upgrade

- **Live:** gh-pages 96993f9.
- **CI passed** on Chromium, Firefox and WebKit (run 41964118267, commit 2d84dea).

## 3. Deploy rule (from now on)

Nothing goes live until CI has passed on all three browsers, even for small removals. Yesterday's last three deploys went out before CI finished. All three have since passed.

## 4. Full bug sweep

| Area | How it was checked | Result |
|---|---|---|
| Every screen | the "every screen opens" test at 7 sizes (phones, iPads, laptop, desktop) | pass |
| Gameplay, input, pause, retry, resize, lost WebGL, private browsing, 30/60/120 Hz | the full test suite | pass |
| All five realms and the four dimensions | 14 km god-mode flights through Void → Solar → Frozen → Glitch → Abyss → Valley → Hurricane → Chrono / Mirror / Prism / Tidal, in normal, Low Graphics and Reduce Flashing | no errors; no new hazard ever hurt while still warning; at most 6 obstacles live at once; obstacle pools stop growing |
| Long runs | the ~10 km "very long run" test, plus the 14 km flights above | pass; no pile-up of objects |
| Accounts and logout in Safari | the accounts and after-logout tests: create, log out, sign in on a new device, delete; one pop-up at a time; no free rewards twice. These run in WebKit (Safari's engine) in CI | pass in WebKit, Chromium and Firefox |
| Saving | a real 1,955 m run, then a page reload | best (1,200 → 1,955), coins (5,000 → 5,273) and run count all survive the reload |
| Both leaderboards | the Distance + Score tests and the game-over placement test | pass |
| Drift Pass / Drift Pass+ | buy, claim, restore on a new device; Pass+ heroes have the standard hitbox and speed and come only from the track; the web version sends you to the iPhone app to buy | pass |
| Audio | audio switched on (the tests normally run silent): tap the home screen, start a run, flap | the sound engine starts on the first tap and keeps running; 150 more sounds started during a short run; no errors |
| Performance | same 120 m stretches as yesterday, after the removals | Neon Void 233.9 ms CPU per frame (243.4 yesterday), heap 11.5 MB; Glitch 279.7 ms (272.9 yesterday), heap 13.0 MB; growth 0.3–0.6 MB. Within noise. This is the slow software renderer here: only compare like with like. |
| Full suite (`test:all`, Chromium × 7 sizes) | local run | **108 passed, 0 failed** |

## 5. Abyss "Slammer + Eye Beam"

The pattern was forced to appear on every pick, 59 times over 30 Abyss laps, with god mode off so collisions were real. A steady pilot flew it, limited to 650 px/s up or down; a real bird manages 790 up and 1,080 down.

- **Deaths:** none from the Slammer or the Eye Beam.
- **Lane:** the Slammer's slot never closes, and in the worst case it still clears the beam's reach by 163 px, hero size included.
- **Warning:** the eye always warns at least 1.38 s before the bird arrives.
- **Sides:** beams came from the ceiling 27 times and from the floor 32 times.

**Verdict: fair.** A lighter version of this check (8 laps) is now a permanent test, so CI runs it in all three browsers.

## 6. Fixes and open issues

**Fixed:** no game bugs were found that needed a code change. The only change is the new test above (branch `glydrift/bugfix-2026-11-05`).

**Needs your decision: the laser mission, caused by the vertical-laser removal**

New players' first mission is "Pass 5 lasers in one run". The other options for that mission ask for 8 or 12. The "Laser Dancer" achievement (which unlocks a title) and one hero's unlock challenge ask for 15.

Lasers passed per run, measured over 6 runs at the same bot skill:

| | by 500 m | by 3,000 m | by 6,000 m |
|---|---|---|---|
| With the vertical laser (before) | 3–7 | 3–7 | 3–7 |
| Now (side lasers + Prism mirror lasers) | 1–2 | 1–2 | 2–9 |

- **The first mission** used to be done in the Neon Void on most runs. Now it usually needs a long run that reaches the Prism dimension.
- **The 15-laser achievement and hero** were already effectively out of reach before the removal (best seen: 7), and still are.

Options, none applied:
1. Lower the laser mission targets, e.g. 2 / 3 / 5, and the achievement and hero challenge to 8.
2. Count other beam hazards as lasers, such as the Eye Beam and the Flare Arc.
3. Replace the laser mission with a different starter mission.

Players who already have the mission keep it. Their progress isn't lost; it's just slower.

**Nothing else is broken that I found.**
