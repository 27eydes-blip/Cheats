#!/usr/bin/env node
// Option 2: turn an iPhone screen recording into the same promo edits (text, beat cuts, logo end).
//
//   node iphone.mjs ~/Downloads/RPReplay_Final1730.MP4                       # all 4 videos, auto-picked moments
//   node iphone.mjs rec.mov --template abyss-tiktok --at hook=12.4 --at calm=41 --at abyss=47.5
//   node iphone.mjs run1.mov run2.mov --at hook=1:8.2 --at death=2:63     # "<file#>:<seconds>"
//   node iphone.mjs rec.mov --marks marks.json                             # {"hook": 12.4, "calm": "2:41"}
//
// --at <segment>=<time> marks WHEN the moment happens (the edit adds its own lead-in, like it does
// for recorded events). Segment names are the "id"s in config/edits/*.json:
//   hook nearmiss2 solar frozen glitch yarms tiger calm abyss eyebeam death leaderboard shop
// Anything you don't mark is chosen automatically (and printed, so you can correct it with --at).
// Moments that can't be found automatically (heroes, menus) are skipped unless marked.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readJson, renderEdl } from "./lib/edit.mjs";
import { decodeMono, ffmpeg, probe } from "./lib/ffmpeg.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    template: { type: "string", default: "all" },
    at: { type: "string", multiple: true, default: [] },
    marks: { type: "string" },
    "crop-top": { type: "string", default: "auto" },
    "crop-bottom": { type: "string", default: "auto" },
    out: { type: "string", default: join(ROOT, "output") },
    suffix: { type: "string", default: "-iphone" },
    tmp: { type: "string", default: join(ROOT, ".tmp") },
  },
});
if (!files.length) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), "utf8")
      .split("\n")
      .slice(1, 15)
      .map((l) => l.replace(/^\/\/ ?/, ""))
      .join("\n"),
  );
  process.exit(1);
}

// ---------- analysis
const AW = 24;
const AH = 52;
const AFPS = 10;
const Q = Uint8Array.from({ length: 256 }, (_, v) =>
  Math.min(7, Math.floor(Math.sqrt(v / 255) * 8)),
);

async function analyse(file) {
  const info = await probe(file);
  if (!info.video) throw new Error(`${file} has no video stream`);
  const raw = await ffmpeg([
    "-i",
    file,
    "-vf",
    `fps=${AFPS},scale=${AW}:${AH}:flags=area`,
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  const fsz = AW * AH * 3;
  const n = Math.floor(raw.length / fsz);
  const motion = new Float32Array(n);
  const scene = new Float32Array(n);
  const rowVar = new Float64Array(AH);
  const rowMean = new Float64Array(AH);
  const hists = [];
  for (let f = 0; f < n; f++) {
    const o = f * fsz;
    const hist = new Float32Array(512);
    let m = 0;
    for (let y = 0; y < AH; y++) {
      let rowSum = 0;
      for (let x = 0; x < AW; x++) {
        const i = o + (y * AW + x) * 3;
        const r = raw[i];
        const g = raw[i + 1];
        const b = raw[i + 2];
        // 8 levels per channel on a sqrt curve so dark palettes (space realms) still separate
        hist[(Q[r] << 6) | (Q[g] << 3) | Q[b]]++;
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        rowSum += lum;
        if (f) {
          const j = i - fsz;
          m += Math.abs(lum - (0.3 * raw[j] + 0.59 * raw[j + 1] + 0.11 * raw[j + 2]));
        }
      }
      // running per-row temporal variance (Welford-ish) to find static UI bands
      const v = rowSum / AW;
      const d = v - rowMean[y];
      rowMean[y] += d / (f + 1);
      rowVar[y] += d * (v - rowMean[y]);
    }
    motion[f] = m / (AW * AH);
    hists.push(hist);
  }
  // scene change = how different the 1s after a point looks from the 1s before it
  // (persistent palette changes like realm transitions score high; one-frame flashes don't)
  const avg = (a0, a1) => {
    const h = new Float32Array(512);
    for (let f = a0; f < a1; f++) for (let k = 0; k < 512; k++) h[k] += hists[f][k] / (a1 - a0);
    return h;
  };
  for (let f = AFPS; f < n - AFPS; f++) {
    const b = avg(f - AFPS, f);
    const a2 = avg(f, f + AFPS);
    let d = 0;
    for (let k = 0; k < 512; k++) d += Math.abs(b[k] - a2[k]);
    scene[f] = d / (2 * AW * AH);
  }
  // audio loudness per analysis frame + onset strength
  const loud = new Float32Array(n);
  const onset = new Float32Array(n);
  if (info.audio) {
    const pcm = await decodeMono(file, { rate: 8000 });
    const hop = 8000 / AFPS;
    let prev = 0;
    for (let f = 0; f < n; f++) {
      let s = 0;
      for (let i = f * hop; i < (f + 1) * hop && i < pcm.length; i++) s += pcm[i] * pcm[i];
      const db = 10 * Math.log10(s / hop + 1e-10);
      loud[f] = db;
      onset[f] = Math.max(0, db - prev);
      prev = db;
    }
  }
  // static bands at top/bottom (status bar, Safari toolbar): rows that never change
  const vars = Array.from(rowVar, (v) => v / Math.max(1, n));
  const live = Math.max(...vars) * 0.02;
  const maxBand = Math.floor(AH * 0.16);
  let top = 0;
  while (top < maxBand && vars[top] < live) top++;
  let bottom = 0;
  while (bottom < maxBand && vars[AH - 1 - bottom] < live) bottom++;
  const rot = Math.abs(info.video.rotation) % 180 === 90;
  const w = rot ? info.video.height : info.video.width;
  const h = rot ? info.video.width : info.video.height;
  return {
    file,
    info,
    w,
    h,
    n,
    motion,
    scene,
    loud,
    onset,
    duration: info.duration,
    autoCrop: { top: Math.round((top / AH) * h), bottom: Math.round((bottom / AH) * h) },
  };
}

const smooth = (arr, r) =>
  arr.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
      s += arr[j];
      c++;
    }
    return s / c;
  });
