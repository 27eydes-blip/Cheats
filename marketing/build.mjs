#!/usr/bin/env node
// Builds the promo videos from recorded clips (record/record.mjs) using config/edits/*.json.
//
//   node build.mjs                      # all videos
//   node build.mjs abyss-tiktok twitter-square
//   node build.mjs --clips other/clips --out other/output
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readJson, renderEdl } from "./lib/edit.mjs";
import { probe } from "./lib/ffmpeg.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    clips: { type: "string", default: join(ROOT, "clips") },
    out: { type: "string", default: join(ROOT, "output") },
    tmp: { type: "string", default: join(ROOT, ".tmp") },
  },
});

const editsDir = join(ROOT, "config/edits");
const all = readdirSync(editsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJson(join(editsDir, f)));
const edls = positionals.length ? all.filter((e) => positionals.includes(e.id)) : all;
if (!edls.length)
  throw new Error(
    `no edit matches ${positionals.join(", ")}; have ${all.map((e) => e.id).join(", ")}`,
  );

const cache = new Map();
async function source(seg) {
  const file = resolve(opt.clips, `${seg.clip}.mkv`);
  if (cache.has(file)) return cache.get(file);
  if (!existsSync(file))
    throw new Error(
      `segment "${seg.id}" needs ${file} — run: node record/record.mjs --only ${seg.clip}`,
    );
  const metaFile = file.replace(/\.mkv$/, ".json");
  const meta = existsSync(metaFile) ? readJson(metaFile) : { events: [] };
  const info = await probe(file);
  const src = {
    file,
    meta,
    hasAudio: !!info.audio,
    duration: info.duration,
    w: info.video.width,
    h: info.video.height,
  };
  cache.set(file, src);
  return src;
}

for (const edl of edls)
  await renderEdl(edl, source, { outDir: opt.out, tmpRoot: opt.tmp, scaleMode: "pixel" });
