# Glydrift overnight quality sweep: 2026-11-02

Branch: `bugfix/2026-11-02`, branched from `art/pixel-overhaul`, the pixel version that is live. Nothing was deployed.

This sweep fixed bugs, stutters and visual glitches only. Nothing here changes the art style, the difficulty or how the game plays. Anything that would have changed those is listed under "Design decisions for you".

## How it was tested

- **Browsers.** Headless Chromium with a software GPU (SwiftShader). I tested two iPhone sizes, 390×844 and 430×932, using an iPhone user-agent and the Dynamic Island safe-area fallback.
- **Fast simulation.** A harness drives the game's own update loop many frames at a time. It plays whole runs in seconds, through every biome, The Calm and the Abyss, and times every frame.
- **Soak tests.** I ran 30+ runs back-to-back through the real Game Over and Retry flow, in both god mode and normal mode. After each run I logged heap size, game-object counts, tweens, timers, event listeners, textures, music tracks and the worst frame.
- **Flow tests.** These used real touch taps (including double taps) on every button of Home, Heroes, Progress, Leaderboard, Settings, Daily Reward, Daily Challenge, Pause, Game Over and Share. They also covered a fresh install with cleared storage, and switching apps mid-run.
- **Leaderboard.** I intercepted network calls to simulate a connection that hangs, an empty leaderboard and a server error. The Supabase keys and database were not touched.
- **Audio.** Audio was unlocked with a real tap. I checked Music state through The Calm and into the Abyss, after death, after retries, and with mute on before and after a reload.
- **Hitboxes.** Each hazard's collision area was drawn over the real sprites in all five biomes.

**About the timings.** The software GPU makes texture uploads hundreds of times slower than a real phone. Absolute milliseconds below are worst cases from that test browser, not iPhone numbers. The before/after comparisons use the same setup, so they are fair.

## Bugs fixed

| # | Bug | Where | Fix |
|---|-----|-------|-----|
| 1 | **120 Hz judder.** On 120 Hz screens the game ran at about 48 fps, with frames alternating between 16.7 ms and 25 ms. The 60 fps cap's threshold (16.67 ms) was a hair more than two 120 Hz ticks (16.66 ms). | `src/main.js` | Cap set to 61 fps. With a simulated 120 Hz clock this went from 485 to 600 steps per 10 s, all 16.7 ms apart. 60 Hz is unchanged. |
| 2 | **~108 MB of wasted canvas memory, plus multi-second freezes when hazards appeared.** Phaser gives every tiled sprite (walls, pillars, beams, background layers) a hidden canvas the full size of the sprite. In WebGL that canvas is never drawn on, but it is still allocated and uploaded to the GPU. iOS Safari caps total canvas memory, and past the cap canvases render blank. | new `src/gfx/tileSpriteFix.js` | Tiled sprites now get a 1×1 hidden canvas, and in WebGL it never grows. That memory went from 108 MB to 0. Every tiled hazard, wall and background layer in all 5 biomes was re-checked visually. |
| 3 | **Freezes of 1–4 s on the first visit to each biome, and when the Abyss walls or crushers first appeared.** Their graphics were built on the spot, mid-run. | `ObstacleManager.prewarm`, `PixelBackground.prebuildNext`, `Terrain.prebuild` | One of every hazard type is built when the run screen opens. Every biome's walls are built up front, and the background layers are built one per frame while idle. |
| 4 | **Text re-drawn many times at the busiest moments.** Each biome change re-drew the title three times. Each "CLOSE!" popup re-drew up to four times. SPEED UP and the run banners created new text objects mid-run. | `HudScene`, `Effects.floatText` | Biome titles are drawn once and reused. Popups only restyle when their colour or size changes. SPEED UP and the run banners are reused. |
| 5 | **Slow startup.** The pixel art was drawn one rectangle per art pixel. | `src/pixel/px.js` | The art is now written as raw pixel data and scaled up without smoothing. Pixel-art drawing went from 4.3 s to 0.9 s, and all 165 generated textures were verified byte-identical. |
| 6 | **Game Over header overlapped "SCORE" on Dynamic Island phones.** The header follows the safe area, but the label was at a fixed screen position. | `GameOverScene` | The header moves up and the label keeps clear. Verified at both sizes. |
| 7 | **Achievement and unlock banners on Game Over dropped onto the score.** | `GameOverScene`, `ui.toast(side)` | They now slide in from the side, in the empty band above RETRY. |
| 8 | **The ENTERING biome title overlapped run banners by about 15 units.** This happened when a mission completed on biome entry, such as "Reach Solar Storm". | `HudScene` | The title moved below the banner lane. Measured with no overlap: score ends at 223, banner spans 319–403, title starts at 446. |
| 9 | **A falling icicle could kill you 40 units above its visible top.** | `signature.js` Icicle | The hitbox now starts at the icicle's own top edge once it's falling. All other hazards match their art (see `docs/bugfix-2026-11-02/hitbox-overlay.jpg`). |
| 10 | **Notes dropped ("Max polyphony exceeded").** Stutter effects retrigger 4–5-note chords, which ran past 16 voices. | `music.js` | Voice limits raised: chords from 16 to 32, pads from 16 to 24. |
| 11 | **Console warning "music tick skipped".** It appeared after main-thread stalls. | `music.js` | The safe skip is now counted silently and shown on the `?music` test page. |
| 12 | **Phaser created an audio context it never used.** All sound runs through Tone.js. | `main.js` | Phaser's audio is switched off (`audio.noAudio`), which removes one idle audio context. |
| 13 | **Build warning about `__dirname`.** | `vite.config.js` | Switched to `import.meta.dirname`. The build now has zero warnings. |
| 14 | **Dead code.** | `ObstacleManager`, `GameScene` | Unused imports and variables removed. |

