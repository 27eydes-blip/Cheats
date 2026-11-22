import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "./errors";
import { all, get, newId, now, run } from "./db";
import { sniffImage, uploadDir } from "./media";
import { cleanText, safeHttpUrl } from "./text";
import { accessibleAccent, BANNER_ASPECT, bannerCopy, bannerCopyError, clampFocal, focalCrop, hex, MOTION_MAX_BYTES } from "./banner";

/**
 * Sponsors. Sponsored cards in the feed are OFF by default; an admin turns
 * them on in the Control Room. Each sponsor has its own on/off switch and
 * optional start and end dates. Cards are always labeled "Sponsored", never
 * ranked or boosted, and sit at fixed slots (4th item, then every 10th).
 */
export type SponsoredCard = {
  id: string; sponsor: string; title: string; body: string; url: string; button: string;
  /** Resized images (600 and 1200 wide) or null for a text-only card. */
  image: { w600: string; w1200: string; alt: string } | null;
  /** The compact banner: short copy, the 16:5 focal crop (800 and 1600 wide), a brand color, optional short motion. */
  banner?: {
    headline: string; text: string; accent: string;
    image: { w800: string; w1600: string; original: string; alt: string } | null;
    focal: { x: number; y: number };
    motion: { url: string; type: "video/mp4" | "image/webp" } | null;
  };
};
export type AdsConfig = { enabled: boolean; cards: SponsoredCard[] };

export type SponsorRow = {
  id: string; name: string; headline: string; body: string; link_url: string; button_label: string; image_key: string | null; image_alt: string; placeholder: string | null;
  starts_at: number | null; ends_at: number | null; active: number; views: number; clicks: number; created_at: number; updated_at: number;
  banner_headline: string; banner_text: string; focal_x: number; focal_y: number; accent: string | null; motion_key: string | null; motion_type: string | null;
};

type Admin = { id: string; role: string };
const must = (u: Admin) => {
  if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
};

