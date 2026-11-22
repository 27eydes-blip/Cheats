import { all, get, now, run, tx } from "../db";
import { FULL_NAME_LEAGUES, LEAGUES, TEAM_ROWS, type League } from "./teams-data";
import { badgeLetters, circleColors, effectiveLogo, LOGO_MODES, type LogoMode, type LogoSource } from "./logos";

export type TeamView = {
  id: string; league: League; abbr: string; city: string; name: string; fullName: string;
  primary: string; secondary: string;
  /** The logo to show (uploaded, then provider badge), or null for the letter badge. */
  logo: string | null;
  logoSource: LogoSource;
  /** The admin's choice for this team ("auto" = uploaded → provider badge → letter). */
  logoMode: LogoMode;
  hasUpload: boolean;
  hasProviderLogo: boolean;
  /** The letter-badge circle: 1–3 letters on the team color, contrast-checked. */
  circle: { letters: string; fill: string; text: string };
};

type Row = {
  id: string; league: League; abbr: string; city: string; name: string; full_name: string; primary_color: string; secondary_color: string;
  logo_path: string | null; logo_status: string; logo_source: string | null; updated_at: number;
  logo_mode: string | null; upload_at: number | null; tsdb_at: number | null; tsdb_color1: string | null;
};

export const teamId = (league: string, abbr: string) => `${league}-${abbr}`.toLowerCase();
export const fullNameOf = (league: League, city: string, name: string) => (FULL_NAME_LEAGUES.includes(league) ? name : `${city} ${name}`);

const toView = (r: Row): TeamView => {
  const e = effectiveLogo(r);
  return {
    id: r.id, league: r.league, abbr: r.abbr, city: r.city, name: r.name, fullName: r.full_name, primary: r.primary_color, secondary: r.secondary_color,
    logo: e.url, logoSource: e.source, logoMode: (LOGO_MODES as string[]).includes(r.logo_mode ?? "") ? (r.logo_mode as LogoMode) : "auto",
    hasUpload: e.available.upload, hasProviderLogo: e.available.tsdb,
    circle: { letters: badgeLetters({ id: r.id, abbr: r.abbr, name: r.full_name }), ...circleColors(r.tsdb_color1 ?? r.primary_color) },
  };
};

/** Insert or update every team from the reference data. Never touches cached logos. */
export function seedTeams() {
  const t = now();
  tx(() => {
    for (const league of LEAGUES) {
      for (const [abbr, city, name, primary, secondary] of TEAM_ROWS[league]) {
        run(
          `INSERT INTO teams (id, league, abbr, city, name, full_name, primary_color, secondary_color, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET league = excluded.league, abbr = excluded.abbr, city = excluded.city, name = excluded.name, full_name = excluded.full_name,
             primary_color = excluded.primary_color, secondary_color = excluded.secondary_color`,
          [teamId(league, abbr), league, abbr, city, name, fullNameOf(league, city, name), primary, secondary, t],
        );
      }
    }
  });
}

let seeded = false;
function ensureSeeded() {
  if (seeded) return;
  if ((get<{ n: number }>("SELECT count(*) n FROM teams")?.n ?? 0) === 0) seedTeams();
  seeded = true;
}
/** Tests reset the database between cases. */
export function resetTeamsCache() {
  seeded = false;
  matcher = null;
}

export function listTeams(league?: League): TeamView[] {
  ensureSeeded();
  return all<Row>(`SELECT * FROM teams ${league ? "WHERE league = ?" : ""} ORDER BY league, full_name`, league ? [league] : []).map(toView);
}

export function getTeam(id: string): TeamView | null {
  ensureSeeded();
  const r = get<Row>("SELECT * FROM teams WHERE id = ?", [id]);
  return r ? toView(r) : null;
}

