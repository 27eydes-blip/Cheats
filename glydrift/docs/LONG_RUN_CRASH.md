# The 33K long-run crash (November 2026)

## What caused it

Each realm's and dimension's background art is drawn as about 5 MB of textures, and each texture also keeps the canvas it was drawn on. The game builds this art when a run approaches a new realm, and it **never released it**.

On a long run that adds up:

- Neon Void → Solar Storm → Frozen Nebula → Glitch Realm → The Calm → the Abyss → Peaceful Valley → Hurricane, then the rift into the four dimensions (Prism, Tidal, Chrono, Mirror).
- By the rift, about 4.5–6 km in (around 33K points for a strong player), all eleven sets were in memory at once.
- That's the same amount of art that crashed iPhones when the game used to build it all at launch ("A problem repeatedly occurred").
- On iPhone, Safari closes a page that uses too much memory **without any error**, so there was no error report to find.

Measured on the iPhone profile (390×844 at 3× pixel density), at the home screen and after 14 km:

| | Home screen | After 14 km, before | After 14 km, now |
|---|---|---|---|
| Realm art sets in memory | 1 | 11 | **4 at most** |
| Image (texture) memory | 38 MB | 95 MB | **58 MB, flat** |
| Canvas memory | 39 MB | 108 MB | **71 MB, flat** |
| Background objects | 174 | 826 | **~310, flat** |
| JavaScript memory | 18 MB | 21 MB | 21 MB |

Everything else that builds up over a run was checked and stays bounded:

- obstacles (pooled)
- particles
- trails
- pop-up texts (a pool of about 15)
- combo pop-ups
- the analytics queue (flushed at 20 events, last 200 kept)
- the music cue log (capped at 400)
- realm and dimension transitions
- the game-over screen after a 33K run (no errors, no long freeze)

Decoded music also takes 33–94 MB on a long run. It rises and falls as tracks crossfade and is pruned as you go, so it never piles up. The music system is owned by another session, so it was left unchanged.

## What changed

- **Only the art that's near is kept:** the first realm (the menus use it), the realm you're in, the one you just left and the next one. A few seconds after each realm change, older sets are destroyed and their textures freed, one per frame. They're rebuilt if a run comes back to them.
- **Crash reports go to Supabase.** Each report includes the device, browser, screen, build, score, distance, realm, hero and mode. They cover:
  - script errors
  - errors that freeze a frame
  - a lost graphics context
  - runs the phone closed mid-way
- **Crash-safe runs:**
  - The run in progress is saved every 3 seconds.
  - If an error sends the game back to the home screen, the run is finished: coins, XP and best score are saved, and the score is queued for the leaderboard.
  - If the phone closes the game mid-run, the same happens at the next launch, and the player sees "YOUR LAST RUN WAS SAVED".
- **The frame guard now covers both of Phaser's frame types.** It's the safety net that stops one bad frame from freezing the game.
- **Always the latest version:**
  - Each build publishes `version.json`.
  - An open game checks it at launch, when it returns to the foreground, and every 5 minutes.
  - When a newer version is live, it reloads at the next safe moment: never mid-run, and only once per version.
- **Regression test:** a 14 km run through every realm, The Calm, the Abyss and the dimensions fails if art, objects or memory keep growing. More tests cover a run the phone closed, an error mid-run, and the version stamp.

## Setup: one SQL file (Supabase → SQL Editor → New query → Run)

`supabase/migrations/20261107000003_crash_reports.sql` creates `crash_reports`. Anyone can add a report, but nobody can read, change or delete reports from the app.

Until you run it, reports wait on each device and are sent once the table exists.

To see the last day's crashes, most common first:

```sql
select kind, message, count(*), max(score) as top_score, max(created_at) as latest
from public.crash_reports where created_at > now() - interval '1 day'
group by kind, message order by count(*) desc;
```

`killed_mid_run` rows with high scores and distances are the iPhone memory closes this fix targets. If they keep appearing, the next step is the music's decoded memory.
