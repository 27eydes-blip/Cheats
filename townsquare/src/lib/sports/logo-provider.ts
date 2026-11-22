import { get, now, run } from "../db";
import type { TeamView } from "./teams";
import type { League } from "./teams-data";
import { dataKey, matchTeam, PROVIDER_LEAGUE } from "./games";
import { removeUpload, saveProviderBadge, saveUpload, readLogoFile } from "./logos";

/**
 * Where provider badges come from. Only licensed sources (never scraped):
 *   - TheSportsDB (default): the data provider behind schedules and scores, through its API;
 *   - manifest: a licensed vendor's JSON feed mapping team ids to logo URLs.
 * Admin uploads (Control Room → Team logos) are separate and always win.
 *
 * Configuration (environment variables; never committed):
 *   SPORTS_LOGO_PROVIDER = thesportsdb (default) | manifest | none
 *   SPORTS_DATA_KEY      = (thesportsdb) the same key as schedules and scores; the free key works too
 *   SPORTS_API_KEY, SPORTS_LOGO_MANIFEST_URL = (manifest) your vendor's key and feed
 *
 * Each badge is downloaded once, validated, re-encoded to WebP (128px and
 * 512px) and cached under UPLOAD_DIR/team-logos. Misses retry after 24 hours.
 */
export type TeamArt = { url: string | null; color1?: string | null; color2?: string | null };

export interface LogoProvider {
  readonly name: string;
  /** Display name for the Control Room. */
  readonly label: string;
  /** The team's badge URL (HTTPS) and colors, or a null URL if the provider has none. */
  teamArt(team: TeamView): Promise<TeamArt>;
  headers(): Record<string, string>;
}

