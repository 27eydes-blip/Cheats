// Static files for the page: gzipped when the browser accepts it, kept in memory until the file
// changes, and sent with an ETag so a reload gets a tiny "304 not changed" instead of the file.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

export const acceptsGzip = (req) => /\bgzip\b/.test(String(req?.headers?.["accept-encoding"] || ""));

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".txt"]);
const fileCache = new Map(); // path -> { mtimeMs, size, etag, raw, gz }
/** The file's bytes, its gzip and an ETag, cached in memory until the file changes. */
function loadStatic(file, ext) {
  const st = fs.statSync(file);
  const hit = fileCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  const raw = fs.readFileSync(file);
  const etag = `"${crypto.createHash("sha1").update(raw).digest("base64url").slice(0, 20)}"`;
  const gz = COMPRESSIBLE.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null;
  const entry = { mtimeMs: st.mtimeMs, size: st.size, etag, raw, gz };
  if (raw.length < 4_000_000) fileCache.set(file, entry);
  return entry;
}

/** Sends a static file: 304 when the browser's copy is current, gzipped when it can be. */
export function sendStatic(req, res, file, { cacheControl }) {
  const ext = path.extname(file);
  const f = loadStatic(file, ext);
  const headers = { "content-type": MIME[ext] || "application/octet-stream", "cache-control": cacheControl, etag: f.etag, vary: "accept-encoding" };
  if (String(req?.headers?.["if-none-match"] || "").split(/\s*,\s*/).includes(f.etag)) return res.writeHead(304, headers).end();
  if (f.gz && acceptsGzip(req)) return res.writeHead(200, { ...headers, "content-encoding": "gzip", "content-length": f.gz.length }).end(f.gz);
  res.writeHead(200, { ...headers, "content-length": f.raw.length }).end(f.raw);
}

