-- Location for live weather/UV, a per-city name for the peak season
-- (Montauk: "Summer"; Key West's busy season is winter), and a weather cache.

ALTER TABLE cities ADD COLUMN lat REAL;
ALTER TABLE cities ADD COLUMN lon REAL;
ALTER TABLE cities ADD COLUMN coastal INTEGER NOT NULL DEFAULT 1;     -- 1 = also fetch water temp + waves
ALTER TABLE cities ADD COLUMN peak_label TEXT NOT NULL DEFAULT 'Summer';

UPDATE cities SET lat = 41.0359, lon = -71.9545 WHERE slug = 'montauk';

CREATE TABLE weather_cache (
  city_id    INTEGER PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  json       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