export function searchTeams(q: string, limit = 8): TeamView[] {
  ensureSeeded();
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return all<Row>(
    `SELECT * FROM teams WHERE lower(full_name) LIKE ? ESCAPE '\\' OR lower(abbr) = ? OR lower(name) LIKE ? ESCAPE '\\' OR lower(city) LIKE ? ESCAPE '\\'
     ORDER BY (lower(abbr) = ?) DESC, (lower(full_name) LIKE ? ESCAPE '\\') DESC, full_name LIMIT ?`,
    [like, s, like, like, s, `${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit],
  ).map(toView);
}

// ---------------------------------------------------------------- tagging stories with teams
type Matcher = { full: RegExp; nick: RegExp; byFull: Map<string, string>; byNick: Map<string, string> };
let matcher: Matcher | null = null;
const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function teamMatcher(): Matcher {
  if (matcher) return matcher;
  const rows = all<{ id: string; full_name: string; name: string; league: League }>("SELECT id, full_name, name, league FROM teams");
  const byFull = new Map<string, string>();
  const byNick = new Map<string, string>();
  const nickCount = new Map<string, number>();
  for (const r of rows) if (!FULL_NAME_LEAGUES.includes(r.league)) nickCount.set(r.name, (nickCount.get(r.name) ?? 0) + 1);
  for (const r of rows) {
    byFull.set(r.full_name.toLowerCase(), r.id);
    // A bare nickname ("Chiefs", "Huskies") only counts when exactly one team uses it.
    if (!FULL_NAME_LEAGUES.includes(r.league) && nickCount.get(r.name) === 1 && r.name.length > 3 && !/^\d/.test(r.name)) byNick.set(r.name, r.id);
  }
  const alt = (names: string[]) => names.sort((a, b) => b.length - a.length).map(esc).join("|");
  matcher = {
    full: new RegExp(`(?<![\\p{L}\\p{N}])(${alt([...byFull.keys()])})(?![\\p{L}\\p{N}])`, "giu"),
    // Nicknames are case-sensitive ("Senators" the team, not "senators" in Congress).
    nick: new RegExp(`(?<![\\p{L}\\p{N}])(${alt([...byNick.keys()])})(?![\\p{L}\\p{N}])`, "gu"),
    byFull,
    byNick,
  };
  return matcher;
}

/**
 * Teams mentioned in a piece of text. Full names ("Kansas City Chiefs",
 * "Arsenal") match anywhere; bare nicknames ("Chiefs", "Huskies") only when
 * `sports` is true (a Sports story), are case-sensitive, and must be unique.
 */
export function teamsMentioned(text: string, opts: { sports?: boolean } = { sports: true }): string[] {
  ensureSeeded();
  const m = teamMatcher();
  const found = new Set<string>();
  for (const x of text.matchAll(m.full)) {
    const id = m.byFull.get(x[1].toLowerCase());
    if (id) found.add(id);
  }
  if (opts.sports) for (const x of text.matchAll(m.nick)) {
    const id = m.byNick.get(x[1]);
    if (id) found.add(id);
  }
  return [...found];
}

/** Tag a story with the teams its title, summary and updates mention. */
export function tagStoryTeams(key: string) {
  const s = get<{ title: string; summary: string; section: string }>("SELECT title, summary, section FROM stories WHERE key = ?", [key]);
  if (!s) return;
  const updates = all<{ body: string }>("SELECT body FROM story_updates WHERE story_key = ?", [key]).map((u) => u.body).join(" \n ");
  const ids = teamsMentioned(`${s.title} \n ${s.summary} \n ${updates}`, { sports: s.section === "Sports" });
  tx(() => {
    run("DELETE FROM story_teams WHERE story_key = ?", [key]);
    for (const id of ids) run("INSERT OR IGNORE INTO story_teams (story_key, team_id) VALUES (?, ?)", [key, id]);
    run("UPDATE stories SET teams_tagged_at = ? WHERE key = ?", [now(), key]);
  });
}

/** Re-tag stories that changed since they were last tagged (cheap; runs before listing stories). */
export function ensureStoryTeams(keys: string[]) {
  if (!keys.length) return;
  ensureSeeded();
  const stale = all<{ key: string }>(
    `SELECT key FROM stories WHERE key IN (${keys.map(() => "?").join(",")}) AND (teams_tagged_at IS NULL OR teams_tagged_at < updated_at)`,
    keys,
  );
  for (const r of stale) tagStoryTeams(r.key);
}

export function teamsForStories(keys: string[]): Map<string, TeamView[]> {
  const out = new Map<string, TeamView[]>();
  if (!keys.length) return out;
  ensureStoryTeams(keys);
  for (const r of all<Row & { story_key: string }>(
    `SELECT st.story_key, t.* FROM story_teams st JOIN teams t ON t.id = st.team_id WHERE st.story_key IN (${keys.map(() => "?").join(",")}) ORDER BY t.full_name`,
    keys,
  )) out.set(r.story_key, [...(out.get(r.story_key) ?? []), toView(r)]);
  return out;
}

export function storiesForTeam(teamId: string): string[] {
  return all<{ story_key: string }>("SELECT story_key FROM story_teams WHERE team_id = ?", [teamId]).map((r) => r.story_key);
}
