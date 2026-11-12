-- Glydrift · iPad crashes (players crashing at random scores, everything going invisible).
-- Read-only: paste into Supabase → SQL Editor and run. Four result sets.
-- iPads usually report as "Mac" (iPadOS Safari pretends to be a Mac); builds from 12 Nov 2026
-- on report "iPad". So an iPad here = device "iPad…", or "Mac" with an iPad-sized screen.

with ipad as (
  select *
  from public.crash_reports
  where created_at > '2026-11-01 00:00+07'
    and (
      device ilike 'iPad%'
      or (device ilike 'Mac%' and split_part(screen, '@', 1) in (
        '768x1024','1024x768','810x1080','1080x810','820x1180','1180x820','834x1112','1112x834',
        '834x1194','1194x834','1024x1366','1366x1024','744x1133','1133x744','1032x1376','1376x1032'))
    )
)
-- 1) What iPads hit, most common first (with where in the run it happened)
select kind, message, count(*) as times, count(distinct player_id) as players,
       min(score) as min_score, percentile_cont(0.5) within group (order by score) as median_score,
       max(score) as max_score, string_agg(distinct coalesce(realm, '-'), ', ') as realms,
       string_agg(distinct screen, ', ') as screens, max(memory_mb) as max_js_mb,
       string_agg(distinct build, ', ') as builds, max(created_at) as latest
from ipad
group by kind, message
order by times desc
limit 30;

-- 2) iPad runs the system closed mid-run (memory kills show as "killed_mid_run"), by realm and
--    score band: a pile-up at one realm points at that realm's art
with ipad as (
  select * from public.crash_reports
  where created_at > '2026-11-01 00:00+07'
    and (device ilike 'iPad%' or (device ilike 'Mac%' and split_part(screen, '@', 1) in (
      '768x1024','1024x768','810x1080','1080x810','820x1180','1180x820','834x1112','1112x834',
      '834x1194','1194x834','1024x1366','1366x1024','744x1133','1133x744','1032x1376','1376x1032')))
)
select coalesce(realm, '-') as realm,
       case when score < 2000 then '<2K' when score < 10000 then '2K–10K'
            when score < 20000 then '10K–20K' else '20K+' end as score_band,
       count(*) as times, count(distinct player_id) as players
from ipad
where kind in ('killed_mid_run', 'contextlost', 'recovered', 'frame', 'contextgiveup')
group by 1, 2
order by times desc;

-- 3) Lost / restored / given-up graphics, by device (new kinds from the 12 Nov build:
--    contextlost, contextrebuild, contextgiveup)
select split_part(device, ' ', 1) as device, kind, count(*) as times,
       count(distinct player_id) as players, max(created_at) as latest
from public.crash_reports
where created_at > '2026-11-01 00:00+07'
  and kind in ('contextlost', 'contextrestored', 'contextrebuild', 'contextgiveup', 'killed_mid_run')
group by 1, 2
order by times desc;

-- 4) iPad vs everything else since Sakura Skies went live (11 Nov 13:42 UTC+7)
select case when device ilike 'iPad%' or (device ilike 'Mac%' and split_part(screen, '@', 1) in (
         '768x1024','1024x768','810x1080','1080x810','820x1180','1180x820','834x1112','1112x834',
         '834x1194','1194x834','1024x1366','1366x1024','744x1133','1133x744','1032x1376','1376x1032'))
       then 'iPad' else split_part(device, ' ', 1) end as device,
       count(*) as reports, count(distinct player_id) as players,
       count(*) filter (where kind = 'killed_mid_run') as killed_mid_run
from public.crash_reports
where created_at > '2026-11-11 13:40+07'
group by 1
order by reports desc;
