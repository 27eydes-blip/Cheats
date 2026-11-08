-- Glydrift · remove the test scores CI posted by mistake (8 Nov 2026).
--
-- What happened: new network tests ran the game's real online start-up in WebKit on CI, and
-- WebKit let the game's service worker send the requests around the tests' network blocking, so
-- 16 test runs reached the real leaderboard: 32 rows named "TestPilot" (415 points / 170 m,
-- hero VOLT), posted between 08:49 and 11:09 UTC on 8 Nov. The tests are fixed (the service
-- worker is blocked in them, and every offline test now refuses any Supabase request outright).
--
-- This deletes exactly those rows: name TestPilot, those two boards, that time window. Checked
-- beforehand (read-only): there are no other TestPilot rows. Safe to run more than once.
delete from public.scores
where username = 'TestPilot'
  and level in ('endless', 'endless-distance')
  and created_at >= '2026-11-08 08:45:00+00'
  and created_at <  '2026-11-08 11:30:00+00';
