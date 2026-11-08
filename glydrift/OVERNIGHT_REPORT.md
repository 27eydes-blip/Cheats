# Glydrift — Overnight report (8 Nov 2026)

Times are UTC+7. Every part was deployed on its own, and only after the full lane (every test,
Chromium + Firefox + WebKit, every device profile) passed on CI. **Status table at the end.**

## Part 0 — the Abyss crash: found, fixed, tested

**What players saw:** the game froze or ended the run in the Abyss when hazards fired, often the
Eye Beam + Slammer pattern ("two lasers at once, one top, one bottom"). Crash reports:
`Cannot read properties of null (reading 'glTexture')` — 10 reports, 5 players, all in the Abyss,
plus the 6 `recovered` reports (the crash guard ending those runs).

**Exact cause:** RETRY keeps the same game screen and its pooled hazards (that's what makes retry
instant). Each realm's art is freed a few seconds after you leave it (to keep iPhone memory down)
and built again as a *new* texture when you come back. In the next run, a **Slammer pooled in an
earlier run still pointed at the freed Abyss art**: its spawn check only compared the frame's name
(`cap_1`), which still matched, so it was never re-pointed, and its pillar bodies were never
re-pointed at all. Drawing it read a destroyed texture → the crash. It needs a run past the Abyss
(~3,000 m) and then a retry, so it hit good players deep in a session, "at the same spot" every
time.

**Why no test caught it:** the long-run soak runs with drawing switched off (it's a memory test)
and the crash only happens while drawing; no test retried after passing the Abyss.

**Not memory:** `killed_mid_run` doesn't cluster in the Abyss, at high scores or in long runs (see
SUPER_SWEEP_REPORT.md), and memory stays flat run after run.

**Fix:**
1. General: whenever a texture is freed or rebuilt (realm art, any replaced texture), every object
   on any screen still using it switches to a blank texture first and gets its own texture and frame
   back the moment that art is built again. Nothing can draw a freed texture any more.
2. The Slammer checks the texture itself (not just the frame name) on every spawn, bodies included.

**Old vs new:** the new test (`tests/e2e/abyss-crash.spec.js`) fails on the live build in run 2
with the players' exact error, every run; on the fix it passes 9 runs in a row with retries:
56 double eye beams and ~95 forced multi-hazard Abyss patterns (Eye Beam pairs, Eye Beam + Slammer,
Tendril + Eye Beam, Slammer, Walls), drawn, checked for anything showing freed art, errors and
growth. Also: 10 natural god-mode runs with retries, drawing the Abyss every time — clean; the 50K
soak twice in a row — clean.

## Part 1 — sweep decisions

App Store blockers:
- **Privacy Policy and Support** buttons in Settings (glydrift.com/privacy, /support).
- **Drift Pass+ price from the App Store** (StoreKit `displayPrice`); $3.99 only on the web.
- **Name reporting** merged from `ios/review-ready` (you already ran its SQL; nothing new).
- **@capacitor/haptics** installed in the iOS app.

Design decisions:
1. **Notch**: the top UI no longer sits ~34 pt too low on Face ID iPhones.
2. **Tap areas** at least 44 pt everywhere (invisible area only; nothing looks different).
3. **Readable small text**: titles under names 11–12 → 15; RESTORE PURCHASES label 13 → 16.
4. Guests can still buy Drift Pass+ (kept).
5. **MATTOE** plays the equipped death effect.
6. **WALLRUNNER** gets the gold perk badge; your own row shows perk badges too.
7. **Menus at 60 fps** on 120 Hz iPhones; flying keeps the full rate.
8. **Korean font** loads alongside the game instead of holding up the first screen.
   Not done: deferring hero art and hazards (a loading-order change with crash risk for a small
   gain — see "left alone").
9. **Boss node on short screens**: the hero stays out from under the header.
10. **Haptics setting**: FULL / LIGHT (softer, no flap tick) / OFF.

Also: REPORT A NAME moved off the "YOUR BEST" label on the leaderboard.

