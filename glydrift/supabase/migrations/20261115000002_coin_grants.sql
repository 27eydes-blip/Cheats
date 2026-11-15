-- Glydrift · coin grants from the owner (safe while the player's game is open).
--
-- Run once (Supabase → SQL Editor → paste → Run). Safe to run more than once. Changes no existing
-- data. After that, grant coins with supabase/admin/grant_coins.sql.
--
-- Why not edit the player's save in player_saves: the game on their phone holds its own copy and
-- uploads it after every change, so an edit there can be overwritten (the game now merges a
-- changed cloud copy first, but an upload can still cross the edit in the same second, and older
-- app versions don't merge at all). A grant is a separate row instead:
--   1. you add it: select public.glydrift_admin_grant_coins(<player id>, <coins>, '<note>');
--   2. the player's game claims it (at launch, when it comes back to the screen, and every two
--      minutes while it's open, never mid-run): one atomic step on the server marks it claimed
--      and hands the coins over, so a grant can never be claimed twice or lost to an upload;
--   3. the coins go into their save and sync to their account like any other coins.
-- It works for guests too (no account needed: the player id is their leaderboard id). An older
-- app version simply leaves the grant waiting until the player updates.
--
--   coin_grants                    one row per grant: who, how many, a note, when claimed
--   glydrift_admin_grant_coins()   add a grant (SQL editor only, never the app)
--   glydrift_claim_grants()        the game claims its own unclaimed grants (signed-in player only)

create table if not exists public.coin_grants (
  id          bigserial primary key,
  player_id   uuid not null references auth.users (id) on delete cascade,
  coins       integer not null check (coins between 1 and 1000000),
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists coin_grants_unclaimed on public.coin_grants (player_id) where claimed_at is null;

-- the app can't read or write the table directly: only through the claim function
alter table public.coin_grants enable row level security;
revoke all on public.coin_grants from anon, authenticated;
revoke all on sequence public.coin_grants_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- add a grant (owner only)
create or replace function public.glydrift_admin_grant_coins(p_player uuid, p_coins integer, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  gid bigint;
begin
  if p_coins is null or p_coins < 1 or p_coins > 1000000 then
    raise exception 'glydrift: grant between 1 and 1,000,000 coins' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_player) then
    raise exception 'glydrift: no player with id %', p_player using errcode = '22023';
  end if;
  insert into public.coin_grants (player_id, coins, note) values (p_player, p_coins, left(p_note, 200))
  returning id into gid;
  return gid;
end;
$$;
-- never callable from the app (only the SQL editor, which runs as the database owner)
revoke all on function public.glydrift_admin_grant_coins(uuid, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the game claims its grants
create or replace function public.glydrift_claim_grants()
returns table (id bigint, coins integer, note text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  -- one statement: each grant is claimed exactly once, even with two devices asking at once
  return query
    update public.coin_grants g
       set claimed_at = now()
     where g.player_id = auth.uid() and g.claimed_at is null
    returning g.id, g.coins, g.note;
end;
$$;
revoke all on function public.glydrift_claim_grants() from public, anon;
grant execute on function public.glydrift_claim_grants() to authenticated;
