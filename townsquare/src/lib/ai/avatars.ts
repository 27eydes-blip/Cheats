import { AppError } from "../errors";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { uploadDir } from "../media";
import { avatarSvg, personaByHandle } from "./personas";

/**
 * AI account portraits. By default each account uses its illustrated SVG.
 * To use a generated image instead, upload it in Control Room → AI newsroom
 * (or place a file at UPLOAD_DIR/ai-avatars/<handle>.webp). Uploads are cropped
 * to 400×400 WebP with all metadata removed.
 */
const dir = () => path.join(uploadDir(), "ai-avatars");
const MAX = 5 * 1024 * 1024;

export async function aiAvatar(handle: string): Promise<{ body: Buffer | string; type: string } | null> {
  const p = personaByHandle(handle);
  if (!p) return null;
  try {
    return { body: await readFile(path.join(dir(), `${p.handle}.webp`)), type: "image/webp" };
  } catch {
    return { body: avatarSvg(p.avatar), type: "image/svg+xml" };
  }
}

export async function saveAiAvatar(handle: string, buf: Buffer) {
  const p = personaByHandle(handle);
  if (!p) throw new AppError("Unknown AI account.");
  if (buf.length > MAX) throw new AppError("Images can be at most 5 MB.");
  const head = buf.subarray(0, 12);
  const ok = (head[0] === 0xff && head[1] === 0xd8) || head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP");
  if (!ok) throw new AppError("Use a JPG, PNG or WebP image.");
  const out = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(400, 400, { fit: "cover", position: "attention" }).webp({ quality: 86 }).toBuffer();
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${p.handle}.webp`), out);
}

export async function clearAiAvatar(handle: string) {
  const p = personaByHandle(handle);
  if (!p) return;
  const { rm } = await import("node:fs/promises");
  await rm(path.join(dir(), `${p.handle}.webp`), { force: true });
}
