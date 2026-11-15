-- Glydrift · WASP LORD switched OFF (15 Nov 2026).
--
-- Safe to run more than once. Paste the whole file into Supabase → SQL Editor and press Run.
-- The last statement shows a one-row summary.
--
-- What it does:
--   1. A server-side switch (table glydrift_hero_switches) with WASP LORD set to OFF. While it's
--      off, the server REJECTS every new or changed score row with hero 'wasplord', from any
--      version of the game (an old cached copy too). To bring him back one day:
--        update public.glydrift_hero_switches set enabled = true where hero = 'wasplord';
--      (and switch him on in the game: src/data/heroSwitch.js).
--   2. Every WASP LORD score (character = 'wasplord') on every board (endless, endless-distance,
--      daily and every level board) is COPIED into glydrift_wasp_lord_archive first, then removed
--      from the leaderboards. Nothing is lost for good: the archive keeps every column.
--   3. If the ALL MIGHTY crown was held with a WASP LORD score, that reign is taken back and the
--      crown goes to the best non-WASP LORD score (the normal daily re-check, run now).
--   4. His 55,000-coin refund, ONCE per account: glydrift_wasp_owners lists the accounts whose
--      cloud save owns him (taken now, before the game update removes him from saves), and the
--      game calls glydrift_wasp_refund(), which says "granted" the first time and "already" ever
--      after (one row per account in glydrift_wasp_refunds), so a reload, a log-out / log-in or
--      a second device can't pay it twice. Guests (no account) are refunded on their own device.
--
-- Nothing else changes: other heroes' scores, names, titles and score limits stay exactly as
-- they are.

-- ---------------------------------------------------------------- 1. the switch
create table if not exists public.glydrift_hero_switches (
  hero       text primary key,
  enabled    boolean not null,
  changed_at timestamptz not null default now()
);
alter table public.glydrift_hero_switches enable row level security;
drop policy if exists "anyone can read" on public.glydrift_hero_switches;
create policy "anyone can read" on public.glydrift_hero_switches for select using (true);
grant select on public.glydrift_hero_switches to anon, authenticated;

insert into public.glydrift_hero_switches (hero, enabled) values ('wasplord', false)
on conflict (hero) do update set enabled = false, changed_at = now()
  where public.glydrift_hero_switches.enabled;

-- the first check on every score row ("0" sorts before the other glydrift_ triggers)
create or replace function public.glydrift_hero_switch_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.glydrift_hero_switches h
     where h.hero = new.character and not h.enabled
  ) then
    raise exception 'glydrift: hero % is switched off', new.character using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_0_hero_switch on public.scores;
create trigger glydrift_0_hero_switch
  before insert or update on public.scores
  for each row execute function public.glydrift_hero_switch_check();

-- ---------------------------------------------------------------- 2. archive, then remove
create table if not exists public.glydrift_wasp_lord_archive as
  select s.*, now() as archived_at from public.scores s with no data;
-- private: only the database (SQL Editor) reads it, never the app
alter table public.glydrift_wasp_lord_archive enable row level security;
revoke all on public.glydrift_wasp_lord_archive from anon, authenticated;

insert into public.glydrift_wasp_lord_archive
select s.*, now() from public.scores s
 where s.character = 'wasplord'
   and not exists (select 1 from public.glydrift_wasp_lord_archive a where a.id = s.id);

delete from public.scores s
 where s.character = 'wasplord'
   and exists (select 1 from public.glydrift_wasp_lord_archive a where a.id = s.id);

-- ---------------------------------------------------------------- 3. the ALL MIGHTY crown
do $do$
declare
  cur record;
