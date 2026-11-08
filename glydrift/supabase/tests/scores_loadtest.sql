-- Glydrift · OPTIONAL load-test table (Part 2, test 5). Not part of the game.
--
-- A throwaway copy of the leaderboard table, with the same columns, indexes and the same
-- score-check and server-time triggers, so `node scripts/load-test-scores.mjs` can send 500
-- players' scores at once without touching the real leaderboard. The script refuses to write to
-- `scores`. Anyone can add and remove rows here (it's test data only, never shown in the game).
--
-- Run it only if you want the real-server load test; the game doesn't need it.
-- Safe to run more than once. To remove it afterwards: drop table public.scores_loadtest;

create table if not exists public.scores_loadtest (like public.scores including all);

alter table public.scores_loadtest enable row level security;
drop policy if exists "loadtest anyone" on public.scores_loadtest;
create policy "loadtest anyone" on public.scores_loadtest
  for all using (true) with check (true);

drop trigger if exists glydrift_check_score on public.scores_loadtest;
create trigger glydrift_check_score
  before insert or update on public.scores_loadtest
  for each row execute function public.glydrift_check_score();

drop trigger if exists glydrift_server_time on public.scores_loadtest;
create trigger glydrift_server_time
  before insert or update on public.scores_loadtest
  for each row execute function public.glydrift_server_time();