function enabledSetting(): boolean {
  const row = get<{ value: string }>("SELECT value FROM site_settings WHERE key = 'ads'");
  if (!row) return false;
  try {
    return (JSON.parse(row.value) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

/** The image URLs for a sponsor (the version key in the URL busts caches after a new upload). */
export function sponsorImage(s: Pick<SponsorRow, "id" | "image_key" | "placeholder" | "image_alt" | "name">): SponsoredCard["image"] {
  const v = s.image_key ?? (s.placeholder ? `ph-${s.placeholder}` : null);
  if (!v) return null;
  return { w600: `/api/sponsors/${s.id}/image?w=600&v=${encodeURIComponent(v)}`, w1200: `/api/sponsors/${s.id}/image?w=1200&v=${encodeURIComponent(v)}`, alt: s.image_alt || `${s.name} ad` };
}

/** Banner image URLs: the version carries the image and the focal point, so a new crop is a new URL. */
export function bannerImage(s: Pick<SponsorRow, "id" | "image_key" | "placeholder" | "image_alt" | "name" | "focal_x" | "focal_y">) {
  const v = s.image_key ?? (s.placeholder ? `ph-${s.placeholder}` : null);
  if (!v) return null;
  const q = `v=${encodeURIComponent(`${v}-${Math.round(clampFocal(s.focal_x) * 100)}-${Math.round(clampFocal(s.focal_y) * 100)}`)}`;
  return { w800: `/api/sponsors/${s.id}/image?kind=banner&w=800&${q}`, w1600: `/api/sponsors/${s.id}/image?kind=banner&w=1600&${q}`, original: `/api/sponsors/${s.id}/image?kind=orig&v=${encodeURIComponent(v)}`, alt: s.image_alt || `${s.name} ad` };
}

const toCard = (s: SponsorRow): SponsoredCard => {
  const copy = bannerCopy({ bannerHeadline: s.banner_headline, bannerText: s.banner_text, headline: s.headline, body: s.body });
  return {
    id: s.id, sponsor: s.name, title: s.headline, body: s.body, url: s.link_url, button: s.button_label || "Learn more", image: sponsorImage(s),
    banner: {
      ...copy,
      accent: accessibleAccent(s.accent),
      image: bannerImage(s),
      focal: { x: clampFocal(s.focal_x), y: clampFocal(s.focal_y) },
      motion: s.motion_key && (s.motion_type === "video/mp4" || s.motion_type === "image/webp") ? { url: `/api/sponsors/${s.id}/motion?v=${encodeURIComponent(s.motion_key)}`, type: s.motion_type } : null,
    },
  };
};

/** Is a sponsor showing right now? Its switch is on and today is within its dates. */
export const isLive = (s: Pick<SponsorRow, "active" | "starts_at" | "ends_at">, t = now()) => !!s.active && (!s.starts_at || s.starts_at <= t) && (!s.ends_at || s.ends_at > t);

export function getAds(t = now()): AdsConfig {
  const cards = all<SponsorRow>("SELECT * FROM sponsors ORDER BY created_at").filter((s) => isLive(s, t)).map(toCard);
  return { enabled: enabledSetting(), cards };
}

export function listSponsors(): (SponsorRow & { live: boolean; card: SponsoredCard })[] {
  return all<SponsorRow>("SELECT * FROM sponsors ORDER BY active DESC, updated_at DESC").map((s) => ({ ...s, live: isLive(s), card: toCard(s) }));
}

export function setAdsEnabled(u: Admin, on: boolean) {
  must(u);
  run("INSERT INTO site_settings (key, value) VALUES ('ads', ?) ON CONFLICT(key) DO UPDATE SET value = json_set(value, '$.enabled', json(?))", [JSON.stringify({ enabled: !!on, cards: [] }), on ? "true" : "false"]);
}

// ------------------------------------------------------------------ images

export const SPONSOR_IMAGE_MAX = 5 * 1024 * 1024;
export const SPONSOR_SIZES = [[1200, 630], [600, 315]] as const;
const dir = () => path.join(uploadDir(), "sponsors");
const file = (key: string, w: number) => path.join(dir(), `${key}-${w}.webp`);

/**
 * Check and convert an uploaded sponsor image. Only JPG, PNG and WebP, up to
 * 5 MB, recognized by their bytes (not the file name). Output: 1200×630 and
 * 600×315 WebP (cropped to fill, focused on the most interesting part), with
 * all metadata (EXIF, GPS, camera) stripped by re-encoding.
 */
export async function processSponsorImage(buf: Buffer): Promise<{ w1200: Buffer; w600: Buffer; orig: Buffer; accent: string | null }> {
  if (buf.length > SPONSOR_IMAGE_MAX) throw new AppError("Images must be 5 MB or smaller.");
  const kind = sniffImage(buf);
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp") throw new AppError("Use a JPG, PNG or WebP image.");
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError("That image couldn't be read. Try another file.");
  }
  if (!meta.width || !meta.height || meta.width < 300 || meta.height < 150) throw new AppError("The image is too small. Use at least 600×315 (1200×630 looks best).");
  const out = async (w: number, h: number) => sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(w, h, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 82 }).toBuffer();
  // The full image (up to 2400 wide, metadata stripped) is kept so the banner can be re-cropped at any focal point.
  const orig = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  return { w1200: await out(1200, 630), w600: await out(600, 315), orig, accent: await dominantColor(orig) };
}

/** The image's dominant color as #rrggbb (null if it can't be read). */
export async function dominantColor(buf: Buffer): Promise<string | null> {
  try {
    const { dominant } = await sharp(buf).stats();
    return hex([dominant.r, dominant.g, dominant.b]);
  } catch {
    return null;
  }
}

/** A generated placeholder graphic in the app's colors (used until a real image is uploaded). */
export function placeholderSvg(kind: string, w = 1200, h = 630) {
  const title = kind === "glydrift" ? "GLYDRIFT" : kind.toUpperCase().slice(0, 16);
  const rings = Array.from({ length: 7 }, (_, i) => `<ellipse cx="${w * 0.72}" cy="${h * 0.62}" rx="${80 + i * 70}" ry="${30 + i * 26}" fill="none" stroke="#2f6bff" stroke-opacity="${0.55 - i * 0.07}" stroke-width="${3 - i * 0.3}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g" cx="72%" cy="62%" r="60%"><stop offset="0" stop-color="#22d3ee" stop-opacity=".55"/><stop offset=".25" stop-color="#2f6bff" stop-opacity=".35"/><stop offset="1" stop-color="#070b14" stop-opacity="0"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#070b14"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${rings}
  <circle cx="${w * 0.72}" cy="${h * 0.62}" r="26" fill="#070b14" stroke="#22d3ee" stroke-width="3"/>
  <path d="M ${w * 0.08} ${h * 0.86} C ${w * 0.3} ${h * 0.78}, ${w * 0.5} ${h * 0.3}, ${w * 0.7} ${h * 0.58}" fill="none" stroke="#a5f3fc" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 16"/>
  <text x="${w * 0.07}" y="${h * 0.3}" font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(h * 0.15)}" font-weight="900" fill="#ffffff" letter-spacing="4">${title}</text>
  <text x="${w * 0.07}" y="${h * 0.42}" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.06)}" fill="#a5f3fc">Placeholder graphic</text>
</svg>`;
}

/** Bytes of a sponsor image at a width (600 or 1200); null if it has none. Placeholders are rendered once and cached on disk. */
/** The source for banner crops: the kept original, the 1200 version for older uploads, or the placeholder art. */
async function bannerSource(s: SponsorRow): Promise<Buffer | null> {
  if (s.image_key) {
    for (const f of [path.join(dir(), `${s.image_key}-orig.webp`), file(s.image_key, 1200)]) if (existsSync(f)) return readFileSync(f);
    return null;
  }
  if (s.placeholder) return sharp(Buffer.from(placeholderSvg(s.placeholder, 1600, 840))).png().toBuffer();
  return null;
}

/**
 * A 16:5 banner crop (800 or 1600 wide) at the sponsor's focal point, made
 * once and cached on disk. Also records the image's brand color the first
 * time, for sponsors saved before colors existed.
 */
export async function sponsorBannerBytes(id: string, w: number): Promise<Buffer | null> {
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s) return null;
  const width = w >= 1600 ? 1600 : 800;
  const fx = Math.round(clampFocal(s.focal_x) * 100), fy = Math.round(clampFocal(s.focal_y) * 100);
  const key = s.image_key ?? (s.placeholder ? `placeholder-${s.placeholder.replace(/[^a-z0-9-]/gi, "")}` : null);
  if (!key) return null;
  const cached = path.join(dir(), `${key}-b${width}-${fx}-${fy}.webp`);
  if (existsSync(cached)) return readFileSync(cached);
  const src = await bannerSource(s);
  if (!src) return null;
  const meta = await sharp(src).metadata();
  const crop = focalCrop(meta.width ?? 1200, meta.height ?? 630, BANNER_ASPECT, fx / 100, fy / 100);
  const out = await sharp(src).extract(crop).resize(width, Math.round(width / BANNER_ASPECT)).webp({ quality: 82 }).toBuffer();
  mkdirSync(dir(), { recursive: true });
  writeFileSync(cached, out);
  if (!s.accent) {
    const c = await dominantColor(src);
    if (c) run("UPDATE sponsors SET accent = ? WHERE id = ? AND accent IS NULL", [c, id]);
  }
  return out;
}

/** The image the banner is cropped from (shown in the focal-point picker), as WebP. */
export async function sponsorOriginalBytes(id: string): Promise<Buffer | null> {
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s) return null;
  const src = await bannerSource(s);
  return src ? sharp(src).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer() : null;
}

