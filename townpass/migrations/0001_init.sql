-- TownPass schema. Timestamps are unix epoch milliseconds (INTEGER).

CREATE TABLE cities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,          -- used in /city/:slug
  code            TEXT NOT NULL UNIQUE,          -- short prefix for sticker IDs, e.g. MTK
  name            TEXT NOT NULL,
  state           TEXT NOT NULL,                 -- two-letter US state
  tagline         TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  price_cents     INTEGER NOT NULL DEFAULT 300,
  currency        TEXT NOT NULL DEFAULT 'usd',
  access_hours    INTEGER,                       -- NULL = lifetime access; e.g. 24 = 24-hour pass
  summer_start    TEXT NOT NULL DEFAULT '05-22', -- MM-DD, inclusive (summer season hours apply)
  summer_end      TEXT NOT NULL DEFAULT '09-08', -- MM-DD, inclusive
  published       INTEGER NOT NULL DEFAULT 0,    -- 0 = hidden from public
  created_at      INTEGER NOT NULL
);

-- type is one of: essentials, food, nightlife, parking, beaches, tips
CREATE TABLE sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id    INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  intro      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sections_city ON sections(city_id, sort);

CREATE TABLE listings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id       INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT,             -- e.g. "Pharmacy", "Seafood", "Municipal lot"
  address          TEXT,
  phone            TEXT,
  website          TEXT,
  -- Hours spec strings, e.g. "mon-fri 08:00-21:00; sat 09:00-22:00; sun closed".
  -- hours_summer / hours_offseason override hours_default in that season.
  hours_default    TEXT,
  hours_summer     TEXT,
  hours_offseason  TEXT,
  price_range      TEXT,             -- "$", "$$", "$$$", or free text for parking
  details          TEXT NOT NULL DEFAULT '{}',  -- JSON object of section-specific fields
  local_tip        TEXT,
  body             TEXT,             -- long free text (insider tips)
  verified         INTEGER NOT NULL DEFAULT 0,  -- 0 = UNVERIFIED placeholder
  last_verified_at INTEGER,          -- NULL = never verified
  sort             INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_listings_section ON listings(section_id, sort);

CREATE TABLE stickers (
  id         TEXT PRIMARY KEY,      -- e.g. MTK-7F3K2Q (printed under the QR code)
  city_id    INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  label      TEXT,                  -- where you put it, e.g. "Gosman's Dock bulletin board"
  batch      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_stickers_city ON stickers(city_id);

CREATE TABLE scans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id    INTEGER NOT NULL,
  sticker_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_scans_sticker ON scans(sticker_id, created_at);

-- status: pending -> paid -> (refunded | disputed). Only 'paid' grants access.
CREATE TABLE purchases (
  id                 TEXT PRIMARY KEY,   -- random id, embedded in access tokens
  city_id            INTEGER NOT NULL REFERENCES cities(id),
  sticker_id         TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL,
  email              TEXT,
  stripe_session_id  TEXT UNIQUE,
  stripe_payment_intent TEXT,
  access_expires_at  INTEGER,            -- NULL = lifetime
  created_at         INTEGER NOT NULL,
  paid_at            INTEGER,
  refunded_at        INTEGER,
  email_sent_at      INTEGER
);
CREATE INDEX idx_purchases_city_status ON purchases(city_id, status, paid_at);
CREATE INDEX idx_purchases_email ON purchases(email, city_id);
CREATE INDEX idx_purchases_pi ON purchases(stripe_payment_intent);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',  -- open | resolved
  client_hash TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_reports_status ON reports(status, created_at);

-- Processed Stripe webhook events (idempotency).
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Throttling for admin login, restore-by-email and reports.
CREATE TABLE rate_limits (
  key         TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_rate_limits ON rate_limits(key, created_at);