const z = (arr) => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) || 1;
  return arr.map((v) => (v - m) / sd);
};

/** Heuristic moment finder. Returns { id: {file, t} } for whatever it can find. */
function autoMarks(an, used, manual) {
  const out = {};
  const a = an[0];
  const T = (f) => f / AFPS;
  const taken = Object.values(manual)
    .filter((m) => m.file === 0)
    .map((m) => m.t);
  const free = (t, gap = 2.5) => taken.every((x) => Math.abs(x - t) > gap);
  const zm = z(Array.from(a.motion));
  const zo = z(Array.from(a.onset));
  const intensity = smooth(
    zm.map((v, i) => v + zo[i] * 0.7),
    6,
  );
  // calm: biggest sustained loudness drop (loud 3s before, quiet 3s after)
  const L = smooth(Array.from(a.loud), 5);
  let calm = null;
  for (let f = 30; f < a.n - 30; f++) {
    const before = L.slice(f - 30, f).reduce((x, y) => x + y, 0) / 30;
    const after = L.slice(f, f + 30).reduce((x, y) => x + y, 0) / 30;
    const d = before - after;
    if (!calm || d > calm.d) calm = { f, d };
  }
  if (calm && calm.d > 6) {
    out.calm = T(calm.f);
    taken.push(out.calm);
    // abyss: the biggest loudness jump after the calm
    let ab = null;
    for (let f = calm.f + 20; f < a.n - 5; f++) {
      const d = L[f + 3] - L[f - 3];
      if (!ab || d > ab.d) ab = { f, d };
    }
    if (ab) {
      out.abyss = T(ab.f);
      out.eyebeam = out.abyss + 2.6;
      taken.push(out.abyss, out.eyebeam);
    }
  }
  // death: screen recordings usually stop shortly after the game-over screen appears
  out.death = Math.max(0, a.duration - 2.4);
  taken.push(out.death);
  // realm transitions: the biggest colour-histogram jumps, in chronological order
  const sc = Array.from(a.scene)
    .map((v, f) => ({ f, v }))
    .sort((x, y) => y.v - x.v);
  const realms = [];
  for (const s of sc) {
    if (realms.length >= 3 || s.v < 0.12) break;
    if (free(T(s.f), 4)) {
      realms.push(T(s.f));
      taken.push(T(s.f));
    }
  }
  realms.sort((x, y) => x - y);
  ["solar", "frozen", "glitch"].forEach((id, i) => realms[i] != null && (out[id] = realms[i]));
  // hook & second near-miss: the two most intense moments left
  const peaks = intensity.map((v, f) => ({ f, v })).sort((x, y) => y.v - x.v);
  for (const id of ["hook", "nearmiss2"]) {
    const p = peaks.find((q) => free(T(q.f)) && T(q.f) > 1 && T(q.f) < a.duration - 4);
    if (p) {
      out[id] = T(p.f);
      taken.push(out[id]);
    }
  }
  return Object.fromEntries(
    Object.entries(out)
      .filter(([id]) => used.has(id))
      .map(([id, t]) => [id, { file: 0, t, auto: true }]),
  );
}

