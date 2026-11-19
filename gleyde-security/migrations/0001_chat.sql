-- Gleyde website chat log (Cloudflare D1, database "gleyde-chat").
-- No IP addresses are stored. Message text is redacted before it is written.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id               TEXT PRIMARY KEY,          -- random UUID made in the visitor's browser
  created_at       INTEGER NOT NULL,          -- unix ms
  last_activity_at INTEGER NOT NULL,          -- unix ms
  start_page       TEXT,                      -- path the chat started on, e.g. /services
  message_count    INTEGER NOT NULL DEFAULT 0,
  shared_contact   INTEGER NOT NULL DEFAULT 0, -- 1 = visitor shared contact details
  follow_up        INTEGER NOT NULL DEFAULT 0, -- 1 = visitor asked us to follow up (kept past 30 days)
  contact_name     TEXT,
  contact_email    TEXT,
  emailed_at       INTEGER                    -- unix ms of the last transcript email; NULL = needs sending
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_mail ON chat_sessions(emailed_at, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON chat_sessions(created_at, follow_up);
