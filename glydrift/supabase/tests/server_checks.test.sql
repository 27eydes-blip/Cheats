-- © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
-- Attacks a cheater could make with the public key, run against the real migrations.
-- Every row must say PASS. Run: npm run test:server (needs a local PostgreSQL).
\set QUIET on
create schema t; grant usage on schema t to authenticated;
create table t.results (n serial, name text, ok boolean, detail text); grant all on t.results to authenticated; grant all on sequence t.results_n_seq to authenticated;
create function t.expect(name text, stmt text, should_fail boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into t.results(name, ok, detail) values (name, not should_fail, 'succeeded');
  exception when others then
    insert into t.results(name, ok, detail) values (name, should_fail, sqlerrm);
  end;
end $$;
create function t.check(name text, cond boolean, detail text default '') returns void language sql as $$
  insert into t.results(name, ok, detail) values (name, cond, detail) $$;
grant execute on all functions in schema t to authenticated;
-- one Production purchase of season 1 for player B (written by the Edge Function in real life)
insert into public.purchases (user_id, season_id, product_id, transaction_id, original_transaction_id, environment, purchased_at)
values ('bbbbbbbb-0000-0000-0000-000000000002','s1','com.glydrift.game.driftpassplus.s1','tx-b','tx-b','Production', now());

-- act as player A
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
select t.expect('honest endless run is accepted',
  $q$insert into scores(player_id,username,level,score,character,run_time_ms,distance) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','endless',3000,'volt',60000,2500)$q$, false);
select t.expect('honest distance run is accepted',
  $q$insert into scores(player_id,username,level,score,character,run_time_ms,distance) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','endless-distance',2500,'volt',60000,2500)$q$, false);
select t.expect('today''s daily is accepted',
  format($q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','daily-%s',900,'volt',30000)$q$, public.glydrift_daily_today()), false);
select t.expect('RLS-test board test-rls still works',
  $q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('aaaaaaaa-0000-0000-0000-000000000001','TestPlayerA','test-rls',100,'volt',60000)$q$, false);
select t.expect('L1: billion-ms run time to top the board is rejected',
  $q$update scores set score=1999999, run_time_ms=999999999, distance=null where level='endless'$q$, true);
select t.expect('L1: run longer than 2 h is rejected',
  $q$update scores set score=200000, run_time_ms=7300000 where level='endless'$q$, true);
select t.expect('impossible score for the run time is still rejected',
  $q$update scores set score=900000, run_time_ms=60000 where level='endless'$q$, true);
-- L2: back/forward-dating
update scores set username = 'PilotA', created_at = '2099-01-01' where level = 'endless';
select t.check('L2: a rename can''t future-date the row', (select created_at < now() + interval '1 minute' from scores where level='endless'), (select created_at::text from scores where level='endless'));
update scores set score = 3100, run_time_ms = 62000, created_at = '2000-01-01' where level = 'endless';
select t.check('L2: a new best gets the server''s time, not the client''s', (select created_at > now() - interval '1 minute' from scores where level='endless'), (select created_at::text from scores where level='endless'));
select t.expect('L2: a row can''t be moved to another board',
  $q$update scores set level='endless-distance-x', username='PilotA' where level='endless'$q$, false);
select t.check('L2: ...and the board stayed "endless"', (select count(*)=1 from scores where level='endless'));
select t.expect('L4: offensive name rejected (plain)',  $q$update scores set username='FuckYou' where level='endless'$q$, true);
select t.expect('L4: offensive name rejected (leetspeak)', $q$update scores set username='5h1tLord' where level='endless'$q$, true);
select t.expect('L4: offensive name rejected (f4g)',   $q$update scores set username='f4g' where level='endless'$q$, true);
select t.expect('L4: overlong name rejected', $q$update scores set username='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' where level='endless'$q$, true);
select t.expect('L4: symbols / spaces rejected', $q$update scores set username='<b>hi</b>' where level='endless'$q$, true);
select t.expect('L4: a normal rename still works', $q$update scores set username='PilotAce' where level='endless'$q$, false);
select t.expect('L5: made-up board rejected', $q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','hacked-board',100,'volt',60000)$q$, true);
select t.expect('L5: future daily rejected',
  format($q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','daily-%s',100,'volt',60000)$q$, public.glydrift_daily_today()+5), true);
select t.expect('L5: long-closed daily rejected', $q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('aaaaaaaa-0000-0000-0000-000000000001','PilotA','daily-3',100,'volt',60000)$q$, true);
select t.expect('L6: junk character rejected', $q$update scores set character='<script>' where level='endless'$q$, true);
update scores set character = 'voidcat' where level = 'endless';
select t.check('L6: unbought Drift Pass+ hero shows as Volt', (select character='volt' from scores where level='endless'), (select character from scores where level='endless'));
update scores set title = 'p_abysslord' where level = 'endless';
select t.check('L7: unbought p_ title is removed', (select title is null from scores where level='endless'));
select t.expect('another player''s row can''t be written (RLS)', $q$insert into scores(player_id,username,level,score,character,run_time_ms) values ('bbbbbbbb-0000-0000-0000-000000000002','Spoof','endless',100,'volt',60000)$q$, true);
select t.expect('purchases can''t be written from the app', $q$insert into purchases(user_id,season_id,product_id,transaction_id,original_transaction_id,environment,purchased_at) values ('aaaaaaaa-0000-0000-0000-000000000001','s1','x','fake','fake','Production',now())$q$, true);
select t.expect('paid items list can''t be edited from the app', $q$delete from glydrift_paid_items$q$, false);
select t.check('...and nothing was deleted', (select count(*)=13 from glydrift_paid_items));
select t.expect('private helper can''t be called from the app', $q$select public.glydrift_owns_season('bbbbbbbb-0000-0000-0000-000000000002','s1')$q$, true);
select t.expect('refund function can''t be called from the app', $q$select public.glydrift_revoke_purchase('tx-b')$q$, true);
reset role;

-- player B owns Season 1 (Production)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
set role authenticated;
select t.expect('B: run with paid hero + paid title',
  $q$insert into scores(player_id,username,level,score,character,run_time_ms,title) values ('bbbbbbbb-0000-0000-0000-000000000002','PilotB','endless',2000,'voidcat',60000,'p_abysslord')$q$, false);
select t.check('B: paid hero + title stay (verified purchase)', (select character='voidcat' and title='p_abysslord' from scores where player_id='bbbbbbbb-0000-0000-0000-000000000002'));
reset role;
-- Apple reports a refund → Edge Function calls this with the service role
select public.glydrift_revoke_purchase('tx-b');
select t.check('refund: purchase marked revoked', (select revoked_at is not null from purchases where transaction_id='tx-b'));
select t.check('refund: paid hero + title come off the board', (select character='volt' and title is null from scores where player_id='bbbbbbbb-0000-0000-0000-000000000002'), (select character||'/'||coalesce(title,'null') from scores where player_id='bbbbbbbb-0000-0000-0000-000000000002'));
-- Sandbox purchase: unlocks the game, but no public paid extras
insert into public.purchases (user_id, season_id, product_id, transaction_id, original_transaction_id, environment, purchased_at)
values ('aaaaaaaa-0000-0000-0000-000000000001','s1','com.glydrift.game.driftpassplus.s1','tx-sbx','tx-sbx','Sandbox', now());
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select t.check('sandbox purchase is readable by its owner (RESTORE works)', (select count(*)=1 from purchases where transaction_id='tx-sbx'));
update scores set character='voidcat', title='p_abysslord' where level='endless' and player_id=auth.uid();
select t.check('sandbox purchase gives no public paid extras', (select character='volt' and title is null from scores where level='endless' and player_id=auth.uid()));
reset role;
select n, case when ok then 'PASS' else 'FAIL' end, name, left(detail,80) from t.results order by n;
select count(*) filter (where not ok) as failures, count(*) as total from t.results;
