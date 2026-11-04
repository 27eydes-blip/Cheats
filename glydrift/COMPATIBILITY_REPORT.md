# Glydrift compatibility report: 2026-11-04

Branch: `claude/glydrift-arcade-game-7hznpc`. Nothing has been published to GitHub Pages yet.

## What runs automatically now

`npm run test:all` builds the game twice and runs the full browser suite:
- the real release build, checked for a clean load;
- a test build, which adds hooks the tests drive.

GitHub Actions runs the same suite on every push and pull request that touches `glydrift/`, with one job per browser engine. The workflow is `.github/workflows/glydrift.yml`.

**Engines:**
- Chromium, for Chrome and Edge
- Firefox
- WebKit, the engine inside Safari and every iOS browser

**Device profiles:**

| Profile | Size | Pixel ratio | Input |
|---|---|---|---|
| iphone-small | 375×667 | 2× | touch |
| iphone-std | 390×844 | 3× | touch |
| iphone-large | 430×932 | 3× | touch |
| ipad-portrait | 820×1180 | 2× | touch |
| ipad-landscape | 1180×820 | 2× | touch |
| laptop | 1366×768 | 1× | mouse and keys |
| desktop | 1920×1080 | 1× | mouse and keys |

That is 3 engines × 7 profiles = **21 browser/device combinations**.

**What each combination checks:**
1. **Loads with no console errors.**
   - No failed requests for the game's own files.
   - The game is framed correctly: never stretched; edge to edge on phones; centred with the themed sides on wide screens.
   - Pinch zoom, ctrl+wheel zoom, double-tap zoom, long-press menus and pull-to-refresh are blocked.
2. **The real release build loads with no console errors**, and exposes no test hooks.
3. **Every screen opens through its real button:** Home, Settings, Heroes, Shop, Lucky Spin, Leaderboard, Progress and the Drift Pass. Each one is checked for framing and screenshotted.
4. **A short run with real input:**
   - taps on touch profiles; mouse clicks plus Space, W and Up on desktop profiles;
   - **exactly one flap per tap, click or key press** (no double inputs);
   - a held key flaps once and doesn't repeat.
5. **Pause and resume:**
   - the pause button on touch, Escape and P on desktop;
   - the world freezes while paused;
   - the app going to the background pauses the run, and RESUME continues it.
6. **Game over and retry:** the run dies, the results roll up, and RETRY is back in a fresh run in **under 1 s**.
7. **Shop purchase** through the real buttons (price, then BUY!): coins go down by exactly the price, and the item is owned.
8. **Resize, rotation and Split View mid-run:**
   - **iPhones:** landscape, address bar showing, and back.
   - **iPads:** 768×1024, 1024×768, 1024×1366, 1366×1024, Split View (507 and 694 wide) and Slide Over (320 wide).
   - **Laptop and desktop:** 2560×720 (very wide), 1366×420 (very short), 520×900 (narrow) and 1920×1080.
   - The run never restarts, keeps scoring and stays framed.
   - Back home, the canvas is re-rendered at the new size.
9. **A lost WebGL context:** the context is dropped and restored mid-run, and the game keeps running and drawing.
10. **Private browsing (no storage at all):** the game runs, and the "progress won't save" note shows.
11. **The same game speed at 30, 60 and 120 Hz**, checked once per engine (the distance flown in 4 s must match within 2%).
12. **Gameplay looks right:** a run flown by an in-page autopilot, compared against its baseline screenshot.

**Screenshot comparisons:** the Home, Heroes, Shop, gameplay and Game Over screens are compared against saved baselines on Chromium and WebKit for all 7 profiles. That's 70 baselines, in `tests/e2e/__screenshots__/`.
- Menus and Game Over fail at more than 2% of pixels different.
- Gameplay fails at more than 8%, because a mid-run frame's particles and parallax can land a frame apart.
- Firefox runs every functional check and saves every screenshot for review, but isn't pixel-compared. It runs headed inside a virtual display (the only way it gets WebGL on the CI machines), and that display presents frames on its own schedule. Its screenshots differed by up to 11% between identical runs.
- Every other screen is screenshotted into the test report for review.
- The tests use a frozen clock, seeded randomness and no audio, so every run draws the identical frames. I checked this: three runs matched frame for frame.
- Baselines are recorded by GitHub Actions itself, so they come from the same environment that later compares against them. A new screen or profile records its first baseline automatically.
- To accept an intended visual change, push a commit whose message contains `[update screenshots]`.

