-- Glydrift · a READ-ONLY database role for the nightly crash digest (optional).
--
-- It can read ONE table, crash_reports, and nothing else: no players, saves, scores or accounts,
-- and it can't change anything. Never use the service_role key for the nightly sweep.
--
-- 1. Pick a long random password. Type it ONLY in the line below, in the Supabase SQL Editor
--    (never in a chat, an issue or a commit), then run this whole file.
-- 2. In GitHub: Settings → Secrets and variables → Actions → New repository secret
--      name:  GLYDRIFT_READONLY_DB_URL
--      value: postgresql://glydrift_nightly_reader.<project-ref>:<password>@<pooler host>:5432/postgres
--    (Supabase → Connect → "Session pooler" shows the host and the project ref; replace the user
--    "postgres.<project-ref>" with "glydrift_nightly_reader.<project-ref>".)
-- Safe to run again (it resets the password and the grants). To remove it later:
--   drop owned by glydrift_nightly_reader; drop role glydrift_nightly_reader;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'glydrift_nightly_reader') then
    create role glydrift_nightly_reader login;
  end if;
end
$$;

alter role glydrift_nightly_reader with login password 'CHOOSE_A_LONG_RANDOM_PASSWORD'
  nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 2;
alter role glydrift_nightly_reader set default_transaction_read_only = on;
alter role glydrift_nightly_reader set statement_timeout = '30s';

revoke all on all tables in schema public from glydrift_nightly_reader;
grant usage on schema public to glydrift_nightly_reader;
grant select on public.crash_reports to glydrift_nightly_reader;

-- crash_reports has row-level security: let this role (and only it) read the rows
drop policy if exists "nightly reader reads crash reports" on public.crash_reports;
create policy "nightly reader reads crash reports" on public.crash_reports
  for select to glydrift_nightly_reader using (true);

select 'glydrift_nightly_reader can read crash_reports only' as done;
