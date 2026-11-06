-- Glydrift · strict server-side score checks (replaces the loose check from 20261104000001).
--
-- Why: the old check allowed up to 20 points per metre at 56 m/s and skipped the check
-- entirely when a row had no distance, so a doctored request could post a score far above
-- anything a real run can make.
--
-- How a score is made: score = metres flown + bonuses (coins, close calls, dead-centre
-- passes), each bonus times the combo (x10, or x13 for SXE). Endless spawns at most about
-- 0.07 coins and 0.04 hazards per metre, so even every coin and every close call at x13 stays
-- under 30 points per metre. Real runs make 5–9.
--
-- Rules (the game checks the same ones before it uploads, in src/online/leaderboard.js):
--   every row         run time ≥ 0.5 s; distance ≤ top speed × run time
--                      (top speed 625 px/s × 1.8 / 20 px per metre ≈ 56 m/s, plus 40 m)
--   score / daily     distance required; distance − 2 ≤ score ≤ distance × 30 + 2000
--   distance board    distance required; score = distance
--   level boards      the score encodes the time: score = round(500,000,000 / run time)
--
-- Also adds glydrift_meta, a small public table the game reads at launch (the leaderboard
-- reset notice uses it). Safe to run more than once. Existing rows are not re-checked
-- (a rename only changes the username).

create or replace function public.glydrift_check_score()
returns trigger
language plpgsql
as $$
declare
  max_m numeric;
  is_level boolean := new.level ~ 'lv-[0-9]+$';
  is_distance boolean := new.level like '%endless-distance';
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
  if new.score is null or new.score <= 0 or new.score > 2000000 then
    raise exception 'glydrift: impossible score' using errcode = '22023';
  end if;
  max_m := (625 * 1.8 / 20.0) * (new.run_time_ms / 1000.0) + 40;
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
  if new.score < new.distance - 2 or new.score > new.distance * 30 + 2000 then
    raise exception 'glydrift: impossible score for the distance flown' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_score on public.scores;
create trigger glydrift_check_score
  before insert or update on public.scores
  for each row execute function public.glydrift_check_score();

-- small public settings the game reads (no player data): anyone can read, nobody can write
-- from the app (only the SQL editor / database owner)
create table if not exists public.glydrift_meta (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.glydrift_meta enable row level security;
drop policy if exists "glydrift_meta: read" on public.glydrift_meta;
create policy "glydrift_meta: read" on public.glydrift_meta
  for select to anon, authenticated using (true);