class ManifestProvider implements LogoProvider {
  readonly name = "manifest";
  readonly label = "Licensed feed";
  private map: Promise<Record<string, string>> | null = null;
  constructor(private url: string, private key: string) {}
  headers() {
    return { Authorization: `Bearer ${this.key}`, "X-API-Key": this.key };
  }
  private load() {
    this.map ??= fetch(this.url, { headers: this.headers(), cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
      .catch(() => ({}));
    return this.map;
  }
  async teamArt(team: TeamView) {
    const m = await this.load();
    const url = m[team.id] ?? m[`${team.league}:${team.abbr}`] ?? null;
    return { url: url && /^https:\/\//.test(url) ? url : null };
  }
}

/**
 * TheSportsDB team badges and colors: one request per league lists every team
 * with its badge URL and club colors; teams are matched to ours by name (and
 * the aliases in Control Room → Team logos).
 */
export class TheSportsDBLogos implements LogoProvider {
  readonly name = "thesportsdb";
  readonly label = "TheSportsDB";
  private leagues = new Map<string, Promise<Map<string, TeamArt>>>();
  constructor(private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}
  headers() {
    return {};
  }
  private load(league: League) {
    let m = this.leagues.get(league);
    if (!m) {
      m = this.fetchImpl(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(dataKey())}/lookup_all_teams.php?id=${PROVIDER_LEAGUE[league]}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { teams?: Record<string, unknown>[] | null }) => {
          const out = new Map<string, TeamArt>();
          for (const t of j.teams ?? []) {
            const raw = typeof t.strBadge === "string" ? t.strBadge.trim().replace(/^http:\/\//, "https://") : "";
            const art: TeamArt = { url: /^https:\/\//.test(raw) ? raw : null, color1: typeof t.strColour1 === "string" ? t.strColour1 : null, color2: typeof t.strColour2 === "string" ? t.strColour2 : null };
            for (const n of [t.strTeam, t.strTeamAlternate, t.strTeamShort]) {
              if (typeof n !== "string" || !n.trim()) continue;
              for (const part of n.split(",")) {
                const id = matchTeam(league, part.trim());
                if (id && !out.has(id)) out.set(id, art);
              }
            }
          }
          return out;
        });
      m.catch(() => this.leagues.delete(league)); // a failed lookup is tried again next time
      this.leagues.set(league, m);
    }
    return m;
  }
  async teamArt(team: TeamView): Promise<TeamArt> {
    return (await this.load(team.league)).get(team.id) ?? { url: null };
  }
}

const g = globalThis as unknown as { __tsdbLogos?: TheSportsDBLogos };
const PROVIDERS: Record<string, () => LogoProvider | null> = {
  none: () => null,
  thesportsdb: () => (g.__tsdbLogos ??= new TheSportsDBLogos()),
  manifest: () => {
    const key = process.env.SPORTS_API_KEY ?? "";
    return key && process.env.SPORTS_LOGO_MANIFEST_URL ? new ManifestProvider(process.env.SPORTS_LOGO_MANIFEST_URL, key) : null;
  },
};

export function logoProvider(): LogoProvider | null {
  // Tests opt in explicitly, so they never reach the network by default.
  const name = (process.env.SPORTS_LOGO_PROVIDER ?? (process.env.VITEST ? "none" : "thesportsdb")).toLowerCase();
  return PROVIDERS[name]?.() ?? null;
}
export const providerNames = () => Object.keys(PROVIDERS);

/** Never tried, or a miss/error more than a day ago (so a fixed key or a new badge gets picked up). */
export const needsFetch = (status: string, checkedAt: number | null, t = now()) => status === "none" || ((status === "missing" || status === "error") && (checkedAt ?? 0) < t - 24 * 3_600_000);

/** Fetch one team's provider badge (and colors). Uploads are separate and never touched. */
export async function fetchProviderLogo(team: TeamView, opts: { force?: boolean; provider?: LogoProvider | null } = {}): Promise<"ok" | "missing" | "error" | "skipped"> {
  const provider = opts.provider === undefined ? logoProvider() : opts.provider;
  if (!provider) return "skipped";
  const row = get<{ tsdb_status: string; tsdb_checked_at: number | null }>("SELECT tsdb_status, tsdb_checked_at FROM teams WHERE id = ?", [team.id]);
  if (!row) return "skipped";
  if (!opts.force && !needsFetch(row.tsdb_status, row.tsdb_checked_at)) return "skipped";
  try {
    const art = await provider.teamArt(team);
    if (art.color1 || art.color2) run("UPDATE teams SET tsdb_color1 = COALESCE(?, tsdb_color1), tsdb_color2 = COALESCE(?, tsdb_color2) WHERE id = ?", [hexOrNull(art.color1), hexOrNull(art.color2), team.id]);
    if (!art.url) {
      run("UPDATE teams SET tsdb_status = 'missing', tsdb_checked_at = ?, provider = ? WHERE id = ?", [now(), provider.name, team.id]);
      return "missing";
    }
    const res = await fetch(art.url, { headers: provider.headers(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    await saveProviderBadge(team.id, buf, provider.name, { c1: art.color1, c2: art.color2 });
    return "ok";
  } catch {
    // Provider down or bad file: any badge cached earlier keeps serving.
    run("UPDATE teams SET tsdb_status = CASE WHEN tsdb_at IS NULL THEN 'error' ELSE tsdb_status END, tsdb_checked_at = ?, provider = ? WHERE id = ?", [now(), provider.name, team.id]);
    return "error";
  }
}
const hexOrNull = (c: string | null | undefined) => (c && /^#?[0-9a-f]{6}$/i.test(c.trim()) ? `#${c.trim().replace("#", "").toUpperCase()}` : null);

/** Fetch every missing provider badge, one team at a time. Runs at startup and daily from the sports scheduler. */
export async function refreshAllLogos(teams: TeamView[], opts: { pauseMs?: number; force?: boolean } = {}) {
  const p = logoProvider();
  const tally: Record<string, number> = {};
  if (!p) return tally;
  for (const t of teams) {
    const r = await fetchProviderLogo(t, { provider: p, force: opts.force });
    tally[r] = (tally[r] ?? 0) + 1;
    if (r !== "skipped" && opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
  }
  return tally;
}

const inflight = new Set<string>();
/** Fire-and-forget: fetch provider badges for teams never tried before. */
export function warmLogos(teams: TeamView[]) {
  const p = logoProvider();
  if (!p) return;
  for (const t of teams) {
    if (t.hasProviderLogo || inflight.has(t.id)) continue;
    inflight.add(t.id);
    fetchProviderLogo(t, { provider: p }).finally(() => inflight.delete(t.id));
  }
}

// Kept for existing callers (scripts and tests): uploads go through logos.ts.
export const setManualLogo = async (teamId: string, file: File) => saveUpload(teamId, Buffer.from(await file.arrayBuffer()));
export const removeLogo = (teamId: string) => removeUpload(teamId);
export const readLogo = (teamId: string) => readLogoFile(teamId, "upload", 128)?.buf ?? readLogoFile(teamId, "tsdb", 128)?.buf ?? null;
