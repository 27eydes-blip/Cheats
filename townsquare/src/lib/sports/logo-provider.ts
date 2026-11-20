import sharp from "sharp";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "../errors";
import { get, now, run } from "../db";
import { sniffImage, uploadDir } from "../media";
import type { TeamView } from "./teams";

/**
 * Team logos come only from a licensed source:
 *   1. a logo an admin uploaded in the Control Room (they confirm the rights), or
 *   2. a licensed sports-data provider, through a small adapter.
 * Nothing is scraped. With no provider configured, the site shows a generated
 * badge (team colors + abbreviation).
 *
 * Configuration (environment variables; never committed):
 *   SPORTS_LOGO_PROVIDER = none | manifest      (add more in PROVIDERS below)
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

/** Add a vendor here: one class implementing LogoProvider, one entry in this map. */
const PROVIDERS: Record<string, (key: string) => LogoProvider | null> = {
  none: () => null,
  manifest: (key) => (process.env.SPORTS_LOGO_MANIFEST_URL ? new ManifestProvider(process.env.SPORTS_LOGO_MANIFEST_URL, key) : null),
};

export function logoProvider(): LogoProvider | null {
  const name = (process.env.SPORTS_LOGO_PROVIDER ?? "none").toLowerCase();
  const key = process.env.SPORTS_API_KEY ?? "";
  if (name === "none" || !key) return null;
  const make = PROVIDERS[name];
  return make ? make(key) : null;
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
  const row = get<{ logo_source: string | null; logo_status: string }>("SELECT logo_source, logo_status FROM teams WHERE id = ?", [team.id]);
  if (!row || row.logo_source === "manual") return "skipped";
  if (!opts.force && row.logo_status !== "none") return "skipped";
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
