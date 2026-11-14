-- Glydrift · WASP LORD's scores (replaces glydrift_check_score from 20261107000001).
--
-- WHEN TO RUN: BEFORE the game update with WASP LORD goes live. Until it has run, the old check
-- rejects his fastest runs and his x16 runs (the game itself accepts them), so his best scores
-- would silently fail to upload. Running it early is harmless: no other hero's limits change.
-- Safe to run more than once. Existing rows are not re-checked or changed.
-- Paste into Supabase → SQL Editor and run.
--
-- What it does:
--   1. Keeps every rule of the strict check (20261107000001) exactly as it was, for every hero.
--   2. Gives rows whose character = 'wasplord' (and only those) his own two limits:
--        top speed   he flies ×1.308 (30% above the roster average). × the Abyss / dimension
--                    spike (×1.1) × Chrono "fast" zones (×1.35) = ×1.942, so ×1.95 instead
--                    of ×1.8: 625 px/s × 1.95 / 20 px per metre ≈ 61 m/s (plus 40 m).
--        points      his combo reaches x16 instead of x13. The 30 points per metre allowed
--                    every coin and close call at x13; at x16 that is 30 × 16 / 13 = 36.9, and
--                    every coin, close call and dead-centre pass at once is 1 + 2.3 × 16 =
--                    37.8, so 38 points per metre (+2000) instead of 30.
--      A doctored request can claim 'wasplord' to get these limits, but then the row shows the
--      ILLEGAL tag on every leaderboard, and it is still capped by his real best case.
--   3. New results must name a well-formed hero id (^[a-z0-9_]{1,24}$, every hero id in the
--      game fits), so a row can't carry an empty or made-up label.
--   4. An update that keeps the result (a rename: same score, distance and run time) can't
--      change `character`: the stored hero is put back, so a rename can't relabel a run as
--      WASP LORD's (or take his ILLEGAL tag off one). A new best is a new run and stores the
--      hero it was flown with, as before.
--
-- The game checks the same rules before it uploads (isPlausible in src/online/leaderboard.js).

create or replace function public.glydrift_check_score()
returns trigger
language plpgsql
as $$
declare
  max_m numeric;
  is_level boolean := new.level ~ 'lv-[0-9]+$';
  is_distance boolean := new.level like '%endless-distance';
  is_wasp boolean;
  speed numeric;
  per_m numeric;
begin
  -- a rename (or any update that leaves the result alone) is not a new result: it keeps the
  -- hero the run was flown with
  if tg_op = 'UPDATE'
     and new.score = old.score
     and new.distance is not distinct from old.distance
     and new.run_time_ms is not distinct from old.run_time_ms then
    new.character := old.character;
    return new;
  end if;
  if new.character is null or new.character !~ '^[a-z0-9_]{1,24}$' then
    raise exception 'glydrift: missing or malformed hero id' using errcode = '22023';
  end if;
  is_wasp := new.character = 'wasplord';
  speed := case when is_wasp then 1.95 else 1.8 end;
  per_m := case when is_wasp then 38 else 30 end;
  if new.run_time_ms is null or new.run_time_ms < 500 then
    raise exception 'glydrift: run time missing or too short' using errcode = '22023';
  end if;
  if new.score is null or new.score <= 0 or new.score > 2000000 then
    raise exception 'glydrift: impossible score' using errcode = '22023';
  end if;
  max_m := (625 * speed / 20.0) * (new.run_time_ms / 1000.0) + 40;
  if new.distance is not null and (new.distance < 0 or new.distance > max_m) then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;

  if is_level then
    -- level boards: the score is the time, so the two must agree
    if abs(new.score - round(500000000.0 / new.run_time_ms)) > 1 then
      raise exception 'glydrift: level score does not match its time' using errcode = '22023';
    end if;
    return new;
  end if;

  -- endless, daily and distance rows must say how far the run went
  if new.distance is null or new.distance <= 0 then
    raise exception 'glydrift: distance missing' using errcode = '22023';
  end if;
  if is_distance then
    if new.score <> new.distance then
      raise exception 'glydrift: distance board score must equal the distance' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.score < new.distance - 2 or new.score > new.distance * per_m + 2000 then
    raise exception 'glydrift: impossible score for the distance flown' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_score on public.scores;
create trigger glydrift_check_score
  before insert or update on public.scores
  for each row execute function public.glydrift_check_score();
