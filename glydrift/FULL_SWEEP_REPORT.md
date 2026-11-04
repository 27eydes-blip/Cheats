# Glydrift full bug sweep: 2026-11-04

Branch: `bugfix/full-sweep-2026-11-04`, branched from the live home-screen build (`b1b0e29`). Nothing was deployed, and `main` was not touched.

This sweep fixed bugs only. Nothing here changes the art, the difficulty, the economy numbers or how the game plays. Anything that would have changed those is listed under "Design decisions for you". The Supabase keys and database setup were not touched.

## How it was tested

- **Browsers.** Headless Chromium with a software GPU (SwiftShader). I tested three iPhone sizes: 375×667 (SE), 390×844 (standard) and 430×932 (Pro Max). The Dynamic Island and home-indicator safe areas were simulated for each.
- **Screen sweep.** A script opened all 30 screens and states at each size. It saved a screenshot and logged every console error and warning.
- **Soak test.** 40 runs back-to-back through the real Game Over and Retry flow. After each run I logged the worst frame, heap size, object counts, tweens, timers, event listeners and textures.
- **Code review.** I read the code for economy, leaderboard and save, then for leaks, then for the release build. Each finding was confirmed in the code before it was fixed.
- **Leaderboard.** The online board was stubbed so it could render 40 rows. The network to Supabase is blocked in this sandbox, which is why every log has `ERR_TUNNEL_CONNECTION_FAILED`.

**About the timings.** The software GPU is far slower than a real phone, especially at uploading textures. Absolute milliseconds here are worst cases from the test browser, not iPhone numbers.

## Bugs fixed

### 1. Build and code health

| Bug | Where | Fix |
|---|---|---|
| Build warning: `seasons.js` imported the leaderboard dynamically, but it was already bundled statically. | `src/data/seasons.js` | Changed to a static import. The build now has **zero warnings**. |
| **Release builds exposed test hooks.** `window.__glydrift`, `__leaderboard`, `__heroDefs` and `__music` were set for everyone. `?music` and five taps on the logo opened the music test page, and `?lbtest` worked in release. | `main.js`, `BootScene`, `MenuScene`, `leaderboard.js` | All are now gated on the test-build flag (`GLY_TEST=1`). `?god`, `?demo`, `?character` and `?dimension` were already gated. |
| Missing-frame warnings at the start of every run (`cap_0`, `cap_1`, `cap_1b`, `emitter`). | see Gameplay below | Fixed at the root (see Gameplay). |
| The "Max polyphony exceeded" warning flooded the console after a stall. | `src/audio/music.js` | See Audio below. |

**Remaining console messages:** `ERR_TUNNEL_CONNECTION_FAILED` comes from this sandbox having no network. "The AudioContext was not allowed to start" comes from Tone.js: it creates its audio context when the page loads, and that context stays silent until the first tap. This is expected, and the warning is harmless (see "Found but not fixed").

### 2. Every screen

All 30 screens and states at all 3 sizes are in `docs/sweep-2026-11-04/` (`small_375x667_*.jpg`, `std_390x844_*.jpg`, `large_430x932_*.jpg`; 4 contact sheets per size, each screen labelled). The hero check is in `all_68_heroes_fly_and_die.jpg`. I found no overlaps, nothing under the notch or home indicator, no black bars, no empty boxes, and Korean renders everywhere it appears (손주원, 손주원팬).

| Bug | Where | Fix |
|---|---|---|
| **The first tap after scrolling did nothing** on pass tiles, shop tabs and shop cards. Phaser fires the object's tap before the scene's drag-end, so handlers read the previous drag. | `PassScene`, `ShopScene` | Handlers read the live drag state. |
| **Leaderboard:** a late reply from a previous visit could overwrite the board you're looking at. | `LeaderboardScene` | Request IDs now carry across visits. |
| Looping tweens kept running on popups and pass tiles after they were destroyed. | `ui.js` (new `killTweensDeep`), `MenuScene`, `ShopScene`, `PassScene` | Tweens are stopped before destroy. |
| The home showcase didn't pick up newly reached worlds until a reload. | `MenuScene` | Reset on every visit. |

