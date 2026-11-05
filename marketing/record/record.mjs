#!/usr/bin/env node
// Records each moment in config/moments.json to clips/<name>.mp4 (+ .json with events).
//
//   GLYDRIFT_URL=http://localhost:5173/ node record/record.mjs            # all moments
//   node record/record.mjs --only nearmiss,abyss --url http://localhost:5173/
//   node record/record.mjs --moments test/moments.json --adapter test/fixture.adapter.js
//
// Capture is frame-locked: the page runs on a virtual clock that only advances when we step it,
// so game time slows to whatever the browser can render and the footage still plays back at a
// perfectly smooth constant rate. Audio is rendered offline on the same clock (in sync).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FFMPEG, ffmpeg } from "../lib/ffmpeg.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values: opt } = parseArgs({
  options: {
    url: { type: "string", default: process.env.GLYDRIFT_URL || "http://localhost:5173/" },
    moments: { type: "string", default: join(ROOT, "config/moments.json") },
    adapter: { type: "string", default: join(ROOT, "config/glydrift.adapter.js") },
    out: { type: "string", default: join(ROOT, "clips") },
    only: { type: "string" },
    headed: { type: "boolean", default: false },
    "capture-fps": { type: "string", default: "30" },
  },
});

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const { createRequire } = await import("node:module");
  ({ chromium } = createRequire(import.meta.url)("playwright"));
}

const W = 390;
const H = 844;
const SIM_HZ = 60;
const CAP_FPS = Number(opt["capture-fps"]);
const STEPS_PER_CAPTURE = Math.round(SIM_HZ / CAP_FPS);
const FRAME_MS = 1000 / SIM_HZ;
const inject = (f) => readFileSync(join(ROOT, "record/inject", f), "utf8");

const cfgAll = JSON.parse(readFileSync(resolve(opt.moments), "utf8"));
const only = opt.only?.split(",");
const moments = cfgAll.moments.filter((m) => !only || only.includes(m.name));
mkdirSync(opt.out, { recursive: true });

const browser = await chromium.launch({
  headless: !opt.headed,
  // keep audio + timers running even though nothing is "visible"
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});

