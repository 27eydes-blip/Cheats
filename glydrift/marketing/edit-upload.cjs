#!/usr/bin/env node
// Option 2: turn your own iPhone screen recording into the same style of TikTok edit.
//
//   node marketing/edit-upload.cjs my-recording.mp4 [options]
//
//   --out FILE            output (default: marketing/output/<name>_tiktok.mp4)
//   --length SECONDS      target length before the logo (default 21)
//   --hook "TEXT"         opening text, 0-2 s          (default "POV: you made it to the Abyss")
//   --end "TEXT"          last-3-seconds text          (default "GLYDRIFT · coming soon")
//   --text "AT|TEXT"      extra caption at a time in the FINAL video, repeatable,
//                         e.g. --text "12|it gets quiet..." --text "15|...too quiet"
//   --cuts "S:D,S:D,..."  use these source moments (start:duration seconds) instead of auto
//   --skip-top PX         pixels of the recording to drop at the top (status bar; default auto)
//
// Auto mode picks highlights from the recording's own audio: the loudest moments (near-miss
// whooshes, deaths, biome stingers) become 1-3 s cuts, the loudest one opens the video as the
// hook, cut lengths follow the music's detected tempo, and it ends on the Glydrift logo.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const L = require("./lib/edit-lib.cjs");

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--") && !/^\d/.test(a) && fs.existsSync(a));
if (!input) {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const extraTexts = args.flatMap((a, i) => (a === "--text" ? [args[i + 1]] : []));
const WORK = path.join(__dirname, "work", `upload_${path.basename(input, path.extname(input))}`);
const OUT = opt("out", path.join(__dirname, "output", `${path.basename(input, path.extname(input))}_tiktok.mp4`));

function probe(file) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  return { w: v.width, h: v.height, dur: +j.format.duration, hasAudio: !!a, rotate: +(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0) };
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const info = probe(input);
  console.log(`[upload] ${input}: ${info.w}x${info.h}, ${info.dur.toFixed(1)} s, audio=${info.hasAudio}`);

  // 1) normalise: portrait 1080x1920 cover (crop, never letterbox), 30 fps, audio 48 kHz
  //    (iPhone recordings are ~0.46 wide/tall; TikTok is 0.5625 → trim top/bottom)
  const norm = path.join(WORK, "normalized.mkv");
  const scaleW = L.W;
  const scaledH = Math.round((info.h * scaleW) / info.w);
  const extra = Math.max(0, scaledH - L.H);
  const skipTop = opt("skip-top") !== undefined ? +opt("skip-top") * (scaleW / info.w) : extra * 0.45; // keep a bit more of the bottom HUD
  const cropY = Math.round(Math.min(extra, Math.max(0, skipTop)));
  const vf = scaledH >= L.H
    ? `scale=${scaleW}:-2:flags=lanczos,crop=${L.W}:${L.H}:0:${cropY},fps=${L.FPS},setsar=1`
    : `scale=-2:${L.H}:flags=lanczos,crop=${L.W}:${L.H},fps=${L.FPS},setsar=1`;
  const audioIn = info.hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  L.ff(["-i", input, ...audioIn, "-vf", vf, ...(info.hasAudio ? [] : ["-map", "0:v", "-map", "1:a", "-shortest"]),
    "-c:v", "libx264", "-crf", "12", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", norm]);
  const wav = path.join(WORK, "audio.wav");
  L.ff(["-i", norm, "-vn", "-ac", "2", "-ar", "48000", wav]);
  const dur = L.probeDuration(norm);

  // 2) tempo + highlights from the audio
  const mono = L.readMono(wav);
  const on = L.onsetEnvelope(mono);
  const bpm = info.hasAudio ? L.estimateBpm(on) : 124;
  const grid = L.beatGrid(on, 0, dur, bpm);
  const beat = grid.beat;
  console.log(`[upload] tempo ≈ ${bpm} BPM`);
  const target = +opt("length", 21);
  let cuts;
  if (opt("cuts")) {
    cuts = opt("cuts").split(",").map((p) => { const [s, d] = p.split(":").map(Number); return { start: s, dur: L.q(d) }; });
  } else {
    const win = 0.25;
    const rms = L.rmsWindows(mono, win);
    // local loudness peaks above the track's own baseline, at least 3 s apart
    const sorted = rms.map((v, i) => ({ v, t: i * win })).filter((p) => p.t > 1 && p.t < dur - 2).sort((a, b) => b.v - a.v);
    const peaks = [];
    for (const p of sorted) {
      if (peaks.every((q) => Math.abs(q.t - p.t) >= 3)) peaks.push(p);
      if (peaks.length >= 14) break;
    }
    const hook = peaks[0];
    const rest = peaks.slice(1).sort((a, b) => a.t - b.t);
    const lens = [4, 3, 4, 3, 2, 4, 3]; // beats per cut (1-3 s) for rhythm
    cuts = [];
    let total = 0;
    const add = (p, nBeats, lead) => {
      const st = L.snap(Math.max(0, p.t - lead), [grid]).t;
      const d = L.q(Math.min(3, Math.max(1, nBeats * beat)));
      cuts.push({ start: Math.max(0, Math.min(dur - d, st)), dur: d });
      total += d;
    };
    add(hook, Math.round(2.05 / beat), 1.0); // the hook: ~2 s around the loudest moment
    for (let i = 0; i < rest.length && total < target - 0.8; i++) add(rest[i], lens[i % lens.length], 0.9);
  }

  // 3) cards + clips + logo
  const cards = await L.renderCards([
    { id: "hook", text: opt("hook", "POV: you made it<br>to the Abyss"), y: 420 },
    { id: "soon", text: opt("end", "GLYDRIFT · coming soon"), y: 1350, size: 64 },
    ...extraTexts.map((t, i) => ({ id: `x${i}`, text: t.split("|").slice(1).join("|"), y: 470 })),
  ], path.join(WORK, "cards"));
  const endCard = await L.renderEndCard(path.join(WORK, "cards", "endcard.png"));
  const files = cuts.map((c, i) => {
    const out = path.join(WORK, `c${String(i).padStart(2, "0")}.mkv`);
    // already 1080x1920: no further upscale, just trim (scale=1 keeps it untouched)
    L.renderClip({ video: norm, audio: wav, out, start: c.start, dur: c.dur, scale: 1, cropY: 0 });
    return out;
  });
  const last = cuts[cuts.length - 1];
  const logoOut = path.join(WORK, "logo.mkv");
  L.renderClip({ image: endCard, audio: wav, start: Math.min(dur - 1.6, last.start + last.dur), dur: 1.5, out: logoOut, fadeIn: 0.15, audioFadeOut: 0.9 });
  files.push(logoOut);
  const total = cuts.reduce((s, c) => s + c.dur, 0) + 1.5;
  const overlays = [
    { file: cards.hook, from: 0, to: Math.min(2, cuts[0].dur) },
    ...extraTexts.map((t, i) => { const at = +t.split("|")[0]; return { file: cards[`x${i}`], from: at, to: Math.min(total - 3, at + 2.2) }; }),
    { file: cards.soon, from: total - 3, to: total },
  ];
  L.finalize({ clips: files, overlays, out: OUT, workDir: WORK });
  console.log(`[upload] → ${OUT} (${L.probeDuration(OUT).toFixed(2)} s, ${cuts.length} cuts + logo)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
