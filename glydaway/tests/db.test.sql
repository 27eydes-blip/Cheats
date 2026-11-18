-- Database checks for glydaway/supabase/schema.sql on a plain PostgreSQL (16+), with small stand-ins for
-- what Supabase provides (the auth schema, auth.uid()/auth.jwt(), the anon/authenticated roles).
-- Run from the glydaway folder:  psql -X -q -t -f tests/db.test.sql   (prints PASS/FAIL lines)
-- Stand-ins for Supabase: the auth schema, its users table and helpers, and the API roles.
\set ON_ERROR_STOP on
drop schema if exists auth cascade; drop schema if exists extensions cascade;
create schema auth; create schema extensions;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create table auth.users (id uuid primary key, email text unique, is_anonymous boolean not null default true);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
\unset ON_ERROR_STOP
\i supabase/schema.sql
\echo '--- second run (must be safe to run again)'
\i supabase/schema.sql
\set ON_ERROR_STOP on

-- players: A and B anonymous, C has an email account
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', null, true), ('00000000-0000-0000-0000-00000000000b', null, true), ('00000000-0000-0000-0000-00000000000c', 'c@example.com', false);
create function pg_temp.as_player(id text, anon boolean) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, false), set_config('request.jwt.claims', json_build_object('sub', id, 'is_anonymous', anon)::text, false), null::void
$$;
create table pg_temp.results (n serial, test text, ok boolean, detail text);
grant all on pg_temp.results to anon, authenticated; grant usage on sequence pg_temp.results_n_seq to anon, authenticated;
create function pg_temp.expect_error(test text, q text, want text) returns void language plpgsql as $$
begin
  begin execute q; insert into pg_temp.results (test, ok, detail) values (test, false, 'no error');
  exception when others then insert into pg_temp.results (test, ok, detail) values (test, sqlerrm = want or sqlerrm like '%' || want || '%', sqlerrm); end;
end $$;
create function pg_temp.expect(test text, cond boolean, detail text default '') returns void language sql as $$ insert into pg_temp.results (test, ok, detail) values (test, coalesce(cond, false), detail) $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

set role authenticated;
-- C (an email account) claims a name
select pg_temp.as_player('00000000-0000-0000-0000-00000000000c', false);
select public.glydaway_set_username('NeonFox');
select pg_temp.expect('a signed-in player''s name is claimed', (select claimed from public.glydaway_profiles where username = 'NeonFox'));
-- A (anonymous) can't take it, in any letter case; rude and malformed names are refused
select pg_temp.as_player('00000000-0000-0000-0000-00000000000a', true);
select pg_temp.expect_error('anonymous player cannot take a claimed name (any case)', $q$select public.glydaway_set_username('neonFOX')$q$, 'name_taken');
select pg_temp.expect_error('rude name refused', $q$select public.glydaway_set_username('Sh1tHead')$q$, 'name_invalid');
select pg_temp.expect_error('too long name refused', $q$select public.glydaway_set_username('ThisNameIsWayTooLong')$q$, 'name_invalid');
select pg_temp.expect_error('symbols refused', $q$select public.glydaway_set_username('a b!')$q$, 'name_invalid');
select public.glydaway_set_username('SkyKid');
-- B (anonymous) may share an unclaimed name
select pg_temp.as_player('00000000-0000-0000-0000-00000000000b', true);
select public.glydaway_set_username('SkyKid');
select pg_temp.expect('two anonymous players may share an unclaimed name', (select count(*) = 2 from public.glydaway_profiles where username = 'SkyKid'));

