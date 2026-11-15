-- Glydrift · the ILLEGAL leaderboard: WASP LORD's runs get their own boards.
--
-- REPLACES 20261114000001_wasp_lord_scores.sql: everything that file did is in here too, so you
-- don't need to run it first (if you already ran it, that's fine).
-- Safe to run more than once. Deletes NO scores. Paste the whole file into Supabase → SQL
-- Editor and press Run. The last line shows a one-row summary.
--
-- What it does:
--   1. WASP LORD's rows live on boards of their own: the level gets an "illegal-" prefix
--      ("endless" → "illegal-endless", "endless-distance" → "illegal-endless-distance", daily
--      and level boards the same). The normal boards are read by level, so his rows can no
--      longer show up there, from any app version or a modified browser, and they never count
--      for ALL MIGHTY (which reads the normal "endless" board only).
--        - The server does the routing (trigger glydrift_a_illegal_board, the first trigger to
--          run on a score row): a new row with character = 'wasplord' is put on the illegal
--          board whatever level the game asked for. An older game that still sends his runs to
--          "endless" ends up on the ILLEGAL board too.
--        - An ILLEGAL row stays one (its level and hero can't be changed back), its best score
--          is never lowered by an older game, and no other hero can post on an illegal board.
--        - A normal row can't be relabelled as his.
--   2. Existing WASP LORD rows are MOVED (their level gets the prefix), never deleted: score,
--      name, time and hero stay exactly as they were.
--   3. If the ALL MIGHTY crown is held with a WASP LORD score, it goes to the best
--      non-WASP LORD score now. That reign doesn't count as an ALL MIGHTY reign: a player whose
--      only reign it was loses the "Former All Mighty" badge it gave; anyone else's history
--      is untouched. The daily re-check also ignores his rows (belt and braces).
--   4. The score check (glydrift_check_score) is the same as 20261114000001: his higher
--      limits (×1.95 speed, 38 points per metre: his x16 combo) only for a player whose cloud
--      save has him unlocked; everyone else gets the normal limits (×1.8, 30). New rows must
--      carry a well-formed hero id; a rename can't change the hero a run was flown with.
--
-- Nothing else changes: other heroes' rows, names, titles, the Distance / Daily / level boards
-- and the score limits of every other hero stay exactly as they are.

-- ---------------------------------------------------------------- 1. the score check
create or replace function public.glydrift_check_score()
returns trigger
language plpgsql
security definer -- reads the uploader's own cloud save whatever the table's grants are
set search_path = public
as $$
declare
  max_m numeric;
  is_level boolean := new.level ~ 'lv-[0-9]+$';
  is_distance boolean := new.level like '%endless-distance';
  is_wasp boolean;
  speed numeric;
  per_m numeric;
begin
  -- a rename (or any update that leaves the result alone) is not a new result: it keeps the
  -- hero the run was flown with
  if tg_op = 'UPDATE'
     and new.score = old.score
     and new.distance is not distinct from old.distance
     and new.run_time_ms is not distinct from old.run_time_ms then
    new.character := old.character;
    return new;
  end if;
  if new.character is null or new.character !~ '^[a-z0-9_]{1,24}$' then
    raise exception 'glydrift: missing or malformed hero id' using errcode = '22023';
  end if;
  -- his limits only for a player whose cloud save has him unlocked: only the uploader's own
  -- save is read (the row's player must be the signed-in player, and a player can only write
  -- scores as themselves)
  is_wasp := new.character = 'wasplord'
    and exists (
      select 1 from public.player_saves ps
      where ps.user_id = new.player_id
        and ps.user_id = auth.uid()
        and ps.save #> '{unlocked,wasplord}' = 'true'::jsonb
    );
  speed := case when is_wasp then 1.95 else 1.8 end;
  per_m := case when is_wasp then 38 else 30 end;
  if new.run_time_ms is null or new.run_time_ms < 500 then
    raise exception 'glydrift: run time missing or too short' using errcode = '22023';
  end if;
  if new.score is null or new.score <= 0 or new.score > 2000000 then
    raise exception 'glydrift: impossible score' using errcode = '22023';
  end if;
  max_m := (625 * speed / 20.0) * (new.run_time_ms / 1000.0) + 40;
  if new.distance is not null and (new.distance < 0 or new.distance > max_m) then
    raise exception 'glydrift: impossible distance for the run time' using errcode = '22023';
  end if;

  if is_level then
    -- level boards: the score is the time, so the two must agree
    if abs(new.score - round(500000000.0 / new.run_time_ms)) > 1 then
      raise exception 'glydrift: level score does not match its time' using errcode = '22023';
    end if;
    return new;
  end if;

  -- endless, daily and distance rows must say how far the run went
  if new.distance is null or new.distance <= 0 then
    raise exception 'glydrift: distance missing' using errcode = '22023';
  end if;
  if is_distance then
    if new.score <> new.distance then
      raise exception 'glydrift: distance board score must equal the distance' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.score < new.distance - 2 or new.score > new.distance * per_m + 2000 then
    raise exception 'glydrift: impossible score for the distance flown' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_score on public.scores;
create trigger glydrift_check_score
  before insert or update on public.scores
  for each row execute function public.glydrift_check_score();

-- ---------------------------------------------------------------- 2. the ILLEGAL routing
create or replace function public.glydrift_illegal_board()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.level like 'illegal-%' then
    -- an ILLEGAL row stays on the ILLEGAL board and stays his
    new.level := old.level;
    new.character := old.character;
    -- an older game compares with its normal-board row, not this one: never lower his best
    if new.score < old.score then
      return old;
    end if;
    return new;
  end if;
  if new.character = 'wasplord' then
    if tg_op = 'UPDATE' then
      raise exception 'glydrift: a normal board row can''t become a Wasp Lord row' using errcode = '22023';
    end if;
    if new.level not like 'illegal-%' then
      new.level := 'illegal-' || new.level;
    end if;
    return new;
  end if;
  if new.level like 'illegal-%' then
    raise exception 'glydrift: only Wasp Lord runs go on the ILLEGAL board' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- (off while the existing rows move, so a re-run moves anything left over the same way)
drop trigger if exists glydrift_a_illegal_board on public.scores;

-- ---------------------------------------------------------------- 3. move his existing rows
-- (only the level changes; the score check and server-time triggers see a rename and keep the
-- hero and the time; nothing is deleted)
update public.scores s
   set level = 'illegal-' || s.level
 where s.character = 'wasplord'
   and s.level not like 'illegal-%'
   and not exists (
     select 1 from public.scores t
      where t.player_id = s.player_id and t.level = 'illegal-' || s.level
   );

-- the router runs first on every score row ("a" sorts before the other glydrift_ triggers)
create trigger glydrift_a_illegal_board
  before insert or update on public.scores
  for each row execute function public.glydrift_illegal_board();

-- ---------------------------------------------------------------- 4. ALL MIGHTY
-- the daily re-check: the same as 20261109000001, and it also skips any WASP LORD row
create or replace function public.glydrift_refresh_all_mighty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  top_id     uuid;
  top_name   text;
  top_score  bigint;
  cur_id     uuid;
  is_new     boolean;
begin
  -- the #1 all-time SCORE row (the same order as the leaderboard: score, then who was first)
  select s.player_id, s.username, s.score
    into top_id, top_name, top_score
  from public.scores s
  where s.level = 'endless'
    and s.character is distinct from 'wasplord'
    and s.score > 0
    and exists (select 1 from auth.users u where u.id = s.player_id)
  order by s.score desc, s.created_at asc, s.player_id
  limit 1;

  select a.player_id into cur_id from public.all_mighty a where a.id = 1;

  if top_id is null then
    -- an empty board (e.g. right after a leaderboard reset): nobody holds the title.
    -- The history is kept: former holders stay former holders.
    insert into public.all_mighty (id, player_id, username, score, since, checked_at)
    values (1, null, null, null, null, now())
    on conflict (id) do update
      set player_id = null, username = null, score = null, since = null, checked_at = now();
    return jsonb_build_object('holder', null, 'changed', cur_id is not null);
  end if;

  is_new := cur_id is distinct from top_id;

  insert into public.all_mighty (id, player_id, username, score, since, checked_at)
  values (1, top_id, top_name, top_score, now(), now())
  on conflict (id) do update
    set player_id  = excluded.player_id,
        username   = excluded.username,
        score      = excluded.score,
        since      = case when is_new then now() else coalesce(public.all_mighty.since, now()) end,
        checked_at = now();

  insert into public.all_mighty_history
    (player_id, username, first_held_at, last_held_at, reigns, best_score)
  values (top_id, top_name, now(), now(), 1, top_score)
  on conflict (player_id) do update
    set username     = excluded.username,
        last_held_at = now(),
        -- a new reign only when they (re)took #1, so a second run the same day adds nothing
        reigns       = public.all_mighty_history.reigns + case when is_new then 1 else 0 end,
        best_score   = greatest(public.all_mighty_history.best_score, excluded.best_score);

  return jsonb_build_object(
    'holder', top_id, 'username', top_name, 'score', top_score, 'changed', is_new
  );
end;
$$;

-- only the database itself (the daily job, the SQL editor) runs it, never the app
revoke all on function public.glydrift_refresh_all_mighty() from public, anon, authenticated;

-- the crown, if a WASP LORD score holds it: that reign is taken back, then the best
-- non-WASP LORD score takes the crown
do $do$
declare
  cur record;
begin
  select a.player_id, a.score into cur from public.all_mighty a where a.id = 1;
  if cur.player_id is not null
     and exists (
       select 1 from public.scores s
        where s.player_id = cur.player_id and s.level = 'illegal-endless' and s.score = cur.score
     )
     and not exists (
       select 1 from public.scores s
        where s.player_id = cur.player_id and s.level = 'endless' and s.score >= cur.score
     ) then
    update public.all_mighty_history set reigns = reigns - 1
     where player_id = cur.player_id and reigns > 1;
    delete from public.all_mighty_history
     where player_id = cur.player_id and reigns = 1
       and first_held_at >= (select since from public.all_mighty where id = 1) - interval '1 minute';
    update public.all_mighty
       set player_id = null, username = null, score = null, since = null
     where id = 1;
    raise notice 'glydrift: the ALL MIGHTY crown was held with a Wasp Lord score; it moves now';
  end if;
end;
$do$;

select public.glydrift_refresh_all_mighty();

-- ---------------------------------------------------------------- summary (one row)
select
  (select count(*) from public.scores where level like 'illegal-%') as illegal_board_rows,
  (select count(*) from public.scores
    where character = 'wasplord' and level not like 'illegal-%') as wasp_rows_on_normal_boards,
  (select count(*) from public.scores) as total_rows,
  (select a.username from public.all_mighty a where a.id = 1) as all_mighty_now,
  (select s.character from public.all_mighty a
     join public.scores s on s.player_id = a.player_id and s.level = 'endless'
    where a.id = 1) as all_mighty_hero;