**Bug found on the way (was live):** a Drift Pass+ reward preview left open when its screen ended
(e.g. going home) kept animating its hero on the next visit with effects that no longer existed —
an error every frame (Umbra Drake's fire breath). Firefox's random-tap test found it. Fixed, with a
regression test.

## Part 2 — new tests (and what they caught)

| Test | Lane | Caught |
|---|---|---|
| Network: slow / spotty / offline mid-run, through the real online start-up | fast | nothing — runs play, save and queue their score |
| Weak phone (CPU 5×): Low Graphics turns on and draws faster (12 → 6.9 ms a frame) | nightly | nothing |
| First-time player: one pop-up at a time → name → first run → game over → level 1 | fast | **the name box could do a real form submission (a page reload)** — fixed |
| Old saves (3 generations) load with nothing lost and play | fast | nothing |
| 500 players at once | by hand | `scripts/load-test-scores.mjs` against a throwaway table; refuses the real one (tested) |
| Two hours on the menus, then a run | nightly | nothing grows |
| Reference screenshots: every main screen, small / standard / large iPhone | full | baselines recorded on the first CI run |
| Fuzz: 200 junk saves, 300 junk scores, junk names and settings | fast | nothing |
| Accessibility: VoiceOver labels on every button; Reduce Flashing + mute | fast | **VoiceOver saw the game as one picture** — every button now has a label (new) |
| Multi-hazard stress: every realm's busiest patterns back to back, drawn | nightly | nothing |

Fast-lane tests are tagged `@smoke`; heavy ones `@nightly` (the nightly run only; the full lane
skips them).

## Part 3 — polish

- **Numbers with commas everywhere** (coins 12,345, BEST / BEAT YOUR BEST, GAME OVER, Lucky Spin
  points), like the leaderboard already did.
- Before/after screenshots of every screen on the small, standard and large iPhones, looked at one
  by one: nothing moved or got cut off.
- Debug leftovers: none found (no logs, debugger lines or TODOs in the game code).

**Left alone (not sure it would be better, or can't check it properly from here):** camera feel,
flap feel, effect density and sound balance — these need hands and ears on a real phone; changing
them blind could make the game worse. Deferring hero art / hazards at launch (crash risk).
The achievement toast on GAME OVER briefly covers the Lucky Spin line on the smallest iPhones
(by design: never a button).

## Part 4 — plans (nothing changed, nothing run)

SQL is in `supabase/proposed/` — **not** migrations; don't run them until you approve the plan.

1. **Coins duplicated across devices.** Plan: lifetime ledger in the save (`earned`, `spent`, plus a
   `base` = today's coins for existing saves); the cloud merge takes the larger of each counter, and
   coins = base + earned − spent, so spending on one device can never be undone by the other.
   Client-only; no SQL needed for the fix itself (save_validation.sql uses the ledger later).
2. **Impossible level times.** `level_min_times.sql`: a table of each level's minimum time (60% of
   the measured fastest standard-hero time, 32–92 s per level) and the line to add to the score
   check.
3. **Edited saves.** `save_validation.sql`: loose server checks on cloud saves (no impossible coin
   totals or impossibly fast gains; with the ledger, coins must add up).
4. **Shop trusts the phone's date.** `server_now.sql`: a `glydrift_now()` function; the shop,
   featured heroes and Daily Drop would use the server's date.

## ⚠️ One thing went wrong tonight (fixed; needs one SQL from you)

The new network tests ran the game's real online start-up. In WebKit (Safari) on CI, the game's
service worker sent its requests *around* the tests' network blocking, so **16 test runs reached
the real leaderboard: 32 rows named "TestPilot" (415 points / 170 m, VOLT), 15:49–18:09 (UTC+7)**.
Low scores, but they show on TODAY / THIS WEEK. No player data was touched.

Fixed so it can't happen again: the service worker is blocked in those tests, they stop before
playing unless every request is intercepted, and every other test now refuses any database request
in the page itself.

**To remove the 32 rows:** run `supabase/cleanup/20261108_remove_ci_test_scores.sql` (deletes only
name TestPilot on those two boards in that time window — I checked there are no other TestPilot
rows). I don't run database changes myself.

## SQL files

| File | Status |
|---|---|
| `supabase/migrations/20261108000001_server_time_scores.sql` | you ran it ✓ |
| `supabase/queries/top_crashes_this_week.sql` | you ran it ✓ (a query, any time) |
| `supabase/migrations/20261107000004_name_reports.sql` | you ran it ✓ |
| `supabase/cleanup/20261108_remove_ci_test_scores.sql` | **please run**: removes the 32 CI test scores |
| `supabase/tests/scores_loadtest.sql` | optional: only for the 500-player load test |
| `supabase/proposed/*.sql` | Part 4 plans: wait for your OK |

Nothing else needs running for what was deployed tonight.

## App Store readiness

The four likely rejection reasons from the super sweep are fixed and live:
1. Privacy Policy + Support inside the app (Settings) — glydrift.com/privacy and /support answer.
2. Drift Pass+ shows the App Store's own price (StoreKit), never a hard-coded one in the app.
3. Players can report a name (REPORT A NAME on the leaderboard; your SQL blocks it after 3 reports).
4. Native haptics in the iOS app (`@capacitor/haptics`), with a setting to turn them down or off.

Plus VoiceOver can now read every button, and tap areas meet Apple's 44 pt minimum.

**Ready to submit: yes** — from the code side. Before you press Submit: build the iOS app from the
live branch (Codemagic, as set up in `docs/APP_STORE_REVIEW.md`), and on a real iPhone check the
Drift Pass+ price shows in your currency (sandbox account) and that haptics buzz. The review notes,
privacy answers and demo account are in `docs/APP_STORE_REVIEW.md`.

## Status

| Part | Branch | Full lane (3 browsers) | Live |
|---|---|---|---|
| Super sweep | `bugfix/super-sweep` | ✅ | build `mw7j13k9` · 14:44 |
| 0 · Abyss crash | `bugfix/abyss-crash` | ✅ | build `mw7m64rr` · 16:12 |
| 1 · Sweep decisions | `decisions/super-sweep` | ✅ | build `mw7q4asa` · 18:03 |
| 2 · New tests | `test/coverage-upgrade` | ✅ | build `mw7t5f66` · 19:28 |
| 3 · Polish | `polish/overnight` | ✅ | build `mw7uygf0` · 20:18 |
| 4 · Plans | — | nothing deployed | — |

(times UTC+7, 8 Nov)
