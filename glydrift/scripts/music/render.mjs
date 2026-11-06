// Pre-render Glydrift's reggae soundtrack:  npm run music   (or: node scripts/music/render.mjs)
//
//  1. serves the game's sources with Vite and opens scripts/music/render.html in headless
//     Chromium (the Playwright browser the tests already use)
//  2. renders every song / bridge / Calm stem with Tone.js in an OfflineAudioContext
//  3. balances the stems (fixed loudness per stem, the same for every realm), checks headroom
//  4. encodes mono MP3s with ffmpeg (libmp3lame) into public/music/ (content-hashed names)
//  5. writes src/audio/reggae/manifest.json (timings + files + the source fingerprint)
//
// The build (vite.config.js) refuses to ship if the manifest's fingerprint doesn't match the
// music sources, so the game never plays audio rendered from an older composition.
// An interrupted run resumes where it stopped (clips already rendered from the same sources
// are kept). Options: --port=5291 · --pages=3 (parallel renders) · --verbose · --fresh
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { MANIFEST, musicHash } from "./hash.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, "public/music");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const PAGES = Number(arg("pages") || 3);
const VERBOSE = process.argv.includes("--verbose");
const PORT = Number(arg("port") || 5291);

// loudness of each stem (dBFS RMS over the parts where it plays) — one mix for every realm
const TARGET = { drums: -19, bass: -17.5, skank: -25, lead: -22.5, music: -24 };
const KBPS = { drums: 56, bass: 64, skank: 48, lead: 48, music: 48 };
const CALM_TARGET = { drums: -26, skank: -34 };

if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("music: ffmpeg (with libmp3lame) is needed to encode the soundtrack");
  process.exit(1);
}

const dB = (x) => 20 * Math.log10(Math.max(1e-9, x));
/** RMS over the 50 ms windows where the stem is actually playing. */
function activeRms(d, sr) {
  const win = Math.round(sr * 0.05);
  const levels = [];
  for (let i = 0; i + win <= d.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += d[j] * d[j];
    levels.push(s / win);
  }
  const loud = levels.filter((v) => dB(Math.sqrt(v)) > -50);
  if (!loud.length) return 0;
  return Math.sqrt(loud.reduce((a, b) => a + b, 0) / loud.length);
}
function peak(d) {
  let p = 0;
  for (const v of d) p = Math.max(p, Math.abs(v));
  return p;
}

function encode(name, data, sr, kbps) {
  const pcm = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const tmp = join(OUT, `.tmp-${name}.mp3`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "f32le",
      "-ar",
      String(sr),
      "-ac",
      "1",
    ].concat(["-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-ar", String(sr), tmp]),
    { input: pcm, maxBuffer: 1 << 30 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${r.stderr}`);
  const bytes = readFileSync(tmp);
  rmSync(tmp);
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  const file = `${name}.${hash}.mp3`;
  writeFileSync(join(OUT, file), bytes);
  return { file, bytes: bytes.length };
}

const server = await createServer({
  root: ROOT,
  logLevel: "error",
  // no file watching: editing the game while it renders must not reload the render page
  server: { port: PORT, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const base = server.resolvedUrls?.local?.[0] || `http://localhost:${server.config.server.port}/`;
// MUSIC_CHROMIUM=/path/to/chrome uses another Chromium than Playwright's own
const browser = await chromium.launch(
  process.env.MUSIC_CHROMIUM ? { executablePath: process.env.MUSIC_CHROMIUM } : {},
);
async function openPage() {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("page:", m.text()));
  await page.goto(new URL("scripts/music/render.html", base).href);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });
  return page;
}
const pages = [await openPage()];
const jobs = await pages[0].evaluate(() => window.musicJobs());
const info = await pages[0].evaluate(() => window.musicInfo());
mkdirSync(OUT, { recursive: true });

// group jobs into clips (all stems of one clip are balanced together)
const clips = new Map();
for (const j of jobs) {
  const key =
    j.kind === "bridge"
      ? `bridge:${j.a}>${j.b}`
      : j.kind === "calib" || j.kind === "calm"
        ? j.kind
        : `${j.kind}:${j.id}`;
  if (!clips.has(key)) clips.set(key, { key, kind: j.kind, id: j.id, a: j.a, b: j.b, jobs: [] });
  clips.get(key).jobs.push(j);
}

const hash = musicHash();
const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
const resume = old && old.hash === hash && !process.argv.includes("--fresh");
if (resume && old.complete) {
  console.log(`music: up to date (hash ${hash}); --fresh renders it again`);
  await browser.close();
  await server.close();
  process.exit(0);
}
const manifest = resume
  ? old
  : {
      hash,
      sampleRate: 32000,
      complete: false,
      done: [],
      calib: null,
      tracks: {},
      bridges: {},
      calm: null,
    };
manifest.complete = false;
const save = () => writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
save();
let totalBytes = 0;
const t0 = Date.now();

