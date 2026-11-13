-- Glydrift · "Delete my account" removes every trace of the player (App Store guideline 5.1.1(v)).
--
-- The game calls public.delete_my_account() (Settings → ACCOUNT → DELETE MY ACCOUNT,
-- src/online/account.js). The first version (20261104000002_accounts_cloud_save.sql) deleted the
-- leaderboard rows, the cloud save, the purchases and the auth user (and with it, by cascade,
-- name_reports, name_blocks and all_mighty_history). This version also removes what that one
-- left behind:
--   * crash_reports rows sent from the player's sessions (player_id has no foreign key),
--   * the player's rows in the 2026-11 leaderboard backup (leaderboard_archive_2026_11),
--   * their name on the ALL MIGHTY board when they hold #1 (the foreign key only cleared the id;
--     the name stayed until the next refresh).
--
-- Still no secret / service-role key anywhere: the function runs with the database owner's rights
-- but only ever for auth.uid(), the signed-in caller. Signed-out callers get an error.
-- Optional tables are checked with to_regclass, so this works whichever migrations ran.
-- Safe to run more than once. Paste the whole file into Supabase → SQL Editor and press Run.

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

  -- leaderboard entries and the cloud save
  delete from public.scores where player_id = me;
  delete from public.player_saves where user_id = me;

  -- purchase records (Drift Pass+)
  if to_regclass('public.purchases') is not null then
    execute 'delete from public.purchases where user_id = $1' using me;
  end if;

  -- crash reports sent while signed in as this player
  if to_regclass('public.crash_reports') is not null then
    execute 'delete from public.crash_reports where player_id = $1' using me;
  end if;

  -- reports they made / reports about them, and their blocked-name list (also cascades)
  if to_regclass('public.name_reports') is not null then
    execute 'delete from public.name_reports where reporter = $1 or reported_player = $1' using me;
  end if;
  if to_regclass('public.name_blocks') is not null then
    execute 'delete from public.name_blocks where player_id = $1' using me;
  end if;

  -- the leaderboard backup taken before the November 2026 reset
  if to_regclass('public.leaderboard_archive_2026_11') is not null then
    execute 'delete from public.leaderboard_archive_2026_11 where player_id = $1' using me;
  end if;

  -- ALL MIGHTY: their name off the #1 board now (the hourly refresh picks the next player)
  if to_regclass('public.all_mighty') is not null then
    execute 'update public.all_mighty
                set player_id = null, username = null, score = null, since = null
              where player_id = $1' using me;
  end if;
  if to_regclass('public.all_mighty_history') is not null then
    execute 'delete from public.all_mighty_history where player_id = $1' using me;
  end if;

  -- finally the sign-in itself (email / Sign in with Apple identity, sessions, refresh tokens)
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
