import type { DatabaseSync } from "node:sqlite";
import { LEAGUES, TEAM_ROWS, FULL_NAME_LEAGUES, type League } from "./teams-data";

/**
 * Team-name normalizing and the default aliases. Pure (no database handle
 * import), so the migration that seeds aliases and the matcher share it.
 */
export const normName = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(fc|afc|cf|sc)\b/g, " ")
    .replace(/\bst\b\.?/g, "state")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** Seeded into team_aliases (editable in Control Room → Team logos). [league, alias, team id] */
export const DEFAULT_ALIASES: [League, string, string][] = [
  ["NCAAF", "Miami (FL)", "ncaaf-mia"],
  ["NCAAF", "Miami FL", "ncaaf-mia"],
  ["NCAAF", "Miami Florida", "ncaaf-mia"],
  ["NCAAF", "Miami (OH)", "ncaaf-moh"],
  ["NCAAF", "Miami OH", "ncaaf-moh"],
  ["NCAAF", "Miami Ohio", "ncaaf-moh"],
  ["NCAAF", "UT San Antonio", "ncaaf-utsa"],
  ["NCAAF", "Texas-San Antonio", "ncaaf-utsa"],
  ["NCAAF", "La Tech", "ncaaf-lt"],
  ["NCAAF", "Mississippi", "ncaaf-miss"],
  ["NCAAF", "Southern California", "ncaaf-usc"],
  ["NCAAF", "Brigham Young", "ncaaf-byu"],
  ["NCAAF", "Louisiana State", "ncaaf-lsu"],
  ["NCAAF", "Texas Christian", "ncaaf-tcu"],
  ["NCAAF", "Southern Methodist", "ncaaf-smu"],
  ["NBA", "LA Clippers", "nba-lac"],
  ["NBA", "Los Angeles Clippers", "nba-lac"],
  ["NBA", "LA Lakers", "nba-lal"],
  ["EPL", "Man United", "epl-mun"],
  ["EPL", "Man Utd", "epl-mun"],
  ["EPL", "Man City", "epl-mci"],
  ["EPL", "Spurs", "epl-tot"],
  ["EPL", "Wolves", "epl-wol"],
  ["EPL", "Nottm Forest", "epl-nfo"],
  ["EPL", "Brighton", "epl-bha"],
  ["EPL", "Newcastle", "epl-new"],
  ["EPL", "West Ham", "epl-whu"],
  ["EPL", "Leeds", "epl-lee"],
  ["EPL", "Bournemouth", "epl-bou"],
  ["MLS", "Inter Miami", "mls-mia"],
];

/** Migration step: add reference teams a database doesn't have yet (never changes existing rows). */
export function addMissingTeams(db: DatabaseSync) {
  const t = Date.now();
  const has = db.prepare("SELECT 1 FROM teams WHERE id = ?");
  const ins = db.prepare(
    "INSERT OR IGNORE INTO teams (id, league, abbr, city, name, full_name, primary_color, secondary_color, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // Only top up databases that were already seeded; an empty table is seeded in full on first use.
  if (!db.prepare("SELECT 1 FROM teams LIMIT 1").get()) return;
  for (const league of LEAGUES)
    for (const [abbr, city, name, primary, secondary] of TEAM_ROWS[league]) {
      const id = `${league}-${abbr}`.toLowerCase();
      if (has.get(id)) continue;
      ins.run(id, league, abbr, city, name, FULL_NAME_LEAGUES.includes(league) ? name : `${city} ${name}`, primary, secondary, t);
    }
}

export function seedAliases(db: DatabaseSync) {
  const t = Date.now();
  const ins = db.prepare("INSERT OR IGNORE INTO team_aliases (league, alias_norm, alias, team_id, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const [league, alias, id] of DEFAULT_ALIASES) ins.run(league, normName(alias), alias, id, t);
}
