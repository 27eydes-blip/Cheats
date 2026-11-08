# Glydrift — Super Sweep (2026-11-08)

Branch `bugfix/super-sweep`. Bug fixes only: no new features, design, balance or art changes.
Anything whose fix would change how the game plays or looks is listed under **Design decisions**
instead of being changed.

How the sweep was done: four read-only code audits in parallel (level mode; economy, accounts,
time and cheating; every hero; screens, audio, offline and App Store), every finding checked
against the code before fixing, the whole test suite run locally on the iPhone profile, then the
full lane (all tests, all three browsers, every device profile) on CI before deploying.

## 1. Real player crashes

From your `top_crashes_this_week.sql` results:

| Crash | Count | Players | What it is | Status |
|---|---|---|---|---|
| `this.source.glTexture` | 10 | 5 | Every one in the Abyss (top score 15,501): a hazard drawn with a texture that was freed | **Part 0** (next, its own deploy) |
| `killed_mid_run` | 17 | 7 | See below: not memory | Two reporting bugs fixed tonight |
| `recovered` | 6 | — | Runs saved after an error (the safety net working) | — |
| `i.cat` (Shop) | 5 | — | The shop drew an item that no longer exists (an old offer in the save / config) | **Fixed** (#34) |
| `contextlost` | 3 | — | The phone dropped the graphics context (already recovered by the game) | — |
| `this.data.drawImage` | 3 | — | Old builds only | Gone in the current build |
| `this.frame.cutWidth` | 2 | — | Build mw65x6n0 only | Gone in the current build |

### killed_mid_run: are they iOS memory kills?

**No.** Broken down by realm, score, distance, hero and run length:

- **17 rows are about 11 real events.** 5 pairs are the same report sent twice (same millisecond), and
  one 2,679-point run was reported twice 46 minutes apart.
- **Almost all were in the first seconds of a run**: 8–26 m in the Neon Void (the first realm),
  i.e. 3–8 seconds in, with tiny scores. One was longer (2,679 points, 964 m, Frozen).
- **Heroes are all different** (TUNG, DAWSON, SPLICE, LURKEEL, MILZZZ, VOLT, RONIN, THE HADDAD).
- **None in the Abyss, none at high scores, none in long runs.** Memory can't build up in 5 seconds.

So these are players closing / locking the phone right after starting, plus one real bug: a new
version arriving in the first 15 s after launch **reloaded the page mid-run** (fixed tonight, #27) —
that matches the cluster of very early runs. The real memory-type crash is the Abyss
`glTexture` one, which Part 0 fixes.

Fixed tonight so the numbers are honest from now on:
- **Duplicate reports** (#35): two reports in a row (or a page closed mid-upload) sent the same rows
  twice. Rows now leave the queue before they're sent, one upload at a time.
- **The same run reported (and credited) twice** (#36): if a page was still alive in the background
  when the game was opened again (a second tab, or Safari + the home-screen app), the old page wrote
  the run's checkpoint again the next time it was hidden, so the next launch reported it and paid its
  coins a second time. A run another page already credited is never written again.
- **Telling crashes from closes** (telemetry): every `killed_mid_run` now says whether the game was
  **on screen** or **in the background** when it was last seen, and **how many seconds into the run**,
  e.g. "the game was closed mid-run (on screen, 412s in)". An on-screen one deep into a run is a real
  crash (memory or a freeze); a background one is the phone tidying up or a swipe-away.

Long runs: the hardening soak (50,000+ score through every realm, The Calm, the Abyss and every
dimension; memory, objects, tweens, timers and audio nodes stay flat) is part of the full lane.

## 2. Bugs fixed tonight

Each one has a regression test in `tests/e2e/super-sweep.spec.js` unless noted.

### Progress and cloud sync (data loss)
| # | Bug | Cause | Fix |
|---|---|---|---|
| 1 | A signed-in player who opened the game offline (or on a flaky network) could **overwrite their whole cloud save** with this device's: the next save uploaded straight over the account. Two signed-in devices could also wipe each other. | The launch-time download + merge failed quietly, but uploads weren't blocked. | Uploads now wait for a successful download + merge in this session; until then an upload attempt retries the merge instead. |
| 2 | **Logging out offline wiped unsynced progress** (stars, coins, heroes since the last upload). | The failed upload was ignored, then the device save was reset. | Logging out is refused with "Can't reach the cloud right now. Connect to the internet to log out without losing progress." |
| 3 | A change made while an upload was in flight **never reached the cloud**. | The new upload request was dropped while one was running. | It's remembered and pushed as soon as the running one finishes. |
| 4 | Progress from the last few seconds before closing / backgrounding the app, or from playing offline, stayed off the cloud until the next launch. | Nothing uploaded on close or when the connection came back. | Upload when the app is hidden or closed, and when the device comes back online. (Code path; no browser test can close a tab mid-upload.) |
| 5 | After a password-reset or email-confirmation link, scores and renames went to the old guest id and were silently dropped. | The leaderboard kept the previous session. | The leaderboard restarts on the new session. |
| 6 | The cloud merge **dropped Drift Pass+ banners** (their tier stayed claimed, so the banner was lost for good) and could **pay a finished event challenge twice**; the level map's finale eye progress was lost on every merge and on reload. | Those fields weren't merged / saved. | Merged (owned for good / finished for good / furthest open), and the eye progress is saved. |

### Economy and purchases
| # | Bug | Cause | Fix |
|---|---|---|---|
| 7 | **Daily Drop farmable by changing the phone clock**: forward a day, claim, back, claim again — endless free pods (and 250-coin refunds once everything is owned). | "Ready" meant "a different day", not "a later day". | Only a later day counts. |
| 8 | **Earned but unclaimed Drift Pass+ tiers were lost when the season ended** (Season 1 ends 2 Dec). | The season recap auto-claimed the free track only. | The recap also pays out earned paid tiers for verified Drift Pass+ owners (once). |
| 9 | A **guest who bought Drift Pass+ lost it on every launch** (Restore brought it back only until the next launch). | The launch check dropped every entitlement for anyone not signed in, though guests can buy. | Guests keep their own verified purchases; only a device with no session at all drops local entitlements. (Code path: the purchase server isn't reachable from tests.) |

### Heroes
| # | Bug | Fix |
|---|---|---|
| 10 | TUNG's aura, orbiting stars and halo (levels 2–5) **stayed frozen on screen after she died**. | Hidden / cleared on death. |
| 11 | The Mirror Realm twin left glows behind (TUNG's horn glow and aura, DEWBERRY's glow, DAWSON's Neon Reef glow, MATTOE's aura, THE HADDAD's streaks) — they stayed on screen, even after RETRY. | Hiding the twin now hides / clears everything its hero draws. |
| 12 | DAWSON in a shop colour skin (e.g. Gold) **lost the skin's colours as soon as a realm changed**. | His realm wings now leave a colour skin alone. (Code path.) |
| 13 | Results and leaderboard portraits ignored DAWSON's and TUNG's own skins. | Portraits wear their own skins. |
| 14 | TUNG's flap chime could use a stale level (from a preview on the hero page). | Set from her real level when a run starts. (Code path.) |
| 15 | **Practice levels counted toward TUNG's upgrade levels** and her title ("practice never counts" is the rule everywhere else). | Practice no longer counts. (Code path.) |
| 16 | Drift Pass+ / reward previews of DAWSON / TUNG skins showed an empty stage. | The skin is shown on its hero. (Code path.) |

### Level mode
| # | Bug | Fix |
|---|---|---|
| 17 | A second crash right after a checkpoint respawn (before that pattern came back) sent the player **back past the checkpoint**. | The checkpoint's own record is kept. (Covered by the 50-level bot runs.) |
| 18 | Pausing during the 0.2 s Abyss blackout at the start of levels 41–50 opened an **invisible pause menu**. | The pause menu always shows. |
| 19 | With every level finished, the map showed the hero **off screen** (at level 50 while the map opened on the first level short of 3 stars). | The hero stands where the map opens. (Code path.) |
| 20 | Practice runs announced "MISSION COMPLETE" banners for missions that never complete in practice. | No mission banners in practice. (Code path.) |

### Screens, input, audio, battery
| # | Bug | Fix |
|---|---|---|
| 21 | A second tap during a screen fade (or two fingers on two buttons) could **start two screens**. | One screen change at a time; input is off during the fade. |
| 22 | Pause-settings sliders added listeners every time the menu opened (they piled up). | Removed with the slider. (Code path.) |
| 23 | **Offline, the music re-downloaded every frame** (several failing requests per frame — battery and data). | A failed track is retried after 10 s, not every frame. (Code path.) |
| 24 | Old music decks stayed connected to the mix after they ended (Safari keeps their decoded audio alive: memory grew run after run). | Unplugged when their last sound ends. (Code path; soak checks audio nodes.) |
| 25 | **Music kept the audio hardware running in the background** (Android / desktop tabs). | It sleeps when the game is hidden and wakes when it's back. (Code path.) |
| 26 | Native haptics (once the iOS plugin is added) could raise an unhandled error. | Errors are caught. (Code path.) |
| 27 | A new version arriving in the first 15 s after launch could **reload in the middle of a run**. | Only when no run is in progress (otherwise at the next safe moment). (Code path.) |
| 28 | The share card's hero chip didn't use the game's Korean-capable font (손주원 fell back to the system font). | Galmuri11 added to its font stack. (Code path.) |

### Offline and updates
| # | Bug | Fix |
|---|---|---|
| 29 | **The game couldn't start offline after one visit**: the offline cache only held the page and icons; the game's scripts, styles and fonts were never cached, and offline the page itself was served in place of a missing script. | Every build's scripts, styles, fonts and images are pre-cached on the first visit; only a page load falls back to the page. Music is still cached realm by realm as each track first plays. |
| 30 | The offline cache stored a new copy of `version.json` every 5 minutes (it never shrank). | The update check always goes to the network and is never stored. |
| 31 | The soundtrack test page and its 256 KB synth engine shipped in the release build (reachable only in test builds). | Left out of release builds entirely. |

### Tests
| # | Bug | Fix |
|---|---|---|
| 32 | "Drift Pass+ heroes: standard speed" and "no skin changes the hitbox, speed or score rules" compared distances to the hundredth of a metre, but a run starts a frame earlier or later with frame timing (and speed grows with distance): it failed on rounding with identical heroes. | Compared within 0.05 m (a real speed difference is metres). |

### Crash reporting and the shop
| # | Bug | Fix |
|---|---|---|
| 34 | The shop **crashed on opening** (`i.cat`, 5 reports) when an offer (or the SALE ribbon on the tabs) pointed at an item that no longer exists. | Unknown items are skipped everywhere the shop reads them. |
| 35 | Crash reports were **sent twice** (5 duplicate pairs in your table). | Rows leave the queue before they're sent; one upload at a time; put back only if the upload fails. |
| 36 | A run could be **reported and credited twice** when an old page was still alive in the background. | A run another page already credited isn't checkpointed again. |

### Server (SQL for you to run — I don't run database changes)
| # | Bug | File |
|---|---|---|
| 33 | Leaderboard rows carried the **phone's** time: a clock set a year ahead kept a best on TODAY / THIS WEEK for a year (and a clock set back hid real ones). | `supabase/migrations/20261108000001_server_time_scores.sql` — stamps every new result with the server's time. Safe to run more than once. Paste into Supabase → SQL Editor. |

## 3. Not fixed, and why

- **Abyss `glTexture` crash** (10 reports, 5 players) — the next job (Part 0), deployed on its own with its own tests.
- **A run continued in an old background page after another page credited it** still pays its first part twice when it finally ends (rare: two pages open at once). Fixing it means one page "owning" the save at a time — a bigger change, listed for later.
- **Coins can be duplicated across two devices** — the cloud merge takes coins from the save with more progress but owned items from both, so coins spent on one device can come back from the other. A safe fix needs lifetime "earned" and "spent" counters in the save and a migration for existing saves; that's an economy change I'd rather you approve.
- **Level boards accept impossible times** — the server only checks that the score matches the time, not that the time is possible for that level. Fix: a server table of each level's minimum time (generated from the level data) checked by the score trigger. Needs a migration I'd write for you to run.
- **Edited saves sync to the cloud** — the cloud save accepts any JSON, so a hacked local save (coins, heroes, stars) uploads as-is. Drift Pass+ titles, heroes and flair are already stripped on the leaderboard. Real protection needs server-side validation of saves (an economy service).
- **Name reporting** — built on `ios/review-ready` (with its SQL) and not merged yet, waiting for your go-ahead. Names are only checked in the game, not on the server.
- **Setting the clock forward** lets a player buy featured / limited heroes early (the shop trusts the phone's date).
- **Level "attempts"** only count finishes (restarts and quits aren't counted).

## 4. Design decisions for you

1. **Notch spacing**: the safe-area probe adds the bottom inset to the top one, so the top UI sits ~34 pt lower than needed on Face ID iPhones. Fixing it moves the top UI up.
2. **Buttons under 44 pt**: TUNG's LOOK (~22 pt), JAMAL NOISES, LATER, level-card buttons, the offer ✕, every BACK and RESTORE PURCHASES (~35 pt). Option: enlarge only the invisible tap area.
3. **Small text**: titles under names (~6 pt) and the RESTORE label are hard to read on small iPhones.
4. **Require an account to buy Drift Pass+?** Tonight's fix keeps guest purchases working instead; requiring sign-in is itself an App Store risk (5.1.1).
5. **MATTOE** never plays an equipped death effect (every other special hero does).
6. **WALLRUNNER** (x15 coins) doesn't get the gold perk badge on the leaderboard; your own row never shows the perk badge.
7. **Menus redraw at 120 fps** on ProMotion iPhones (battery). Option: cap menus at 60.
8. **Load time**: all hero art and four realms' hazards are built before the home screen, and the boot waits up to 1.5 s for fonts (including the 164 KB Korean font for one hero name). Deferring them is a loading-order change.
9. **Boss node on short screens** (iPad): the hero above a boss node can sit partly under the header when the level card is open.
10. **Haptics toggle**: there's no setting to turn haptics off.

## 5. App Store readiness

Checked and fine: no debug flags, test hooks, test pages or placeholder text in the release build
(test flags compile out); account deletion, Restore Purchases and Sign in with Apple (iOS only)
exist; Mystery Pod odds are shown; secrets: none in the code or the whole git history (only the
publishable key, which is public by design; a fake `sb_secret_abc123` test value and setup
instructions match a scan).

Likely rejection reasons still open:
1. **No privacy policy or support link inside the app** (5.1.1) — accounts and leaderboards need them. Adds two buttons to Settings.
2. **Hard-coded "$3.99"** for Drift Pass+ — must show the App Store's localized price (StoreKit `displayPrice`).
3. **User names with no report / block** (1.2) — name reporting is on `ios/review-ready`, not merged.
4. **Haptics plugin missing** in the iOS app (`@capacitor/haptics` isn't installed): not a rejection, but haptics do nothing on iPhone.

## 6. Is it stable enough for the App Store?

**Stability: yes** — once the full lane is green on all three browsers (see below), the game itself
is stable: no known crash, the long-run soak stays flat, and tonight's data-loss bugs are fixed.

**Send it to the App Store tonight: no** — items 1–3 in section 5 would likely get it rejected.
They're small (a Settings link pair, the StoreKit price, merging name reporting), but they're
features / design, so they wait for you.

## 7. Test results

Local, whole suite on the iPhone profile (Chromium): **131 passed, 1 failed** — the failure was the
skin speed test's rounding (#32), now fixed; it and the 12 super-sweep tests then passed, as did every
crash-safety, shop and skin test rerun against the final builds.

CI full lane (every test, Chromium + Firefox + WebKit, all 7 device profiles): see the deploy note
below.
