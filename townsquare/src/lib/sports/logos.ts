import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "../errors";
import { get, now, run } from "../db";
import { uploadDir } from "../media";
import { contrast } from "./badge";

/**
 * Team logos, in one place:
 *   - "upload": an image an admin uploaded in Control Room → Team logos (they confirm permission);
 *   - "tsdb":   the badge from the licensed data provider (TheSportsDB by default);
 *   - "letter": a generated circle in the team's color with 1–3 letters (no artwork at all).
 * Priority everywhere is upload → provider badge → letter, unless an admin
 * picks one for the team. Images are stored as WebP at 128px and 512px in
 * UPLOAD_DIR/team-logos (on Railway: the /data volume).
 */

export type LogoKind = "upload" | "tsdb";
export type LogoSource = LogoKind | "letter";
export type LogoMode = "auto" | LogoSource;
export const LOGO_MODES: LogoMode[] = ["auto", "upload", "tsdb", "letter"];
export const SIZES = [128, 512] as const;
export const MAX_UPLOAD = 2 * 1024 * 1024;

export const logoDir = () => path.join(uploadDir(), "team-logos");
const safeId = (id: string) => id.replace(/[^a-z0-9-]/g, "");
export const fileFor = (id: string, kind: LogoKind, size: 128 | 512) => path.join(logoDir(), `${safeId(id)}-${kind}-${size}.webp`);
/** Logos cached by the earlier version (one PNG per team). Still served until replaced. */
const legacyFile = (id: string) => path.join(logoDir(), `${safeId(id)}.png`);

// ------------------------------------------------------------------ validation

export type ImageKind = "png" | "jpeg" | "webp" | "svg";

/** The file's real type from its first bytes (the extension and the browser's claim are ignored). */
export function sniffLogo(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  // SVG is text: optional BOM, XML declaration, comments or doctype, then an <svg> root.
  const head = buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, "");
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
  return null;
}

/**
 * SVGs are never served as SVG: they are drawn into a WebP on the server. Before
 * that, refuse anything that could reach outside the file (external images,
 * links to other files, entities, scripts, embedded HTML).
 */
