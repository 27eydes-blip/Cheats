// Shared editing helpers: text cards + end card (rendered with the game's own font), beat
// detection on the recorded audio, and ffmpeg clip/concat/final passes.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const GAME = path.join(ROOT, "..");
const W = 1080;
const H = 1920;
const FPS = 30;

function ff(args, opts = {}) {
  return execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 1 << 30, ...opts });
}
function probeDuration(file) {
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
}

// ------------------------------------------------------------------ cards (Playwright)
function fontFace(family, file, weight) {
  const b64 = fs.readFileSync(file).toString("base64");
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};}`;
}
const FONTS = () =>
  fontFace("Orbitron", path.join(GAME, "node_modules/@fontsource/orbitron/files/orbitron-latin-900-normal.woff2"), 900) +
  fontFace("Rajdhani", path.join(GAME, "node_modules/@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2"), 700);

/**
 * Render text overlays (transparent 1080x1920 PNGs): bold white, thick black outline, kept
 * inside TikTok's safe area (never in the top 150 px or bottom 400 px).
 * cards: [{ id, text, y (centre, px), size }]
 */
async function renderCards(cards, outDir) {
  const { chromium } = require("playwright");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const files = {};
  for (const c of cards) {
    const size = c.size || 74;
    await page.setContent(`<html><head><style>${FONTS()}
      html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}
      .t{position:absolute;left:60px;width:960px;top:${c.y}px;transform:translateY(-50%);text-align:center;
         font:900 ${size}px/1.18 Orbitron;color:#fff;letter-spacing:1px;
         -webkit-text-stroke:${Math.round(size * 0.16)}px #000;paint-order:stroke fill;
         text-shadow:0 ${Math.round(size * 0.08)}px 0 #000,0 0 ${Math.round(size * 0.4)}px rgba(0,0,0,.55)}
      .band{left:50%;width:max-content;max-width:900px;transform:translate(-50%,-50%);padding:16px 38px 22px;
         background:rgba(2,1,7,.72);border-radius:26px;-webkit-text-stroke:0;text-shadow:0 0 18px rgba(62,244,255,.55)}
      .pill{left:50%;width:auto;white-space:nowrap;transform:translate(-50%,-50%);padding:18px 40px 22px;
         background:rgba(2,1,7,.82);border-radius:28px;box-shadow:0 0 0 4px rgba(62,244,255,.55),0 0 40px rgba(62,244,255,.35)}
    </style></head><body><div class="t${c.pill ? " pill" : ""}${c.band ? " band" : ""}">${c.text}</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.evaluate(() => { const r = document.querySelector(".t").getBoundingClientRect(); return [r.top, r.bottom]; });
    if (box[0] < 150 || box[1] > H - 400) throw new Error(`card "${c.text}" leaves the TikTok safe area (${box})`);
    const f = path.join(outDir, `${c.id}.png`);
    await page.screenshot({ path: f, omitBackground: true });
    files[c.id] = f;
  }
  await browser.close();
  return files;
}