// ---------- marks
function parseTime(v) {
  const s = String(v);
  const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/) || s.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`bad time "${v}" (use seconds like 12.4, or file#:seconds like 2:12.4)`);
  return { file: m[1] ? Number(m[1]) - 1 : 0, t: Number(m[2]) };
}
const marks = {};
if (opt.marks) for (const [k, v] of Object.entries(readJson(opt.marks))) marks[k] = parseTime(v);
for (const a of opt.at) {
  const [k, v] = a.split("=");
  marks[k] = parseTime(v);
}

// ---------- run
const editsDir = join(ROOT, "config/edits");
const edls = readdirSync(editsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJson(join(editsDir, f)))
  .filter((e) => opt.template === "all" || opt.template.split(",").includes(e.id));
if (!edls.length) throw new Error(`unknown --template ${opt.template}`);

console.log("analysing recording(s)…");
const an = [];
for (const f of files) {
  if (!existsSync(f)) throw new Error(`no such file: ${f}`);
  an.push(await analyse(resolve(f)));
}
const used = new Set(edls.flatMap((e) => e.segments.map((s) => s.id)));
const found = { ...autoMarks(an, used, marks), ...marks };

const sources = an.map((a) => {
  const top = opt["crop-top"] === "auto" ? a.autoCrop.top : Number(opt["crop-top"]);
  const bottom = opt["crop-bottom"] === "auto" ? a.autoCrop.bottom : Number(opt["crop-bottom"]);
  const pre = [];
  const tr = a.info.video.transfer;
  if (tr === "arib-std-b67" || tr === "smpte2084") {
    // HDR (HLG/PQ) screen recording -> SDR, otherwise colours look washed out on most phones
    pre.push(
      "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p",
    );
  }
  const h = a.h - top - bottom;
  if (top || bottom) pre.push(`crop=${a.w}:${h - (h % 2)}:0:${top}`);
  console.log(
    `  ${a.file}\n    ${a.w}x${a.h} ${a.info.video.fps.toFixed(1)}fps ${a.duration.toFixed(1)}s` +
      `${tr ? ` (${tr})` : ""}  crop top ${top}px / bottom ${bottom}px${a.info.audio ? "" : "  ⚠ no audio track"}`,
  );
  return {
    file: a.file,
    hasAudio: !!a.info.audio,
    w: a.w,
    h: h - (h % 2),
    duration: a.duration,
    prefilter: pre.join(",") || null,
    scaleMode: "smooth",
    meta: { events: [] },
  };
});

console.log("\nmoments (seconds into the recording; fix any with --at <name>=<time>):");
for (const id of used) {
  const m = found[id];
  console.log(
    `  ${id.padEnd(12)} ${m ? `${files.length > 1 ? `${m.file + 1}:` : ""}${m.t.toFixed(1)}s${m.auto ? "  (auto)" : ""}` : "— not found, skipped"}`,
  );
}

for (const edl of edls) {
  const e = structuredClone(edl);
  e.out = (e.out || `${e.id}.mp4`).replace(/\.mp4$/, `${opt.suffix}.mp4`);
  e.id += opt.suffix;
  const skipped = e.segments.filter((s) => !found[s.id]).map((s) => s.id);
  e.segments = e.segments
    .filter((s) => found[s.id])
    .map((s) => {
      const m = found[s.id];
      const src = sources[m.file];
      if (!src) throw new Error(`--at ${s.id}: there is no recording #${m.file + 1}`);
      const startAt = Math.min(
        Math.max(0, m.t),
        Math.max(0, an[m.file].duration - s.dur - 0.05) + (s.pre ?? 0),
      );
      return {
        ...s,
        event: undefined,
        in: startAt,
        _src: m.file,
        fit: s.fit === "contain" ? "contain" : "cover",
      };
    });
  if (!e.segments.length) throw new Error("no usable moments — mark some with --at");
  // texts tied to skipped segments are dropped; the rest stay on their segments
  e.texts = (e.texts || []).filter((t) => !t.seg || !skipped.includes(t.seg));
  if (skipped.length)
    console.log(`\n  ${edl.id}: skipping ${skipped.join(", ")} (mark them with --at to include)`);
  await renderEdl(e, async (seg) => sources[seg._src], {
    outDir: opt.out,
    tmpRoot: opt.tmp,
    scaleMode: "smooth",
  });
}