export function svgProblem(text: string): string | null {
  if (/<!ENTITY/i.test(text)) return "SVG files can't define entities.";
  if (/<script[\s>]/i.test(text)) return "SVG files can't contain scripts.";
  if (/<foreignObject[\s>]/i.test(text)) return "SVG files can't contain embedded HTML.";
  if (/<image[\s>]/i.test(text) || /<use[^>]+href\s*=\s*["'](?!#)/i.test(text)) return "SVG files can't load other images or files.";
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return "SVG files can't link to other files.";
  if (/url\(\s*["']?(?!#)/i.test(text)) return "SVG files can't load outside resources.";
  if (/@import/i.test(text)) return "SVG files can't import styles.";
  return null;
}

/** Check an upload and draw it into the two WebP sizes (transparent background, logo centered). */
export async function processLogo(buf: Buffer): Promise<Record<128 | 512, Buffer>> {
  if (buf.length > MAX_UPLOAD) throw new AppError("Logos can be at most 2 MB.");
  const kind = sniffLogo(buf);
  if (!kind) throw new AppError("Use a PNG, SVG, JPG or WebP image.");
  if (kind === "svg") {
    const problem = svgProblem(buf.toString("utf8"));
    if (problem) throw new AppError(problem);
  }
  try {
    const base = sharp(buf, { limitInputPixels: 40_000_000, ...(kind === "svg" ? { density: 300 } : {}) }).rotate();
    const out = {} as Record<128 | 512, Buffer>;
    for (const size of SIZES) {
      out[size] = await base
        .clone()
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: false })
        .webp({ quality: 90, alphaQuality: 100 })
        .toBuffer();
    }
    return out;
  } catch {
    throw new AppError("That image couldn't be read.");
  }
}

function writeVariants(id: string, kind: LogoKind, v: Record<128 | 512, Buffer>) {
  mkdirSync(logoDir(), { recursive: true });
  for (const size of SIZES) writeFileSync(fileFor(id, kind, size), v[size]);
}

const teamExists = (id: string) => !!get("SELECT 1 FROM teams WHERE id = ?", [id]);

// ------------------------------------------------------------------ writes

export async function saveUpload(id: string, buf: Buffer) {
  if (!teamExists(id)) throw new AppError("Unknown team.", "not_found");
  writeVariants(id, "upload", await processLogo(buf));
  run("UPDATE teams SET upload_at = ?, updated_at = ? WHERE id = ?", [now(), now(), id]);
}

export function removeUpload(id: string) {
  for (const size of SIZES) rmSync(fileFor(id, "upload", size), { force: true });
  const r = get<{ logo_source: string | null }>("SELECT logo_source FROM teams WHERE id = ?", [id]);
  if (r?.logo_source === "manual") {
    rmSync(legacyFile(id), { force: true });
    run("UPDATE teams SET logo_path = NULL, logo_source = NULL, logo_status = 'none' WHERE id = ?", [id]);
  }
  run("UPDATE teams SET upload_at = NULL, logo_mode = CASE WHEN logo_mode = 'upload' THEN 'auto' ELSE logo_mode END, updated_at = ? WHERE id = ?", [now(), id]);
}

/** Store a provider badge (validated and re-encoded exactly like uploads). */
export async function saveProviderBadge(id: string, buf: Buffer, provider: string, colors: { c1?: string | null; c2?: string | null } = {}) {
  writeVariants(id, "tsdb", await processLogo(buf));
  run("UPDATE teams SET tsdb_at = ?, tsdb_status = 'ok', tsdb_checked_at = ?, provider = ?, tsdb_color1 = COALESCE(?, tsdb_color1), tsdb_color2 = COALESCE(?, tsdb_color2), updated_at = ? WHERE id = ?", [
    now(), now(), provider, validHex(colors.c1), validHex(colors.c2), now(), id,
  ]);
}

export function setLogoMode(id: string, mode: LogoMode) {
  if (!LOGO_MODES.includes(mode)) throw new AppError("Unknown logo choice.");
  if (!teamExists(id)) throw new AppError("Unknown team.", "not_found");
  run("UPDATE teams SET logo_mode = ?, updated_at = ? WHERE id = ?", [mode, now(), id]);
}

export const validHex = (c: string | null | undefined) => {
  const s = (c ?? "").trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toUpperCase()}` : null;
};

// ------------------------------------------------------------------ reads

export type LogoRow = {
  id: string; logo_mode: string | null; upload_at: number | null; tsdb_at: number | null; logo_source: string | null; logo_path: string | null; logo_status: string;
};

const has = (r: LogoRow, kind: LogoKind) => {
  if (kind === "upload") return !!r.upload_at && (existsSync(fileFor(r.id, "upload", 128)) || (r.logo_source === "manual" && existsSync(legacyFile(r.id))));
  return !!r.tsdb_at && (existsSync(fileFor(r.id, "tsdb", 128)) || (r.logo_source === "provider" && existsSync(legacyFile(r.id))));
};

/**
 * Which logo a team shows. "auto" = uploaded, then provider badge, then letter.
 * A chosen source that isn't available falls back the same way.
 */
export function pickSource(mode: string | null, available: { upload: boolean; tsdb: boolean }): LogoSource {
  if (mode === "letter") return "letter";
  if (mode === "tsdb") return available.tsdb ? "tsdb" : "letter";
  if (available.upload) return "upload";
  if (available.tsdb) return "tsdb";
  return "letter";
}

export function effectiveLogo(r: LogoRow): { source: LogoSource; url: string | null; available: { upload: boolean; tsdb: boolean } } {
  const available = { upload: has(r, "upload"), tsdb: has(r, "tsdb") };
  const source = pickSource(r.logo_mode, available);
  return { source, url: source === "letter" ? null : logoUrl(r.id, source, source === "upload" ? r.upload_at : r.tsdb_at), available };
}

export const logoUrl = (id: string, kind: LogoKind, at: number | null, size: 128 | 512 = 128) => `/api/team-logo/${id}?k=${kind}&s=${size}&v=${at ?? 0}`;

/** The bytes for one stored variant (new WebP files first, then the old PNG cache). */
export function readLogoFile(id: string, kind: LogoKind, size: 128 | 512): { buf: Buffer; type: string } | null {
  const f = fileFor(id, kind, size);
  if (existsSync(f)) return { buf: readFileSync(f), type: "image/webp" };
  const r = get<{ logo_source: string | null }>("SELECT logo_source FROM teams WHERE id = ?", [id]);
  const legacyKind = r?.logo_source === "manual" ? "upload" : r?.logo_source === "provider" ? "tsdb" : null;
  if (legacyKind === kind && existsSync(legacyFile(id))) return { buf: readFileSync(legacyFile(id)), type: "image/png" };
  return null;
}

// ------------------------------------------------------------------ the letter badge

export const NEUTRAL_FILL = "#3A4256";
const OVERRIDES: Record<string, string> = {
  "ncaaf-arst": "AST", "ncaaf-okst": "OKS", "ncaaf-fres": "FRE", "mls-rbny": "NYR", "ncaaf-utah": "UTA", "ncaaf-bois": "BSU", "ncaaf-tenn": "TEN", "ncaaf-minn": "MIN",
  "ncaaf-wash": "UW", "ncaaf-utsa": "UTS", "ncaaf-miss": "OM", "ncaaf-colo": "CU", "ncaaf-msst": "MSU", "ncaaf-ucla": "UCL", "mls-lafc": "LA", "ncaaf-clem": "CU",
  "ncaaf-tamu": "A&M", "ncaaf-iowa": "IA", "ncaaf-mich": "M",
};

/** 1–3 letters: the team's abbreviation when short enough, else a fixed short form, else initials. */
export function badgeLetters(t: { id?: string; abbr?: string; name: string }): string {
  if (t.id && OVERRIDES[t.id]) return OVERRIDES[t.id];
  const abbr = (t.abbr ?? "").trim();
  if (abbr && abbr.length <= 3) return abbr.toUpperCase();
  const words = t.name.replace(/\(.*?\)/g, " ").replace(/^(The|FC|AFC|CF) /i, "").split(/[\s-]+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  const initials = words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  return initials || "?";
}

const mix = (hex: string, toward: [number, number, number], amount: number) => {
  const v = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `#${c.map((x, i) => Math.round(x + (toward[i] - x) * amount).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

/**
 * The circle's colors: the team's primary color (provider colors first, then our
 * reference colors, else a neutral slate), with white or near-black letters,
 * whichever reads better. If neither reaches 4.5:1, the fill is nudged darker
 * (or lighter) until it does.
 */
export function circleColors(fillIn: string | null | undefined): { fill: string; text: string } {
  let fill = validHex(fillIn) ?? NEUTRAL_FILL;
  const DARK = "#0B1220";
  const WHITE = "#FFFFFF";
  const best = (f: string) => (contrast(WHITE, f) >= contrast(DARK, f) ? WHITE : DARK);
  let text = best(fill);
  for (let i = 1; contrast(text, fill) < 4.5 && i <= 20; i++) {
    fill = text === WHITE ? mix(validHex(fillIn) ?? NEUTRAL_FILL, [0, 0, 0], i * 0.05) : mix(validHex(fillIn) ?? NEUTRAL_FILL, [255, 255, 255], i * 0.05);
    text = best(fill);
  }
  return { fill, text };
}