for (const m of moments) {
  const t0 = Date.now();
  console.log(`\n● ${m.name}`);
  await recordMoment(m);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();

async function recordMoment(m) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().startsWith("[rec"))
      console.log(`  [page] ${msg.text()}`);
  });
  page.on("pageerror", (e) => console.log(`  [page error] ${e.message}`));

  // Network: never let a demo run write to the real backend (scores, leaderboard). GETs pass.
  const mocks = [...(cfgAll.mocks || []), ...(m.mocks || [])];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const mock = mocks.find(
      (x) => new RegExp(x.match).test(req.url()) && (!x.method || x.method === req.method()),
    );
    if (mock)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mock.json),
      });
    if (
      req.method() !== "GET" &&
      req.method() !== "HEAD" &&
      !(cfgAll.allowWrites || []).some((r) => new RegExp(r).test(req.url()))
    ) {
      console.log(`  blocked ${req.method()} ${req.url()}`);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  const maxSeconds =
    (m.boot ?? 15) +
    (m.warmup ?? 0) +
    (m.record ?? 10) +
    (m.after ?? 0) +
    (m.setup || []).reduce((s, x) => s + (x.wait || 0), 0) +
    10;
  const recCfg = {
    demo: true,
    seed: m.seed ?? 1,
    epoch: Date.UTC(2026, 10, 5, 20),
    audioSeconds: maxSeconds,
    ...m.rec,
  };
  await page.addInitScript(`window.__REC_CFG__ = ${JSON.stringify(recCfg)};`);
  await page.addInitScript(inject("virtual-time.js"));
  await page.addInitScript(inject("offline-audio.js"));
  await page.addInitScript(readFileSync(resolve(opt.adapter), "utf8"));
  await page.addInitScript(inject("demo-bot.js"));

  const url = new URL(m.url || "", opt.url);
  url.searchParams.set("demo", "");
  await page.goto(url.toString().replace("demo=", "demo"), { waitUntil: "load" });

  // boot: step virtual frames until the adapter says the game is ready
  // (real-time loop so asset fetches / decoding can finish between virtual frames)
  let ok = false;
  for (const until = Date.now() + (m.boot ?? 15) * 1000; !ok && Date.now() < until; ) {
    ok = await page.evaluate(() => {
      if (window.__glyAdapter?.ready?.()) return true;
      window.__rec.frame(1000 / 60);
      return false;
    });
    if (!ok) await new Promise((r) => setTimeout(r, 4));
  }
  if (!ok)
    throw new Error(
      `${m.name}: adapter.ready() never returned true — check config/glydrift.adapter.js`,
    );

  // staging: setup calls run against the adapter, with optional fast-forward waits
  const stepAll = (sec) => page.evaluate((ms) => window.__rec.run(ms), sec * 1000);
  for (const s of m.setup || []) {
    if (s.wait) await stepAll(s.wait);
    if (s.call) {
      await page.evaluate(
        ([fn, args]) => {
          const ad = window.__glyAdapter;
          if (typeof ad[fn] !== "function") throw new Error(`adapter.${fn}() is not implemented`);
          return ad[fn](...(args || []));
        },
        [s.call, s.args],
      );
    }
    if (s.bot) await page.evaluate((b) => Object.assign(window.__demoBot, b), s.bot);
  }
  if (m.warmup) await stepAll(m.warmup);

  // capture
  const clip = join(opt.out, `${m.name}.mkv`);
  const silent = join(opt.out, `${m.name}.video.mkv`);
  const enc = spawn(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(CAP_FPS),
      "-c:v",
      "png",
      "-i",
      "pipe:0",
      "-c:v",
      "libx264rgb",
      "-preset",
      "ultrafast",
      "-crf",
      "0",
      silent,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const startMs = await page.evaluate(() => window.__rec.now);
  const maxFrames = Math.round((m.record ?? 10) * CAP_FPS);
  let afterLeft = m.until ? -1 : Infinity;
  let frames = 0;
  const tCap = Date.now();
  for (; frames < maxFrames && afterLeft !== 0; frames++) {
    const status = await page.evaluate(
      ([n, ms, until]) => {
        for (let i = 0; i < n; i++) window.__rec.frame(ms);
        return until ? (window.__demoBot?.events || []).some((e) => e.type === until) : false;
      },
      [STEPS_PER_CAPTURE, FRAME_MS, m.until],
    );
    if (status && afterLeft < 0) afterLeft = Math.round((m.after ?? 3) * CAP_FPS);
    if (afterLeft > 0) afterLeft--;
    const png = await page.screenshot({ type: "png", animations: "allow", caret: "hide" });
    if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r));
    if (frames % CAP_FPS === 0)
      process.stdout.write(`\r  ${(frames / CAP_FPS).toFixed(0)}s captured`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on("close", r));
  const real = (Date.now() - tCap) / 1000;
  const gameSec = frames / CAP_FPS;
  console.log(
    `\r  ${gameSec.toFixed(1)}s of game time captured in ${real.toFixed(1)}s real time ` +
      (real < gameSec * 1.05
        ? "(browser kept up, no slow-down needed)"
        : `(game slowed to ${((100 * gameSec) / real).toFixed(0)}% speed while recording)`),
  );

  // audio: render the whole take offline, then cut out the captured window
  const audio = await page.evaluate((s) => window.__recAudio?.render(s), maxSeconds);
  const wav = join(opt.out, `${m.name}.wav`);
  if (audio) {
    const CH = 4 * 1024 * 1024;
    const parts = [];
    for (let i = 0; i * CH < audio.bytes; i++)
      parts.push(
        Buffer.from(
          await page.evaluate(([i, CH]) => window.__recAudio.chunk(i, CH), [i, CH]),
          "base64",
        ),
      );
    writeFileSync(wav, Buffer.concat(parts));
    console.log(
      `  audio rendered (peak ${audio.peak.toFixed(2)}, ${audio.deferredOps} timed graph changes)`,
    );
    if (audio.peak < 0.001)
      console.warn("  ! audio is silent — did the game create its AudioContext?");
  } else console.warn("  ! game never created an AudioContext; clip will be silent");

  const offset = startMs / 1000;
  await ffmpeg([
    "-i",
    silent,
    ...(audio ? ["-ss", offset.toFixed(4), "-i", wav] : []),
    "-map",
    "0:v",
    ...(audio ? ["-map", "1:a", "-c:a", "pcm_s16le", "-shortest"] : []),
    "-c:v",
    "copy",
    clip,
  ]);
  rmSync(silent, { force: true });
  rmSync(wav, { force: true });

  // events, rebased to clip time
  const raw = await page.evaluate(() => window.__demoBot?.events || []);
  const events = raw
    .map((e) => ({ ...e, t: (e.t - startMs) / 1000 }))
    .filter((e) => e.t >= 0 && e.t <= gameSec);
  events.push(...chains(events));
  writeFileSync(
    join(opt.out, `${m.name}.json`),
    JSON.stringify(
      {
        name: m.name,
        width: W,
        height: H,
        fps: CAP_FPS,
        duration: gameSec,
        events,
      },
      null,
      2,
    ),
  );
  const counts = events.reduce((o, e) => ((o[e.type] = (o[e.type] || 0) + 1), o), {});
  console.log(`  events: ${JSON.stringify(counts)}`);
  await ctx.close();
}

/** Densest near-miss windows => "chain" events (best = most near-misses in 2.5s). */
function chains(events) {
  const nm = events.filter((e) => e.type === "nearMiss").map((e) => e.t);
  const out = [];
  for (let i = 0; i < nm.length; i++) {
    let j = i;
    while (j + 1 < nm.length && nm[j + 1] - nm[i] <= 2.5) j++;
    if (j - i >= 2)
      out.push({ type: "chain", t: nm[i], end: nm[j], count: j - i + 1, score: j - i + 1 });
  }
  return out;
}
