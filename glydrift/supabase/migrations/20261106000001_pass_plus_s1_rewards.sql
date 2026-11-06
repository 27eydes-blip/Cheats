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
-- anyone else can see. Safe to run more than once.

alter table public.scores add column if not exists flair text;
alter table public.scores drop constraint if exists scores_flair_shape;
alter table public.scores add constraint scores_flair_shape
  check (flair is null or flair ~ '^[a-z0-9_]{1,12}(,[a-z0-9_]{1,12}){0,5}$');

-- Pass+ heroes by season (keep in step with src/player/passHeroDefs.js)
create or replace function public.glydrift_pass_hero_season(hero text)
returns text
language sql
immutable
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

create or replace function public.glydrift_has_pass(uid uuid, season text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.purchases p
    where p.user_id = uid and p.season_id = season and p.revoked_at is null
  )
$$;

-- One trigger for every Drift Pass+ extra on a score row: title, hero and flair
create or replace function public.glydrift_check_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hero_season text;
begin
  -- Drift Pass+ titles ("p_…") are Season 1's
  if new.title like 'p\_%' and not public.glydrift_has_pass(new.player_id, 's1') then
    new.title := null;
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
  before insert or update of title, character, flair on public.scores
  for each row execute function public.glydrift_check_title();
