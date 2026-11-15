-- Glydaway · online leaderboard (DISTANCE and COINS boards).
--
-- Run once in the Supabase SQL editor of the project Glydrift already uses. It only ADDS a
-- new table, glydaway_scores. Glydrift's tables, checks, resets and boards are not touched,
-- and Glydrift's leaderboard resets can't wipe Glydaway's scores.
--
-- Needs: Anonymous sign-ins turned on (Authentication → Sign In / Providers). Glydrift already
-- uses them, so nothing changes there. Safe to run more than once.
--
-- One row per player per board, holding that player's personal best:
--   board 'distance'  score = metres run
--   board 'coins'     score = coins collected in one run
-- Anyone can read the boards. Players can only write their own rows (auth.uid()), and a
-- server-side check rejects results that are impossible for the run's length.

create table if not exists public.glydaway_scores (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null default auth.uid(),
  username    text not null check (username ~ '^[A-Za-z0-9]{3,12}$'),
  board       text not null check (board in ('distance', 'coins')),
  score       integer not null check (score > 0),
  distance    integer not null check (distance >= 0),
  coins       integer not null check (coins >= 0),
  run_time_ms integer not null check (run_time_ms >= 500),
  created_at  timestamptz not null default now(),
  unique (player_id, board)
);

create index if not exists glydaway_scores_board_idx
  on public.glydaway_scores (board, score desc, created_at);

alter table public.glydaway_scores enable row level security;

drop policy if exists "glydaway_scores: read" on public.glydaway_scores;
create policy "glydaway_scores: read" on public.glydaway_scores
  for select to anon, authenticated using (true);

drop policy if exists "glydaway_scores: insert own" on public.glydaway_scores;
create policy "glydaway_scores: insert own" on public.glydaway_scores
  for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "glydaway_scores: update own" on public.glydaway_scores;
create policy "glydaway_scores: update own" on public.glydaway_scores
  for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

grant select on public.glydaway_scores to anon, authenticated;
grant insert, update on public.glydaway_scores to authenticated;

-- Plausibility check. Top speed is 600 units/s × 1.8 (boost) at 40 units per metre = 27 m/s;
-- 28 m/s plus a 40 m start allowance is used. Coins are capped at 1.5 per metre + 100
-- (a boost's coin rush is the densest stretch, about 1.2 per metre).
create or replace function public.glydaway_check_score()
returns trigger
language plpgsql
as $$
declare
  max_m numeric := 28 * (new.run_time_ms / 1000.0) + 40;
begin
  if tg_op = 'UPDATE' and new.player_id <> old.player_id then
    raise exception 'glydaway: a row can not change owner' using errcode = '22023';
  end if;
  -- a rename only changes the username
  if tg_op = 'UPDATE' and new.score = old.score and new.board = old.board
     and new.distance = old.distance and new.coins = old.coins and new.run_time_ms = old.run_time_ms then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.score < old.score then
    raise exception 'glydaway: only a better result replaces a personal best' using errcode = '22023';
  end if;
  if new.distance > max_m then
    raise exception 'glydaway: impossible distance for the run time' using errcode = '22023';
  end if;
  if new.coins > new.distance * 1.5 + 100 then
    raise exception 'glydaway: impossible coins for the distance' using errcode = '22023';
  end if;
  if (new.board = 'distance' and new.score <> new.distance)
     or (new.board = 'coins' and new.score <> new.coins) then
    raise exception 'glydaway: score does not match the board' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydaway_check_score on public.glydaway_scores;
create trigger glydaway_check_score
  before insert or update on public.glydaway_scores
  for each row execute function public.glydaway_check_score();
