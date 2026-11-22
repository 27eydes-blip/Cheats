import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "./errors";
import { all, get, newId, now, run } from "./db";
import { sniffImage, uploadDir } from "./media";
import { cleanText, safeHttpUrl } from "./text";

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
};
export type AdsConfig = { enabled: boolean; cards: SponsoredCard[] };

export type SponsorRow = {
  id: string; name: string; headline: string; body: string; link_url: string; button_label: string; image_key: string | null; image_alt: string; placeholder: string | null;
  starts_at: number | null; ends_at: number | null; active: number; views: number; clicks: number; created_at: number; updated_at: number;
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

const toCard = (s: SponsorRow): SponsoredCard => ({ id: s.id, sponsor: s.name, title: s.headline, body: s.body, url: s.link_url, button: s.button_label || "Learn more", image: sponsorImage(s) });

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
export async function processSponsorImage(buf: Buffer): Promise<{ w1200: Buffer; w600: Buffer }> {
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
  return { w1200: await out(1200, 630), w600: await out(600, 315) };
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
};

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
  const existing = id ? get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]) : undefined;
  if (id && !existing) throw new AppError("Sponsor not found.", "not_found");
  const sid = existing?.id ?? newId();
  let imageKey = existing?.image_key ?? null;
  if (input.image?.length) {
    if (!alt) throw new AppError("Describe the image for screen-reader users (alt text).");
    const img = await processSponsorImage(input.image);
    const key = `${sid}-${Date.now().toString(36)}`;
    mkdirSync(dir(), { recursive: true });
    writeFileSync(file(key, 1200), img.w1200);
    writeFileSync(file(key, 600), img.w600);
    if (imageKey) for (const [w] of SPONSOR_SIZES) rmSync(file(imageKey, w), { force: true });
    imageKey = key;
  } else if (input.removeImage && imageKey) {
    for (const [w] of SPONSOR_SIZES) rmSync(file(imageKey, w), { force: true });
    imageKey = null;
  }
  const t = now();
  if (existing) {
    run(
      `UPDATE sponsors SET name = ?, headline = ?, body = ?, link_url = ?, button_label = ?, image_key = ?, image_alt = ?, starts_at = ?, ends_at = ?, active = ?, updated_at = ?,
         placeholder = CASE WHEN ? IS NOT NULL THEN NULL ELSE placeholder END WHERE id = ?`,
      [name, headline, body, url, button, imageKey, alt, input.startsAt, input.endsAt, input.active ? 1 : 0, t, imageKey, sid],
    );
  } else {
    if ((get<{ n: number }>("SELECT count(*) n FROM sponsors")?.n ?? 0) >= 50) throw new AppError("Up to 50 sponsors. Delete an old one first.");
    run(
      "INSERT INTO sponsors (id, name, headline, body, link_url, button_label, image_key, image_alt, starts_at, ends_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [sid, name, headline, body, url, button, imageKey, alt, input.startsAt, input.endsAt, input.active ? 1 : 0, t, t],
    );
  }
  return sid;
}

export function deleteSponsor(u: Admin, id: string) {
  must(u);
  const s = get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", [id]);
  if (!s) return;
  if (s.image_key) for (const [w] of SPONSOR_SIZES) rmSync(file(s.image_key, w), { force: true });
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
export const isSponsoredSlot = (index: number) => index % 10 === 3;
