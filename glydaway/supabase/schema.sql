-- Glydaway online: player identity, claimed usernames, the world leaderboard and cloud progress.
--
-- Run this once in the SQL editor of Glydaway's OWN Supabase project (not Glydrift's): it adds
-- tables and functions, and the account-deletion function removes the player's whole login.
-- Safe to run again (it replaces the functions and policies; tables are only created if missing).
--
-- Who can do what:
--   * every write goes through the functions below (SECURITY DEFINER, auth.uid() only): a player
--     can only ever write their own rows, and every score is checked on the server first;
--   * anyone can read the leaderboard (username, score, a "claimed" flag) — never an email;
--   * a player can read and write only their own progress row.
-- Needs (Authentication settings): Anonymous sign-ins ON, Email provider ON with an email OTP
-- template that includes {{ .Token }}, and a custom SMTP sender for real players (see README).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists public.glydaway_profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text not null check (username ~ '^[A-Za-z0-9]{3,12}$'),
  claimed         boolean not null default false,  -- true once the player signed in with an email
  name_changed_at timestamptz,                     -- last username change (rate limit)
  last_submit_at  timestamptz,                     -- last score submission (rate limit)
  submits_day     date,
  submits_today   integer not null default 0,
  created_at      timestamptz not null default now()
);
-- a claimed name belongs to one account, whatever the letter case
create unique index if not exists glydaway_profiles_claimed_name on public.glydaway_profiles (lower(username)) where claimed;

create table if not exists public.glydaway_scores (
  player_id   uuid not null references public.glydaway_profiles (id) on delete cascade,
  board       text not null check (board in ('distance', 'coins')),
  period      text not null check (period = 'all' or period ~ '^\d{4}-W\d{2}$'), -- all-time, or an ISO week
  score       integer not null check (score > 0),
  distance    integer not null check (distance > 0),
  coins       integer not null check (coins >= 0),
  run_time_ms integer not null check (run_time_ms >= 500),
  achieved_at timestamptz not null default now(),
  primary key (player_id, board, period)            -- one best per player per board: nobody fills the board
);
create index if not exists glydaway_scores_rank on public.glydaway_scores (board, period, score desc, achieved_at);

create table if not exists public.glydaway_progress (
  id         uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384),
  updated_at timestamptz not null default now()
);

create table if not exists public.glydaway_transfers ( -- one-time codes that move an anonymous player's scores into an account
  code       text primary key,
  from_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------- access rules
alter table public.glydaway_profiles  enable row level security;
alter table public.glydaway_scores    enable row level security;
alter table public.glydaway_progress  enable row level security;
alter table public.glydaway_transfers enable row level security;

revoke all on public.glydaway_profiles, public.glydaway_scores, public.glydaway_progress, public.glydaway_transfers from anon, authenticated;
grant select (id, username, claimed) on public.glydaway_profiles to anon, authenticated; -- no rate-limit columns, no email (emails live in auth.users)
grant select on public.glydaway_scores to anon, authenticated;
grant select, insert, update on public.glydaway_progress to authenticated;

drop policy if exists "glydaway profiles: public names" on public.glydaway_profiles;
create policy "glydaway profiles: public names" on public.glydaway_profiles for select to anon, authenticated using (true);
drop policy if exists "glydaway scores: public" on public.glydaway_scores;
create policy "glydaway scores: public" on public.glydaway_scores for select to anon, authenticated using (true);
drop policy if exists "glydaway progress: own" on public.glydaway_progress;
create policy "glydaway progress: own" on public.glydaway_progress for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- (glydaway_transfers: no policies at all; only the functions below touch it)

-- what everyone may read: rank material only
create or replace view public.glydaway_leaderboard with (security_invoker = true) as
  select s.board, s.period, s.score, s.achieved_at, p.username, p.claimed, (s.player_id = auth.uid()) as me
  from public.glydaway_scores s join public.glydaway_profiles p on p.id = s.player_id;
grant select on public.glydaway_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.glydaway_is_anon() returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true)
$$;
create or replace function public.glydaway_week() returns text language sql stable as $$
  select to_char(now() at time zone 'utc', 'IYYY-"W"IW')
$$;
-- the same name rules and light profanity filter as the game (3-12 letters/numbers)
create or replace function public.glydaway_name_ok(n text) returns boolean language plpgsql immutable as $$
declare
  low text := lower(n);
  leet text := translate(lower(n), '013457895$@!', 'oieastbgssai');
  squeezed text := regexp_replace(translate(lower(n), '013457895$@!', 'oieastbgssai'), '(.)\1+', '\1', 'g');
  w text;
