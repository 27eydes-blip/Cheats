import { unzipSync } from "fflate";
import { AppError } from "../errors";
import { all } from "../db";
import { listTeams, type TeamView } from "./teams";
import { logoUrl, MAX_UPLOAD, saveUpload, setLogoMode, type LogoMode } from "./logos";
import { LEAGUE_NAME } from "./teams-data";

/** Rows for Control Room → Team logos. */
export type LogoAdminRow = {
  id: string; league: TeamView["league"]; leagueName: string; name: string; abbr: string;
  source: TeamView["logoSource"]; mode: LogoMode; current: string | null; uploadThumb: string | null; providerThumb: string | null;
  providerStatus: string; circle: TeamView["circle"];
  /** Where the stored provider badge came from ("TheSportsDB", "Licensed feed"). */
  providerLabel: string;
};
const PROVIDER_LABEL: Record<string, string> = { thesportsdb: "TheSportsDB", manifest: "Licensed feed" };

export function logoAdminRows(): LogoAdminRow[] {
  const teams = listTeams();
  const meta = new Map(all<{ id: string; upload_at: number | null; tsdb_at: number | null; tsdb_status: string; provider: string | null }>("SELECT id, upload_at, tsdb_at, tsdb_status, provider FROM teams").map((r) => [r.id, r]));
  return teams.map((t) => {
    const m = meta.get(t.id);
    return {
      id: t.id, league: t.league, leagueName: LEAGUE_NAME[t.league], name: t.fullName, abbr: t.abbr,
      source: t.logoSource, mode: t.logoMode, current: t.logo,
      uploadThumb: t.hasUpload ? logoUrl(t.id, "upload", m?.upload_at ?? 0) : null,
      providerThumb: t.hasProviderLogo ? logoUrl(t.id, "tsdb", m?.tsdb_at ?? 0) : null,
      providerStatus: m?.tsdb_status ?? "none", circle: t.circle, providerLabel: PROVIDER_LABEL[m?.provider ?? ""] ?? "TheSportsDB",
    };
  });
}

export function setModeForTeams(ids: string[], mode: LogoMode) {
  let n = 0;
  for (const id of ids.slice(0, 500)) {
    setLogoMode(id, mode);
    n++;
  }
  return n;
}

export type ZipResult = { matched: { file: string; team: string }[]; unmatched: { file: string; reason: string }[] };
const IMAGE_EXT = /\.(png|svg|jpe?g|webp)$/i;
const MAX_FILES = 400;
const MAX_TOTAL = 120 * 1024 * 1024;

/**
 * Bulk upload: a ZIP of images named by team slug (e.g. ncaaf-ala.png,
 * nfl-kc.svg). Each file goes through the same checks as a single upload.
 * Returns which files matched a team and which didn't, and why.
 */
export async function importLogoZip(zip: Buffer): Promise<ZipResult> {
  const teams = new Map(listTeams().map((t) => [t.id, t.fullName]));
  let total = 0;
  let count = 0;
  const tooBig: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zip), {
      // Look at the declared sizes before inflating anything (guards against zip bombs).
      filter: (f) => {
        const base = f.name.split("/").pop() ?? "";
        if (f.name.endsWith("/") || base.startsWith(".") || f.name.startsWith("__MACOSX/")) return false;
        if (++count > MAX_FILES) throw new AppError(`A ZIP can hold at most ${MAX_FILES} images.`);
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new AppError("That ZIP is too large once unpacked.");
        if (f.originalSize > MAX_UPLOAD) {
          tooBig.push(base);
          return false;
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("That file isn't a ZIP we can read.");
  }
  const result: ZipResult = { matched: [], unmatched: tooBig.map((file) => ({ file, reason: "Larger than 2 MB." })) };
  for (const [name, data] of Object.entries(files)) {
    const base = name.split("/").pop()!;
    if (!IMAGE_EXT.test(base)) {
      result.unmatched.push({ file: base, reason: "Not a PNG, SVG, JPG or WebP file name." });
      continue;
    }
    const slug = base.replace(IMAGE_EXT, "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!teams.has(slug)) {
      result.unmatched.push({ file: base, reason: `No team with the slug "${slug}".` });
      continue;
    }
    try {
      await saveUpload(slug, Buffer.from(data));
      result.matched.push({ file: base, team: teams.get(slug)! });
    } catch (e) {
      result.unmatched.push({ file: base, reason: e instanceof AppError ? e.message : "Couldn't read the image." });
    }
  }
  return result;
}
