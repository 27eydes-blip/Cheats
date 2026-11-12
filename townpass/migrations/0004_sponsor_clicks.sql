-- Taps on sponsor placements (Glydrift), for the dashboard.
CREATE TABLE sponsor_clicks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor    TEXT NOT NULL,
  placement  TEXT NOT NULL,     -- e.g. guide-home, footer
  city_slug  TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sponsor_clicks ON sponsor_clicks(sponsor, created_at);
