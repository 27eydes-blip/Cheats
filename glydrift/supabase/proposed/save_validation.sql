-- Glydrift · PROPOSED (Part 4 plan, not applied). Review before running.
-- Server-side sanity checks on cloud saves (table player_saves), so a hand-edited save can't be
-- uploaded as-is. Deliberately loose (it must never refuse a real player's save): it refuses only
-- impossible values and impossibly fast gains. The full fix also needs the coin ledger from the
-- coin-duplication plan (lifetime earned / spent counters), which the checks below then use.
create or replace function public.glydrift_check_save()
returns trigger
language plpgsql
as $$
declare
  coins bigint := coalesce((new.save->>'coins')::bigint, 0);
  old_coins bigint := coalesce((old.save->>'coins')::bigint, 0);
  hours numeric := greatest(0.05, extract(epoch from (now() - coalesce(old.updated_at, now() - interval '1 hour'))) / 3600);
  earned bigint := coalesce((new.save->'ledger'->>'earned')::bigint, null);
  spent bigint := coalesce((new.save->'ledger'->>'spent')::bigint, null);
begin
  if coins < 0 or coins > 10000000 then
    raise exception 'glydrift: impossible coin total' using errcode = '22023';
  end if;
  -- a single device can't earn more than ~60,000 coins an hour (the best runs pay ~6,000)
  if tg_op = 'UPDATE' and coins - old_coins > 60000 * hours + 20000 then
    raise exception 'glydrift: coins grew impossibly fast' using errcode = '22023';
  end if;
  -- with the ledger: coins must equal what was earned minus what was spent
  if earned is not null and spent is not null and coins <> earned - spent + coalesce((new.save->'ledger'->>'base')::bigint, 0) then
    raise exception 'glydrift: coins do not match the ledger' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists glydrift_check_save on public.player_saves;
create trigger glydrift_check_save
  before insert or update on public.player_saves
  for each row execute function public.glydrift_check_save();
