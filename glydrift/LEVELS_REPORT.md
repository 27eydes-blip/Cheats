# LEVEL MODE report: 2026-11-06

LEVEL MODE replaces the Daily Challenge. There are 50 hand-built levels, 10 in each realm. Every 10th level is a boss.

Work was done on the `feature/levels` branch. All five batches shipped. Each batch was merged into `claude/glydrift-arcade-game-7hznpc` with `--no-ff` once CI had passed on all three browsers.

## 1. Batches

| Batch | Realm | Levels | Status |
|---|---|---|---|
| 1 | Neon Void | 1-10 | **Live** (CI run 42182467257, merge 7effa01) |
| 2 | Solar Storm | 11-20 | **Live** (CI run 42188617661, merge 6afffbd) |
| 3 | Frozen Nebula | 21-30 | **Live** (CI run 42195358728, merge a03d279) |
| 4 | Glitch Realm | 31-40 | **Live** (CI run 42201584576, merge ae80ed0) |
| 5 | The Abyss | 41-50 | **Live** (CI run 42205697543, merge b0533e1) |

**How release works:** `SHIPPED_BATCHES` in `src/levels/levels.js` decides how many realms players see. Every built level is in the game files and is cached by the service worker. Levels that haven't shipped show as **SOON** on the map. To try a later batch early, add `?levels=50` to the address of a test build.

### What every batch went through before it shipped

1. **Bot run.** A bot plays every shipped level and must finish it. It respawns at checkpoints and is allowed at most 40 tries per checkpoint. It runs on three screen sizes (375×667, 390×844 and 1366×768), because hazard sizes scale with screen height and so each layout differs a little per screen.
2. **God-mode run.** A pilot that can't crash collects all 3 star coins on every level. This checks that no coin sits inside a hazard.
3. **Local suite.** The full Chromium test suite, plus the level tests on all three Chromium screen sizes.
4. **CI on all three browsers.** Chromium, Firefox and WebKit. The batch is merged and deployed only after this passes.

## 2. What was built

- **Home:** LEVELS takes the Daily Challenge's place. It shows the total stars (e.g. `37/150 ★`) and your next level. The endless mode is now called **ENDLESS**.
- **Level map:** a scrolling path through the 5 realm bands. It shows stars under each level, padlocks, crowns on the bosses, and SOON for levels that haven't shipped. Tapping a level opens a card with **PLAY** and **PRACTICE**.
- **Levels:**
  - fixed layouts with a checkered finish gate;
  - a progress bar with %;
  - 3 hidden star coins;
  - checkpoints;
  - hints in the tutorial and on levels that introduce a new hazard;
  - realm music;
  - bosses are longer, with a boss banner partway through, then **BOSS DOWN** and fireworks.
- **Stars:** finish, all 3 star coins, and no crashes. Stars are earned across runs: a coin collected on an earlier run stays collected and shows as a ghost.
- **Practice:** checkpoints work the same way, but nothing counts: no stars, rewards or times.
- **Unlocks:** levels unlock in order. The next realm opens after its boss.
- **First-time rewards:**
  - finish: 50 + 6 × level number in coins;
  - each new star: 40 coins;
  - each boss: 300 coins;
  - each realm cleared: 1,000 coins plus a title (Void Pilot, Storm Chaser, Frost Runner, Glitch Breaker, ABYSS CONQUEROR);
  - level 50: 10,000 coins plus the legendary **Level Master** trail.
