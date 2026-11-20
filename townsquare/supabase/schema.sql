-- World Net News — Postgres schema for Supabase, with row-level security on every table.
-- This is the swap-in target for the local SQLite layer (src/lib/db/schema.ts).
-- Apply with: supabase db push   (or paste into the SQL editor of a NEW project)
--
-- Conventions: auth.users holds credentials (managed by Supabase Auth, incl. Google + 2FA);
-- public.profiles holds the public profile. Timestamps are timestamptz.
-- Counters (like_count, ...) are maintained by triggers so clients can't fake them.

-- Helper functions below reference tables created later in this file.
set check_function_bodies = off;

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- ---------- profiles ----------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          citext not null unique check (handle ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name    text not null check (char_length(display_name) between 1 and 50),
  bio             text not null default '' check (char_length(bio) <= 160),
  avatar_path     text,
  banner_path     text,
  links           jsonb not null default '[]',
  pinned_post_id  uuid,
  role            text not null default 'user' check (role in ('user','admin')),
  status          text not null default 'active' check (status in ('active','suspended','deleted')),
  suspended_until timestamptz,
  verified        boolean not null default false,
  hide_follows    boolean not null default false,
  is_premium      boolean not null default false,
  town            text,
  created_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are public" on profiles for select using (status <> 'deleted');
-- Users may edit their own profile but never their role, status, verified or premium flags.
create policy "edit own profile" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid())
              and status = (select status from profiles where id = auth.uid())
              and verified = (select verified from profiles where id = auth.uid())
              and is_premium = (select is_premium from profiles where id = auth.uid()));
create policy "admins manage profiles" on profiles for update using (is_admin());

-- ---------- communities (Stage 2) ----------
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  description text not null default '',
  rules jsonb not null default '[]',
  visibility text not null default 'public' check (visibility in ('public','private','invite')),
  banner_path text,
  allow_anonymous boolean not null default false,
  slow_mode_seconds int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.memberships (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','owner','banned')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
alter table communities enable row level security;
alter table memberships enable row level security;
create policy "public communities visible" on communities for select
  using (visibility = 'public' or exists (select 1 from memberships m where m.community_id = id and m.user_id = auth.uid() and m.role <> 'banned'));
create policy "create community" on communities for insert with check (created_by = auth.uid());
create policy "memberships visible to members" on memberships for select
  using (user_id = auth.uid() or exists (select 1 from communities c where c.id = community_id and c.visibility = 'public'));
create policy "join public" on memberships for insert with check (user_id = auth.uid() and role = 'member'
  and exists (select 1 from communities c where c.id = community_id and c.visibility = 'public'));
create policy "leave" on memberships for delete using (user_id = auth.uid() and role <> 'banned');

-- ---------- posts ----------
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references profiles(id) on delete cascade,
  body         text not null default '' check (char_length(body) <= 2000),
  reply_to_id  uuid references posts(id) on delete set null,
  root_id      uuid references posts(id) on delete set null,
  quote_of_id  uuid references posts(id) on delete set null,
  community_id uuid references communities(id) on delete cascade,
  link_url     text, link_title text, link_domain text,
  like_count int not null default 0, reply_count int not null default 0,
  repost_count int not null default 0, quote_count int not null default 0,
  score int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz, deleted_at timestamptz, removed_at timestamptz,
  search tsvector generated always as (to_tsvector('english', body)) stored
);
create index on posts (author_id, created_at desc);
create index on posts (created_at desc);
create index on posts (reply_to_id, created_at);
create index on posts using gin (search);
alter table posts enable row level security;
create policy "read live posts" on posts for select using (
  (deleted_at is null and removed_at is null and not is_blocked_between(author_id, auth.uid())
   and (community_id is null or exists (select 1 from communities c where c.id = community_id)))
  or author_id = auth.uid() or is_admin());
create policy "post as yourself when active" on posts for insert with check (
  author_id = auth.uid() and exists (select 1 from profiles where id = auth.uid() and status = 'active'));