/** End card: the Glydrift app icon + neon wordmark on the game's dark-space backdrop. */
async function renderEndCard(outFile) {
  const { chromium } = require("playwright");
  const icon = fs.readFileSync(path.join(GAME, "public/icon-512.png")).toString("base64");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<html><head><style>${FONTS()}
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;
      background:radial-gradient(circle at 50% 42%,#1b0f45 0%,#0a0420 45%,#020107 80%)}
    .icon{position:absolute;left:50%;top:560px;width:420px;height:420px;transform:translate(-50%,-50%);
      border-radius:96px;box-shadow:0 0 80px rgba(62,244,255,.55),0 0 160px rgba(180,92,255,.35);image-rendering:pixelated}
    .logo{position:absolute;left:0;width:100%;top:890px;text-align:center;font:900 138px Orbitron;color:#eaffff;
      letter-spacing:4px;text-shadow:0 0 18px #3ef4ff,0 0 46px #3ef4ff,0 0 90px #b45cff}
    .tag{position:absolute;left:0;width:100%;top:1080px;text-align:center;font:700 40px Rajdhani;color:#cfc6ff;letter-spacing:12px}
    .stars{position:absolute;inset:0;background-image:radial-gradient(2px 2px at 20% 30%,#9ff 50%,transparent 51%),
      radial-gradient(2px 2px at 80% 20%,#f9f 50%,transparent 51%),radial-gradient(3px 3px at 65% 75%,#fff 50%,transparent 51%),
      radial-gradient(2px 2px at 30% 82%,#9ff 50%,transparent 51%),radial-gradient(2px 2px at 88% 60%,#fff 50%,transparent 51%);opacity:.7}
  </style></head><body><div class="stars"></div><img class="icon" src="data:image/png;base64,${icon}">
  <div class="logo">GLYDRIFT</div><div class="tag">DRIFT THE NEON COSMOS</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outFile });
  await browser.close();
  return outFile;
}

// ------------------------------------------------------------------ audio analysis
function readMono(wav, rate = 22050) {
  const buf = ff(["-i", wav, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"]);
  return { data: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), rate };
}

/** Kick-drum onset strength every 10 ms (low-passed energy rise). */
function onsetEnvelope({ data, rate }) {
  const hop = Math.round(rate / 100);
  const a = Math.exp((-2 * Math.PI * 140) / rate);
  let lp = 0;
  const env = new Float32Array(Math.floor(data.length / hop));
  for (let i = 0, j = 0; j < env.length; j++) {
    let e = 0;
    for (let k = 0; k < hop; k++, i++) {
      lp = a * lp + (1 - a) * data[i];
      e += lp * lp;
    }
    env[j] = Math.sqrt(e / hop);
  }
  const on = new Float32Array(env.length);
  for (let j = 1; j < env.length; j++) on[j] = Math.max(0, env[j] - env[j - 1]);
  return on; // 100 values per second
}

/** Beat grid phase for a tempo inside [from, to] seconds (max onset alignment). */
function beatGrid(on, from, to, bpm) {
  const beat = 60 / bpm;
  const end = Math.min(to, on.length / 100); // analyse only where there is audio
  let best = 0;
  let bestScore = -1;
  for (let p = 0; p < beat; p += 0.005) {
    let sc = 0;
    for (let t = from + p; t < end; t += beat) {
      const j = Math.round(t * 100);
      sc += (on[j] || 0) + 0.5 * ((on[j - 1] || 0) + (on[j + 1] || 0));
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  return { from, to, bpm, beat, phase: from + best };
}

/** Loudness per window (RMS) — used to find highlight moments in uploaded recordings. */
function rmsWindows({ data, rate }, win = 0.25) {
  const n = Math.round(rate * win);
  const out = [];
  for (let i = 0; i + n <= data.length; i += n) {
    let s = 0;
    for (let k = 0; k < n; k++) s += data[i + k] * data[i + k];
    out.push(Math.sqrt(s / n));
  }
  return out;
}

/** Most likely tempo (90–160 BPM) from the onset envelope's autocorrelation. */
function estimateBpm(on) {
  let best = 124;
  let bestScore = -1;
  for (let bpm = 90; bpm <= 160; bpm += 0.5) {
    const lag = 6000 / bpm; // in 10 ms hops
    let sc = 0;
    for (let j = 0; j + lag * 4 < on.length; j += 1) sc += on[j] * (on[Math.round(j + lag)] + on[Math.round(j + lag * 2)] * 0.5);
    if (sc > bestScore) {
      bestScore = sc;
      best = bpm;
    }
  }
  return best;
}

// ------------------------------------------------------------------ timeline helpers
const q = (t, fps = FPS) => Math.round(t * fps) / fps;

/** Snap a time to the nearest beat of its tempo section. */
function snap(t, grids) {
  const g = grids.find((x) => t >= x.from && t < x.to) || grids[grids.length - 1];
  const k = Math.round((t - g.phase) / g.beat);
  return { t: g.phase + k * g.beat, g };
}

/**
 * A clip around a moment: starts on the beat nearest (moment - lead), lasts a whole number of
 * beats close to `want` seconds (so the cut lands on the beat too), quantised to video frames.
 */
function beatClip(name, moment, lead, want, grids, extra = {}) {
  const { t, g } = snap(moment - lead, grids);
  const n = Math.max(2, Math.round(want / g.beat));
  return { name, start: Math.max(0, t), dur: q(n * g.beat), bpm: g.bpm, ...extra };
}

// ------------------------------------------------------------------ ffmpeg passes
/**
 * Cut one clip from a source video/audio, upscale nearest-neighbour (crisp pixels), crop to
 * 1080x1920, 30 fps, with 12 ms audio fades so cuts never click.
 */
function renderClip({ video, audio, start, dur, out, scale = 3, cropY = 250, image = null, fadeIn = 0, audioFadeOut = 0.012 }) {
  const vf = image
    ? `fps=${FPS},scale=${W}:${H}:flags=neighbor,setsar=1${fadeIn ? `,fade=t=in:st=0:d=${fadeIn}` : ""}`
    : `fps=${FPS},scale=iw*${scale}:ih*${scale}:flags=neighbor,crop=${W}:${H}:(iw-${W})/2:${cropY},setsar=1`;
  const af = `aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, dur - audioFadeOut).toFixed(3)}:d=${audioFadeOut}`;
  const vin = image ? ["-loop", "1", "-framerate", String(FPS), "-t", String(dur), "-i", image] : ["-ss", start.toFixed(4), "-t", dur.toFixed(4), "-i", video];
  ff([...vin, "-ss", (image ? start : start).toFixed(4), "-t", dur.toFixed(4), "-i", audio,
    "-filter_complex", `[0:v]${vf}[v];[1:a]${af},apad=whole_dur=${dur.toFixed(4)}[a]`,
    "-map", "[v]", "-map", "[a]", "-t", dur.toFixed(4), "-c:v", "libx264", "-crf", "12", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-r", String(FPS), "-c:a", "pcm_s16le", out]);
  return out;
}

/** Concatenate clips, burn text overlays at their times, loudness-normalise, final H.264 MP4. */
function finalize({ clips, overlays, out, workDir }) {
  const list = path.join(workDir, `concat_${path.basename(out)}.txt`);
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(workDir, `joined_${path.basename(out, ".mp4")}.mkv`);
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  const inputs = ["-i", joined];
  let chain = "[0:v]null[v0]";
  overlays.forEach((o, i) => {
    inputs.push("-loop", "1", "-i", o.file);
    const fadeIn = `fade=t=in:st=${o.from.toFixed(3)}:d=0.12:alpha=1`;
    const fadeOut = `fade=t=out:st=${(o.to - 0.15).toFixed(3)}:d=0.15:alpha=1`;
    chain += `;[${i + 1}:v]format=rgba,${fadeIn},${fadeOut}[t${i}];[v${i}][t${i}]overlay=0:0:enable='between(t,${o.from.toFixed(3)},${o.to.toFixed(3)})':shortest=1[v${i + 1}]`;
  });
  ff([...inputs, "-filter_complex", `${chain};[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
    "-map", `[v${overlays.length}]`, "-map", "[a]",
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.2", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]);
  return out;
}

/**
 * Still images for X/Twitter posts (1600x900): a real game frame (crisp pixels, neon frame) on
 * the left, a headline in the game's font on the right, the icon + wordmark underneath.
 * stills: [{ id, frame (png path), title (html), sub }] → <outDir>/x_still_<id>.png
 */
async function renderStills(stills, outDir) {
  const { chromium } = require("playwright");
  const icon = fs.readFileSync(path.join(GAME, "public/icon-192.png")).toString("base64");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  for (const s of stills) {
    const shot = fs.readFileSync(s.frame).toString("base64");
    await page.setContent(`<html><head><style>${FONTS()}
      html,body{margin:0;width:1600px;height:900px;overflow:hidden;
        background:radial-gradient(circle at 70% 40%,#1b0f45 0%,#0a0420 50%,#020107 85%)}
      .shot{position:absolute;left:150px;top:40px;height:820px;border-radius:26px;image-rendering:pixelated;
        box-shadow:0 0 0 4px rgba(62,244,255,.7),0 0 60px rgba(62,244,255,.45),0 0 140px rgba(180,92,255,.35)}
      .r{position:absolute;left:700px;right:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
      h1{margin:0;font:900 92px/1.08 Orbitron;color:#fff;letter-spacing:2px;
        text-shadow:0 0 16px rgba(62,244,255,.8),0 0 50px rgba(180,92,255,.55)}
      p{margin:28px 0 0;font:700 44px/1.25 Rajdhani;color:#d6ceff}
      .brand{display:flex;align-items:center;gap:22px;margin-top:64px}
      .brand img{width:84px;height:84px;border-radius:20px;box-shadow:0 0 30px rgba(62,244,255,.5)}
      .brand b{font:900 54px Orbitron;color:#eaffff;letter-spacing:3px;text-shadow:0 0 14px #3ef4ff}
      .brand span{display:block;font:700 30px Rajdhani;color:#39ff88;letter-spacing:3px;margin-top:4px}
    </style></head><body>
      <img class="shot" src="data:image/png;base64,${shot}">
      <div class="r"><h1>${s.title}</h1><p>${s.sub}</p>
        <div class="brand"><img src="data:image/png;base64,${icon}"><div><b>GLYDRIFT</b><span>PLAY FREE IN YOUR BROWSER</span></div></div>
      </div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `x_still_${s.id}.png`) });
  }
  await browser.close();
}

module.exports = {
  renderStills,
  W, H, FPS, ff, probeDuration, renderCards, renderEndCard, readMono, onsetEnvelope, beatGrid, rmsWindows,
  estimateBpm, snap, beatClip, renderClip, finalize, q,
};
