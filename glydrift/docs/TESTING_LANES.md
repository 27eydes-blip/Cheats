# Testing lanes: fast, full and nightly

Every push that touches the game is tested before anything goes live.

| Lane | When | What runs | Goes live |
|---|---|---|---|
| **fast** | Small changes: text, colours, one hero, one bug fix | The smoke suite on iPhone Safari (WebKit) and Chromium, side by side | When the smoke suite passes |
| **full** | Gameplay, levels, obstacles, realms, music, the build, the test setup, CI, merges that combine two lines of work, more than 15 files, **and anything touching purchases, accounts, saving or the leaderboard** | Every test on all three browsers. WebKit runs all 7 device profiles; Chromium and Firefox run 3. The run is split across 14 machines. | When everything passes |
| none | Docs only (`*.md`, `docs/`, `marketing/`) | Nothing | Nothing to publish |
| nightly | Every night, on the live version | The full lane, plus the release build on the real glydrift.com | Never publishes. A failure opens a GitHub issue, which emails you. |

## The smoke suite

These are the tests tagged `@smoke` in `tests/e2e/game.spec.js`:

- the game loads, framed, with no console errors
- the release build loads
- one run through several realms
- death and retry
- level 1 flown to the finish
- buying from the shop
- account sign-in

## Choosing the lane

- Put **[fast]** or **[full]** in the request (in the commit message).
- Without a tag, `scripts/ci-lane.sh` decides from what changed, and every run's summary page says which lane it used and why.
- Purchases, accounts, saving and the leaderboard **always** get the full lane, even with [fast]. This covers `src/online/`, `save.js`, `progression.js`, the Drift Pass and Pass+ files, `supabase/` and the iOS purchase plugin.

## Speed-ups

- **Sharding:** the full suite is split across 14 machines (Chromium 5, Firefox 3, WebKit 6). The 50-level bot test is split into one test per realm, so it spreads across them too.
- **Caching:** npm packages and the Playwright browsers are cached between runs. Only the browsers' system packages are installed fresh.
- **No cancelling:** a new push never cancels a run in progress; runs go side by side. Publishing happens one at a time. A run whose commit is no longer the newest on its branch doesn't publish, because the newer run will.
- **Reuse:** files that already passed a lane (for example, a feature branch merged into the release branch unchanged) aren't tested again. A fast-lane pass doesn't count for a change that needs the full lane.
- **Docs-only changes:** these skip the tests entirely.

## Running it by hand

Go to **Actions → Glydrift tests → Run workflow**. Choose the lane (auto, fast or full), and tick **deploy** to publish, or **nightly** for the live check.