/** Recognize a short motion file: MP4 ("ftyp" box) or animated WebP (an ANIM chunk). */
export function sniffMotion(buf: Buffer): "video/mp4" | "image/webp" | null {
  if (buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  if (buf.length > 30 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP" && buf.subarray(0, 4096).includes(Buffer.from("ANIM"))) return "image/webp";
  return null;
}

export function sponsorMotion(id: string): { buf: Buffer; type: string } | null {
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s?.motion_key || !s.motion_type) return null;
  const f = path.join(dir(), `${s.motion_key}.${s.motion_type === "video/mp4" ? "mp4" : "webp"}`);
  return existsSync(f) ? { buf: readFileSync(f), type: s.motion_type } : null;
}

export async function sponsorImageBytes(id: string, w: number): Promise<Buffer | null> {
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s) return null;
  const width = w >= 1200 ? 1200 : 600;
  if (s.image_key && existsSync(file(s.image_key, width))) return readFileSync(file(s.image_key, width));
  if (!s.placeholder) return null;
  const key = `placeholder-${s.placeholder.replace(/[^a-z0-9-]/gi, "")}`;
  if (existsSync(file(key, width))) return readFileSync(file(key, width));
  const buf = await sharp(Buffer.from(placeholderSvg(s.placeholder, 1200, 630))).resize(width, Math.round((width * 630) / 1200)).webp({ quality: 85 }).toBuffer();
  mkdirSync(dir(), { recursive: true });
  writeFileSync(file(key, width), buf);
  return buf;
}

