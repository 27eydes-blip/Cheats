-- © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
--
-- Glydrift · server-side checks, round 2 (security review 2026-11-05).
-- Everything that matters to other players or to paid content is decided here, on the server.
-- A modified game, or a direct REST call with the public key, gets the same answers as the game.
--
--  1. Scores: the server sets created_at, so a row can't be back-dated or future-dated onto
--     "Today". A row can't move to another player or board. Run time is capped at 2 hours.
--     The board must be a real one (endless, endless-distance, or daily-N for about today;
--     test-… boards stay open for the RLS test script).
--     The username must be 3–12 letters/numbers and pass the same word filter as the game.
--  2. Characters: shape-checked. A Drift Pass+ hero shows on the board only with a verified,
--     non-refunded App Store (Production) purchase of that season; otherwise it shows as Volt.
--  3. Drift Pass+ titles ("p_…") need a verified Production purchase of their own season.
--     Sandbox/TestFlight purchases still unlock the game, because App Review needs that, but
--     they never show paid extras on the public board.
--
-- Safe to run more than once. Existing rows aren't re-checked until they change.
-- Keep the word lists in step with BLOCKED_ANYWHERE / BLOCKED_EDGE in src/online/username.js.

-- ---------------------------------------------------------------- helpers
create or replace function public.glydrift_daily_today()
returns integer language sql stable set search_path = '' as $$
  -- same numbering as dailyNumber() in src/data/rng.js: day 1 = 2026-01-01
  select greatest(1, (current_date - date '2026-01-01') + 1)::integer
$$;

