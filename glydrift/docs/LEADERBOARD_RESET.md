# Leaderboard reset (November 2026)

## What inflated the scores

I read all 210 rows of the `scores` table on 6 November 2026, using the public key only:

- 115 Score rows
- 46 Distance rows
- 42 Daily rows
- 7 level best times

1. **Coins times the combo.** A score is distance plus bonuses for coins, close calls and dead-centre passes. Each bonus is multiplied by the combo, which goes up to x10, or x13 for SXE. Since the 3 November coin-flow change, coins are spaced so a combo can keep going, so most runs stay at x10 and every coin is worth 100 points. Recent runs make 5–9 points per metre for every hero, so a 3,800 m run scores about 25,000.
2. **No distance on most rows.** 138 of the 157 Score and Daily rows have no distance at all, because older versions of the game didn't send one. Those scores could never be checked.
3. **A server check that barely checked anything.** It allowed up to 20 points per metre at 56 m/s, about twice the real top speed. It also skipped the check completely when there was no distance. So a doctored request could post a score 3 to 10 times higher than anything possible.

What I didn't find:

- **Impossible rows.** No row breaks the real limits.
- **Speed perks.** SXE and RONIN are faster, but they score the same per metre as everyone else.
- **The Coin Magnet.** Boosted runs never reach the boards.

You chose to keep the scoring and add strict checks.

## What changed

- **Strict server check**, in `supabase/migrations/20261107000001_strict_score_check.sql`. This is the same rule set the game checks before uploading, in `isPlausible`.
  - **Every row:** distance must be at most top speed × run time.
  - **Score and Daily:** a distance is required, and the score must be between the distance and distance × 30 + 2,000.
  - **Distance board:** a distance is required, and the score must equal the distance.
  - **Level boards:** the score must match the time.
- **Levels 10, 30 and 34**, which were caught along the way. Each had a gate the level bot couldn't clear in time.
  - **Levels 10 and 30:** the gate came straight after another hazard, with its opening near the top of the screen. The gate now comes first.
  - **Blink gates (levels 31–40 and endless):** the opening now stays near the middle, so it can be reached from either side of the blinking block.
- **The game:**
  - It reads the reset from the server at launch.
  - It clears that device's best score, ghost and daily best, and drops endless and daily scores that are still waiting to upload from before the reset.
  - It shows the notice once.
  - It never shows the notice on a brand-new install.

## How to run the reset (Supabase SQL Editor)

Do this **after** the new game version is live on glydrift.com, so players get the notice as soon as the boards are empty.

1. **SQL Editor → New query:** paste `supabase/migrations/20261107000001_strict_score_check.sql`, then **Run**.
   - This adds the strict checks and the small public `glydrift_meta` table.
   - It is safe to run again.
2. **SQL Editor → New query:** paste `supabase/migrations/20261107000002_leaderboard_reset_2026_11.sql`, then **Run**. This one file does four things:
   1. It copies **every** row of `scores` into `leaderboard_archive_2026_11`. That table is private: Row Level Security is on with no policies.
   2. It clears the Score, Distance and Daily boards (all-time, weekly and today). Level best times stay.
   3. It sets `best` to 0 in every cloud save. Nothing else in a save changes.
   4. It publishes the reset, which makes the notice appear for players.

   The result shows `rows_archived`, `score_rows_left` (which should be 0) and `reset_at`. If you run it a second time, it changes nothing.

No secret key is needed. Coins, heroes, cosmetics, Drift Pass, level stars and accounts are never touched.

## The notice

The title is **LEADERBOARD RESET** and the button is **LET'S GO**. The message reads:

> Due to inflated scores, the leaderboard has been reset. Your coins, heroes and progress are safe. Everyone starts fresh — go claim the #1 spot!

- **When it shows:** the next time a returning player opens the game, after the name picker and before the daily reward. It's part of the same one-at-a-time pop-up queue, so it never stacks with another pop-up.
- **Only once:** it's remembered on the device (`lbNotice`) and in the account's cloud save (`lbReset`), so a player who saw it on one device doesn't see it on another.
- **Never on a new install:** a brand-new install, which has never flown and has no best, applies the reset without showing the notice.
