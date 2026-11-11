# Glydrift overnight bug sweep: 11–12 November 2026

Branch `bugfix/overnight-nov11` (base: live build with Sakura Skies, f7b21df). Bugs only: nothing
that changes how the game looks or plays was changed without being listed here. Four checkers ran in
parallel (A crashes/long runs/chaos, B Sakura Skies + realm order, C saves/money, D screens/devices);
they were paused once by a usage limit and resumed.

Deploy rule: Abyss double-beam regression test + full lane (Chromium, Firefox, WebKit) green first.
- Abyss double-beam test on the merged branch: **passed** (Chromium, 3.2 min). CI runs it on all three.
- Full lane: **green on all three browsers** (run 43072976718, commit e817f17). Deployed 12 Nov 02:13 UTC+7, build **mwchxd4c**.

## 1. Real player crashes

The game can only ADD crash reports (`crash_reports` is insert-only), so they can't be read from the
test machine. **Run in the morning:** `supabase/queries/crashes_since_2026_11_09.sql` in Supabase →
SQL Editor (read-only). It gives (1) the top crashes since the 9 Nov sweep, (2) crash kinds that are
new since then, (3) crashes per realm since Sakura Skies went live (11 Nov 13:42 UTC+7).

Without the reports, checker A read every new crash-prone path (Sakura hazards, scenery, pace maths,
HUD title cache, music cues, crash-safety handlers) and ran the long-run / chaos tests below: no crash
was found.

## ✅ What passed

**Long runs and crashes (A)**
- 10 god-mode runs to 52K score in a row (~43 km each, RETRY between), every realm incl. Sakura Skies,
  The Calm, the Abyss and all 4 dimensions, multi-hazard patterns forced in all 12: 0 errors, 0 crash
  reports, nothing drawn with freed art, 0 orphaned hazards, hazard pools capped (≤ 4 of any type).
- Flat across 10 runs: display objects 829 → 846, textures 560 → 563, memory 14 → 15 MB, realm art
  sets 3–4, tweens 2–20, timers 0–1, listeners constant.
- Tightest gap in any forced multi-hazard pattern: Glitch blink-gate 240 px (≈ 5.7 bird widths).
  Sakura's tightest 720 px (lantern) — as roomy as Solar Storm (708).
- Chaos: backgrounding + offline mid-run (5 rounds, during a lantern warning), offline death + 15
  rapid taps on GAME OVER, 74 death-and-retry cycles with tap spam (one 35-cycle run fully measured,
  nothing grew), monkey test, rotate/resize, taps during transitions: no errors.
- Abyss double-beam regression test: passed.

**Sakura Skies and realm order (B)**
- 2nd endless realm in real runs (Void 0 m, Sakura 500 m, Solar 1000 m); title, music cue, analytics
  `biome_reached {biome: "sakura"}` and the discovered flag all fire.
- Missions, achievements (Blossom Drifter), Stats (realm list + count), cloud merge, game-over and
  share-card realm names all include Sakura; old saves keep maxBiome and every hero challenge;
  "Reach Solar Storm" is not completed by reaching Sakura.
- Every hazard warns before it can hurt (lantern drop line ≥ 1 s before it reaches the bird).
- Difficulty (bot, would-be hits / 100 m): Void 0.76, Sakura 0.34, Solar 0.24, Frozen 1.10 —
  easy-to-medium, no retune.
- Music: Void → Sakura 90 → 95 BPM and Sakura → Solar 95 → 100 BPM bridges, started on a bar,
  title on the drop, same as other borders.
- Reduce Flashing (no lantern flicker frames) and Low Graphics (fewer petals/birds/rays) work.
- Level mode untouched.

**Saves and money (C)**
- Reload mid-Lucky-Spin, mid-Daily-Drop, mid-run: nothing lost, nothing paid twice.
- Shop, Mystery Pods, bundles, Drift Pass and Pass+ claims, login reward, level stars, chests: each
  pays out once.
- Logout/login can't re-claim daily rewards (per-device ledger); logout won't wipe the device before
  the cloud has the save.
- THE NEWBLEIZER: jump exactly ×1.08 height, gold perk badge, right frames; 9 retries with other heroes
  in between: never disappears.
- Pre-flight fix: collisions work on the very first frame of a run and after RETRY.

**Screens and devices (D)**
- Home, MORE sheet, Settings, splash, Stats (Sakura fits on small iPhone), Locker, Shop, Heroes, Pass,
  Progress, Leaderboard, HUD and pause: nothing under the notch/home bar on the sizes checked.
- "Created by Sam Eyde III" and the © line: home, Settings → CREDITS, splash ("A Sam Eyde III game"),
  website footer, README, LICENSE, on every size checked.
- Rapid taps (4×) on every main button: exactly one spin used, one game opened, 0 errors.

## 🔧 Bugs fixed

1. **Drift Pass+ paid rewards lost at season end** on a new device or after logging back in. *Why:* the
   season wrap-up ran before the store confirmed Pass+ ownership, skipped the paid track and marked the
   recap done. *Fix:* each home visit still pays any earned paid tier of an ended season (never twice).
   `src/data/seasons.js`. Season 1 ends 2 Dec, so this would have hit then. Test: night-c.spec.js.
2. **Cloud merge marked new Pass+ tiers claimed without paying them** when an old (pre-6 Nov layout)
   cloud copy met a new save. *Fix:* the old side's claims are moved to the new layout before merging.
   `src/data/seasonDefs.js`, `passPlus.js`, `src/online/cloudSave.js`. Test: night-c.spec.js.