Earlier in the night, on the feature branch, I also fixed a meteor that asked for an animation frame that doesn't exist, and obstacles that could drift into the start of The Calm.

## Smoothness: worst frame spikes

| Scenario (same headless setup) | Before | After |
|---|---|---|
| Single run through all 5 biomes (fast simulation) | 3,600 ms (Abyss hazards first built) | **48 ms** |
| First visit to each biome | 1,100–1,500 ms | **25–60 ms** |
| 30-run soak at 430×932, god mode, runs to 2,600 m | 7–28 s on many runs (texture uploads) | **≤ 61 ms** on every run, no upload over 80 ms |
| Frame pacing on a 120 Hz display | about 48 fps, alternating 16.7/25 ms | **60 fps, steady 16.7 ms** |
| Startup pixel-art drawing | 4.3 s | **0.9 s** |
| Average update cost per frame | — | 0.05–0.3 ms |

**Run 30 compared with run 1.** Across the soak, the heap stayed flat at 68.9 MB and the number of event listeners stayed stable (14–17). Tweens and timers returned to baseline after each run. Average and worst frame cost on the last runs matched the first.

Object counts grow at first because the reuse pools fill up: particle rings, decor, "CLOSE!" labels, a second copy of some hazards. They level off. Nothing leaks.

## Checked and working

- **Fresh install** (cleared storage): the name prompt, then RANDOM and SAVE, then the daily reward (+50 coins). No errors.
- **Every button** on every screen, with a single tap and a double tap: no errors, and each one goes where it should. A double tap on RETRY starts exactly one run.
- **Pause and app switching:** the pause button pauses the game. Switching apps mid-run auto-pauses with the overlay showing, and RESUME continues the run.
- **TAP TO FLY** shows only before the first flap.
- **Saving:** after two runs the save was byte-identical after a reload. The menu showed LV 2, 268 coins and BEST 1330, and the Heroes coin count and the Progress achievements (4/16) all matched the save.
- **Leaderboard:**
  - With a hanging connection it shows "Loading…", then OFFLINE with a RETRY button after 8 s.
  - With an empty board it shows "BE THE FIRST!".
  - With a server error it shows "Couldn't load… Try again".
  - Retry after death takes 1 ms in all three cases, so the upload never blocks it.
  - The offline queue keeps scores through failures, and it drained when the server answered.
- **Audio:**
  - Nothing plays before the first tap.
  - Tracks crossfade between biomes.
  - In The Calm the drone and heartbeat come up and the music filter closes.
  - The 140 BPM Abyss track starts on the slam, about 0.24 s in real time in this slow browser.
  - After death the music goes back to Neon Void and the Calm audio is cleared.
  - Mute saves and survives a reload.
- **Layout:** nothing is cut off by the notch, Dynamic Island or home indicator at either size, and there are no black bars. All screens are listed in the testing section above.

## Bugs found but not fixed

1. **Console warning "The AudioContext was not allowed to start" on page load.** Tone.js creates its audio context as soon as it's imported. Fixing it means loading Tone after the first tap, and on iPhone audio must be unlocked inside that tap. Getting this wrong would silence all audio on iPhone, so it's too risky for an overnight fix. The warning is harmless.
2. **"Max polyphony exceeded" can still appear,** but only when the main thread stalls for seconds, as in my soak harness: Tone then catches up and fires many notes at once. I couldn't confirm whether it happens in normal play.
3. **The score text is re-drawn and re-uploaded about 20 times a second while you fly.** That's how Phaser text works. The cure is a bitmap font for the score, which would change how the score looks.
4. **The two-player Supabase security test still can't run here,** because this environment's network blocks `supabase.co`.
5. **No real-device profiling.** All timings come from a software-GPU browser. A short Safari Web Inspector session on a real iPhone would confirm the improvements.

## Design decisions for you

- **The Settings "BACKDROP: GRID" button does nothing anymore.** The pixel backgrounds replaced the old styles. Remove it or repurpose it? See `docs/bugfix-2026-11-02/settings-backdrop-toggle.jpg`.
- **The leaderboard shows the title "OFFLINE" for server errors too.** The line under it is correct ("Couldn't load… Try again"); only the title is misleading.
- **Physics depends on the frame step.** The 60/120 Hz match comes from the 61 fps cap. True 120 fps on ProMotion iPhones would need fixed-step physics with interpolation: smoother, but more battery use, and a small change in how the bird moves.
- **The Abyss slam crushers close fully,** so you must time them (red lamp plus rattle as warning). The Abyss darkness is set to 0.82 opacity with a 340 px light radius. Tune either to taste.
- **The Calm's colour drain** uses a WebGL colour-matrix pass for about 7 seconds. It's cheap, but it is the only full-screen effect left.

## Top 3 to fix next

1. **Profile on a real iPhone** with Safari Web Inspector (Timelines, then a JavaScript and graphics recording) through a Solar-to-Abyss run. This confirms the test-browser results.
2. **Bitmap font for the in-run score.** This removes the remaining per-frame text uploads. It's a small visual change.
3. **Remove the leftover neon-era code:** the unused SkyScene, the old Background class, the neon crusher, `neon.js` and the old smooth hero textures. Also decide on the BACKDROP setting. Startup cost is small (about 54 ms), but it simplifies the code.
