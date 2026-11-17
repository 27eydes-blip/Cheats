-- Oblivion GP leaderboards and ranked ladder (src/leaderboard.js). No new columns: rank points and
-- best laps stay in users.progress (JSON, written only by the server); these indexes keep the
-- leaderboard sorts off a full table scan. The server also creates them (IF NOT EXISTS) on first use.
CREATE INDEX IF NOT EXISTS users_rank_rp ON users(CAST(json_extract(progress, '$.race.rk.rp') AS INTEGER));
CREATE INDEX IF NOT EXISTS users_lap_desert ON users(json_extract(progress, '$.race.bestLap.desert'));
CREATE INDEX IF NOT EXISTS users_lap_frozen ON users(json_extract(progress, '$.race.bestLap.frozen'));
CREATE INDEX IF NOT EXISTS users_lap_ashlands ON users(json_extract(progress, '$.race.bestLap.ashlands'));
CREATE INDEX IF NOT EXISTS users_lap_neon ON users(json_extract(progress, '$.race.bestLap.neon'));
CREATE INDEX IF NOT EXISTS users_lap_skyline ON users(json_extract(progress, '$.race.bestLap.skyline'));
CREATE INDEX IF NOT EXISTS users_lap_starfall ON users(json_extract(progress, '$.race.bestLap.starfall'));