create or replace function public.glydrift_name_ok(name text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  anywhere constant text[] := array['fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'nigg', 'faggot', 'retard', 'whore', 'slut', 'pussy', 'dildo', 'jizz', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'wank', 'twat', 'tranny', 'kike', 'chink', 'asshole', 'bastard', 'horny', 'nude', 'milf'];
  edge constant text[] := array['fag', 'rape', 'cum', 'anal', 'sex', 'hoe', 'tits', 'boob', 'cock', 'dick', 'piss', 'spic', 'kkk', 'arse'];
  low text := lower(coalesce(name, ''));
  -- the game's leetspeak map: 0→o 1→i 3→e 4→a 5→s 7→t 8→b 9→g
  mapped text := translate(low, '01345789', 'oieastbg');
  squashed text := regexp_replace(mapped, '(.)\1+', '\1', 'g');
  w text;
begin
  if name is null or name !~ '^[A-Za-z0-9]{3,12}$' then return false; end if;
  foreach w in array anywhere loop
    if position(w in low) > 0 or position(w in mapped) > 0 or position(w in squashed) > 0 then
      return false;
    end if;
  end loop;
  if low = any (edge) or mapped = any (edge) or squashed = any (edge) then return false; end if;
  return true;
end;
$$;

-- Drift Pass+ items that need a purchase before they show on the public board.
-- Add rows for every new season, e.g. ('character', 'newhero', 's2').
create table if not exists public.glydrift_paid_items (
  kind      text not null check (kind in ('character', 'title')),
  item_id   text not null,
  season_id text not null,
  primary key (kind, item_id)
);
alter table public.glydrift_paid_items enable row level security;
drop policy if exists "paid items: read" on public.glydrift_paid_items;
create policy "paid items: read" on public.glydrift_paid_items for select using (true);
-- (no write policies: you edit it from the dashboard / SQL editor)

insert into public.glydrift_paid_items (kind, item_id, season_id) values
  ('character', 'voidcat', 's1'), ('character', 'hexowl', 's1'),
  ('character', 'wraithmoth', 's1'), ('character', 'triphound', 's1'),
  ('character', 'phantomray', 's1'), ('character', 'scorpyre', 's1'),
  ('character', 'krakkie', 's1'), ('character', 'crimsonmantis', 's1'),
  ('character', 'gloomeleon', 's1'), ('character', 'umbradrake', 's1'),
  ('title', 'p_abysslord', 's1'), ('title', 'p_neonroyal', 's1'), ('title', 'p_starborn', 's1')
on conflict (kind, item_id) do update set season_id = excluded.season_id;

-- does this player hold a verified, non-refunded App Store purchase of this season?
create or replace function public.glydrift_owns_season(uid uuid, season text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.purchases p
    where p.user_id = uid and p.season_id = season
      and p.revoked_at is null and p.environment = 'Production'
  )
$$;
revoke all on function public.glydrift_owns_season(uuid, text) from public, anon, authenticated;

-- may this player show this paid item? (true for anything that isn't a paid item)
create or replace function public.glydrift_may_show(uid uuid, item_kind text, item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.glydrift_paid_items i
    where i.kind = item_kind and i.item_id = item
      and not public.glydrift_owns_season(uid, i.season_id)
  )
$$;
revoke all on function public.glydrift_may_show(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- scores
create or replace function public.glydrift_check_score()
returns trigger
language plpgsql
security definer -- only to call the private helpers above; every check uses the row itself
set search_path = ''
as $$
declare
  -- top speed: 625 px/s × 1.8 (fastest hero, realm speed spikes, Chrono fast zones),
  -- 20 px per metre, plus a 40 m allowance for the launch
  max_m numeric;
  day_n integer;
  today integer;
begin
  if tg_op = 'UPDATE' then
    -- a row never changes owner or board
    new.player_id := old.player_id;
    new.level := old.level;
  end if;

  -- the name, whenever it's set or changed
  if (tg_op = 'INSERT' or new.username is distinct from old.username)
     and not public.glydrift_name_ok(new.username) then
    raise exception 'glydrift: name not allowed' using errcode = '22023';
  end if;

  -- the hero shown next to the score
  if new.character is not null and new.character !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'glydrift: unknown hero' using errcode = '22023';
  end if;
  if new.character is not null
     and not public.glydrift_may_show(new.player_id, 'character', new.character) then
    new.character := 'volt';
  end if;

  -- a rename (or any update that leaves the result alone) is not a new result
  if tg_op = 'UPDATE'
     and new.score = old.score
     and new.distance is not distinct from old.distance
     and new.run_time_ms is not distinct from old.run_time_ms then
    new.created_at := old.created_at;
    return new;
  end if;

  -- a new result: the server's clock decides when it happened
  new.created_at := now();

  -- real boards only (test-… boards are for scripts/test-leaderboard-rls.mjs and ?lbtest builds;
  -- the game never shows them)
  if new.level !~ '^test-[a-z0-9-]{1,40}$' then
    if new.level !~ '^(endless|endless-distance|daily-[0-9]{1,6})$' then
      raise exception 'glydrift: unknown board' using errcode = '22023';
    end if;
    if new.level like 'daily-%' then
      day_n := substring(new.level from 7)::integer;
      today := public.glydrift_daily_today();
      -- ±1 day for time zones (the game numbers days by the player's local date)
      if day_n < today - 1 or day_n > today + 1 then
        raise exception 'glydrift: that daily challenge is closed' using errcode = '22023';
      end if;
    end if;
  end if;

  if new.run_time_ms is null or new.run_time_ms < 500 then
    raise exception 'glydrift: run time missing or too short' using errcode = '22023';
  end if;
  if new.run_time_ms > 7200000 then
    raise exception 'glydrift: run time too long' using errcode = '22023';
  end if;
  max_m := (625 * 1.8 / 20.0) * (new.run_time_ms / 1000.0) + 40;
  if new.distance is not null and (new.distance < 0 or new.distance > max_m) then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;
  if new.level like '%endless-distance' and new.score > max_m then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;
  -- score = metres + coin bonus + close-call bonus, both bounded per metre
  if new.score <= 0 or new.score > max_m * 20 + 500 or new.score > 2000000 then
    raise exception 'glydrift: impossible score for the run time' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_score on public.scores;
create trigger glydrift_check_score
  before insert or update on public.scores
  for each row execute function public.glydrift_check_score();

-- ---------------------------------------------------------------- Drift Pass+ titles
create or replace function public.glydrift_check_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title like 'p\_%' and not public.glydrift_may_show(new.player_id, 'title', new.title) then
    new.title := null;
  end if;
  -- an unknown p_ title (not in glydrift_paid_items) is never shown either
  if new.title like 'p\_%' and not exists (
    select 1 from public.glydrift_paid_items i where i.kind = 'title' and i.item_id = new.title
  ) then
    new.title := null;
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_title on public.scores;
create trigger glydrift_check_title
  before insert or update on public.scores
  for each row execute function public.glydrift_check_title();

-- ---------------------------------------------------------------- refunds
-- Called by the Edge Function "appstore-notifications" when Apple reports a refund/revoke:
-- the purchase stops counting and its paid extras come off the public board straight away.
create or replace function public.glydrift_revoke_purchase(tx_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  for p in
    update public.purchases set revoked_at = coalesce(revoked_at, now())
     where transaction_id = tx_id or original_transaction_id = tx_id
    returning user_id, season_id
  loop
    update public.scores s set title = null
     where s.player_id = p.user_id and s.title in (
       select i.item_id from public.glydrift_paid_items i
        where i.kind = 'title' and i.season_id = p.season_id);
    update public.scores s set character = 'volt'
     where s.player_id = p.user_id and s.character in (
       select i.item_id from public.glydrift_paid_items i
        where i.kind = 'character' and i.season_id = p.season_id);
  end loop;
end;
$$;
revoke all on function public.glydrift_revoke_purchase(text) from public, anon, authenticated;
grant execute on function public.glydrift_revoke_purchase(text) to service_role;

-- verify-purchase looks transactions up by their original id too (one purchase, one account)
create index if not exists purchases_original_tx_idx on public.purchases (original_transaction_id);