3. **Bamboo blade killed on clear misses** (up to 16.5 px from any drawn pixel): hitbox ran past the
   leaf tip. *Fix:* leaf-shaped capsules ending at the tip. `src/obstacles/biomes/sakura.js`.
4. **Temple bell and paper lantern: visible hits that didn't kill** (overlap up to 21 px / 17 px).
   *Fix:* lip/shoulder and cap capsules. Same file. *Note:* these two are now very slightly harder (a hit
   that looks like a hit now counts); easy to revert if you prefer them lenient. Test: night-b.spec.js
   (hitboxes measured against the real art pixels).
5. **Home backdrop never showed Sakura Skies** for a player whose furthest realm was Sakura.
   `src/scenes/MenuScene.js`. Test: night-b.spec.js.
6. **Game over: SHARE / LEADERBOARD / HEROES / HOME off the bottom of small iPhones** after a busy run
   (coins + hero bonus + missions + Lucky Spin). *Fix:* RETRY's position is capped so its button row stays
   above the home bar; it only moves when the row would otherwise leave the screen (a first version moved
   it on every iPad-portrait game over in Safari; the full lane caught that and it was tightened).
   `src/scenes/GameOverScene.js`. Test: night-d.spec.js.
7. **Website footer drawn over the game** on iPad landscape (~120 px) and laptops. *Fix:* it wraps to
   fit the side area (same text/size/colour, never hidden), and the name and © line never split across
   lines. `index.html`; credit.spec.js now checks the footer's text. Test: night-d.spec.js.
8. **Lucky Spin odds cut off on iPad portrait** (only the first prize row showed). *Fix:* only when the
   strip doesn't fit, the wheel moves up a little. `src/scenes/SpinScene.js`. Test: night-d.spec.js.
9. **Flaky test** in sakura.spec.js ("old save … Blossom Drifter only"): a god run can legitimately earn
   THE HADDAD with a ×10 combo. Now checks what it meant (no realm-reach hero handed out).

## ⚠️ Still open (not fixed: they change behaviour or look, or need a decision)

- **Two devices online at once can overwrite each other's progress in the cloud**
  (`src/online/account.js:296`, `pushNow`): the cloud is read once per session, later pushes overwrite
  it. E.g. a hero bought on the phone can vanish when an older tablet session saves. Suggested fix: read
  + merge before each push when another device wrote since (detect with a random `pushId`). Changes
  what players see mid-session (coins can jump), so it needs your OK.
- Coins earned on the less-progressed device are dropped in a merge (the documented "keep the most
  progress" design, but players may see it as lost coins).
- Paid Pass+ tiers paid late (fix 1) arrive silently, no pop-up.
- Lantern warning partly off screen on the smallest iPhone (up to 60 % of the flicker before it's
  visible; the drop line still shows ≥ 1 s ahead). Suggested: start the flicker only once on screen.
- Bell's rounded top is still ~11 px lenient.
- One long frame at the first realm border (~500 m) on the software-GPU test machine — not caused by
  Sakura (same when starting in Solar). Worth a Safari timeline on a real iPhone across 500 m.
- Very busy game over on small iPhone: RETRY covers the last 2–3 result lines (suggest collapsing
  finished missions into one line).
- Credit text on the home screen and Settings © line is readable but small on the small iPhone
  (~8 CSS px). Suggested 16–17 units.
- Level Complete buttons ~3 units into the home-bar area on the standard iPhone.
- Cosmetic: Locker nameplate under the flying hero; Shop "FREE"/"NEW" tags overlap the coin pills.
- Not checked (machine load): most screens on large iPhone and iPad landscape; Locker/Level Select/
  gameplay/game over on laptop; Level Complete on any device; Lucky Spin results after ×10/×20 spins.
- Test-only: the soak's memory check is skipped (no `performance.memory` in this Chromium); measured
  separately instead (flat).

## SQL to run in the morning

1. `supabase/queries/crashes_since_2026_11_09.sql` (read-only): crash results since the last sweep.
2. Still outstanding from before, if not run yet:
   `supabase/migrations/20261109000001_all_mighty.sql` (turn on pg_cron first; see ALL_MIGHTY.md) and
   `supabase/cleanup/20261108_remove_ci_test_scores.sql`.
No new database changes were made tonight.

## Full lane and deploy

- Run 1 (4be275d): one real failure: the iPad-portrait game-over screenshot in Safari/WebKit. Fix 6's
  first version moved RETRY up on an ordinary game over there (a look change). Tightened twice: the cap
  now uses the button row's measured bottom edge (RETRY + 146, +4 margin), so normal game overs keep
  their old layout everywhere.
- Runs 2–3: GitHub's package mirrors were down for ~3 hours ("could not install chromium/webkit"); no
  tests ran in those jobs. Rerun once they were back.
- Run 43072976718 (e817f17): **all 14 test jobs passed** (Chromium 5/5, Firefox 3/3, WebKit 6/6),
  including the Abyss double-beam regression test on all three browsers.
- Deployed (c3a350c; tree identical to the tested branch). glydrift.com now serves build mwchxd4c
  (was mwbr4lz7); the live game contains SAKURA SKIES, the splash "A Sam Eyde III game" and the footer
  "Created by Sam Eyde III · © 2026 Sam Eyde III. All rights reserved."

## Safe to share and ready for the App Store?

**Yes.** No crash found, every fix tested on all three browsers, nothing lost from saves or money. The
one item worth a decision before many players use two devices at once is the cloud overwrite above.