async function renderClip(page, clip) {
  const stems = {};
  let meta = null;
  let sr = 32000;
  for (const j of clip.jobs) {
    if (VERBOSE) console.log("render", j.name);
    const r = await page.evaluate((job) => window.renderJob(job), j);
    const buf = Buffer.from(r.data, "base64");
    stems[j.stem || "calib"] = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / 4,
    ).slice();
    meta = r.meta;
    sr = r.sampleRate;
  }
  // balance: every stem to its loudness target (the intro reuses its song's gains)
  const gains = {};
  for (const [stem, d] of Object.entries(stems)) {
    if (clip.kind === "calib") gains[stem] = 1;
    else if (clip.kind === "intro") gains[stem] = manifest.tracks[clip.id].gains[stem];
    else {
      const target = clip.kind === "calm" ? CALM_TARGET[stem] : TARGET[stem];
      const rms = activeRms(d, sr);
      gains[stem] = rms > 0 ? 10 ** ((target - dB(rms)) / 20) : 1;
    }
  }
  // headroom: the full mix of this clip must peak under -1 dBFS
  const len = Math.max(...Object.values(stems).map((d) => d.length));
  const mix = new Float32Array(len);
  for (const [stem, d] of Object.entries(stems))
    for (let i = 0; i < d.length; i++) mix[i] += d[i] * gains[stem];
  const pk = peak(mix);
  const room = clip.kind === "intro" || pk <= 0.89 ? 1 : 0.89 / pk;
  const files = {};
  for (const [stem, d] of Object.entries(stems)) {
    gains[stem] *= room;
    const out = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) out[i] = d[i] * gains[stem];
    const name =
      clip.kind === "calib"
        ? "calibration"
        : clip.jobs.find((j) => (j.stem || "calib") === stem).name;
    const e = encode(name, out, sr, KBPS[stem] || 48);
    files[stem] = e.file;
    totalBytes += e.bytes;
  }
  if (clip.kind === "calib") manifest.calib = { file: files.calib, mark: meta.mark };
  else if (clip.kind === "body") {
    const g = Object.fromEntries(Object.entries(gains).map(([k, v]) => [k, +v.toFixed(5)]));
    manifest.tracks[clip.id] = {
      ...manifest.tracks[clip.id],
      ...info.tracks[clip.id],
      length: meta.length,
      pad: meta.pad,
      files,
      gains: g,
    };
  } else if (clip.kind === "intro")
    manifest.tracks[clip.id] = {
      ...manifest.tracks[clip.id],
      intro: { length: meta.length, files },
    };
  else if (clip.kind === "bridge") {
    const bt = await page.evaluate(([a, b]) => window.bridgeBeats(a, b), [clip.a, clip.b]);
    manifest.bridges[`${clip.a}>${clip.b}`] = { ...bt, land: meta.land, files };
  } else if (clip.kind === "calm")
    manifest.calm = { ...info.calm, length: meta.length, pad: meta.pad, files };
  manifest.done.push(clip.key);
  save();
  console.log(
    `${clip.key.padEnd(28)} ${(len / sr).toFixed(1).padStart(5)} s  peak ${dB(pk * room).toFixed(1)} dB  ` +
      Object.entries(gains)
        .map(([k, g]) => `${k} ${dB(g).toFixed(1)}`)
        .join(" · "),
  );
}

/** Render a list of clips on a few pages in parallel. */
async function pool(list) {
  let next = 0;
  const work = async (page) => {
    while (next < list.length) await renderClip(page, list[next++]);
  };
  await Promise.all(pages.map(work));
}

while (pages.length < PAGES) pages.push(await openPage());
const todo = [...clips.values()].filter((c) => !manifest.done.includes(c.key));
await pool(todo.filter((c) => c.kind !== "intro"));
await pool(todo.filter((c) => c.kind === "intro")); // intros reuse their song's gains

// drop audio files the manifest no longer points at
const keep = new Set([manifest.calib?.file]);
for (const t of Object.values(manifest.tracks)) {
  for (const f of Object.values(t.files || {})) keep.add(f);
  for (const f of Object.values(t.intro?.files || {})) keep.add(f);
}
for (const b of Object.values(manifest.bridges))
  for (const f of Object.values(b.files)) keep.add(f);
for (const f of Object.values(manifest.calm?.files || {})) keep.add(f);
for (const f of readdirSync(OUT)) if (f.endsWith(".mp3") && !keep.has(f)) rmSync(join(OUT, f));

manifest.complete = true;
delete manifest.done;
save();
let bytes = 0;
for (const f of keep) bytes += readFileSync(join(OUT, f)).length;
console.log(
  `music: ${keep.size} files, ${(bytes / 1e6).toFixed(1)} MB (${(totalBytes / 1e6).toFixed(1)} MB new) in ` +
    `${((Date.now() - t0) / 1000).toFixed(0)} s (hash ${manifest.hash})`,
);
await browser.close();
await server.close();
