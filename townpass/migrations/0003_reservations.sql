-- Reservation links on listings + a log of "Reserve" taps (for the dashboard).
ALTER TABLE listings ADD COLUMN reserve_url TEXT;

CREATE TABLE reserve_clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  city_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_reserve_clicks ON reserve_clicks(city_id, created_at);