-- Authors can edit body within 15 minutes, or soft-delete any time; enforced again by trigger below.
create policy "edit own" on posts for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "admins moderate" on posts for update using (is_admin());

create or replace function public.posts_guard() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body and new.deleted_at is null then
    if now() - old.created_at > interval '15 minutes' and not is_admin() then raise exception 'Edit window closed'; end if;
    new.edited_at := now();
    insert into post_edits(post_id, body, edited_at) values (old.id, old.body, now());
  end if;
  -- counters and moderation fields can't be changed by authors
  if not is_admin() then
    new.like_count := old.like_count; new.reply_count := old.reply_count; new.repost_count := old.repost_count;
    new.quote_count := old.quote_count; new.removed_at := old.removed_at; new.score := old.score;
  end if;
  return new;
end $$;
create trigger posts_guard before update on posts for each row execute function posts_guard();

create table public.post_edits (post_id uuid references posts(id) on delete cascade, body text not null, edited_at timestamptz not null);
alter table post_edits enable row level security;
create policy "edit history is public with the post" on post_edits for select using (exists (select 1 from posts p where p.id = post_id));

-- ---------- media (files live in a PRIVATE storage bucket; served via signed URLs) ----------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  kind text not null default 'image', mime text not null,
  width int, height int, bytes int not null, path text not null, alt text not null default '' check (char_length(alt) <= 1000),
  position int not null default 0, created_at timestamptz not null default now()
);
alter table media enable row level security;
create policy "media follows its post" on media for select using (
  owner_id = auth.uid() or kind in ('avatar','banner') or exists (select 1 from posts p where p.id = post_id));
create policy "upload own" on media for insert with check (owner_id = auth.uid());
create policy "attach own" on media for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- insert into storage.buckets (id, name, public) values ('media', 'media', false);

-- ---------- polls ----------
create table public.polls (id uuid primary key default gen_random_uuid(), post_id uuid not null unique references posts(id) on delete cascade,
  closes_at timestamptz not null, kind text not null default 'opinion' check (kind in ('opinion','prediction')));
create table public.poll_options (id uuid primary key default gen_random_uuid(), poll_id uuid not null references polls(id) on delete cascade,
  idx int not null, label text not null check (char_length(label) <= 40), votes int not null default 0);
