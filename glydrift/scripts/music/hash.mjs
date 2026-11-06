// Fingerprint of the music *sources* (the composition + renderer), ignoring comments and
// formatting. The rendered audio's manifest records it; the build refuses stale audio.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
export const SOURCES = [
  ...readdirSync(join(ROOT, "src/audio/reggae"))
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => `src/audio/reggae/${f}`),
  "scripts/music/render.mjs",
];

function normalize(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
    .replace(/\s+/g, "")
    .replace(/,(?=[)\]}])/g, ""); // trailing commas are formatting too
}

export function musicHash() {
  const h = createHash("sha256");
  for (const f of SOURCES) h.update(`${f}\n${normalize(readFileSync(join(ROOT, f), "utf8"))}\n`);
  return h.digest("hex").slice(0, 16);
}

export const MANIFEST = join(ROOT, "src/audio/reggae/manifest.json");