- **Saves:**
  - progress is kept on the device;
  - cloud sync merges the two copies so that the most progress wins and no star is ever lost (each star is OR'ed, and the best time is the lowest);
  - older saves load unchanged.
- **Best times:**
  - each level has its own leaderboard (online only);
  - only runs with no crashes are submitted;
  - boosted runs are excluded;
  - times recorded offline wait in the existing upload queue.
- **Daily Challenge removed:**
  - it's gone from home, menus and the leaderboard tabs;
  - missions became "Beat N levels" and "Earn N level stars", and old daily missions are converted when the save loads;
  - the "Daily Driver" achievement became "Level Driver: Beat 5 levels";
  - XP and the Drift Pass give +100 for each level beaten;
  - the login reward and streak are unchanged.

## 3. Every level

**How to read the table:**
- **Length** is how long a crash-free run takes on a 390×844 phone.
- **Patterns** is the number of hazard set pieces in the level.
- **d** is the layout difficulty (0 to 0.5).
- **Bot crashes** is the bot's average over the three screen sizes. The bot is a careful but imperfect player, so read this as relative difficulty, not as what a human will score.
- In the final run, the bot finished all 50 levels on all three screens, and the god-mode pilot collected 150/150 star coins on each screen.

### Neon Void (levels 1-10)

| # | Name | Length | Patterns | Hazards | Difficulty d | Bot crashes (avg) |
|---|---|---|---|---|---|---|
| 1 | First Flight | 39 s | 15 | gates, saws | 0 | 0.0 |
| 2 | Saw Alley | 44 s | 19 | gates, saws | 0.08 | 0.3 |
| 3 | Twin Teeth | 42 s | 19 | gates, saws, twin saws | 0.1 | 0.0 |
| 4 | Pendulum | 53 s | 19 | gates, saws, axe, twin saws | 0.12 | 1.7 |
| 5 | Laser Lines | 49 s | 19 | gates, side lasers, saws, axe, twin saws | 0.14 | 2.3 |
| 6 | Heartbeat | 48 s | 20 | gates, saws, Neon Pulse, side lasers | 0.16 | 0.0 |
| 7 | Upside Down | 58 s | 24 | gates, saws, gravity flip, axe, side lasers, Neon Pulse, twin saws | 0.18 | 1.7 |
| 8 | Small Wonder | 50 s | 23 | gates, saws, shrink portal, twin saws, axe, side lasers, Neon Pulse, gravity flip | 0.2 | 4.7 |
| 9 | Neon Gauntlet | 69 s | 27 | gates, axe, twin saws, axe pair, side lasers, Neon Pulse, pulse pair, saws, gravity flip, shrink portal | 0.26 | 4.3 |
| 10 👑 | The Void Core | 90 s | 36 | gates, saws, axe, side lasers, Neon Pulse, axe pair, twin saws, pulse pair, gravity flip, shrink portal | 0.3 | 1.7 |

### Solar Storm (levels 11-20)

| # | Name | Length | Patterns | Hazards | Difficulty d | Bot crashes (avg) |
|---|---|---|---|---|---|---|
| 11 | Sunrise | 47 s | 20 | gates, saws, geysers, axe | 0.16 | 0.0 |
| 12 | Meteor Shower | 41 s | 20 | gates, geysers, meteors, saws, twin saws | 0.25 | 0.3 |
| 13 | Fire Bars | 43 s | 20 | gates, meteors, fire bars, geysers, twin saws, saws | 0.26 | 0.3 |
| 14 | Solar Flare | 48 s | 20 | gates, geysers, solar flares, meteors, fire bars, twin saws, saws | 0.28 | 1.0 |
| 15 | Eruption | 46 s | 20 | gates, geysers, meteors, eruption, fire bars, solar flares, twin saws | 0.3 | 1.7 |
| 16 | Firefall | 49 s | 19 | gates, meteors, meteor shower, fire bars, fire-bar pair, solar flares, geysers, eruption | 0.32 | 1.7 |
| 17 | Under Pressure | 54 s | 22 | gates, geyser + bar, meteors, solar flares, fire-bar pair, meteor shower, eruption, gravity flip, geysers, fire bars | 0.34 | 2.0 |
| 18 | Heatwave | 58 s | 24 | gates, shrink portal, geysers, meteors, fire bars, solar flares, meteor shower, geyser + bar, eruption, fire-bar pair, twin saws, gravity flip | 0.36 | 2.3 |
| 19 | Corona | 57 s | 23 | gates, eruption, meteor shower, fire-bar pair, solar flares, geyser + bar, meteors, fire bars, shrink portal | 0.38 | 3.0 |
| 20 👑 | Heart of the Sun | 90 s | 37 | gates, geysers, meteors, fire bars, solar flares, eruption, meteor shower, fire-bar pair, geyser + bar, gravity flip | 0.4 | 6.0 |

### Frozen Nebula (levels 21-30)

| # | Name | Length | Patterns | Hazards | Difficulty d | Bot crashes (avg) |
|---|---|---|---|---|---|---|
| 21 | First Frost | 37 s | 19 | gates, saws, icicles, twin saws, axe | 0.28 | 1.7 |
| 22 | Ice Sliders | 33 s | 19 | gates, icicles, ice sliders, saws, twin saws | 0.3 | 1.7 |
| 23 | Static | 36 s | 19 | gates, ice sliders, zaps, icicles, saws | 0.27 | 3.0 |
| 24 | Frost Comet | 35 s | 19 | gates, icicles, frost comet, ice sliders, zaps | 0.32 | 2.0 |
| 25 | Ice Curtain | 38 s | 18 | gates, ice sliders, ice curtain, zaps, frost comet, icicles | 0.34 | 2.7 |
| 26 | Glacier Pass | 34 s | 20 | gates, ice sliders, slider pair, zaps, frost comet, ice curtain, icicles | 0.36 | 0.3 |
| 27 | Staircase | 41 s | 20 | gates, zaps, zap stairs, slider pair, frost comet, ice curtain, gravity flip, ice sliders, icicles | 0.37 | 3.0 |
| 28 | Whiteout | 44 s | 23 | gates, shrink portal, slider pair, zaps, ice curtain, frost comet, zap stairs, icicles, gravity flip, ice sliders | 0.39 | 3.7 |
| 29 | The Gauntlet | 38 s | 21 | gates, ice gauntlet, frost comet, slider pair, ice curtain, zap stairs, shrink portal, zaps | 0.41 | 2.3 |
| 30 👑 | Frozen Throne | 61 s | 35 | gates, icicles, ice sliders, zaps, frost comet, ice curtain, slider pair, zap stairs, ice gauntlet, gravity flip | 0.43 | 4.7 |

### Glitch Realm (levels 31-40)

| # | Name | Length | Patterns | Hazards | Difficulty d | Bot crashes (avg) |
|---|---|---|---|---|---|---|
| 31 | Corrupted | 34 s | 19 | gates, saws, blink blocks, twin saws, axe | 0.3 | 3.7 |
| 32 | Flip Field | 37 s | 19 | gates, blink blocks, gravity zones, saws, twin saws | 0.31 | 0.0 |
| 33 | Double Vision | 36 s | 18 | gates, blink blocks, blink pair, gravity zones, twin saws | 0.33 | 0.0 |
| 34 | Firewall | 43 s | 18 | gates, blink pair, blink gate, gravity zones, blink blocks | 0.3 | 9.3 |
| 35 | Packet Loss | 50 s | 22 | gates, blink blocks, gravity flip, blink pair, gravity zones, blink gate | 0.33 | 3.0 |
| 36 | Bit Rot | 42 s | 21 | gates, shrink portal, blink pair, gravity zones, blink blocks, blink gate | 0.38 | 3.7 |
| 37 | Overclock | 48 s | 22 | gates, blink gate, gravity zones, blink pair, blink blocks, gravity flip | 0.37 | 7.7 |
| 38 | Buffer Overflow | 44 s | 21 | gates, axe, blink pair, gravity zones, side lasers, blink gate, twin saws, shrink portal | 0.42 | 2.3 |
| 39 | Kernel Panic | 53 s | 24 | gates, blink gate, gravity zones, blink pair, gravity flip, blink blocks, shrink portal | 0.4 | 6.3 |
| 40 👑 | System Crash | 73 s | 35 | gates, blink blocks, gravity zones, blink pair, blink gate, gravity flip, shrink portal | 0.43 | 7.7 |

### The Abyss (levels 41-50)

| # | Name | Length | Patterns | Hazards | Difficulty d | Bot crashes (avg) |
|---|---|---|---|---|---|---|
| 41 | The Deep | 31 s | 19 | gates, saws, tendrils, twin saws, axe | 0.32 | 6.0 |
| 42 | Slammer | 35 s | 22 | gates, tendrils, slammer, saws | 0.33 | 2.0 |
| 43 | Closing In | 38 s | 18 | gates, slammer, closing walls, tendrils | 0.34 | 2.0 |
| 44 | The Eye | 32 s | 18 | gates, tendrils, eye beam, closing walls, slammer | 0.35 | 4.0 |
| 45 | Watchers | 34 s | 18 | gates, eye beam, eye pair, tendrils, closing walls, slammer | 0.37 | 3.3 |
| 46 | Grasp | 39 s | 19 | gates, tendrils, tendril + eye, closing walls, slammer, eye pair, gravity flip, eye beam | 0.39 | 7.7 |
| 47 | The Crush | 34 s | 16 | gates, slammer, slammer + eye, closing walls, tendril + eye, eye pair, tendrils | 0.41 | 2.7 |
| 48 | Pressure | 40 s | 21 | gates, shrink portal, eye pair, closing walls, tendril + eye, slammer, slammer + eye, tendrils, gravity flip | 0.43 | 5.3 |
| 49 | Event Horizon | 48 s | 22 | gates, slammer + eye, tendril + eye, closing walls, eye pair, slammer, gravity flip | 0.42 | 5.7 |
| 50 👑 | The Abyss Awakens | 78 s | 41 | gates, tendrils, slammer, closing walls, eye beam, tendril + eye, eye pair, slammer + eye, gravity flip, shrink portal | 0.47 | 8.3 |

**Difficulty fixes made during the night:**
- L9's last section;
- L11's middle;
- L18's flipped finale;
- L23 (where zaps are introduced): wider spacing;
- L25, L27 and L28: breathers;
- L30's final section, restored to its original layout after a breather made it worse;
- L34-L40: lower difficulty and wider gaps;
- L35: the gravity flip moved off the very start, since a checkpoint can't sit inside a flip;
- L40: the FATAL ERROR section;
- L42 and L45: breathers;
- L47 and L49: breathers plus a lower difficulty;
- L42 was lengthened from 28 s to 35 s.

**Bot fix:** the bot first ignored the timing of blink blocks, sliders, zaps, fire bars, geysers and slammers, which inflated its Glitch crash counts. It now predicts them.

## 4. Screenshots

Screenshots are in `docs/levels/`:

| | |
|---|---|
| Home (ENDLESS + LEVELS) | `01-home.png` |
| Level map | `02-map.png` |
| Map at the realm boss | `03-map-boss.png` |
| Level card (PLAY / PRACTICE) | `04-level-card.png` |
| A level in progress (progress bar, stars, checkpoint) | `05-level-in-progress.png` |
| A boss level (taken before the distance pop-ups like "1200m" were turned off in levels) | `06-boss-level.png` |
| LEVEL COMPLETE with 3 stars (taken before the star row was moved down to clear the level name) | `07-level-complete.png` |

## 5. What to playtest first

1. **Levels 1-3 on your phone.** Check that the hint timing and first-flight feel are right for a brand-new player.
2. **The bosses: 10, 20, 30, 40 and 50.** Check length, drama and the BOSS DOWN finish.
3. **L34 Firewall and L37 Overclock.** These are the bot's two hardest non-boss levels (blink gates). They should feel hard but fair.
4. **L8-L10 on a tall phone,** where the bot found the Neon Void hardest.
5. **The practice → PLAY FOR REAL flow.** Also check that practice never awards stars.
6. **Cloud sync across two devices.** Play different levels on each, then check that both sets of stars survive.
7. **Banner overlap on bosses:** a MISSION COMPLETE banner can cover the boss banner (seen in `06-boss-level.png`). It's cosmetic, but worth a look.
8. **Speed heroes on the time boards.** SXE flies faster, so it finishes levels faster and best times favour it. Decide whether the per-level boards should show a speed icon, as the endless boards do.

## 6. Notes

- `scripts/music/verify-run.mjs` (in the music system, which I didn't touch) still presses the old **PLAY** button. It needs to press **ENDLESS** now.
- The old link (GitHub Pages) was not updated for LEVEL MODE. glydrift.com was updated.