-- scores: checks, best only, weekly + all-time, rate limit
select pg_temp.as_player('00000000-0000-0000-0000-00000000000a', true);
select public.glydaway_submit_run(300, 40, 60000);
select pg_temp.expect('a run posts to all-time and this week, distance and coins', (select count(*) = 4 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000a'));
select pg_temp.expect_error('too fast: rate limit', $q$select public.glydaway_submit_run(500, 10, 60000)$q$, 'too_fast');
reset role; update public.glydaway_profiles set last_submit_at = now() - interval '1 minute'; set role authenticated;
select pg_temp.expect_error('impossible distance for the run time', $q$select public.glydaway_submit_run(99999, 10, 60000)$q$, 'impossible_score');
select pg_temp.expect_error('impossible coins', $q$select public.glydaway_submit_run(100, 9000, 60000)$q$, 'impossible_score');
select pg_temp.expect_error('negative score', $q$select public.glydaway_submit_run(-5, 0, 60000)$q$, 'impossible_score');
select pg_temp.expect_error('wrong type', $q$select public.glydaway_submit_run('lots', 0, 60000)$q$, 'invalid input syntax');
select public.glydaway_submit_run(200, 5, 60000);
select pg_temp.expect('a worse run does not replace the best', (select score = 300 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000a' and board = 'distance' and period = 'all'));
reset role; update public.glydaway_profiles set last_submit_at = now() - interval '1 minute'; set role authenticated;
select public.glydaway_submit_run(800, 50, 120000);
select pg_temp.expect('a better run replaces it (one row per board, no duplicates)', (select count(*) = 1 and max(score) = 800 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000a' and board = 'distance' and period = 'all'));
-- direct writes are impossible
select pg_temp.expect_error('cannot insert a score directly', $q$insert into public.glydaway_scores values ('00000000-0000-0000-0000-00000000000a','distance','all',99999,99999,0,600000)$q$, 'permission denied');
select pg_temp.expect_error('cannot edit someone''s score', $q$update public.glydaway_scores set score = 1$q$, 'permission denied');
select pg_temp.expect_error('cannot rename someone else', $q$update public.glydaway_profiles set username = 'Hacked'$q$, 'permission denied');
select pg_temp.expect_error('cannot read rate-limit columns', $q$select last_submit_at from public.glydaway_profiles$q$, 'permission denied');
-- B posts; ranks
select pg_temp.as_player('00000000-0000-0000-0000-00000000000b', true);
select public.glydaway_submit_run(500, 20, 60000);
select pg_temp.expect('my rank works', (select (public.glydaway_my_rank('distance', 'all') ->> 'rank')::int = 2));
select pg_temp.expect('leaderboard view: name, score, me flag', (select count(*) = 1 from public.glydaway_leaderboard where board = 'distance' and period = 'all' and me and username = 'SkyKid' and score = 500));
-- the leaderboard is readable without signing in, and shows no emails
reset role; set role anon; select pg_temp.as_player('', true);
select pg_temp.expect('anyone can read the board, sorted', (select array_agg(score order by score desc) = '{800,500}' from public.glydaway_leaderboard where board = 'distance' and period = 'all'));
select pg_temp.expect_error('anonymous visitors cannot post', $q$select public.glydaway_submit_run(100, 0, 60000)$q$, 'permission denied');
select pg_temp.expect_error('nobody can read emails through the API roles', $q$select email from auth.users$q$, 'permission denied');
reset role; set role authenticated;

-- progress: own row only
select pg_temp.as_player('00000000-0000-0000-0000-00000000000a', true);
insert into public.glydaway_progress (id, data) values ('00000000-0000-0000-0000-00000000000a', '{"gold": 120, "skins": ["finn"]}');
select pg_temp.expect_error('cannot write another player''s progress', $q$insert into public.glydaway_progress (id, data) values ('00000000-0000-0000-0000-00000000000b', '{"gold": 5}')$q$, 'row-level security');
select pg_temp.expect_error('gold cannot be negative', $q$update public.glydaway_progress set data = '{"gold": -5}' where id = auth.uid()$q$, 'bad_progress');
select pg_temp.as_player('00000000-0000-0000-0000-00000000000b', true);
select pg_temp.expect('cannot read another player''s progress', (select count(*) = 0 from public.glydaway_progress));

-- an anonymous player (A) joins an existing email account (C): scores move over, A is deleted
select pg_temp.as_player('00000000-0000-0000-0000-00000000000a', true);
create temp table code as select public.glydaway_make_transfer() as c;
select pg_temp.as_player('00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect_error('a wrong transfer code is refused', $q$select public.glydaway_merge('nope')$q$, 'bad_code');
select public.glydaway_merge((select c from code));
select pg_temp.expect('the anonymous player''s best scores now belong to the account', (select score = 800 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000c' and board = 'distance' and period = 'all'));
reset role;
select pg_temp.expect('the anonymous player is gone (login, profile, scores, progress)', (select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000a') and (select count(*) = 0 from public.glydaway_progress where id = '00000000-0000-0000-0000-00000000000a') and (select count(*) = 0 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000a'));
set role authenticated;
select pg_temp.expect_error('a code works only once', $q$select public.glydaway_merge((select c from code))$q$, 'bad_code');
select pg_temp.as_player('00000000-0000-0000-0000-00000000000c', false);
-- claimed rename: once a week
select public.glydaway_set_username('NeonFoxy');
select pg_temp.expect_error('a claimed name changes at most once a week', $q$select public.glydaway_set_username('NeonFox2')$q$, 'rename_too_soon');
select pg_temp.expect('the old claimed name is free again', (select count(*) = 0 from public.glydaway_profiles where lower(username) = 'neonfox'));
-- an anonymous player (B) signs in with a NEW email: same login, now permanent, the name gets claimed
reset role; update auth.users set email = 'b@example.com', is_anonymous = false where id = '00000000-0000-0000-0000-00000000000b'; set role authenticated;
select pg_temp.as_player('00000000-0000-0000-0000-00000000000b', false);
select public.glydaway_claim();
select pg_temp.expect('linking an email keeps the player and claims the name', (select claimed and username = 'SkyKid' from public.glydaway_profiles where id = '00000000-0000-0000-0000-00000000000b') and (select count(*) = 4 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000b'));
-- delete my account: everything goes
select public.glydaway_delete_me();
reset role;
select pg_temp.expect('delete account removes login, email, profile, scores and progress', (select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000b') and (select count(*) = 0 from public.glydaway_profiles where id = '00000000-0000-0000-0000-00000000000b') and (select count(*) = 0 from public.glydaway_scores where player_id = '00000000-0000-0000-0000-00000000000b'));

select (case when ok then 'PASS  ' else 'FAIL  ' end) || test || (case when ok then '' else '  → ' || detail end) as result from pg_temp.results order by n;
select count(*) filter (where not ok) as failed, count(*) as total from pg_temp.results;
