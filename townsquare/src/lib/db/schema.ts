/**
 * SQLite schema. Timestamps are integer milliseconds since epoch.
 * The Postgres/Supabase equivalent (with row-level security) is supabase/schema.sql.
 */
export const SCHEMA = /* sql */ `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT,                 -- null for Google-only accounts
  google_sub      TEXT UNIQUE,
  handle          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name    TEXT NOT NULL,
  bio             TEXT NOT NULL DEFAULT '',
  avatar_media_id TEXT,
  banner_media_id TEXT,
  links           TEXT NOT NULL DEFAULT '[]',   -- JSON array of {label,url}
  pinned_post_id  TEXT,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  suspended_until INTEGER,
  verified        INTEGER NOT NULL DEFAULT 0,
  hide_follows    INTEGER NOT NULL DEFAULT 0,
  is_premium      INTEGER NOT NULL DEFAULT 0,   -- Stage 3
  town            TEXT,                         -- Stage 4 local mode
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS communities (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules       TEXT NOT NULL DEFAULT '[]',
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','invite')),
  banner_media_id TEXT,
  allow_anonymous INTEGER NOT NULL DEFAULT 0,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','owner','banned')),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL DEFAULT '',
  reply_to_id  TEXT REFERENCES posts(id) ON DELETE SET NULL,
  root_id      TEXT REFERENCES posts(id) ON DELETE SET NULL,
  quote_of_id  TEXT REFERENCES posts(id) ON DELETE SET NULL,
  community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,  -- Stage 2
  link_url     TEXT,
  link_title   TEXT,
  link_domain  TEXT,
  like_count   INTEGER NOT NULL DEFAULT 0,
  reply_count  INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  quote_count  INTEGER NOT NULL DEFAULT 0,
  score        INTEGER NOT NULL DEFAULT 0,   -- Stage 2 up/down votes
  created_at   INTEGER NOT NULL,
  edited_at    INTEGER,
  deleted_at   INTEGER,           -- deleted by author
  removed_at   INTEGER            -- removed by a moderator
);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_reply ON posts(reply_to_id, created_at);
CREATE INDEX IF NOT EXISTS posts_quote ON posts(quote_of_id);

CREATE TABLE IF NOT EXISTS post_edits (
  post_id   TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  body      TEXT NOT NULL,
  edited_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'image',
  mime       TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  bytes      INTEGER NOT NULL,
  path       TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_post ON media(post_id, position);

CREATE TABLE IF NOT EXISTS polls (
  id        TEXT PRIMARY KEY,
  post_id   TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  closes_at INTEGER NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'opinion' CHECK (kind IN ('opinion','prediction'))  -- Stage 4
);
CREATE TABLE IF NOT EXISTS poll_options (
  id      TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  idx     INTEGER NOT NULL,
  label   TEXT NOT NULL,
  votes   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id   TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS reposts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS reposts_created ON reposts(created_at DESC);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS mutes (
  muter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (muter_id, muted_id)
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX IF NOT EXISTS hashtags_tag ON post_hashtags(tag, created_at DESC);
CREATE INDEX IF NOT EXISTS hashtags_created ON post_hashtags(created_at DESC);

CREATE TABLE IF NOT EXISTS mentions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('like','reply','repost','quote','follow','mention','warning','system')),
  post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
  message    TEXT,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','user','community','message')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at  INTEGER NOT NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id             TEXT PRIMARY KEY,
  moderator_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  report_id      TEXT REFERENCES reports(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('remove','restore','warn','suspend','unsuspend','ban','dismiss','verify','unverify')),
  note           TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_events (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_events_key ON rate_events(key, at);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Stage 2 news hub (seeded now so the News tab is not empty)
CREATE TABLE IF NOT EXISTS news_sources (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  homepage TEXT NOT NULL,
  feed_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS news_items (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  section      TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL UNIQUE,
  image_url    TEXT,
  story_key    TEXT,          -- groups items about the same story ("How it is covered")
  published_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_section ON news_items(section, published_at DESC);

-- Community up/down votes (Stage 2 preview). posts.score holds the sum.
CREATE TABLE IF NOT EXISTS community_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value   INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

-- Stance votes on Stories and Takes (replace likes in the UI). One stance per person per target.
CREATE TABLE IF NOT EXISTS stances (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('story','post')),
  target_id   TEXT NOT NULL,
  value       TEXT NOT NULL CHECK (value IN ('agree','disagree','unsure')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS stances_target ON stances(target_type, target_id);

-- Markets watchlists (one row per ticker per person).
CREATE TABLE IF NOT EXISTS watchlist (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

-- Live story pages: one row per developing story, with a timeline of updates.
CREATE TABLE IF NOT EXISTS stories (
  key        TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  section    TEXT NOT NULL DEFAULT 'Top Stories',
  tag        TEXT,                -- hashtag whose posts form the community thread
  status     TEXT NOT NULL DEFAULT 'developing' CHECK (status IN ('live','developing','ended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS story_updates (
  id         TEXT PRIMARY KEY,
  story_key  TEXT NOT NULL REFERENCES stories(key) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'update' CHECK (kind IN ('update','key','quote')),
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_id  TEXT REFERENCES news_sources(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS story_updates_key ON story_updates(story_key, created_at DESC);

-- Stage 2+ live blogs / Stage 4 streams
CREATE TABLE IF NOT EXISTS live_events (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('liveblog','stream','audio','debate')),
  title      TEXT NOT NULL,
  host_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER,
  created_at INTEGER NOT NULL
);
`;