Rapid and double taps: PLAY, DAILY CHALLENGE, RETRY and HOME are all guarded (`leaving` flags), and every popup has a full-screen blocker behind it, so taps can't leak through.

### 3. Gameplay

| Bug | Where | Fix |
|---|---|---|
| **Abyss gate caps, Glitch beam nodes and Frozen icicle caps could render as Phaser's "missing" texture.** These hazards are pre-built at run start, but since the iPhone crash fix each biome's art is only built as you approach it. Pieces built before their art existed kept the missing frame for the rest of the session. | `obstacles/biomes/abyss.js`, `glitch.js`, `frozen.js` | They start blank and pick up the real art when they spawn. |
| **Leaving a run during The Calm** (Pause, then HOME) left the grey filter on the shared background and kept the Calm drone and heartbeat playing in the menus. | `GameScene` shutdown | Both are cleared on shutdown. |
| Coin glows could stay frozen on screen after Retry. | `ObstacleManager.reset` | Halos are hidden on reset. |
| A reused hazard could start inside RONIN's Fire Ward. | `obstacles/base.js` | The ward state resets in `arm()`. |

**Dimensions:** each of Prism, Tidal, Chrono and Mirror was started directly (test flag) and flown 1,300 m through the next rifts. All their hazards spawned (prism lasers, glass and prisms; jellies, mines, currents and bubble columns; gears, pendulums, time zones and rewind; spires, orbs and bars), the Mirror twin worked, each dimension was recorded as discovered, and there were no errors.

### 4. Characters

| Bug | Where | Fix |
|---|---|---|
| **RONIN's +13 perk coins were counted as "collected" coins.** They inflated coin missions and stats, and with Double Coins they were doubled. | `GameScene`, `GameOverScene`, `progression.js` | The bonus is now paid on top as `perkBonus` and shown as its own pop. It never counts as collected. |
| "Unlock now!" showed for heroes that unlock by challenge, not coins. | `progression.js` `nextUnlockHint` | The coin share is 0 for challenge heroes. Their progress uses the real stat. |

**All 68 heroes** were flown, given a near-miss and a new-best reaction, then killed: no errors, every sprite drawn, every death animation plays. That includes the shelved animals, through the test flag. Hitboxes are shared by every hero (one standard size), and this sweep didn't change them. Hats and shades were checked on 손주원, YARMS, RONIN and VOLT.

### 5. Economy, shop, pass and seasons