// ------------------------------------------------------------------ create / edit

export type SponsorInput = {
  name: string; headline: string; body: string; url: string; button: string; alt: string;
  startsAt: number | null; endsAt: number | null; active: boolean; image?: Buffer | null; removeImage?: boolean;
  bannerHeadline?: string; bannerText?: string; focalX?: number; focalY?: number; motion?: Buffer | null; removeMotion?: boolean;
};

/** Delete every stored file for an image: both card sizes, the kept original and any cached banner crops. */
function removeImageFiles(key: string) {
  for (const [w] of SPONSOR_SIZES) rmSync(file(key, w), { force: true });
  rmSync(path.join(dir(), `${key}-orig.webp`), { force: true });
  if (existsSync(dir())) for (const f of readdirSync(dir())) if (f.startsWith(`${key}-b`)) rmSync(path.join(dir(), f), { force: true });
}

export async function saveSponsor(u: Admin, id: string | null, input: SponsorInput) {
  must(u);
  const name = cleanText(input.name).slice(0, 40);
  const headline = cleanText(input.headline).slice(0, 90);
  const body = cleanText(input.body).slice(0, 200);
  const button = cleanText(input.button).slice(0, 24) || "Learn more";
  const alt = cleanText(input.alt).slice(0, 160);
  const url = safeHttpUrl(String(input.url).trim().slice(0, 300));
  if (!name || !headline) throw new AppError("A sponsor needs a name and a headline.");
  if (!url) throw new AppError("The link must be a full web address (https://…).");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new AppError("The end date must be after the start date.");
  const bannerHeadline = cleanText(input.bannerHeadline ?? "").slice(0, 80);
  const bannerText = cleanText(input.bannerText ?? "").slice(0, 60);
  const copyErr = bannerCopyError(bannerHeadline, bannerText);
  if (copyErr) throw new AppError(copyErr);
  const focalX = clampFocal(input.focalX ?? 0.5), focalY = clampFocal(input.focalY ?? 0.5);
  let motionType: string | null = null;
  if (input.motion?.length) {
    if (input.motion.length > MOTION_MAX_BYTES) throw new AppError("Motion files must be under 2 MB.");
    motionType = sniffMotion(input.motion);
    if (!motionType) throw new AppError("Motion must be a short muted MP4 or an animated WebP.");
  }
  const existing = id ? get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]) : undefined;
  if (id && !existing) throw new AppError("Sponsor not found.", "not_found");
  const sid = existing?.id ?? newId();
  let imageKey = existing?.image_key ?? null;
  let accent = existing?.accent ?? null;
  if (input.image?.length) {
    if (!alt) throw new AppError("Describe the image for screen-reader users (alt text).");
    const img = await processSponsorImage(input.image);
    const key = `${sid}-${Date.now().toString(36)}`;
    mkdirSync(dir(), { recursive: true });
    writeFileSync(file(key, 1200), img.w1200);
    writeFileSync(file(key, 600), img.w600);
    writeFileSync(path.join(dir(), `${key}-orig.webp`), img.orig);
    if (imageKey) removeImageFiles(imageKey);
    imageKey = key;
    accent = img.accent;
  } else if (input.removeImage && imageKey) {
    removeImageFiles(imageKey);
    imageKey = null;
  }
  let motionKey = existing?.motion_key ?? null;
  let motionKind = existing?.motion_type ?? null;
  if (input.motion?.length && motionType) {
    const key = `${sid}-motion-${Date.now().toString(36)}`;
    mkdirSync(dir(), { recursive: true });
    writeFileSync(path.join(dir(), `${key}.${motionType === "video/mp4" ? "mp4" : "webp"}`), input.motion);
    if (motionKey) rmSync(path.join(dir(), `${motionKey}.${motionKind === "video/mp4" ? "mp4" : "webp"}`), { force: true });
    motionKey = key;
    motionKind = motionType;
  } else if (input.removeMotion && motionKey) {
    rmSync(path.join(dir(), `${motionKey}.${motionKind === "video/mp4" ? "mp4" : "webp"}`), { force: true });
    motionKey = null;
    motionKind = null;
  }
  const t = now();
  if (existing) {
    run(
      `UPDATE sponsors SET name = ?, headline = ?, body = ?, link_url = ?, button_label = ?, image_key = ?, image_alt = ?, starts_at = ?, ends_at = ?, active = ?, updated_at = ?,
         placeholder = CASE WHEN ? IS NOT NULL THEN NULL ELSE placeholder END WHERE id = ?`,
      [name, headline, body, url, button, imageKey, alt, input.startsAt, input.endsAt, input.active ? 1 : 0, t, imageKey, sid],
    );
    run("UPDATE sponsors SET banner_headline = ?, banner_text = ?, focal_x = ?, focal_y = ?, accent = ?, motion_key = ?, motion_type = ? WHERE id = ?", [bannerHeadline, bannerText, focalX, focalY, accent, motionKey, motionKind, sid]);
  } else {
    if ((get<{ n: number }>("SELECT count(*) n FROM sponsors")?.n ?? 0) >= 50) throw new AppError("Up to 50 sponsors. Delete an old one first.");
    run(
      "INSERT INTO sponsors (id, name, headline, body, link_url, button_label, image_key, image_alt, starts_at, ends_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [sid, name, headline, body, url, button, imageKey, alt, input.startsAt, input.endsAt, input.active ? 1 : 0, t, t],
    );
    run("UPDATE sponsors SET banner_headline = ?, banner_text = ?, focal_x = ?, focal_y = ?, accent = ?, motion_key = ?, motion_type = ? WHERE id = ?", [bannerHeadline, bannerText, focalX, focalY, accent, motionKey, motionKind, sid]);
  }
  return sid;
}