create table public.poll_votes (poll_id uuid references polls(id) on delete cascade, user_id uuid references profiles(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade, created_at timestamptz not null default now(), primary key (poll_id, user_id));
alter table polls enable row level security; alter table poll_options enable row level security; alter table poll_votes enable row level security;
create policy "polls public" on polls for select using (true);
create policy "options public" on poll_options for select using (true);
create policy "my votes only" on poll_votes for select using (user_id = auth.uid());
create policy "vote once while open" on poll_votes for insert with check (user_id = auth.uid()
  and exists (select 1 from polls p where p.id = poll_id and p.closes_at > now()));

-- ---------- social graph ----------
create table public.follows (follower_id uuid references profiles(id) on delete cascade, followee_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (follower_id, followee_id), check (follower_id <> followee_id));
create table public.likes (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.reposts (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.bookmarks (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.blocks (blocker_id uuid references profiles(id) on delete cascade, blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker_id, blocked_id));
create table public.mutes (muter_id uuid references profiles(id) on delete cascade, muted_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (muter_id, muted_id));
alter table follows enable row level security; alter table likes enable row level security; alter table reposts enable row level security;
alter table bookmarks enable row level security; alter table blocks enable row level security; alter table mutes enable row level security;

create policy "follows visible unless hidden" on follows for select using (
  follower_id = auth.uid() or followee_id = auth.uid()
  or not exists (select 1 from profiles p where p.id in (follower_id, followee_id) and p.hide_follows));
create policy "follow as yourself" on follows for insert with check (follower_id = auth.uid() and not is_blocked_between(follower_id, followee_id));
create policy "unfollow" on follows for delete using (follower_id = auth.uid());
create policy "likes public" on likes for select using (true);
create policy "like as yourself" on likes for insert with check (user_id = auth.uid());
create policy "unlike" on likes for delete using (user_id = auth.uid());
create policy "reposts public" on reposts for select using (true);
create policy "repost as yourself" on reposts for insert with check (user_id = auth.uid());
create policy "unrepost" on reposts for delete using (user_id = auth.uid());
-- Bookmarks, blocks and mutes are private to their owner.
create policy "own bookmarks" on bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own blocks" on blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "own mutes" on mutes for all using (muter_id = auth.uid()) with check (muter_id = auth.uid());

create table public.post_hashtags (post_id uuid references posts(id) on delete cascade, tag citext not null, created_at timestamptz not null default now(), primary key (post_id, tag));
create index on post_hashtags (tag, created_at desc);
create table public.mentions (post_id uuid references posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, primary key (post_id, user_id));
alter table post_hashtags enable row level security; alter table mentions enable row level security;
create policy "tags public" on post_hashtags for select using (true);
create policy "mentions public" on mentions for select using (true);

-- ---------- notifications (private) ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type text not null check (type in ('like','reply','repost','quote','follow','mention','warning','system')),
  post_id uuid references posts(id) on delete cascade,
  message text, created_at timestamptz not null default now(), read_at timestamptz
);
create index on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy "own notifications" on notifications for select using (user_id = auth.uid());
create policy "mark read" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Inserts happen in security-definer triggers / server code only.

-- ---------- reports + moderation ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','user','community','message')),
  target_id uuid not null, reason text not null, details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(), resolved_by uuid references profiles(id), resolved_at timestamptz
);
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references profiles(id) on delete set null,
  target_user_id uuid references profiles(id) on delete cascade,
  target_post_id uuid references posts(id) on delete set null,
  report_id uuid references reports(id) on delete set null,
  action text not null check (action in ('remove','restore','warn','suspend','unsuspend','ban','dismiss','verify','unverify')),
  note text not null default '', created_at timestamptz not null default now()
);
alter table reports enable row level security; alter table moderation_actions enable row level security;
create policy "file reports" on reports for insert with check (reporter_id = auth.uid());
create policy "see own reports" on reports for select using (reporter_id = auth.uid() or is_admin());
create policy "admins resolve" on reports for update using (is_admin());
create policy "admins log actions" on moderation_actions for all using (is_admin()) with check (is_admin());
create policy "see actions on you" on moderation_actions for select using (target_user_id = auth.uid());

create table public.site_settings (key text primary key, value jsonb not null);
alter table site_settings enable row level security;
create policy "settings public" on site_settings for select using (true);
create policy "admins edit settings" on site_settings for all using (is_admin()) with check (is_admin());

-- ---------- news (Stage 2) + live (Stage 2-4) ----------
create table public.news_sources (id uuid primary key default gen_random_uuid(), name text not null, homepage text not null, feed_url text, verified boolean not null default false);
create table public.news_items (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references news_sources(id) on delete cascade,
  section text not null, title text not null, summary text not null default '', url text not null unique,
  image_url text, story_key text, published_at timestamptz not null
);
create table public.live_events (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('liveblog','stream','audio','debate')),
  title text not null, host_id uuid references profiles(id) on delete set null,
  starts_at timestamptz not null, ends_at timestamptz, created_at timestamptz not null default now()
);
alter table news_sources enable row level security; alter table news_items enable row level security; alter table live_events enable row level security;
create policy "news public" on news_sources for select using (true);
create policy "items public" on news_items for select using (true);
create policy "live public" on live_events for select using (true);
create policy "admins manage news" on news_items for all using (is_admin()) with check (is_admin());

-- ---------- counter triggers ----------
create or replace function public.bump_counter() returns trigger language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; pid uuid; delta int;
begin
  if tg_op = 'INSERT' then pid := new.post_id; delta := 1; else pid := old.post_id; delta := -1; end if;
  execute format('update posts set %I = greatest(%I + $1, 0) where id = $2', col, col) using delta, pid;
  return null;
end $$;
create trigger likes_count after insert or delete on likes for each row execute function bump_counter('like_count');
create trigger reposts_count after insert or delete on reposts for each row execute function bump_counter('repost_count');