begin
  if n is null or n !~ '^[A-Za-z0-9]{3,12}$' then return false; end if;
  foreach w in array array['fuck','fuk','fck','shit','bitch','cunt','nigg','faggot','retard','whore','slut','pussy','dildo','jizz','nazi','hitler','porn','penis','vagina','wank','twat','tranny','kike','chink','asshole','bastard','horny','nude','milf'] loop
    if position(w in low) > 0 or position(w in leet) > 0 or position(w in squeezed) > 0 then return false; end if;
  end loop;
  if leet = any (array['fag','rape','cum','anal','sex','hoe','tits','boob','cock','dick','piss','spic','kkk','arse']) then return false; end if;
  return true;
end $$;
create or replace function public.glydaway_me() returns uuid language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------- username
-- Set or change the username. Anonymous players may share a name with other anonymous players,
-- but never take a claimed one. A claimed (signed-in) name can change once every 7 days.
create or replace function public.glydaway_set_username(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := glydaway_me(); prof glydaway_profiles; anon boolean := glydaway_is_anon();
begin
  p_name := trim(p_name);
  if not glydaway_name_ok(p_name) then raise exception 'name_invalid' using errcode = '22023'; end if;
  if exists (select 1 from glydaway_profiles where claimed and lower(username) = lower(p_name) and id <> uid) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  select * into prof from glydaway_profiles where id = uid;
  if found and lower(prof.username) <> lower(p_name) and prof.name_changed_at is not null
     and prof.name_changed_at > now() - (case when prof.claimed then interval '7 days' else interval '1 minute' end) then
    raise exception 'rename_too_soon' using errcode = '22023';
  end if;
  insert into glydaway_profiles (id, username, claimed, name_changed_at) values (uid, p_name, not anon, null)
  on conflict (id) do update set username = excluded.username, claimed = glydaway_profiles.claimed or not anon,
    name_changed_at = case when lower(glydaway_profiles.username) <> lower(excluded.username) then now() else glydaway_profiles.name_changed_at end;
  return json_build_object('username', p_name, 'claimed', not anon or coalesce(prof.claimed, false));
end $$;

-- After signing in with an email: mark this player's name as claimed (it must be free).
create or replace function public.glydaway_claim() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := glydaway_me(); prof glydaway_profiles;
begin
  if glydaway_is_anon() then raise exception 'sign_in_first' using errcode = '28000'; end if;
  select * into prof from glydaway_profiles where id = uid;
  if not found then return json_build_object('username', null, 'claimed', false); end if;
  if exists (select 1 from glydaway_profiles where claimed and lower(username) = lower(prof.username) and id <> uid) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  update glydaway_profiles set claimed = true where id = uid;
  return json_build_object('username', prof.username, 'claimed', true);
end $$;

-- ---------------------------------------------------------------- scores
-- The only way to post a score. Checks it on the server, rate-limits, and keeps one best per board.
-- Limits: the fastest the game ever goes is 520 units/s × 1.8 (boost) = 23.4 m/s; 28 m/s plus a
-- 40 m start allowance is allowed. Coins: at most 1.5 per metre + 100. A run lasts 0.5 s to 3 h.
create or replace function public.glydaway_submit_run(p_distance integer, p_coins integer, p_run_ms integer) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := glydaway_me(); prof glydaway_profiles; wk text := glydaway_week(); b text; per text; sc integer;
begin
  select * into prof from glydaway_profiles where id = uid for update;
  if not found then raise exception 'no_username' using errcode = '22023'; end if;
  if not prof.claimed and exists (select 1 from glydaway_profiles where claimed and lower(username) = lower(prof.username) and id <> uid) then
    raise exception 'name_taken' using errcode = '23505'; -- someone has since claimed this name
  end if;
  if p_distance is null or p_coins is null or p_run_ms is null or p_distance <= 0 or p_coins < 0
     or p_run_ms < 500 or p_run_ms > 3 * 3600 * 1000
     or p_distance > 28 * (p_run_ms / 1000.0) + 40 or p_coins > p_distance * 1.5 + 100 then
    raise exception 'impossible_score' using errcode = '22023';
  end if;
  if prof.last_submit_at is not null and prof.last_submit_at > now() - interval '5 seconds' then
    raise exception 'too_fast' using errcode = '22023';
  end if;
  if prof.submits_day = current_date and prof.submits_today >= 500 then
    raise exception 'too_many_today' using errcode = '22023';
  end if;
  update glydaway_profiles set last_submit_at = now(),
    submits_today = case when submits_day = current_date then submits_today + 1 else 1 end, submits_day = current_date
  where id = uid;
  foreach b in array array['distance', 'coins'] loop
    sc := case when b = 'distance' then p_distance else p_coins end;
    if sc <= 0 then continue; end if;
    foreach per in array array['all', wk] loop
      insert into glydaway_scores (player_id, board, period, score, distance, coins, run_time_ms)
      values (uid, b, per, sc, p_distance, p_coins, p_run_ms)
      on conflict (player_id, board, period) do update
        set score = excluded.score, distance = excluded.distance, coins = excluded.coins, run_time_ms = excluded.run_time_ms, achieved_at = now()
        where excluded.score > glydaway_scores.score;
    end loop;
  end loop;
  return json_build_object('week', wk);
end $$;

-- This player's rank on a board (works far outside the top list).
create or replace function public.glydaway_my_rank(p_board text, p_period text) returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); mine glydaway_scores;
begin
  if uid is null then return null; end if;
  select * into mine from glydaway_scores where player_id = uid and board = p_board and period = p_period;
  if not found then return null; end if;
  return json_build_object('score', mine.score, 'rank', 1 + (select count(*) from glydaway_scores s where s.board = p_board and s.period = p_period
    and (s.score > mine.score or (s.score = mine.score and s.achieved_at < mine.achieved_at))));
