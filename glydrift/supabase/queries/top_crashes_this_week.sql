-- Glydrift · the top crashes of the last 7 days (read-only: paste into Supabase → SQL Editor).
-- One row per kind of crash, most common first: how often, how many players, which builds,
-- devices and screens, the highest score it hit, and one example stack.
select
  kind,
  message,
  count(*)                                         as times,
  count(distinct player_id)                        as players,
  string_agg(distinct build, ', ')                 as builds,
  string_agg(distinct split_part(device, ' ', 1), ', ') as devices,
  string_agg(distinct coalesce(scene, '?'), ', ')  as screens,
  string_agg(distinct coalesce(realm, '-'), ', ')  as realms,
  max(score)                                       as top_score,
  max(distance)                                    as top_distance,
  max(created_at)                                  as latest,
  (array_agg(stack order by created_at desc))[1]   as example_stack
from public.crash_reports
where created_at > now() - interval '7 days'
group by kind, message
order by times desc
limit 25;
