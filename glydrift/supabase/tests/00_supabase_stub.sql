-- © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE.
-- A minimal stand-in for what Supabase provides (roles, auth.uid()), plus the base scores
-- table and policies that predate supabase/migrations. Used only by scripts/test-server-checks.sh.
-- minimal stand-in for what Supabase provides, plus the base scores table the repo doesn't have
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz default now(), is_anonymous boolean default true);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
create table public.scores (
  id bigint generated always as identity primary key,
  player_id uuid not null, username text, level text not null, score integer not null,
  character text, run_time_ms integer, created_at timestamptz default now(),
  unique (player_id, level));
alter table public.scores enable row level security;
create policy "read" on public.scores for select using (true);
create policy "insert own" on public.scores for insert to authenticated with check (player_id = auth.uid());
create policy "update own" on public.scores for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
grant select on public.scores to anon, authenticated; grant insert, update on public.scores to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