**Deployment is gated:**
- **Actions:** the Pages job runs only after all 3 engines pass. That happens on a push to `main`, or when you start the workflow by hand with "deploy" ticked.
- **Locally:** `npm run deploy:pages` now runs `npm run test:all` first and stops if anything fails.

## Results

Final state (CI run RUN_NO, commit `SHA`):

| Engine | iPhone 375 | iPhone 390 | iPhone 430 | iPad portrait | iPad landscape | Laptop | Desktop |
|---|---|---|---|---|---|---|---|
| Chromium (Chrome, Edge) | CH | CH | CH | CH | CH | CH | CH |
| WebKit (Safari, iOS) | WK | WK | WK | WK | WK | WK | WK |
| Firefox | FF | FF | FF | FF | FF | FF | FF |

Each cell is the 12 checks above, except that Firefox's screenshots are saved, not compared (the 30/60/120 Hz check runs once per engine, on the laptop profile).

**`npm run test:all` in this sandbox: 71 passed, 6 skipped, exit 0** (Chromium, all 7 profiles; the skips are the 30/60/120 Hz check, which runs only on the laptop profile). The sandbox can only run Chromium (see Notes), so WebKit and Firefox are skipped there with a message.

**What the test runs caught** (all fixed):
- **Rotation, Split View and window resizing cropped the game** in every browser (the display-size mode wasn't switched).
- **Safari only:** going from a big window to a small one left the game sized for the old window, because Safari fires "resize" before the new layout exists. The game now re-reads the window size before refreshing and checks again once the layout settles.
- Headless Firefox on Linux has no WebGL. That is a CI-machine limit, not a game bug: the game correctly shows its new "needs WebGL" message. CI now runs Firefox in a virtual display, where it has WebGL.

**Making the tests trustworthy.** A screenshot comparison is only useful if the same build always draws the same picture. Getting there took:
- a frozen fake clock (Playwright's clock keeps ticking in real time unless it is paused);
- seeded randomness;
- no audio;
- no network at all in test builds (an `?offline` flag);
- letting fonts and images finish loading before the clock moves;
- taking each screenshot at an exact screen age;
- making sure every real tap is handled on the very next frame;
- giving the browser a moment to put the fresh frame on screen before the picture is taken.

The result: CI reproduces its own screenshots exactly from one run to the next. Pixel comparisons therefore run in CI, where the baselines were recorded. `VISUAL=1 npm run test:all` turns them on locally too; a different machine can land an animation one frame apart, which is about 3% of pixels on some screens.

## What I fixed

| Problem | Fix |
|---|---|
| **Rotating an iPad, Split View, Slide Over or resizing a desktop window cropped the game.** For example, a rotated phone showed a 1826 px-tall canvas in a 390 px window. The code switched Phaser's scale mode, but not the display-size aspect mode Phaser actually uses. | Both are switched (`main.js`). Caught by the new resize test. |
| **Black bars on wide screens** (iPad landscape, laptops). | The portrait game sits in a framed column, and the sides show the current biome's own background, blurred and darkened. It's drawn into two tiny canvases only when the biome changes, so it costs nothing per frame (`systems/sideBackdrop.js`). |
| **The canvas stayed at its boot resolution after a resize or rotation** (soft pixel art). | Once no run is in progress, the canvas is re-rendered at the new size. A run in progress just keeps going, scaled (`config.js idealView/viewDrifted`, `main.js`). |
| **Low Power Mode (30 fps) slowed the whole game down.** Long frames were clamped to 1/30 s. | Long frames now run as ~60 Hz sub-steps (up to 4), so speed is identical at 30, 60 and 120 Hz, and collisions are checked just as finely. 120 Hz was already handled by the 61 fps cap. |
| No keyboard pause; W didn't flap; holding a key could repeat flaps. | Space, W and Up flap (no auto-repeat); Escape and P pause and resume. |
| Pinch and double-tap zoom, ctrl+wheel and trackpad pinch zoom, pull-to-refresh, rubber-band scrolling, long-press menus and text selection were only blocked on the canvas itself (not on the side areas or between overlays). | Blocked page-wide. Text fields and the share card's long-press still work. |
| **Sound stayed off after iOS suspended or interrupted the audio** (app switch, a phone call, Siri). | Every tap revives the audio, and so does coming back to the app. The audio session is set to "ambient" (iOS 16.4+), so it mixes with other apps and follows the silent switch. |
| **Private browsing:** nothing told players their progress was lost. | The game runs normally and shows "Private browsing: progress won't save" on the home screen. |
| **No WebGL** (hardware acceleration off): a blank page. | A clear message instead. |
| Weak devices only switched to Low Graphics after 5 s of stuttering play. | On first launch, devices with ≤2 GB memory, ≤2 CPU cores or a 4-inch iPhone screen start in Low Graphics. The in-play check still runs too. |
| The address bar showing or hiding could cut the game off. | The page uses `100dvh`, and the game box tracks the real viewport. |
| A test build into any folder other than `dist/` crashed the build: the service-worker stamp hard-coded `dist/sw.js`. | It follows the build's output folder. |

Also in this change, as you asked:
- **Glitch realm:** the broken-laser wall (the full-height segmented laser) no longer spawns. A god-mode run through the Glitch realm met only blink blocks, gravity zones and the shared hazards.
- **RONIN** flies 10% faster (`speed: 1.1`). He covered 184 m in the first 10 s against VOLT's 171 m (the launch isn't scaled, so the gap grows over a run). His card's PERKS list says so, and the perk lines now stack by their real height so the third one clears the "TAP TO EDIT" pill.
- **Leaderboard, high-tech look:**
  - HUD grid, scanlines and a slow scan sweep, with corner brackets;
  - a LIVE / SYNC / OFFLINE connection light;
  - chamfered panels and tabs;
  - `#006`-style rank readouts with a score bar against #1;
  - a holographic podium on a perspective grid floor, with discs under the heroes;
  - a radar loading screen and a "SIGNAL LOST" offline state.

## Still needs a real-device check

These can't be proven in a desktop browser engine:
- **iOS Safari address bar and home indicator.** Safe areas are simulated in tests. Check `100dvh` and the home-screen app on a real iPhone.
- **Audio after a phone call or the silent switch.** Browsers can't simulate an iOS audio interruption.
- **Low Power Mode and ProMotion.** The speed maths is tested at 30, 60 and 120 Hz; the real refresh rates need a device.
- **Real WebGL context loss under memory pressure** (tested only by forcing it).
- **iPad Split View and Slide Over.** The tests use the same window sizes, but not the real multitasking UI.
- **Trackpad and iPad with a keyboard and mouse.** Mouse, keyboard and ctrl+wheel are tested, not physical hardware.
- **Holding 60 fps on a mid-range iPhone or iPad.** The test machines draw with a software GPU, so they can't measure this.
- **The Capacitor iOS app.** It uses the same WKWebView (WebKit) engine the tests cover, but it hasn't been built and run on a device.

## Notes

- **WebKit console errors on CI.** WebKit's OpenGL backend on the CI machines' software GPU (Mesa) sometimes logs "Unexpected driver error" during a resize. Real Safari draws through Metal, so the tests log this one message as a warning instead of failing on it.
- **WebKit and Firefox run in GitHub Actions, not in this sandbox.** The sandbox's network policy blocks the browser download host (`cdn.playwright.dev`), so only Chromium can run here. Locally, `test:all` skips an engine that isn't installed and says so; CI always runs all three.
- **The iPad portrait home screen leaves out the DAILY / FREE DROP / SPINS / STREAK row.** Its frame is shorter (720×1080), and the home layout drops that row when there isn't room. This is intended, so nothing overlaps.
- **When the canvas is scaled up.** On very large screens the drawing-buffer budget (set after the earlier iPhone memory crash) can make the canvas render a little under 1:1 and be scaled up. The resize test checks it stays within 0.6–1.6× of the real pixel size.

## Screenshots

These are in `docs/compat-2026-11-04/`:
- `overview.jpg`: home and gameplay on iPhone (390×844), iPad landscape (1180×820) and laptop (1366×768)
- `<device>-01-home.png`, `<device>-09-gameplay.png` and `<device>-06-leaderboard.png` for the same three devices
- `leaderboard-live-sync-offline.jpg`: the new leaderboard in its live, loading and offline states
- `ronin-card.png`: RONIN's card with the "10% faster flight" perk

Every test run also saves every screen for every device into `test-results/screens/<engine>-<device>/`, and CI attaches them to the run as `report-<engine>`.

