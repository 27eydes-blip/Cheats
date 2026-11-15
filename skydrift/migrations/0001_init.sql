-- Days written in the admin page. Seed days in src/content/seed-days.js are used when a date has no row.
CREATE TABLE days (
  date TEXT PRIMARY KEY,          -- YYYY-MM-DD
  prompts TEXT NOT NULL,          -- JSON: [{ prompt, answers: "line format" }] x7
  updated_at INTEGER NOT NULL
);

-- One row per player per prompt per day: stops replays and holds what they scored.
CREATE TABLE submissions (
  date TEXT NOT NULL,
  idx INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  answer_idx INTEGER,             -- index into the prompt's answer list; NULL = timed out
  raw TEXT,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (date, idx, player_id)
);

-- Running counts per answer, so rarity is one cheap read.
CREATE TABLE answer_counts (
  date TEXT NOT NULL,
  idx INTEGER NOT NULL,
  answer_key TEXT NOT NULL,       -- normalized canonical answer, so edits to aliases keep their counts
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, idx, answer_key)
);

-- Answers the curated list didn't recognise: the admin page shows these so you can add good ones.
CREATE TABLE misses (
  date TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, idx, text)
);

-- Anonymous player profiles (collection, streak, purchase), keyed by a random id kept in the browser.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  premium INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
