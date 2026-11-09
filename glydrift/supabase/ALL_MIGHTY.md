# ALL MIGHTY title: server setup

The player who is **#1 in the world on the all-time SCORE board** wears the gold animated title
**ALL MIGHTY**. Anyone who has ever been #1 keeps a **Former All Mighty** badge for good.
The server decides who holds it once a day. The game only reads the answer, so a phone can't
give itself the title.

## What the SQL does (`migrations/20261109000001_all_mighty.sql`)

- **`all_mighty`**: a one-row table with the current holder (`player_id`, `username`, `score`),
  `since` (when they took #1) and `checked_at` (the last check).
- **`all_mighty_history`**: one row for every player who has ever held the title, with their first
  and last day as holder, how many separate times they took #1 (`reigns`) and their best #1 score.
- **`glydrift_refresh_all_mighty()`**: finds the highest score on the all-time Score board (level
  `endless`) and updates both tables. Ties go to whoever set the score first, which is the order
  the leaderboard already uses. Test boards, the Distance board, Daily boards and level boards
  never count. If the board is empty (for example right after a reset), nobody holds the title,
  and the history is kept.
- **A daily pg_cron job** (`glydrift-all-mighty`, 00:07 UTC) runs that function.
- **Read-only access for the app**: anyone can read both tables, and nobody can write to them
  through the API. The app also can't call the function.
- At the end it **runs the check once**, so the title is filled in straight away.

You can run it more than once safely. It doesn't change the scores table, the score checks or any
existing function.

## Steps

1. **Turn on pg_cron**: Supabase dashboard → **Database** → **Extensions** → search `pg_cron` →
   enable it. The SQL tries to enable it too, but turning it on here first is the most reliable.
2. Go to **SQL Editor** → **New query**, paste the whole of
   `glydrift/supabase/migrations/20261109000001_all_mighty.sql`, then press **Run**.
3. The result shows `all_mighty_now`, for example
   `{"holder": "…", "username": "NeonAce", "score": 15800, "changed": true}`.
   - If the Messages tab says *could not enable pg_cron*, everything else still works, but the
     title won't be re-checked on its own. Enable pg_cron (step 1) and run the file again. Until
     you do, run this whenever you want the title re-checked:
     `select public.glydrift_refresh_all_mighty();`

## Check it worked

```sql
-- who holds it now
select player_id, username, score, since, checked_at from public.all_mighty;

-- everyone who has ever held it
select username, first_held_at, last_held_at, reigns, best_score
from public.all_mighty_history order by first_held_at;

-- the daily job (needs pg_cron)
select jobname, schedule, command, active from cron.job where jobname = 'glydrift-all-mighty';

-- its recent runs
select status, start_time, return_message from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'glydrift-all-mighty')
order by start_time desc limit 5;
```

The holder should match the top row of the all-time SCORE board. In the game, that player's
row shows **ALL MIGHTY**. If the holder is you, it also shows under your name on the home screen,
your profile, the game over screen and the leaderboard. The game asks the server again at most
every 30 minutes, so a change can take up to that long to show up.

To remove the job: `select cron.unschedule('glydrift-all-mighty');`