end $$;

-- ---------------------------------------------------------------- moving an anonymous player into an account
-- 1) While still the anonymous player: get a one-time code (valid 15 minutes).
create or replace function public.glydaway_make_transfer() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := glydaway_me(); c text := encode(gen_random_bytes(18), 'hex');
begin
  if not glydaway_is_anon() then raise exception 'not_anonymous' using errcode = '22023'; end if;
  delete from glydaway_transfers where from_id = uid or expires_at < now();
  insert into glydaway_transfers (code, from_id, expires_at) values (c, uid, now() + interval '15 minutes');
  return c;
end $$;
-- 2) Signed in to the existing account: bring the anonymous player's best scores over (the better
--    of the two is kept on each board), then delete the anonymous player entirely.
create or replace function public.glydaway_merge(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := glydaway_me(); src uuid; n integer := 0; r glydaway_scores;
begin
  if glydaway_is_anon() then raise exception 'sign_in_first' using errcode = '28000'; end if;
  delete from glydaway_transfers where code = p_code and expires_at >= now() returning from_id into src;
  if src is null then raise exception 'bad_code' using errcode = '22023'; end if;
  if src = uid then return json_build_object('moved', 0); end if;
  if exists (select 1 from auth.users where id = src and coalesce(is_anonymous, false) = false) then
    raise exception 'not_anonymous' using errcode = '22023'; -- only anonymous players can be absorbed
  end if;
  if exists (select 1 from glydaway_scores where player_id = src) and not exists (select 1 from glydaway_profiles where id = uid) then
    insert into glydaway_profiles (id, username, claimed) select uid, username, false from glydaway_profiles where id = src;
  end if;
  for r in select * from glydaway_scores where player_id = src loop
    insert into glydaway_scores (player_id, board, period, score, distance, coins, run_time_ms, achieved_at)
    values (uid, r.board, r.period, r.score, r.distance, r.coins, r.run_time_ms, r.achieved_at)
    on conflict (player_id, board, period) do update
      set score = excluded.score, distance = excluded.distance, coins = excluded.coins, run_time_ms = excluded.run_time_ms, achieved_at = excluded.achieved_at
      where excluded.score > glydaway_scores.score;
    n := n + 1;
  end loop;
  delete from auth.users where id = src; -- cascades to its profile, scores and progress
  return json_build_object('moved', n);
end $$;

-- ---------------------------------------------------------------- deleting an account
-- Removes everything: scores, progress, profile, and the login itself (with the email).
create or replace function public.glydaway_delete_me() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := glydaway_me();
begin
  delete from glydaway_transfers where from_id = uid;
  delete from glydaway_scores where player_id = uid;
  delete from glydaway_progress where id = uid;
  delete from glydaway_profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

-- ---------------------------------------------------------------- progress (light server-side checks)
create or replace function public.glydaway_check_progress() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if jsonb_typeof(coalesce(new.data -> 'gold', '0'::jsonb)) <> 'number' or (new.data ->> 'gold')::numeric < 0 or (new.data ->> 'gold')::numeric > 10000000 then
    raise exception 'bad_progress' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists glydaway_check_progress on public.glydaway_progress;
create trigger glydaway_check_progress before insert or update on public.glydaway_progress for each row execute function public.glydaway_check_progress();

-- only signed-in players (anonymous ones included) may call the functions
revoke all on function public.glydaway_set_username(text), public.glydaway_claim(), public.glydaway_submit_run(integer, integer, integer),
  public.glydaway_make_transfer(), public.glydaway_merge(text), public.glydaway_delete_me() from public, anon;
grant execute on function public.glydaway_set_username(text), public.glydaway_claim(), public.glydaway_submit_run(integer, integer, integer),
  public.glydaway_make_transfer(), public.glydaway_merge(text), public.glydaway_delete_me() to authenticated;
grant execute on function public.glydaway_my_rank(text, text), public.glydaway_week() to anon, authenticated;