-- ---------- design remodel additions: onboarding, votes, live stories, live metadata, image placeholders ----------
alter table public.profiles add column if not exists interests jsonb not null default '[]';
alter table public.profiles add column if not exists onboarded boolean not null default false;
alter table public.media add column if not exists blur text;
alter table public.live_events add column if not exists tag text;
alter table public.live_events add column if not exists description text not null default '';
alter table public.live_events add column if not exists viewers int not null default 0;

create table public.community_votes (
  user_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table community_votes enable row level security;
-- Votes are private; only the totals (posts.score) are public.
create policy "own votes" on community_votes for select using (user_id = auth.uid());
create policy "vote on community posts" on community_votes for insert with check (
  user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and p.community_id is not null and p.deleted_at is null and p.removed_at is null));
create policy "change own vote" on community_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own vote" on community_votes for delete using (user_id = auth.uid());

create table public.stories (
  key text primary key, title text not null, summary text not null default '', section text not null default 'Top Stories',
  tag text, status text not null default 'developing' check (status in ('live','developing','ended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.story_updates (
  id uuid primary key default gen_random_uuid(),
  story_key text not null references stories(key) on delete cascade,
  body text not null, kind text not null default 'update' check (kind in ('update','key','quote')),
  author_id uuid references profiles(id) on delete set null,
  source_id uuid references news_sources(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table stories enable row level security;
alter table story_updates enable row level security;
create policy "stories public" on stories for select using (true);
create policy "story updates public" on story_updates for select using (true);
create policy "admins write stories" on stories for all using (is_admin()) with check (is_admin());
create policy "verified newsroom accounts post updates" on story_updates for insert with check (
  is_admin() or (author_id = auth.uid() and exists (select 1 from profiles where id = auth.uid() and verified)));

-- ---------- "The Front Page" remodel: stances, takes on stories, desk pins ----------
alter table public.posts add column if not exists stance text check (stance in ('agree','disagree','context','question'));
alter table public.posts add column if not exists story_key text references stories(key) on delete set null;
create index if not exists posts_story on posts (story_key, created_at desc);
alter table public.communities add column if not exists pinned_story_key text references stories(key) on delete set null;

-- Stance votes replace likes in the UI. Counts are public; who voted is private.
create table public.stances (
  user_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('story','post')),
  target_id text not null,
  value text not null check (value in ('agree','disagree','unsure')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index on stances (target_type, target_id);
alter table stances enable row level security;
create policy "see own stances" on stances for select using (user_id = auth.uid());
create policy "cast own stance" on stances for insert with check (user_id = auth.uid()
  and exists (select 1 from profiles where id = auth.uid() and status = 'active'));
create policy "change own stance" on stances for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own stance" on stances for delete using (user_id = auth.uid());
-- Public totals without exposing voters:
create or replace view public.stance_totals with (security_invoker = false) as
  select target_type, target_id,
    count(*) filter (where value = 'agree') agree,
    count(*) filter (where value = 'disagree') disagree,
    count(*) filter (where value = 'unsure') unsure
  from stances group by target_type, target_id;
grant select on public.stance_totals to anon, authenticated;

-- Desk editors (moderators/owners) may pin a story and remove posts in their Desk.
create or replace function public.is_desk_editor(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from memberships where community_id = c and user_id = auth.uid() and role in ('moderator','owner'));
$$;
create policy "editors pin stories" on communities for update using (is_desk_editor(id)) with check (is_desk_editor(id));
create policy "editors remove desk posts" on posts for update using (community_id is not null and is_desk_editor(community_id));

-- Markets: each user's stock watchlist (owner-only).
create table public.watchlist (
  user_id uuid references profiles(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z]{1,5}(\.[A-Z])?$'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table watchlist enable row level security;
create policy "own watchlist" on watchlist for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Story photos (editor-uploaded, credited).
alter table public.stories add column if not exists image_media_id uuid references media(id) on delete set null;
alter table public.stories add column if not exists image_credit text check (char_length(image_credit) <= 80);
