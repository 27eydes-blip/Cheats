-- Glydrift · PROPOSED (Part 4 plan, not applied). Review before running.
-- Level boards: refuse times that are impossible for the level. Each level's minimum is 60% of
-- the time a standard-speed hero takes to fly it start to finish with no crashes (measured by the
-- level bot, 8 Nov 2026) — room for the fastest heroes (+25% speed, WALLRUNNER's dash) and more.
-- Re-measure and update this table whenever a level's layout changes.
create table if not exists public.glydrift_level_min_ms (
  level int primary key,
  min_ms int not null
);
alter table public.glydrift_level_min_ms enable row level security;
drop policy if exists "level mins: read" on public.glydrift_level_min_ms;
create policy "level mins: read" on public.glydrift_level_min_ms for select using (true);

insert into public.glydrift_level_min_ms (level, min_ms) values
  (1, 23299),
  (2, 26490),
  (3, 25150),
  (4, 32880),
  (5, 29950),
  (6, 28380),
  (7, 34870),
  (8, 30640),
  (9, 42060),
  (10, 55380),
  (11, 28819),
  (12, 24439),
  (13, 25570),
  (14, 29610),
  (15, 27550),
  (16, 29719),
  (17, 32800),
  (18, 35070),
  (19, 35080),
  (20, 54420),
  (21, 22260),
  (22, 20119),
  (23, 21820),
  (24, 20980),
  (25, 22450),
  (26, 20740),
  (27, 24100),
  (28, 26389),
  (29, 22879),
  (30, 36739),
  (31, 20640),
  (32, 21870),
  (33, 21589),
  (34, 25870),
  (35, 29950),
  (36, 24850),
  (37, 29280),
  (38, 27049),
  (39, 31720),
  (40, 43830),
  (41, 19440),
  (42, 21510),
  (43, 22630),
  (44, 19429),
  (45, 21490),
  (46, 23989),
  (47, 21630),
  (48, 25080),
  (49, 30060),
  (50, 46420)
on conflict (level) do update set min_ms = excluded.min_ms;

-- the check, added to the score trigger's level branch (glydrift_check_score):
--   if is_level then
--     select min_ms into lv_min from public.glydrift_level_min_ms
--       where level = substring(new.level from 'lv-([0-9]+)$')::int;
--     if lv_min is not null and new.run_time_ms < lv_min then
--       raise exception 'glydrift: impossible time for this level' using errcode = '22023';
--     end if;
--     ... (the existing score-matches-time check)
