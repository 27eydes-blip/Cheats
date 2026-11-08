-- Glydrift · leaderboard rows carry the SERVER's time, not the phone's (super sweep 2026-11-08).
--
-- Why: the game sent `created_at` from the phone's clock, and the TODAY / THIS WEEK boards
-- filter on it. A phone set a year ahead kept its best on "today" for a year; one set back hid
-- a real best. This trigger stamps every new result with now() on the server, so the clock on
-- the phone no longer matters. A rename (same score, distance and run time) keeps its time.
--
-- Safe to run more than once. Touches no existing rows. Paste into Supabase → SQL Editor.

create or replace function public.glydrift_server_time()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.score = old.score
     and new.distance is not distinct from old.distance
     and new.run_time_ms is not distinct from old.run_time_ms then
    new.created_at := old.created_at; -- a rename isn't a new result
  else
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_server_time on public.scores;
create trigger glydrift_server_time
  before insert or update on public.scores
  for each row execute function public.glydrift_server_time();