begin
  if to_regclass('public.all_mighty') is null then
    return; -- (ALL MIGHTY isn't set up on this project)
  end if;
  select a.player_id, a.score, a.since into cur from public.all_mighty a where a.id = 1;
  -- held with a WASP LORD score: that score is in the archive and no other endless row of
  -- theirs is as good
  if cur.player_id is not null
     and exists (
       select 1 from public.glydrift_wasp_lord_archive w
        where w.player_id = cur.player_id and w.level = 'endless' and w.score = cur.score
     )
     and not exists (
       select 1 from public.scores s
        where s.player_id = cur.player_id and s.level = 'endless' and s.score >= cur.score
     ) then
    -- that reign doesn't count: one fewer reign, and a player whose only reign it was loses the
    -- "Former All Mighty" history it gave (anyone else's history is untouched)
    update public.all_mighty_history set reigns = reigns - 1
     where player_id = cur.player_id and reigns > 1;
    delete from public.all_mighty_history
     where player_id = cur.player_id and reigns = 1
       and first_held_at >= coalesce(cur.since, now()) - interval '1 minute';
    update public.all_mighty
       set player_id = null, username = null, score = null, since = null
     where id = 1;
    raise notice 'glydrift: the ALL MIGHTY crown was held with a Wasp Lord score; it moves now';
  end if;
  -- the normal re-check: the best score left on the endless board takes (or keeps) the crown
  perform public.glydrift_refresh_all_mighty();
end;
$do$;

-- ---------------------------------------------------------------- 4. the one-time refund
create table if not exists public.glydrift_wasp_owners (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  found_at timestamptz not null default now()
);
create table if not exists public.glydrift_wasp_refunds (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  coins       integer not null default 55000,
  refunded_at timestamptz not null default now()
);
-- private: the app only ever calls glydrift_wasp_refund()
alter table public.glydrift_wasp_owners enable row level security;
alter table public.glydrift_wasp_refunds enable row level security;
revoke all on public.glydrift_wasp_owners from anon, authenticated;
revoke all on public.glydrift_wasp_refunds from anon, authenticated;

-- every account whose cloud save owns him right now
insert into public.glydrift_wasp_owners (user_id)
select ps.user_id from public.player_saves ps
 where ps.save #> '{unlocked,wasplord}' = 'true'::jsonb
   and exists (select 1 from auth.users u where u.id = ps.user_id)
on conflict (user_id) do nothing;

create or replace function public.glydrift_wasp_refund()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   integer;
begin
  if uid is null then
    return 'none';
  end if;
  -- an owner: listed when this migration ran, or their cloud save still has him
  if not exists (select 1 from public.glydrift_wasp_owners o where o.user_id = uid) then
    if not exists (
      select 1 from public.player_saves ps
       where ps.user_id = uid and ps.save #> '{unlocked,wasplord}' = 'true'::jsonb
    ) then
      return 'not_owner';
    end if;
    insert into public.glydrift_wasp_owners (user_id) values (uid) on conflict (user_id) do nothing;
  end if;
  -- once per account, ever (the primary key makes two devices at the same moment safe too)
  insert into public.glydrift_wasp_refunds (user_id) values (uid) on conflict (user_id) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'granted' else 'already' end;
end;
$$;

revoke all on function public.glydrift_wasp_refund() from public, anon;
grant execute on function public.glydrift_wasp_refund() to authenticated;

-- ---------------------------------------------------------------- summary (one row)
select
  (select count(*) from public.glydrift_wasp_lord_archive) as archived_wasp_scores,
  (select count(*) from public.scores where character = 'wasplord') as wasp_scores_left_on_boards,
  (select count(*) from public.glydrift_wasp_owners) as wasp_owners_with_accounts,
  (select count(*) from public.glydrift_wasp_refunds) as refunds_paid_so_far,
  (select case when enabled then 'ON' else 'OFF' end
     from public.glydrift_hero_switches where hero = 'wasplord') as wasp_lord_switch,
  (select a.username from public.all_mighty a where a.id = 1) as all_mighty_now,
  (select s.character from public.all_mighty a
     join public.scores s on s.player_id = a.player_id and s.level = 'endless'
    where a.id = 1) as all_mighty_hero;
