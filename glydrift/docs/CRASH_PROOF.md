# Crash-proof Glydrift

What keeps the game running when something goes wrong, and the tests that prove it
(`tests/e2e/hardening.spec.js`, plus the crash tests in `game.spec.js`).

## When something goes wrong

| What happens | What the player sees | Where |
|---|---|---|
| A script error in one frame | Nothing. The frame is skipped and the game keeps going. The error is reported. | `systems/frameGuard.js` |
| An error that keeps happening mid-run | After about a third of a second, the run ends the normal way: **GAME OVER**, with score, coins and distance saved and sent to the leaderboard. RETRY starts a fresh game. | `frameGuard.js` → `GameScene.endAfterError` |
| An error that keeps happening anywhere else | Back to the home screen, progress intact. If it still fails, the page reloads (at most once a minute). | `frameGuard.js` |
| A screen fails to open | Back to the home screen with progress intact (the half-built screen stops updating straight away). | `frameGuard.js` `guardScenes` |
| The game can't start (lost connection mid-load, a broken file) | The loading screen says so and offers **TAP TO TRY AGAIN**. Never a blank screen. | `index.html`, `main.js` |
| The phone closes the game mid-run (memory, a call, swiped away) | At the next launch, the run is finished from its last save: score, coins, leaderboard. It's credited exactly once. | `systems/crashSafety.js` |
| The app goes to the background mid-run | The run pauses and is saved at once. | `GameScene.onHidden` |
| The GPU drops the graphics (WebGL context lost) | The game redraws when it comes back. | `frameGuard.watchContext` + Phaser |
| Sound stops (iOS interruption, call, Siri) | The next tap brings it back. | `main.js`, `audio/music.js` |
| The storage is full | Saving makes room (the game's own local logs go first), then saves without ghost replays. | `data/save.js` |
| The storage is blocked (private browsing) | The game plays normally and says progress won't save. | `data/save.js` |
| A damaged save (cut off mid-write, old format, wrong values) | Loads from a backup copy (kept every 20 s), or repairs the bad fields. Never a blank save over a damaged one. The damaged copy is kept aside. | `data/save.js` |
| Supabase is down or slow | Every request gives up after a few seconds. Scores wait in a queue and upload later. The game never waits for the network. | `online/leaderboard.js` |
| A slow connection at launch | After 4 seconds the offline copy loads. | `public/sw.js` |
| A new version is live | It loads at the next launch, or straight away on the home screen or game over (never mid-run). | `systems/updater.js`, `public/sw.js` |

## Bugs found and fixed in this pass

1. **One bad frame could freeze the whole game.** An error mid-frame left Phaser's scene
   manager marked "busy". The next screen change (even the crash recovery itself) then looped
   forever and locked the page. The frame guard now resets it.
2. **Sound effects piled up in Safari's audio graph.** Every coin, near-miss and whoosh left
   about 3 audio nodes connected forever: about 450 per kilometre, so 10,000+ on a long run.
   Safari keeps connected nodes alive. Each sound now disconnects its nodes when it ends.
   This is the likeliest cause of iPhones getting slower and closing the game on very long
   runs, together with the realm art fix from 7 Nov.
3. **A damaged save was replaced by a blank one.** If the save couldn't be read, the game
   started fresh and the next save overwrote the old one: all progress gone. Now it loads the
   backup copy and keeps the damaged one aside.
4. **A save with a wrong value could crash the game** (for example `unlocked: null`). Now
   wrong values fall back to the defaults, and counters can't go negative.
5. **An error mid-run sent the player to the home screen.** Now the run ends with a normal
   GAME OVER and RETRY.
6. **A screen that failed to open left the player stuck** (no BACK button). Now it goes home.
7. **A failed load left the loading screen up forever.** Now it offers a retry.
8. **Backgrounding mid-run** now saves the run at once (it was saved every 3 seconds).
9. **Crash reports are scrubbed** of email addresses, tokens, keys, ids and URL queries.

## Crash reports

Every caught error goes to the Supabase table `crash_reports` with: kind, message, stack,
build, device, browser, screen size, the screen (scene), realm, score, distance, hero and
mode. No email, username or account details. The top crashes of the week:
`supabase/queries/top_crashes_this_week.sql` (paste it into Supabase → SQL Editor).

## The tests

| Test | What it proves |
|---|---|
| soak: a 50,000+ score run (WebKit + Chromium, iPhone) | Through every realm and dimension. Display objects, textures, realm art, particles, tweens, timers, scene / game / input / page listeners, the upload queue and memory don't grow between 15K and 50K. |
| sound effects let go of their audio nodes | 400 sounds, then only the looping ones are left connected. |
| long runs never pile up (game.spec) | Realm art is freed; objects and memory flat over 14 km. |
| one bad frame never locks up the screens that follow | Bug 1. |
| an error mid-run (game.spec) | GAME OVER, score saved and queued, reported, RETRY works. |
| a screen that fails to open | Home screen, progress intact, everything still works. |
| the loading screen offers a retry | Bug 7. |
| a damaged save / wrong values / full storage | Bugs 3 and 4, and the full-storage path. |
| backgrounded mid-run | Bug 8. |
| crash reports never carry personal info | Bug 9. |
| monkey: random rapid taps, double taps and spam on every screen | 120 random taps per screen on 8 screens. The save stays sound and the game keeps running. |
| taps during transitions, pop-ups and reveals | Never two screens at once, or none. |
| opening and closing every screen over and over | No leftover listeners, objects or textures. |
| rotating, resizing, backgrounding and going offline mid-run | The run carries on. |
| 100 deaths and retries in a row | 100 runs counted, nothing grows. |
| a crashed run is credited exactly once | Three relaunches, one run. |
| Drift Pass+: a failed purchase grants nothing, restoring grants it once | No duplicates. |
| levels in practice mode | All 50, start to finish, nothing saved. |
| every hero (game.spec, plus the overnight sweep below) | Visible again after RETRY; every hero flown through every realm and dimension. |

## Overnight results (7 Nov 2026)

- **Every hero, every world:** all 85 heroes flew 9.5 km each in endless mode, through all 7
  realms and all 4 dimensions. Then each one died, went to GAME OVER, retried and flew again.
  No errors, no missing or invisible heroes, all trails present. (A few runs skipped one
  dimension: the order of dimensions is random, so a 9.5 km run doesn't always reach the
  fourth.) Every hero also finished level 1 and the level 50 boss (in CI).
- **Long run:** up to 55,000 score (28 km) in Chromium, plus 50,000+ in CI on WebKit and
  Chromium. Memory stayed at about 20 MB, display objects about 800, textures about 540,
  timers 0, listeners flat, the upload queue empty. With sound on, the sound fix holds the
  audio graph at only the sounds still playing (it was about 450 more nodes every km).
- **Frame time (game logic, 20,000 frames per run, VOLT and THE HADDAD):** median 0.1 ms,
  99th percentile 1.1 ms, worst 29 ms. Nothing over 50 ms. About 12 frames per run went over
  16 ms, all on entering a realm or dimension (its art being prepared). Drawing time can't be
  measured fairly on the test machines (software graphics), so it isn't included.
