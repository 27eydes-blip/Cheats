import type { DatabaseSync } from "node:sqlite";
import { seedOutlets } from "../newsroom/outlets";

/**
 * Numbered, append-only migrations. Each runs once per database and is
 * recorded in schema_migrations. Never edit a shipped migration: add a new one.
 * (supabase/schema.sql mirrors these for the Postgres version.)
 */
export const MIGRATIONS: { id: number; name: string; sql: string; /** data step run after the SQL, inside the same transaction */ after?: (db: DatabaseSync) => void }[] = [
  {
    id: 1,
    name: "for_you_interests_and_engagement",
    sql: `
CREATE TABLE IF NOT EXISTS interests (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('topic','author','tag')),
  key        TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);
CREATE TABLE IF NOT EXISTS engagement_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','story')),
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('view','click','dwell','share')),
  ms          INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS engagement_target ON engagement_events(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS engagement_user ON engagement_events(user_id, created_at);
CREATE TABLE IF NOT EXISTS feed_dismissals (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','story')),
  target_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS muted_topics (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, topic)
);
ALTER TABLE posts ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 2,
    name: "reactions_and_private_accounts",
    sql: `
CREATE TABLE IF NOT EXISTS reactions (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('fire','mindblown','respect','facepalm','facts')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS reactions_post ON reactions(post_id, kind);
ALTER TABLE users ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 3,
    name: "sports_teams_and_logos",
    sql: `
CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  league          TEXT NOT NULL,
  abbr            TEXT NOT NULL,
  city            TEXT NOT NULL,
  name            TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  primary_color   TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  logo_path       TEXT,
  logo_source     TEXT CHECK (logo_source IN ('provider','manual')),
  logo_status     TEXT NOT NULL DEFAULT 'none' CHECK (logo_status IN ('none','ok','missing','error')),
  logo_checked_at INTEGER,
  provider        TEXT,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS teams_league ON teams(league, full_name);
CREATE TABLE IF NOT EXISTS story_teams (
  story_key TEXT NOT NULL REFERENCES stories(key) ON DELETE CASCADE,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (story_key, team_id)
);
ALTER TABLE stories ADD COLUMN teams_tagged_at INTEGER;
`,
  },
  {
    id: 4,
    name: "retag_story_teams_case_sensitive_nicknames",
    sql: `
DELETE FROM story_teams;
UPDATE stories SET teams_tagged_at = NULL;
`,
  },
  {
    id: 5,
    name: "profiles_v2_private_accounts_sources",
    sql: `
ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN beats TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN accent TEXT NOT NULL DEFAULT 'blue';
ALTER TABLE posts ADD COLUMN source_url TEXT;
ALTER TABLE posts ADD COLUMN source_domain TEXT;
CREATE TABLE IF NOT EXISTS profile_pins (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
INSERT OR IGNORE INTO profile_pins (user_id, post_id, position, created_at) SELECT id, pinned_post_id, 0, created_at FROM users WHERE pinned_post_id IS NOT NULL AND pinned_post_id IN (SELECT id FROM posts);
CREATE TABLE IF NOT EXISTS follow_requests (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, target_id)
);
CREATE INDEX IF NOT EXISTS follow_requests_target ON follow_requests(target_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  follows   INTEGER NOT NULL DEFAULT 1,
  mentions  INTEGER NOT NULL DEFAULT 1,
  replies   INTEGER NOT NULL DEFAULT 1,
  reactions INTEGER NOT NULL DEFAULT 1,
  relays    INTEGER NOT NULL DEFAULT 1,
  requests  INTEGER NOT NULL DEFAULT 1,
  milestones INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE notifications_v2 (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('like','reply','repost','quote','follow','mention','warning','system','reaction','follow_request','follow_accept','achievement')),
  post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
  message    TEXT,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
INSERT INTO notifications_v2 SELECT id, user_id, actor_id, type, post_id, message, created_at, read_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_v2 RENAME TO notifications;
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);
`,
  },
  {
    id: 6,
    name: "flash_dispatches_and_achievements",
    sql: `
ALTER TABLE posts ADD COLUMN expires_at INTEGER;
CREATE INDEX IF NOT EXISTS posts_expires ON posts(expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS achievements (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
`,
  },
  {
    id: 7,
    name: "feed_tabs_messages_lists",
    sql: `
CREATE TABLE IF NOT EXISTS feed_tabs (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('topic','team')),
  key        TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  read_at      INTEGER
);
CREATE INDEX IF NOT EXISTS messages_inbox ON messages(recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender_id, recipient_id, created_at DESC);
CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lists_owner ON lists(owner_id, created_at);
CREATE TABLE IF NOT EXISTS list_members (
  list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, user_id)
);
`,
  },
  {
    id: 8,
    name: "real_news_notes_push",
    sql: `
ALTER TABLE news_sources ADD COLUMN kind TEXT NOT NULL DEFAULT 'rss';
ALTER TABLE news_sources ADD COLUMN lean TEXT CHECK (lean IN ('Left','Lean Left','Center','Lean Right','Right'));
ALTER TABLE news_sources ADD COLUMN lean_note TEXT NOT NULL DEFAULT '';
ALTER TABLE news_sources ADD COLUMN color TEXT NOT NULL DEFAULT '#7fa3ff';
ALTER TABLE news_sources ADD COLUMN category TEXT;
ALTER TABLE news_sources ADD COLUMN outlet_type TEXT NOT NULL DEFAULT 'digital';
ALTER TABLE news_sources ADD COLUMN api_source TEXT;
ALTER TABLE news_sources ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE news_sources ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_sources ADD COLUMN etag TEXT;
ALTER TABLE news_sources ADD COLUMN last_modified TEXT;
ALTER TABLE news_sources ADD COLUMN last_fetch_at INTEGER;
ALTER TABLE news_sources ADD COLUMN last_success_at INTEGER;
ALTER TABLE news_sources ADD COLUMN last_status INTEGER;
ALTER TABLE news_sources ADD COLUMN last_error TEXT;
ALTER TABLE news_sources ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_sources ADD COLUMN next_fetch_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_sources ADD COLUMN items_total INTEGER NOT NULL DEFAULT 0;
UPDATE news_sources SET demo = 1, kind = 'demo' WHERE feed_url IS NULL;
ALTER TABLE news_items ADD COLUMN guid TEXT;
ALTER TABLE news_items ADD COLUMN topic TEXT;
ALTER TABLE news_items ADD COLUMN opinion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_items ADD COLUMN tokens TEXT NOT NULL DEFAULT '[]';
ALTER TABLE news_items ADD COLUMN fetched_at INTEGER;
CREATE INDEX IF NOT EXISTS news_items_story ON news_items(story_key, published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_published ON news_items(published_at DESC);
ALTER TABLE stories ADD COLUMN origin TEXT NOT NULL DEFAULT 'real';
ALTER TABLE stories ADD COLUMN category TEXT;
ALTER TABLE stories ADD COLUMN importance REAL NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN freshness REAL NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN summary_source TEXT;
ALTER TABLE stories ADD COLUMN keywords TEXT NOT NULL DEFAULT '{}';
ALTER TABLE stories ADD COLUMN last_article_at INTEGER;
ALTER TABLE stories ADD COLUMN headline_locked INTEGER NOT NULL DEFAULT 0;
UPDATE stories SET origin = 'demo';
CREATE INDEX IF NOT EXISTS stories_rank ON stories(origin, importance DESC);
CREATE TABLE IF NOT EXISTS ingest_runs (
  id          TEXT PRIMARY KEY,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  trigger     TEXT NOT NULL DEFAULT 'schedule',
  sources     INTEGER NOT NULL DEFAULT 0,
  fetched     INTEGER NOT NULL DEFAULT 0,
  new_items   INTEGER NOT NULL DEFAULT 0,
  stories_new INTEGER NOT NULL DEFAULT 0,
  stories_updated INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS robots_cache (
  host       TEXT PRIMARY KEY,
  body       TEXT NOT NULL DEFAULT '',
  status     INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS context_notes (
  id          TEXT PRIMARY KEY,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','story')),
  target_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'needs_ratings' CHECK (status IN ('needs_ratings','published','not_helpful','removed')),
  intercept   REAL,
  factor      REAL,
  ratings     INTEGER NOT NULL DEFAULT 0,
  detail      TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  published_at INTEGER,
  status_changed_at INTEGER
);
CREATE INDEX IF NOT EXISTS notes_target ON context_notes(target_type, target_id, status);
CREATE TABLE IF NOT EXISTS note_ratings (
  note_id    TEXT NOT NULL REFERENCES context_notes(id) ON DELETE CASCADE,
  rater_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      TEXT NOT NULL CHECK (value IN ('helpful','somewhat','not_helpful')),
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, rater_id)
);
CREATE INDEX IF NOT EXISTS note_ratings_rater ON note_ratings(rater_id, created_at DESC);
CREATE TABLE IF NOT EXISTS note_flags (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES context_notes(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS rater_scores (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  factor     REAL NOT NULL,
  grp        INTEGER NOT NULL,
  ratings    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  last_success_at INTEGER,
  failures    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS alert_prefs (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  breaking     INTEGER NOT NULL DEFAULT 1,
  replies      INTEGER NOT NULL DEFAULT 1,
  mentions     INTEGER NOT NULL DEFAULT 1,
  follows      INTEGER NOT NULL DEFAULT 1,
  following    INTEGER NOT NULL DEFAULT 1,
  quiet_start  INTEGER,
  quiet_end    INTEGER,
  tz           TEXT NOT NULL DEFAULT 'America/New_York',
  breaking_cap INTEGER NOT NULL DEFAULT 3
);
CREATE TABLE IF NOT EXISTS alert_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  ref     TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS alert_log_time ON alert_log(user_id, kind, sent_at);
CREATE TABLE IF NOT EXISTS breaking_alerts (
  story_key  TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL,
  sent_by    TEXT,
  auto       INTEGER NOT NULL DEFAULT 0,
  recipients INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL
)
`,
    after: (db) => seedOutlets(db),
  },
];

export function runMigrations(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const done = new Set((db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec("BEGIN");
    try {
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        try {
          db.exec(stmt);
        } catch (e) {
          // ALTER … ADD COLUMN on a database that already has the column is fine.
          if (!/duplicate column/i.test(String(e))) throw e;
        }
      }
      m.after?.(db);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(m.id, m.name, Date.now());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
