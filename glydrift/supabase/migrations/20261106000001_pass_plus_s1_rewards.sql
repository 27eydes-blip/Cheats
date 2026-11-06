-- Glydrift · Season 1 "Abyss Rising" DRIFT PASS+ rewards on the leaderboard.
--
-- New public flair on a score row: `flair` lists Drift Pass+ extras the player shows next to
-- their name — "gold" (the animated gold name) and "s1" (the forever Season 1 badge), e.g.
-- 'gold,s1'. Like Drift Pass+ titles ("p_…"), they only stay on a row whose player has a
-- verified, unrefunded Season 1 purchase in public.purchases (written only by the
-- verify-purchase Edge Function). The same check now also covers the Drift Pass+ heroes
-- (the hero shown on the row): without a purchase the row shows VOLT instead.
--
-- So editing local storage to "own" a Pass+ title, hero, gold name or badge changes nothing
-- anyone else can see.
--
-- Works with or without the stricter server checks (20261105000001_server_checks.sql, on the
-- protect-ip branch): when its glydrift_paid_items table / glydrift_may_show() exist, they're
-- used (and the new heroes and titles are added to the table), so this never loosens them.
-- ORDER: if 20261105000001_server_checks.sql is ever run AFTER this file, it replaces the
-- shared trigger function — run this file again afterwards. (Checked on Postgres 16: in date
-- order, or with this file re-run last, a tampered row loses its Pass+ title, hero and flair.)
-- Safe to run more than once.

alter table public.scores add column if not exists flair text;
alter table public.scores drop constraint if exists scores_flair_shape;
alter table public.scores add constraint scores_flair_shape
  check (flair is null or flair ~ '^[a-z0-9_]{1,12}(,[a-z0-9_]{1,12}){0,5}$');

-- Pass+ heroes by season (keep in step with src/player/passHeroDefs.js)
create or replace function public.glydrift_pass_hero_season(hero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when hero in (
      'voidcat', 'hexowl', 'wraithmoth', 'triphound', 'phantomray', 'scorpyre', 'krakkie',
      'crimsonmantis', 'gloomeleon', 'umbradrake',
      'riftling', 'riftling_armor', 'riftling_aura', 'riftsovereign'
    ) then 's1'
    else null
  end
$$;

-- Does this player own this season's Drift Pass+? (the stricter glydrift_owns_season() when
-- it's installed, else any verified, unrefunded purchase)
create or replace function public.glydrift_has_pass(uid uuid, season text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ok boolean;
begin
  if to_regprocedure('public.glydrift_owns_season(uuid,text)') is not null then
    execute 'select public.glydrift_owns_season($1, $2)' into ok using uid, season;
    return coalesce(ok, false);
  end if;
  return exists (
    select 1 from public.purchases p
    where p.user_id = uid and p.season_id = season and p.revoked_at is null
  );
end;
$$;
revoke all on function public.glydrift_has_pass(uuid, text) from public, anon, authenticated;

-- the new Season 1 heroes and titles, for the stricter checks' paid-items table if it exists
do $$
begin
  if to_regclass('public.glydrift_paid_items') is not null then
    insert into public.glydrift_paid_items (kind, item_id, season_id) values
      ('character', 'riftling', 's1'), ('character', 'riftling_armor', 's1'),
      ('character', 'riftling_aura', 's1'), ('character', 'riftsovereign', 's1'),
      ('title', 'p_riftdiver', 's1'), ('title', 'p_abysswalker', 's1'),
      ('title', 'p_voidtouched', 's1'), ('title', 'p_s1founder', 's1')
    on conflict (kind, item_id) do update set season_id = excluded.season_id;
  end if;
end;
$$;

-- One trigger for every Drift Pass+ extra on a score row: title, hero and flair
create or replace function public.glydrift_check_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  strict_on boolean := to_regclass('public.glydrift_paid_items') is not null
    and to_regprocedure('public.glydrift_may_show(uuid,text,text)') is not null;
  ok boolean;
  hero_season text;
begin
  -- Drift Pass+ titles ("p_…")
  if new.title like 'p\_%' then
    if strict_on then
      execute 'select public.glydrift_may_show($1, ''title'', $2)
                 and exists (select 1 from public.glydrift_paid_items i
                             where i.kind = ''title'' and i.item_id = $2)'
        into ok using new.player_id, new.title;
    else
      ok := public.glydrift_has_pass(new.player_id, 's1');
    end if;
    if not coalesce(ok, false) then
      new.title := null;
    end if;
  end if;
  -- Drift Pass+ heroes: shown only with that season's purchase
  hero_season := public.glydrift_pass_hero_season(new.character);
  if hero_season is not null and not public.glydrift_has_pass(new.player_id, hero_season) then
    new.character := 'volt';
  end if;
  -- gold name + Season 1 badge
  if new.flair is not null and not public.glydrift_has_pass(new.player_id, 's1') then
    new.flair := null;
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_title on public.scores;
create trigger glydrift_check_title
  before insert or update on public.scores
  for each row execute function public.glydrift_check_title();
