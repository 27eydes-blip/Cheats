-- Glydrift · reporting offensive leaderboard names (App Store guideline 1.2).
--
-- In the game: Leaderboard → REPORT A NAME → tap a name. It's hidden for that player at once
-- (on their device) and a row lands in name_reports.
--
-- Here: when 3 different players report the same name, it's blocked automatically: the
-- player's leaderboard rows are renamed to "Player 1a2b", and that name can't be uploaded again
-- (choosing a new, clean name works). To remove a name by hand straight away, run the
-- statement at the bottom. Players can add reports but can't read anyone's reports or blocks.
-- Deleting an account removes its reports and blocks too. Safe to run more than once.

create table if not exists public.name_reports (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  reporter        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_player uuid not null references auth.users (id) on delete cascade,
  reported_name   text not null check (char_length(reported_name) <= 40),
  unique (reported_player, reporter, reported_name)
);

alter table public.name_reports enable row level security;
drop policy if exists "name_reports: players can report" on public.name_reports;
create policy "name_reports: players can report" on public.name_reports
  for insert to authenticated
  with check (reporter = auth.uid() and reported_player <> auth.uid());
-- (no select / update / delete policies)

-- Blocked names: one row per player and name.
create table if not exists public.name_blocks (
  player_id   uuid not null references auth.users (id) on delete cascade,
  name_lower  text not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, name_lower)
);
alter table public.name_blocks enable row level security;
-- (no policies at all: only the database itself reads or writes it)

create or replace function public.glydrift_placeholder_name(pid uuid)
returns text language sql immutable as $$ select 'Player ' || left(replace(pid::text, '-', ''), 4) $$;

-- 3 different reporters → block the name and rename the player's rows
create or replace function public.glydrift_name_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(distinct reporter) from public.name_reports
       where reported_player = new.reported_player
         and lower(reported_name) = lower(new.reported_name)) >= 3 then
    insert into public.name_blocks (player_id, name_lower)
      values (new.reported_player, lower(new.reported_name))
      on conflict do nothing;
    update public.scores
       set username = public.glydrift_placeholder_name(player_id)
     where player_id = new.reported_player
       and lower(username) = lower(new.reported_name);
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_name_reported on public.name_reports;
create trigger glydrift_name_reported
  after insert on public.name_reports
  for each row execute function public.glydrift_name_reported();

-- a blocked name can't come back with the next score upload or rename
create or replace function public.glydrift_block_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.name_blocks
              where player_id = new.player_id and name_lower = lower(new.username)) then
    new.username := public.glydrift_placeholder_name(new.player_id);
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_block_names on public.scores;
create trigger glydrift_block_names
  before insert or update of username on public.scores
  for each row execute function public.glydrift_block_names();

-- Names reported most (look at these every few days):
--   select reported_name, reported_player, count(distinct reporter) as reports, max(created_at)
--   from public.name_reports group by 1, 2 order by reports desc, 4 desc limit 50;
--
-- Remove a name by hand straight away (paste the player id from the query above):
--   insert into public.name_blocks (player_id, name_lower)
--     select player_id, lower(username) from public.scores
--     where player_id = 'PASTE-PLAYER-ID' group by 1, 2 on conflict do nothing;
--   update public.scores set username = public.glydrift_placeholder_name(player_id)
--     where player_id = 'PASTE-PLAYER-ID';
