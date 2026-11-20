import type { DatabaseSync } from "node:sqlite";

/**
 * Numbered, append-only migrations. Each runs once per database and is
 * recorded in schema_migrations. Never edit a shipped migration: add a new one.
 * (supabase/schema.sql mirrors these for the Postgres version.)
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
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
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(m.id, m.name, Date.now());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
