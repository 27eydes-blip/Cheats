#!/usr/bin/env node
// Records the Glydrift demo reel: a lossless 60 fps master video + the game's own audio.
//
//   node marketing/record.cjs            (expects a fresh `npm run build` in glydrift/dist)
//
// Pass 1 (video): the game is advanced in exact 1/60 s steps and every frame is read straight
//   off the canvas, so the footage is perfectly smooth no matter how slowly this machine
//   renders (game time is effectively slowed while recording and played back at 60 fps).
// Pass 2 (audio): the same reel replays in real time without drawing (logic only is cheap),
//   while every sound the page plays is captured with a MediaRecorder. Deterministic seeding
//   makes both passes identical; the event logs are compared to prove it.
// Outputs (marketing/work/): master.mkv (390x844, 60 fps, lossless), audio.wav, events.json
const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const { serve } = require("./lib/server.cjs");
const { openDemo } = require("./lib/page.cjs");

const ROOT = __dirname;
const WORK = path.join(ROOT, "work");
const DIST = path.join(ROOT, "..", "dist-test");
const SEED = +(process.env.REEL_SEED || 20261102);

async function videoPass(url) {
  console.log("[video] stepping + capturing every frame at 60 fps…");
  const { browser, G, errors } = await openDemo(url);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", "60", "-c:v", "png", "-i", "-",
    "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", path.join(WORK, "master.mkv")], { stdio: ["pipe", "inherit", "inherit"] });
  await G((seed) => { const D = window.__demo; D.reel.seed = seed; D.reel.on = true; }, SEED);
  const t0 = Date.now();
  let frames = 0;
  for (;;) {
    const batch = await G(() => {
      const D = window.__demo;
      const out = [];
      for (let i = 0; i < 20 && !D.reel.done; i++) {
        D.step(true);
        out.push(window.__glydrift.canvas.toDataURL("image/png"));
      }
      return { out, done: D.reel.done };
    });
    for (const u of batch.out) {
      const buf = Buffer.from(u.slice(u.indexOf(",") + 1), "base64");
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    frames += batch.out.length;
    if (frames % 600 < 20) console.log(`[video] ${frames} frames (${(frames / 60).toFixed(0)} s of game) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (batch.done) break;
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  const events = await G(() => window.__demo.events);
  await browser.close();
  if (errors.length) console.log("[video] page errors:", errors);
  return { frames, events };
}

async function audioPass(url) {
  console.log("[audio] replaying the reel in real time and recording the game's audio…");
  const { browser, G, errors } = await openDemo(url, { audio: true });
  const res = await G(async (seed) => {
    const D = window.__demo;
    const ctx = window.__tapCtx;
    if (!ctx?.__tap) return { error: "no audio graph captured" };
    const rec = new MediaRecorder(ctx.__tap.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 256000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let recStart = 0;
    const started = new Promise((r) => (rec.onstart = () => { recStart = performance.now(); r(); }));
    rec.start(250);
    await started;
    await new Promise((r) => setTimeout(r, 400));
    D.reel.seed = seed;
    D.reel.on = true;
    const DT = 1000 / 60;
    const t0 = performance.now();
    let maxLag = 0;
    await new Promise((resolve) => {
      const tick = () => {
        const due = Math.floor((performance.now() - t0) / DT);
        maxLag = Math.max(maxLag, due - D.frame);
        let n = 0;
        while (D.frame <= due && !D.reel.done && n < 40) { D.step(false); n++; }
        if (D.reel.done) resolve(); else setTimeout(tick, 2);
      };
      tick();
    });
    await new Promise((r) => setTimeout(r, 600));
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: "audio/webm" });
    const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    return { b64, offsetMs: t0 - recStart, maxLagFrames: maxLag, events: D.events, frames: D.frame };
  }, SEED);
  await browser.close();
  if (res.error) throw new Error(res.error);
  if (errors.length) console.log("[audio] page errors:", errors);
  fs.writeFileSync(path.join(WORK, "audio.webm"), Buffer.from(res.b64, "base64"));
  // frame 0 of the video == the first logic step == t0 in the recording
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", (res.offsetMs / 1000).toFixed(4), "-i", path.join(WORK, "audio.webm"),
    "-ac", "2", "-ar", "48000", path.join(WORK, "audio.wav")]);
  console.log(`[audio] recorded; worst real-time lag ${res.maxLagFrames} frames`);
  return res;
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(path.join(DIST, "index.html"))) throw new Error("build the game first: npm run build");
  const srv = await serve(DIST);
  try {
    if (process.env.AUDIO_ONLY) {
      const a = await audioPass(srv.url);
      for (const e of a.events) console.log("   ", JSON.stringify(e));
      return;
    }
    const v = await videoPass(srv.url);
    const a = await audioPass(srv.url);
    const key = (e) => `${e.type}@${e.frame}`;
    const same = v.events.length === a.events.length && v.events.every((e, i) => key(e) === key(a.events[i]));
    fs.writeFileSync(path.join(WORK, "events.json"), JSON.stringify({ seed: SEED, fps: 60, frames: v.frames, events: v.events, audioEvents: a.events, deterministic: same }, null, 1));
    console.log(same ? "[check] video and audio passes are identical (event-for-event, frame-for-frame)" : "[check] WARNING: passes diverged — audio may drift");
    for (const e of v.events) console.log("   ", JSON.stringify(e));
  } finally {
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
