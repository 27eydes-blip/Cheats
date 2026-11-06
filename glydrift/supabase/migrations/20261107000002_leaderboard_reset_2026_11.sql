-- Glydrift · leaderboard reset, November 2026. Run once, AFTER 20261107000001.
--
-- 1. Copies EVERY row of public.scores (all boards, including level times) into
--    public.leaderboard_archive_2026_11, with the time it was archived. Nothing is lost.
-- 2. Clears the SCORE and DISTANCE boards (all-time, this week and today all read the same
--    rows) and every Daily Challenge board. Level best-time boards are kept.
-- 3. Clears each player's best score in their cloud save, so their next run can set a new
--    one. Coins, heroes, cosmetics, Drift Pass, level stars and accounts are not touched.
-- 4. Publishes the reset in glydrift_meta. The game reads it at launch: it clears that
--    device's best score and shows the one-time LEADERBOARD RESET notice.
--
-- Safe if run twice: once the reset is published, a second run changes nothing (so scores
-- posted after the reset are never wiped). The archive is private: Row Level Security is on
-- with no policies, so only the SQL editor / database owner can read it.

do $$
declare
  archived integer;
  cleared integer;
  saves integer;
begin
  if exists (
    select 1 from public.glydrift_meta
    where key = 'lb_reset' and value ->> 'id' = '2026-11'
  ) then
    raise notice 'glydrift: the 2026-11 reset already ran; nothing changed';
    return;
  end if;

  -- 1. back up every row
  create table if not exists public.leaderboard_archive_2026_11 (
    like public.scores including defaults
  );
  alter table public.leaderboard_archive_2026_11
    add column if not exists archived_at timestamptz not null default now();
  alter table public.leaderboard_archive_2026_11 enable row level security;
  insert into public.leaderboard_archive_2026_11
    select s.*, now() from public.scores s;
  get diagnostics archived = row_count;

  -- 2. clear the Score, Distance and Daily boards (not the level boards)
  delete from public.scores
  where level in ('endless', 'endless-distance') or level ~ '^daily-[0-9]+$';
  get diagnostics cleared = row_count;

  -- 3. clear each player's best score in their cloud save (everything else stays)
  update public.player_saves
  set save = jsonb_set(save, '{best}', '0'::jsonb)
  where coalesce((save ->> 'best')::numeric, 0) > 0;
  get diagnostics saves = row_count;

  -- 4. publish the reset
  insert into public.glydrift_meta (key, value, updated_at)
  values (
    'lb_reset',
    jsonb_build_object('id', '2026-11', 'at', now(), 'archived', archived, 'cleared', cleared),
    now()
  )
  on conflict (key) do update set value = excluded.value, updated_at = now();

  raise notice 'glydrift: archived % rows, cleared % board rows, reset % saved bests',
    archived, cleared, saves;
end;
$$;

-- what happened (shown under the query in the SQL editor)
select
  (select count(*) from public.leaderboard_archive_2026_11) as rows_archived,
  (select count(*) from public.scores
     where level in ('endless', 'endless-distance') or level ~ '^daily-[0-9]+$') as score_rows_left,
  (select value ->> 'at' from public.glydrift_meta where key = 'lb_reset') as reset_at;