export function deleteSponsor(u: Admin, id: string) {
  must(u);
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s) return;
  if (s.image_key) removeImageFiles(s.image_key);
  if (s.motion_key) rmSync(path.join(dir(), `${s.motion_key}.${s.motion_type === "video/mp4" ? "mp4" : "webp"}`), { force: true });
  run("DELETE FROM sponsors WHERE id = ?", [id]);
}

export function setSponsorActive(u: Admin, id: string, on: boolean) {
  must(u);
  run("UPDATE sponsors SET active = ?, updated_at = ? WHERE id = ?", [on ? 1 : 0, now(), id]);
}

/** Count a view or a click (the caller rate-limits: once per visitor per sponsor every 30 minutes). */
export function countSponsorEvent(id: string, kind: "view" | "click") {
  run(`UPDATE sponsors SET ${kind === "click" ? "clicks = clicks + 1" : "views = views + 1"} WHERE id = ?`, [id]);
}

// Older helpers kept so nothing that used them breaks.
export async function addSponsoredCard(u: Admin, input: { sponsor: string; title: string; body: string; url: string }) {
  return saveSponsor(u, null, { name: input.sponsor, headline: input.title, body: input.body, url: input.url, button: "", alt: "", startsAt: null, endsAt: null, active: true });
}
export function removeSponsoredCard(u: Admin, id: string) {
  deleteSponsor(u, id);
}

/** Slots (0-based positions in the whole feed) that carry a sponsored card. */
export { isAdSlot as isSponsoredSlot } from "./banner";
