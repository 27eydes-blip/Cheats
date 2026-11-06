-- Glydrift · crash reports from players' devices (src/systems/crashReport.js).
--
-- The game adds a row when something goes wrong: a script error, an error that froze a frame,
-- a lost graphics context, or a run the phone closed mid-way (found at the next launch). Each
-- row says where: device, browser, screen, build, score, distance, realm, hero, mode.
-- Anyone can ADD a report (the game uses the publishable key); nobody can read, change or
-- delete them from the app. Read them in the Supabase dashboard (Table Editor → crash_reports)
-- or with the query at the bottom. Safe to run more than once.

create table if not exists public.crash_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  happened_at timestamptz,
  kind        text not null check (char_length(kind) <= 40),
  message     text check (char_length(message) <= 300),
  stack       text check (char_length(stack) <= 1500),
  build       text check (char_length(build) <= 40),
  device      text check (char_length(device) <= 120),
  browser     text check (char_length(browser) <= 120),
  screen      text check (char_length(screen) <= 40),
  score       integer,
  distance    integer,
  realm       text check (char_length(realm) <= 40),
  hero        text check (char_length(hero) <= 40),
  mode        text check (char_length(mode) <= 20),
  scene       text check (char_length(scene) <= 80),
  memory_mb   integer,
  player_id   uuid default auth.uid()
);

alter table public.crash_reports enable row level security;

drop policy if exists "crash_reports: anyone can add" on public.crash_reports;
create policy "crash_reports: anyone can add" on public.crash_reports
  for insert to anon, authenticated with check (true);
-- (no select / update / delete policies: the app can't read or change reports)

create index if not exists crash_reports_created_idx on public.crash_reports (created_at desc);

-- The last day's crashes, most common first:
-- select kind, message, count(*), max(score) as top_score, max(created_at) as latest
-- from public.crash_reports where created_at > now() - interval '1 day'
-- group by kind, message order by count(*) desc;
