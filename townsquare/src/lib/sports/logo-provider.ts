import sharp from "sharp";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "../errors";
import { get, now, run } from "../db";
import { sniffImage, uploadDir } from "../media";
import type { TeamView } from "./teams";
import type { League } from "./teams-data";
import { dataKey, matchTeam, PROVIDER_LEAGUE } from "./games";

/**
 * Team logos come only from a licensed source:
 *   1. a logo an admin uploaded in the Control Room (they confirm the rights), or
 *   2. a licensed sports-data provider, through a small adapter.
 * Nothing is scraped. With no provider configured, the site shows a generated
 * badge (team colors + abbreviation).
 *
 * Configuration (environment variables; never committed):
 *   SPORTS_LOGO_PROVIDER = thesportsdb (default) | manifest | none
 *   SPORTS_DATA_KEY      = (thesportsdb) the same key as schedules and scores; the free key works too
 *   SPORTS_API_KEY       = your provider key
 *   SPORTS_LOGO_MANIFEST_URL = (manifest provider) JSON feed from your licensed vendor
 *
 * Each logo is downloaded once, validated, re-encoded, and cached on disk
 * (UPLOAD_DIR/team-logos), so pages stay fast and keep working if the provider
 * is down. `npm run teams:refresh` re-fetches on demand.
 */
export interface LogoProvider {
  readonly name: string;
  /** Return an HTTPS image URL for this team, or null if the provider has none. */
  logoUrl(team: TeamView): Promise<string | null>;
  /** Headers for downloading the image (e.g. the API key). */
  headers(): Record<string, string>;
}

/**
 * Generic licensed feed: your vendor gives you a JSON document mapping team ids
 * (e.g. "nfl-kc") or "LEAGUE:ABBR" keys to logo URLs, served behind your key.
 */
class ManifestProvider implements LogoProvider {
  readonly name = "manifest";
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
  async logoUrl(team: TeamView) {
    const m = await this.load();
    const url = m[team.id] ?? m[`${team.league}:${team.abbr}`] ?? null;
    return url && /^https:\/\//.test(url) ? url : null;
  }
}

/**
 * TheSportsDB team badges (the provider behind schedules and scores): one
 * request per league lists every team with its badge URL; teams are matched
 * to ours by name. Uses SPORTS_DATA_KEY, or the free key.
 */
export class TheSportsDBLogos implements LogoProvider {
  readonly name = "thesportsdb";
  private leagues = new Map<string, Promise<Map<string, string>>>();
  constructor(private fetchImpl: typeof fetch = fetch) {}
  headers() {
    return {};
  }
  private load(league: League) {
    let m = this.leagues.get(league);
    if (!m) {
      m = this.fetchImpl(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(dataKey())}/lookup_all_teams.php?id=${PROVIDER_LEAGUE[league]}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { teams?: Record<string, unknown>[] | null }) => {
          const out = new Map<string, string>();
          for (const t of j.teams ?? []) {
            const badge = typeof t.strBadge === "string" ? t.strBadge.trim().replace(/^http:\/\//, "https://") : "";
            if (!/^https:\/\//.test(badge)) continue;
            for (const n of [t.strTeam, t.strTeamAlternate, t.strTeamShort]) {
              if (typeof n !== "string" || !n.trim()) continue;
              for (const part of n.split(",")) {
                const id = matchTeam(league, part.trim());
                if (id && !out.has(id)) out.set(id, badge);
              }
            }
          }
          return out;
        });
      // Don't cache a failed lookup: the next attempt tries again.
      m.catch(() => this.leagues.delete(league));
      this.leagues.set(league, m);
    }
    return m;
  }
  async logoUrl(team: TeamView) {
    return (await this.load(team.league)).get(team.id) ?? null;
  }
}

/** Add a vendor here: one class implementing LogoProvider, one entry in this map. */
const PROVIDERS: Record<string, (key: string) => LogoProvider | null> = {
  none: () => null,
  thesportsdb: () => (g.__tsdbLogos ??= new TheSportsDBLogos()),
  manifest: (key) => (key && process.env.SPORTS_LOGO_MANIFEST_URL ? new ManifestProvider(process.env.SPORTS_LOGO_MANIFEST_URL, key) : null),
};
const g = globalThis as unknown as { __tsdbLogos?: TheSportsDBLogos };

export function logoProvider(): LogoProvider | null {
  // Tests opt in explicitly, so they never reach the network by default.
  const name = (process.env.SPORTS_LOGO_PROVIDER ?? (process.env.VITEST ? "none" : "thesportsdb")).toLowerCase();
  const make = PROVIDERS[name];
  return make ? make(process.env.SPORTS_API_KEY ?? "") : null;
}
export const providerNames = () => Object.keys(PROVIDERS);

