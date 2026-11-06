-- © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE.
-- Glydrift · DRIFT PASS+ purchases ($3.99 per season, iOS In-App Purchase, StoreKit 2).
--
-- A row here means: Apple confirmed this transaction (checked server-side by the Edge Function
-- "verify-purchase" against the App Store Server API) for this account, app and product, and it
-- hasn't been refunded. Players can read their own rows (RESTORE PURCHASES on any device);
-- nobody can write rows from the app — only the Edge Function can, with the service role that
-- Supabase gives Edge Functions on its own servers (it is never in the app or the repository).
-- Safe to run more than once.

create table if not exists public.purchases (
  id                       bigint generated always as identity primary key,
  user_id                  uuid not null references auth.users (id) on delete cascade,
  season_id                text not null,
  product_id               text not null,
  transaction_id           text not null unique,
  original_transaction_id  text not null,
  environment              text not null check (environment in ('Production', 'Sandbox')),
  purchased_at             timestamptz not null,
  verified_at              timestamptz not null default now(),
  revoked_at               timestamptz,
  unique (user_id, season_id)
);

alter table public.purchases enable row level security;

drop policy if exists "purchases: read own" on public.purchases;
create policy "purchases: read own" on public.purchases
  for select to authenticated using (user_id = auth.uid() and revoked_at is null);
-- (no insert / update / delete policies: the app can never write purchases)

-- Drift Pass+ titles ("p_…") on the leaderboard need a verified purchase behind them
create or replace function public.glydrift_check_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title like 'p\_%' and not exists (
    select 1 from public.purchases p
    where p.user_id = new.player_id and p.revoked_at is null
  ) then
    new.title := null;
  end if;
  return new;
end;
$$;

drop trigger if exists glydrift_check_title on public.scores;
create trigger glydrift_check_title
  before insert or update of title on public.scores
  for each row execute function public.glydrift_check_title();
