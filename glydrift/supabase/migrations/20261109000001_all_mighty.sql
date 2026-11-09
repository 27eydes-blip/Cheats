-- Glydrift · the ALL MIGHTY title: the player who is #1 in the world on the all-time SCORE
-- board (level "endless" in public.scores) wears the gold animated title "ALL MIGHTY", and
-- everyone who has ever been #1 keeps a "Former All Mighty" badge for good.
--
-- It is decided HERE, on the server, once a day. The game only reads the answer (with the
-- publishable key); a phone can never give itself the title.
--
--   all_mighty                    one row: who holds the title now, since when, with what score
--   all_mighty_history            one row per player who has ever held it (first / last day,
--                                 how many separate reigns, their best #1 score)
--   glydrift_refresh_all_mighty() reads the #1 all-time score and updates both tables
--   pg_cron job                   runs that function every day at 00:07 UTC
--
-- Who counts: the highest score on the all-time SCORE board (ties: whoever set it first, the
-- same order the leaderboard shows). Rows already go through the server's score checks
-- (glydrift_check_score) before they are stored, so impossible scores never get here. Names
-- reported 3 times are renamed on the scores rows (name_reports migration), not removed, so a
-- renamed player still counts with their new placeholder name. Rows whose account no longer
-- exists are skipped. Test boards ("test-endless") and the Distance / Daily / level boards
-- never count.
--
-- Read-only for the app: Row Level Security lets anyone SELECT both tables, and there are no
-- insert / update / delete policies (and those rights are revoked), so only this function and
-- the SQL editor can change them. The function itself can't be called through the API.
--
-- Safe to run more than once: tables, policies and the function are created "if not exists" /
-- replaced, the daily job is replaced (never duplicated), and running the refresh twice on the
-- same day changes nothing the second time. Existing tables, score checks and functions are
-- not touched. Paste the whole file into Supabase → SQL Editor and press Run.

-- ---------------------------------------------------------------- tables
create table if not exists public.all_mighty (
  id          smallint primary key default 1 check (id = 1), -- always exactly one row
  player_id   uuid references auth.users (id) on delete set null, -- null: nobody (empty board)
  username    text,
  score       bigint,
  since       timestamptz, -- when this player took #1 (stays the same while they keep it)
  checked_at  timestamptz not null default now() -- the last time the refresh ran
);

create table if not exists public.all_mighty_history (
  player_id      uuid primary key references auth.users (id) on delete cascade,
  username       text, -- their name the last time they were #1
  first_held_at  timestamptz not null default now(),
  last_held_at   timestamptz not null default now(),
  reigns         integer not null default 1, -- separate times they took #1
  best_score     bigint
);

-- anyone can read, nobody can write from the app
alter table public.all_mighty enable row level security;
alter table public.all_mighty_history enable row level security;

drop policy if exists "all_mighty: read" on public.all_mighty;
create policy "all_mighty: read" on public.all_mighty
  for select to anon, authenticated using (true);

drop policy if exists "all_mighty_history: read" on public.all_mighty_history;
create policy "all_mighty_history: read" on public.all_mighty_history
  for select to anon, authenticated using (true);
-- (no insert / update / delete policies; and belt and braces:)
revoke insert, update, delete, truncate on public.all_mighty from anon, authenticated;
revoke insert, update, delete, truncate on public.all_mighty_history from anon, authenticated;
grant select on public.all_mighty to anon, authenticated;
grant select on public.all_mighty_history to anon, authenticated;

-- ---------------------------------------------------------------- the daily check
create or replace function public.glydrift_refresh_all_mighty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  top_id     uuid;
  top_name   text;
  top_score  bigint;
  cur_id     uuid;
  is_new     boolean;
begin
  -- the #1 all-time SCORE row (the same order as the leaderboard: score, then who was first)
  select s.player_id, s.username, s.score
    into top_id, top_name, top_score
  from public.scores s
  where s.level = 'endless'
    and s.score > 0
    and exists (select 1 from auth.users u where u.id = s.player_id)
  order by s.score desc, s.created_at asc, s.player_id
  limit 1;

  select a.player_id into cur_id from public.all_mighty a where a.id = 1;

  if top_id is null then
    -- an empty board (e.g. right after a leaderboard reset): nobody holds the title.
    -- The history is kept: former holders stay former holders.
    insert into public.all_mighty (id, player_id, username, score, since, checked_at)
    values (1, null, null, null, null, now())
    on conflict (id) do update
      set player_id = null, username = null, score = null, since = null, checked_at = now();
    return jsonb_build_object('holder', null, 'changed', cur_id is not null);
  end if;

  is_new := cur_id is distinct from top_id;

  insert into public.all_mighty (id, player_id, username, score, since, checked_at)
  values (1, top_id, top_name, top_score, now(), now())
  on conflict (id) do update
    set player_id  = excluded.player_id,
        username   = excluded.username,
        score      = excluded.score,
        since      = case when is_new then now() else coalesce(public.all_mighty.since, now()) end,
        checked_at = now();

  insert into public.all_mighty_history
    (player_id, username, first_held_at, last_held_at, reigns, best_score)
  values (top_id, top_name, now(), now(), 1, top_score)
  on conflict (player_id) do update
    set username     = excluded.username,
        last_held_at = now(),
        -- a new reign only when they (re)took #1, so a second run the same day adds nothing
        reigns       = public.all_mighty_history.reigns + case when is_new then 1 else 0 end,
        best_score   = greatest(public.all_mighty_history.best_score, excluded.best_score);

  return jsonb_build_object(
    'holder', top_id, 'username', top_name, 'score', top_score, 'changed', is_new
  );
end;
$$;

-- only the database itself (the daily job, the SQL editor) runs it, never the app
revoke all on function public.glydrift_refresh_all_mighty() from public, anon, authenticated;

-- ---------------------------------------------------------------- run it every day
-- pg_cron must be enabled: Supabase → Database → Extensions → search "pg_cron" → enable it.
-- This block tries to enable it itself, and (re)schedules the job only when it's there.
-- FALLBACK if pg_cron can't be enabled: nothing breaks, the title just isn't re-checked by
-- itself. Run this line by hand in the SQL editor whenever you like (e.g. once a day):
--     select public.glydrift_refresh_all_mighty();
do $do$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'glydrift: could not enable pg_cron (%). Enable it in Database → Extensions and run this file again, or run select public.glydrift_refresh_all_mighty(); by hand.', sqlerrm;
    end;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- replace the job, never add a second copy
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'glydrift-all-mighty';
    perform cron.schedule(
      'glydrift-all-mighty',
      '7 0 * * *', -- every day at 00:07 UTC
      $cron$select public.glydrift_refresh_all_mighty();$cron$
    );
    raise notice 'glydrift: ALL MIGHTY is re-checked every day at 00:07 UTC';
  end if;
end;
$do$;

-- ---------------------------------------------------------------- fill it in now
select public.glydrift_refresh_all_mighty() as all_mighty_now;
