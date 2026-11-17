// Tiny static server for the automated tests: the test build (with test hooks) and the real
// release build, each on its own port. Usage: node tests/serve.mjs <dir> <port>
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const [dir = "dist-test", port = "4317"] = process.argv.slice(2);
const root = resolve(dir);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

// The build's _headers file (public/_headers), applied the way Cloudflare Pages does: every rule
// whose path pattern matches adds its headers ("*" matches anything), so the tests see exactly
// the security headers glydrift.com sends.
const rules = [];
const headersFile = join(root, "_headers");
if (existsSync(headersFile)) {
  let cur = null;
  for (const line of readFileSync(headersFile, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const re = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      rules.push((cur = { re, headers: [] }));
    } else if (cur) {
      const i = line.indexOf(":");
      cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
}
const headersFor = (path) => {
  const out = {};
  for (const r of rules) if (r.re.test(path)) for (const [k, v] of r.headers) out[k.toLowerCase()] = v;
  return out;
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    statSync(file);
  } catch {
    return res.writeHead(404).end("not found");
  }
  res.writeHead(200, {
    ...headersFor(path),
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`serving ${root} on :${port}`));
