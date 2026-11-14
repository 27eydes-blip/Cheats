-- Hunt accounts + progression (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE COLLATE NOCASE,   -- NULL for guests
  pass_hash TEXT,                        -- PBKDF2-SHA256, base64
  salt TEXT,
  progress TEXT NOT NULL DEFAULT '{}',   -- JSON, see public/progression.js
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,           -- SHA-256 of the bearer token (raw tokens are never stored)
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