const dir = () => path.join(uploadDir(), "team-logos");
const fileFor = (id: string) => path.join(dir(), `${id.replace(/[^a-z0-9-]/g, "")}.png`);

/** Validate and re-encode an image (PNG, transparency kept, max 512px). SVG is refused: it can carry script. */
async function normalize(buf: Buffer): Promise<Buffer> {
  if (!sniffImage(buf)) throw new AppError("Logos must be PNG, WebP, JPEG or GIF.");
  try {
    return await sharp(buf, { limitInputPixels: 25_000_000 }).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  } catch {
    throw new AppError("That image couldn't be read.");
  }
}

function store(teamIdValue: string, png: Buffer, source: "provider" | "manual", provider: string | null) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(fileFor(teamIdValue), png);
  run("UPDATE teams SET logo_path = ?, logo_source = ?, logo_status = 'ok', logo_checked_at = ?, provider = ?, updated_at = ? WHERE id = ?", [
    path.basename(fileFor(teamIdValue)), source, now(), provider, now(), teamIdValue,
  ]);
}

/** Admin upload from the Control Room. */
export async function setManualLogo(teamIdValue: string, file: File) {
  if (!get("SELECT 1 FROM teams WHERE id = ?", [teamIdValue])) throw new AppError("Unknown team.", "not_found");
  if (file.size > 4 * 1024 * 1024) throw new AppError("Logos must be under 4 MB.");
  store(teamIdValue, await normalize(Buffer.from(await file.arrayBuffer())), "manual", null);
}

export function removeLogo(teamIdValue: string) {
  const f = fileFor(teamIdValue);
  if (existsSync(f)) rmSync(f);
  run("UPDATE teams SET logo_path = NULL, logo_source = NULL, logo_status = 'none', logo_checked_at = NULL, updated_at = ? WHERE id = ?", [now(), teamIdValue]);
}

const readLogoFile = (teamIdValue: string) => {
  const f = fileFor(teamIdValue);
  return existsSync(f) ? f : null;
};

export function readLogo(teamIdValue: string): Buffer | null {
  const r = get<{ logo_path: string | null; logo_status: string }>("SELECT logo_path, logo_status FROM teams WHERE id = ?", [teamIdValue]);
  if (!r?.logo_path || r.logo_status !== "ok") return null;
  const f = path.join(dir(), path.basename(r.logo_path));
  return existsSync(f) ? readFileSync(f) : null;
}

/**
 * Fetch one team's logo from the provider (once). Manual uploads are never
 * overwritten. Returns the resulting status.
 */
export async function fetchProviderLogo(team: TeamView, opts: { force?: boolean; provider?: LogoProvider | null } = {}): Promise<"ok" | "missing" | "error" | "skipped"> {
  const provider = opts.provider === undefined ? logoProvider() : opts.provider;
  if (!provider) return "skipped";
  const row = get<{ logo_source: string | null; logo_status: string; logo_checked_at: number | null }>("SELECT logo_source, logo_status, logo_checked_at FROM teams WHERE id = ?", [team.id]);
  if (!row || row.logo_source === "manual") return "skipped";
  if (!opts.force && !needsFetch(row.logo_status, row.logo_checked_at)) return "skipped";
  try {
    const url = await provider.logoUrl(team);
    if (!url) {
      run("UPDATE teams SET logo_status = 'missing', logo_checked_at = ?, provider = ? WHERE id = ?", [now(), provider.name, team.id]);
      return "missing";
    }
    const res = await fetch(url, { headers: provider.headers(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) throw new Error("too large");
    store(team.id, await normalize(buf), "provider", provider.name);
    return "ok";
  } catch {
    // Provider down or bad file: keep serving a previously cached logo if there is one.
    const cached = readLogoFile(team.id);
    run(`UPDATE teams SET ${cached ? "" : "logo_status = 'error', "}logo_checked_at = ?, provider = ? WHERE id = ?`, [now(), provider.name, team.id]);
    return "error";
  }
}

/** Never tried, or a miss/error more than a day ago (so a fixed key or a new badge gets picked up). */
export const needsFetch = (status: string, checkedAt: number | null, t = now()) => status === "none" || ((status === "missing" || status === "error") && (checkedAt ?? 0) < t - 24 * 3_600_000);

/**
 * Fetch every team's logo that is missing (one team at a time, a short pause
 * between downloads). Runs at startup and daily from the sports scheduler.
 */
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
/** Fire-and-forget: fetch logos for teams never tried before (provider configured only). */
export function warmLogos(teams: TeamView[]) {
  const p = logoProvider();
  if (!p) return;
  for (const t of teams) {
    if (t.logo || inflight.has(t.id)) continue;
    inflight.add(t.id);
    fetchProviderLogo(t, { provider: p }).finally(() => inflight.delete(t.id));
  }
}
