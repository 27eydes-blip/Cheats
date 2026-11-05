-- © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
-- Glydrift · titles on the leaderboard.
-- Each score row carries the id of the title its player wears (e.g. "t_gold", "p_abysslord"),
-- shown under their name. Titles are decoration only. Drift Pass+ titles are only ever
-- granted by the verified paid track, and the game ignores ids it doesn't know.
alter table public.scores add column if not exists title text;
alter table public.scores drop constraint if exists scores_title_shape;
alter table public.scores add constraint scores_title_shape
  check (title is null or title ~ '^[a-z0-9_]{1,40}$');
