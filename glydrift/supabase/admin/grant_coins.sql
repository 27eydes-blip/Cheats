-- Glydrift · grant coins to a player (owner only, in Supabase → SQL Editor).
--
-- Needs supabase/migrations/20261115000002_coin_grants.sql to have been run once.
-- Safe while the player's game is open: the game claims the grant by itself (at launch, when it
-- comes back to the screen, and every two minutes while open, never mid-run) and adds the coins
-- to their save. A grant is claimed exactly once. Don't edit coins in player_saves by hand.
-- Run ONE step at a time: select the lines of a step and press Run.

-- ---- step 1: find the player's id from their leaderboard name (case doesn't matter)
select distinct player_id, username
  from public.scores
 where lower(username) = lower('PlayerNameHere');

-- ---- step 2: grant (paste the player_id from step 1, the coins and a short note)
select public.glydrift_admin_grant_coins('00000000-0000-0000-0000-000000000000', 500, 'Thanks for the bug report!');

-- ---- step 3 (any time): check it; claimed_at fills in once their game has picked it up
select id, player_id, coins, note, created_at, claimed_at
  from public.coin_grants
 order by id desc
 limit 20;

-- ---- to cancel a grant that hasn't been claimed yet (use the id from step 3)
-- update public.coin_grants set claimed_at = now(), note = coalesce(note, '') || ' (cancelled)'
--  where id = 0 and claimed_at is null;
