-- Glydrift · crashes since the last sweep (the hour bug sweep went live on 9 Nov 2026).
-- Read-only: paste into Supabase → SQL Editor and run. Three result sets.
-- (crash_reports only lets the game ADD rows, so the game and the test tools can't read them.)

-- 1) One row per kind of crash, most common first.
select
  kind,
  message,
  count(*)                                         as times,
  count(distinct player_id)                        as players,
  string_agg(distinct build, ', ')                 as builds,
  string_agg(distinct split_part(device, ' ', 1), ', ') as devices,
  string_agg(distinct coalesce(scene, '?'), ', ')  as screens,
  string_agg(distinct coalesce(realm, '-'), ', ')  as realms,
  string_agg(distinct coalesce(hero, '-'), ', ')   as heroes,
  max(score)                                       as top_score,
  max(distance)                                    as top_distance,
  min(created_at)                                  as first_seen,
  max(created_at)                                  as latest,
  (array_agg(stack order by created_at desc))[1]   as example_stack
from public.crash_reports
where created_at > '2026-11-09 00:00+07'
group by kind, message
order by times desc
limit 25;

-- 2) Crash kinds that are NEW since the sweep (never seen before 9 Nov).
select kind, message, count(*) as times, count(distinct player_id) as players, max(created_at) as latest
from public.crash_reports c
where created_at > '2026-11-09 00:00+07'
  and not exists (
    select 1 from public.crash_reports o
    where o.kind = c.kind and o.message is not distinct from c.message
      and o.created_at <= '2026-11-09 00:00+07'
  )
group by kind, message
order by times desc;

-- 3) Since Sakura Skies went live (11 Nov, 13:42 UTC+7): crashes per realm, to spot anything new there.
select coalesce(realm, '-') as realm, kind, count(*) as times, count(distinct player_id) as players
from public.crash_reports
where created_at > '2026-11-11 13:40+07'
group by 1, 2
order by times desc;
