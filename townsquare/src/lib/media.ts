import sharp from "sharp";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LIMITS } from "@/config";
import { AppError } from "./errors";
import { get, newId, now, run } from "./db";

export const uploadDir = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

/** Identify an image by its first bytes; the browser-supplied type is not trusted. */
export function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | "gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "gif";
  return null;
}

type Purpose = "post" | "avatar" | "banner";
const MAX_DIM: Record<Purpose, [number, number]> = { post: [2048, 2048], avatar: [400, 400], banner: [1500, 500] };

/**
 * Validate, re-encode to WebP, and store an uploaded image. Re-encoding drops
 * all metadata (EXIF, GPS location, camera info) and neutralizes malformed files.
 */
export async function saveImage(ownerId: string, file: File, purpose: Purpose, alt = ""): Promise<string> {
  if (file.size > LIMITS.imageBytes) throw new AppError(`Images must be under ${LIMITS.imageBytes / 1024 / 1024} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new AppError("Only JPEG, PNG, WebP, and GIF images are allowed.");

  const [w, h] = MAX_DIM[purpose];
  let img = sharp(buf, { animated: kind === "gif" && purpose === "post", limitInputPixels: 50_000_000 }).rotate();
  img =
    purpose === "post"
      ? img.resize({ width: w, height: h, fit: "inside", withoutEnlargement: true })
      : img.resize({ width: w, height: h, fit: "cover" });
  let out: { data: Buffer; info: sharp.OutputInfo };
  try {
    out = await img.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("That image couldn't be read. Try a different file.");
  }

  const id = newId();
  const dir = uploadDir();
  mkdirSync(dir, { recursive: true });
  const rel = `${id}.webp`;
  writeFileSync(path.join(dir, rel), out.data);
  run(
    `INSERT INTO media (id, owner_id, kind, mime, width, height, bytes, path, alt, created_at)
     VALUES (?, ?, ?, 'image/webp', ?, ?, ?, ?, ?, ?)`,
    [id, ownerId, purpose === "post" ? "image" : purpose, out.info.width, out.info.pageHeight ?? out.info.height, out.data.length, rel, alt.slice(0, LIMITS.altChars), now()],
  );
  return id;
}

type MediaRow = { id: string; owner_id: string; post_id: string | null; kind: string; mime: string; path: string };

/**
 * Access rules for a stored file (the "private bucket" check):
 * avatars/banners of live accounts are public; post images follow their post;
 * an image not attached to anything yet is visible only to its owner.
 */
export function readMediaFor(id: string, viewerId: string | null): { data: Buffer; mime: string; isPublic: boolean } | null {
  const m = get<MediaRow>("SELECT id, owner_id, post_id, kind, mime, path FROM media WHERE id = ?", [id]);
  if (!m) return null;
  let allowed = m.owner_id === viewerId;
  let isPublic = false;
  if (!allowed && (m.kind === "avatar" || m.kind === "banner")) {
    allowed = !!get("SELECT 1 FROM users WHERE id = ? AND status != 'deleted'", [m.owner_id]);
    isPublic = allowed;
  }
  if (!allowed && m.post_id) {
    allowed = !!get(
      `SELECT 1 FROM posts p WHERE p.id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p.author_id AND b.blocked_id = ?)`,
      [m.post_id, viewerId ?? ""],
    );
    isPublic = allowed;
  }
  if (!allowed) return null;
  const file = path.join(uploadDir(), path.basename(m.path));
  if (!existsSync(file)) return null;
  return { data: readFileSync(file), mime: m.mime, isPublic };
}

export function deleteFiles(paths: { path: string }[]) {
  for (const p of paths) rmSync(path.join(uploadDir(), path.basename(p.path)), { force: true });
}
