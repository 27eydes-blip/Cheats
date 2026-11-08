-- Glydrift · PROPOSED (Part 4 plan, not applied, not needed until the shop change is built).
-- The server's clock for the game: the shop, featured / limited heroes and the Daily Drop would
-- use this instead of the phone's date, so winding the phone clock forward no longer buys a
-- hero early. Read-only, no player data. Safe to run more than once.
create or replace function public.glydrift_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.glydrift_now() to anon, authenticated;
