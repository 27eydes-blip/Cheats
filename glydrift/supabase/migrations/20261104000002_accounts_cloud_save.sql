-- © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
-- Glydrift · accounts + cloud save.
--
-- Accounts are Supabase Auth users. Everyone starts anonymous (as before); creating an account
-- upgrades that same user to email + password (or Sign in with Apple on iOS), so their id,
-- leaderboard rows and progress stay theirs.
--
--   player_saves       one cloud save per account; only the owner can read or write it
--   delete_my_account  deletes the caller's account and every row that belongs to them
--
-- Row Level Security is on for every table. No secret / service-role key is used anywhere:
-- delete_my_account runs with the database owner's rights, but only ever for auth.uid().
-- Safe to run more than once.

create table if not exists public.player_saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  save       jsonb not null,
  progress   bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_saves enable row level security;

drop policy if exists "player_saves: read own" on public.player_saves;
create policy "player_saves: read own" on public.player_saves
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "player_saves: insert own" on public.player_saves;
create policy "player_saves: insert own" on public.player_saves
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "player_saves: update own" on public.player_saves;
create policy "player_saves: update own" on public.player_saves
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "player_saves: delete own" on public.player_saves;
create policy "player_saves: delete own" on public.player_saves
  for delete to authenticated using (user_id = auth.uid());

-- a cloud save is at most 1 MB (a full save is ~20 KB)
alter table public.player_saves drop constraint if exists player_saves_size;
alter table public.player_saves add constraint player_saves_size
  check (pg_column_size(save) < 1048576);

-- "Delete my account" (Settings → Account): removes everything that belongs to the caller.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.scores where player_id = me;
  delete from public.player_saves where user_id = me;
  if to_regclass('public.purchases') is not null then
    execute 'delete from public.purchases where user_id = $1' using me;
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
