import { AppError } from "../errors";
import { all, get, now, run } from "../db";
import { normName } from "./names";
import { LEAGUES, type League } from "./teams-data";
import { resetTeamIndex } from "./games";

/** Name aliases the matcher checks first (Control Room → Team logos → Name aliases). */
export type AliasRow = { league: League; alias: string; aliasNorm: string; teamId: string; teamName: string | null };

export function listAliases(): AliasRow[] {
  return all<{ league: League; alias: string; alias_norm: string; team_id: string; full_name: string | null }>(
    "SELECT a.league, a.alias, a.alias_norm, a.team_id, t.full_name FROM team_aliases a LEFT JOIN teams t ON t.id = a.team_id ORDER BY a.league, a.alias",
  ).map((r) => ({ league: r.league, alias: r.alias, aliasNorm: r.alias_norm, teamId: r.team_id, teamName: r.full_name }));
}

export function addAlias(league: string, alias: string, teamId: string) {
  if (!(LEAGUES as readonly string[]).includes(league)) throw new AppError("Pick a league.");
  const a = alias.trim().slice(0, 80);
  if (normName(a).trim().length < 2) throw new AppError("Type the name as the data feed writes it.");
  const t = get<{ league: string }>("SELECT league FROM teams WHERE id = ?", [teamId]);
  if (!t) throw new AppError("Pick a team.");
  if (t.league !== league) throw new AppError("That team is in a different league.");
  run("INSERT INTO team_aliases (league, alias_norm, alias, team_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(league, alias_norm) DO UPDATE SET alias = excluded.alias, team_id = excluded.team_id", [
    league, normName(a), a, teamId, now(),
  ]);
  resetTeamIndex();
}

export function deleteAlias(league: string, aliasNorm: string) {
  run("DELETE FROM team_aliases WHERE league = ? AND alias_norm = ?", [league, aliasNorm]);
  resetTeamIndex();
}
