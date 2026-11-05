-- © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
-- Glydrift · two leaderboards (DISTANCE + SCORE) and a server-side plausibility check.
--
-- The DISTANCE board needs no new table: it is the level "endless-distance" in the existing
-- scores table (one personal best per player, the row's score = metres). This migration:
--   1. stores the run's distance with every score row, and
--   2. rejects any score / distance that is impossible for the run's time, on the server,
--      so a modified game can't post them either.
-- Safe to run more than once. Existing rows are not changed; renames are not re-checked.

alter table public.scores add column if not exists distance integer;

create or replace function public.glydrift_check_score()
returns trigger
language plpgsql
as $$
declare
  -- top speed: 625 px/s × 1.8 (fastest hero, realm speed spikes, Chrono fast zones),
  -- 20 px per metre, plus a 40 m allowance for the launch
  max_m numeric;
begin
  -- a rename (or any update that leaves the result alone) is not a new result
  if tg_op = 'UPDATE'
     and new.score = old.score
     and new.distance is not distinct from old.distance
     and new.run_time_ms is not distinct from old.run_time_ms then
    return new;
  end if;
  if new.run_time_ms is null or new.run_time_ms < 500 then
    raise exception 'glydrift: run time missing or too short' using errcode = '22023';
  end if;
  max_m := (625 * 1.8 / 20.0) * (new.run_time_ms / 1000.0) + 40;
  if new.distance is not null and (new.distance < 0 or new.distance > max_m) then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;
  if new.level like '%endless-distance' and new.score > max_m then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;
  -- score = metres + coin bonus + close-call bonus, both bounded per metre
  if new.score <= 0 or new.score > max_m * 20 + 500 or new.score > 2000000 then
    raise exception 'glydrift: impossible score for the run time' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_score on public.scores;
create trigger glydrift_check_score
  before insert or update on public.scores
  for each row execute function public.glydrift_check_score();

-- faster board reads (top 100 per level, newest-first ties)
create index if not exists scores_level_score_idx on public.scores (level, score desc, created_at);