| Bug | Where | Fix |
|---|---|---|
| **The shop could charge more than the price shown.** The daily deal changes at midnight, and a card left open across midnight charged the new price. | `cosmetics.js` `buy`/`buyBundle`, `ShopScene` | The purchase checks the shown price. If it changed, you see "PRICE UPDATED" and the shop refreshes. |
| **The Lucky Spin pity counter reset on every launch.** `spinPity` wasn't in the save defaults, so loading dropped it. | `save.js` | Added to defaults (with `xpBoost` and `seasons`). |
| An XP boost that ran out kept its old multiplier, so the next boost of a different size used the wrong one. | `driftPass.js` | The multiplier resets once the boost is spent. |
| **The pass screen stayed open on a season that had ended**, and let you claim from it. | `PassScene` | It goes home when the active season changes. |
| **A bad remote season challenge could crash the end of a run.** | `seasons.js` | Malformed challenges are dropped, rewards are coerced to whole non-negative numbers, and season records are filled defensively. |
| **The daily reward could be claimed twice, and the streak reset,** if the date went backwards (flying west, or changing the phone's clock). | `progression.js` `loginStatus` | A date earlier than the last claim counts as already claimed and keeps the streak. |

Checked and working: coins and shards never go negative (every spend checks the balance first). Boosted runs never submit to the leaderboard. Claim All gives each tier exactly once. Tier 50 shows "ALL 50 TIERS DONE". The Lucky Spin badge caps at 99+ and hides at 0. Season end auto-claims, resets and shows the recap.

### 6. Save data

The `seasons`, `spinPity` and `xpBoost` keys are in the save defaults. Before this, the save merge dropped any top-level key missing from defaults on load. A fresh install with cleared storage goes through the name prompt and the daily reward with no errors.

### 7. Online

| Bug | Where | Fix |
|---|---|---|
| **Long, legitimate runs were silently rejected as "impossible".** The plausibility limit didn't allow for the fastest hero, the Abyss speed spike or Chrono's fast zones. | `leaderboard.js` | The limit now allows 1.8× top speed plus a margin. That is still far below any cheated score. |
| **A new best could merge into the score that was mid-upload** and be lost when that upload finished. | `leaderboard.js` | The in-flight entry is never merged into. |
| **Any network hiccup dropped a queued score.** | `leaderboard.js` | Only clear server refusals (400/403/404/409/422, or Postgres errors) drop a score. 5xx errors, rate limits and timeouts retry with backoff, up to 60 s, and a score is dropped after 8 tries. |
| Renaming yourself while a score was uploading could drop it. | `leaderboard.js` `setUsername` | The rename edits the queue in place. |
| Analytics events were lost if the app was closed from the background. | `analytics.js` | The queue is also flushed when the app is hidden. |
| The service worker cached a new copy of `seasons.json` for every query string. | `public/sw.js` | One cache key. |

### 8. Performance

| Bug | Where | Fix |
|---|---|---|
| **A hitch each time a new biome approached.** Since the iPhone crash fix, the next biome's art (about 20 textures) is built 700 m ahead, all in one frame. In the test browser that took 100–170 ms. | `pixel/px.js` (`deferUploads`), `pixel/themes.js` (`queueBiomeArt`, `pumpBiomeArt`), `GameScene` | The art is drawn up front and uploaded one texture per frame during the lead-in. Anything that needs it immediately (entering the biome, the menu) still finishes it right away. All 121 biome textures were verified identical to the old build. |
| **A hitch on arrival in every biome or dimension built mid-run.** The background-layer prebuilder stopped after startup, and the terrain only prebuilt biomes whose art existed at run start. Later biomes built their walls and parallax layers on arrival, worst at a rift. | `BackdropScene`, `GameScene` | Both are now prebuilt, hidden, as soon as the art is ready. |
| A music note burst after stalls. | `music.js` | See Audio. |

Details are under "Smoothness" below.

### 9. Audio and settings

| Bug | Where | Fix |
|---|---|---|
| **A burst of notes after a main-thread stall.** Tone.js plays every missed 16th note at the same instant. That is an audible blast, and it flooded the console with "Max polyphony exceeded". | `music.js` `tick` | Notes more than 0.25 s late are skipped and counted. The bar position stays correct, and a track's first note is never skipped. |
| The Calm's drone kept playing after leaving the run (see Gameplay). | `GameScene` | Fixed. |

Music starts only after the first tap. Every setting (music, SFX, mute, low graphics, reduce flashing, name) saves and reloads. Flashing was verified at 3 or fewer per second in the 11-02 sweep, and no new flash effects were added since.

## Smoothness: worst frame spikes

All numbers come from the same headless software-GPU setup, with each test run alone on the machine.

| Scenario | Before | After |
|---|---|---|
| Next biome's art being prepared (once per new biome, 700 m before it) | **102–170 ms** in one frame, every biome | **37–59 ms** (the single largest upload) |
| Arriving in a biome or dimension built mid-run (walls and background layers) | **43–194 ms** at every boundary, worst at the rift into Chrono | **No frame over 60 ms** past 500 m, on a god-mode run to 5,200 m through the rift |
| Music after a long stall | every missed 16th note played at once | late notes skipped |
| First texture upload of a session, at 500 m | about 1.5 s | about 1.5 s (unchanged, see below) |

**The 1.5 s at 500 m is a test-browser artifact.** The slow upload is a 4×256 sky gradient, the smallest texture in the game. Every other sky uploads in 30–60 ms. The cost is the software GPU flushing its queue the first time, not work the game does, and it happens the same way on the old build. It belongs on the real-device check (Top 5, #5).

**40-run soak** (390×844, real Game Over → Retry each run, runs from 800 m to 3,500 m, covering every biome, the Abyss and dimensions):

- **0 errors and 0 warnings** across all 40 runs.
- **Event listeners:** steady at 14–17.
- **Timers and tweens:** back to baseline after every run (timers 0–7, tweens 6–46 depending on what's on screen).
- **Game objects:** grow as the reuse pools fill, then stay flat. 1,367 at run 25, 1,372 at run 40.
- **Textures:** grow as each new biome's art is built for the first time, then stay flat at about 853 from run 25 to run 40.
- **Heap:** 68.9 MB for runs 1–24, then one step to 117.3 MB at run 25. That is consistent with more dimension art being built for the first time. It stayed flat for the last 15 runs. Chrome reports the heap in coarse steps.
- **Run 40 against run 1:** average update cost per frame went from 4.5 ms (runs 1–2, while art was still being built) to 1.5–2.5 ms (runs 30–40). Nothing degrades over time.

In the soak's harness, worst-frame numbers still show multi-second spikes. They come from the same software-GPU flushing (logic frames there run without rendering, so the queued GPU work lands in whichever frame uploads next), so they don't reflect the phone. The single-run probe above, which renders every frame, is the fair comparison.

**Not re-measured this sweep:** frame pacing at 60 and 120 Hz, and retry time. Both were fixed and measured in the 11-02 sweep (a steady 16.7 ms at 120 Hz, retry under 1 s), and nothing in this sweep touched the game loop or the retry path.

## Found but not fixed

| Issue | Why not fixed |
|---|---|
| **The Today and This Week leaderboards only show players who set an all-time best in that period.** Someone who scores 900 this week but has an older best of 1,000 doesn't appear. | Fixing it needs a new table or column for per-run scores in Supabase. You asked me not to touch the database setup. |
| A cached remote season config (from Supabase or `seasons.json`) beats newer built-in seasons after an app update, until the cache refreshes on the next online launch. | Changing which source wins is risky for live seasons. Keeping `seasons.json` on the site up to date avoids it. |
| DRIFT PASS+ rewards from remote config aren't validated the way free rewards are. | DRIFT PASS+ is display-only ("coming soon"), so nothing can be claimed from it yet. Validate it when it goes live. |
| "The AudioContext was not allowed to start" console warning. | Tone.js creates its context on load. Fixing it means loading the music engine lazily after the first tap: a risky restructure for a warning that's harmless. |
| The Settings screen has no analytics, haptics or notifications toggles. | Adding them would be a new feature. |
| Lucky Spin has no "free spin" state for a FREE badge. | That doesn't exist in the game yet, so it's a feature, not a bug. |

## Design decisions for you

1. **Game Over on tall phones (430×932):** there's an empty band of about 80 pt between the XP bar and RETRY. Should RETRY move up, or should the band hold something (for example the next pass tier)?
2. **The shop tab bar scrolls sideways**, and when you enter on a later tab (Hats, Pods…) the highlighted tab can be off-screen. Should the bar scroll the selected tab into view, or should it be two rows?
3. **The FREE and NEW tags on shop tabs** sit right under the coin and shard pills. They look crowded on the 375-wide SE.
4. **Daily streak:** missing a day resets the streak to Day 1. Some games keep the streak with a one-day grace period.

## Top 5 things to fix next

1. **Per-period leaderboards** (Today and This Week showing the best run in that period). This needs a Supabase migration that adds a runs table, without touching the existing scores.
2. **Load the music engine lazily** after the first tap. That removes the autoplay warning.
3. **Validate DRIFT PASS+ rewards** before DRIFT PASS+ launches.
4. **Version the remote season config** so a newer built-in season beats an older cached remote one.
5. **Test on real devices** on an iPhone SE and a 120 Hz Pro. The timings here come from a software GPU.

## Commits

- `dfac2d2` Sweep: online, economy and release-build fixes
- `5013e8e` Sweep: cleanup / leak fixes
- `7e626a2` Sweep: lazy biome art on pooled hazards, music stall bursts, daily reward clock
- `121b0a1` Sweep: spread each biome's texture uploads over frames
- `278ee4c` Sweep: prebuild walls and background layers for biomes built mid-run
