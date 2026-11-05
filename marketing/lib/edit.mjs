// Edit-decision-list renderer: segments -> crisp scaled/cropped clips -> concat -> captions,
// end card, loudness and final H.264 encode. Used by build.mjs (recorded footage) and
// iphone.mjs (uploaded screen recordings).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { detectBeats, snap } from "./beats.mjs";
import { FFMPEG, ffmpeg, fpath, probe } from "./ffmpeg.mjs";
import { captionFont } from "./fonts.mjs";

const SR = 48000;
const MAX_BYTES = 49 * 1024 * 1024; // keep a safety margin under 50MB

const log = (...a) => console.log("  ", ...a);

/** Resolve the source window [in, dur] for a segment. */
function resolveWindow(seg, src) {
  let t = seg.in ?? 0;
  if (seg.event) {
    const evs = (src.meta?.events || []).filter((e) => e.type === seg.event);
    if (!evs.length) throw new Error(`segment "${seg.id}": no "${seg.event}" event in ${src.file}`);
    let ev;
    if (seg.pick === "best") ev = evs.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
    else if (seg.pick === "last") ev = evs[evs.length - 1];
    else ev = evs[Math.min(seg.pick ?? 0, evs.length - 1)];
    t = ev.t + (seg.offset ?? 0);
  }
  const startAt = Math.max(0, t - (seg.pre ?? 0));
  return { start: startAt, dur: seg.dur };
}

function pixelScale(src, W, H, fit, zoom = 1) {
  // integer nearest-neighbour factor so every game pixel becomes an identical k×k block
  const need = fit === "contain" ? Math.min(W / src.w, H / src.h) : Math.max(W / src.w, H / src.h);
  const k = Math.max(1, fit === "contain" ? Math.floor(need * zoom) : Math.ceil(need * zoom));
  return { sw: src.w * k, sh: src.h * k, k };
}

function videoChain(seg, src, cv, scaleMode) {
  const { w: W, h: H } = cv;
  const fit = seg.fit || "cover";
  const fx = seg.focusX ?? 0.5;
  const fy = seg.focusY ?? 0.5;
  const parts = [];
  if (src.prefilter) parts.push(src.prefilter); // e.g. iPhone HDR tonemap / status-bar crop
  if (seg.speed && seg.speed !== 1) parts.push(`setpts=PTS/${seg.speed}`);
  const crop = (sw, sh) =>
    `crop=${W}:${H}:${Math.round((sw - W) * fx)}:${Math.round((sh - H) * fy)}`;
  if (fit === "contain") {
    // whole frame visible, blurred & darkened copy fills the bars
    const flags = scaleMode === "pixel" ? "neighbor" : "lanczos";
    const fg =
      scaleMode === "pixel"
        ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=neighbor`
        : `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=${flags}`;
    return [
      `${parts.length ? parts.join(",") + "," : ""}split[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.18[bg]`,
      `[b]${fg}[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2`,
    ].join(";");
  }
  if (scaleMode === "pixel") {
    const { sw, sh } = pixelScale(src, W, H, "cover", seg.zoom);
    parts.push(`scale=${sw}:${sh}:flags=neighbor`, crop(sw, sh));
  } else {
    const z = seg.zoom ?? 1;
    const s = Math.max(W / src.w, H / src.h) * z;
    const sw = Math.ceil((src.w * s) / 2) * 2;
    const sh = Math.ceil((src.h * s) / 2) * 2;
    parts.push(`scale=${sw}:${sh}:flags=lanczos`, crop(sw, sh));
  }
  return parts.join(",");
}

async function renderSegment(seg, src, win, cv, fps, scaleMode, outFile) {
  const fades = [];
  if (seg.flash) fades.push(`fade=in:st=0:d=${seg.flash === true ? 0.12 : seg.flash}:color=white`);
  if (seg.fadeFromBlack) fades.push(`fade=in:st=0:d=${seg.fadeFromBlack}`);
  const outDur = win.dur / (seg.speed || 1);
  const vchain = videoChain(seg, src, cv, scaleMode);
  const vf = `[0:v]${vchain},fps=${fps},setsar=1${fades.length ? "," + fades.join(",") : ""},format=yuv444p[v]`;
  const atempo = seg.speed && seg.speed !== 1 ? `atempo=${seg.speed},` : "";
  const fadeOut = Math.max(0, outDur - 0.015).toFixed(4);
  const af =
    src.hasAudio && seg.audio !== "mute"
      ? `[0:a]${atempo}aresample=${SR},aformat=channel_layouts=stereo,apad,atrim=0:${outDur.toFixed(4)},afade=in:d=0.006,afade=out:st=${fadeOut}:d=0.015${seg.gain ? `,volume=${seg.gain}dB` : ""}[a]`
      : `anullsrc=r=${SR}:cl=stereo,atrim=0:${outDur.toFixed(4)}[a]`;
  await ffmpeg([
    "-ss",
    win.start.toFixed(4),
    "-t",
    win.dur.toFixed(4),
    "-i",
    src.file,
    "-filter_complex",
    `${vf};${af}`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    outDur.toFixed(4),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "10",
    "-g",
    String(fps),
    "-c:a",
    "pcm_s16le",
    "-ar",
    String(SR),
    outFile,
  ]);
  return outDur;
}

/** End card: blurred last frame + logo (pixel-scaled) + lines of text; audio = source tail, faded. */
async function renderEndCard(card, lastSeg, cv, fps, outFile, tmp) {
  const { w: W, h: H } = cv;
  const font = captionFont();
  const dur = card.dur ?? 1.5;
  const inputs = [];
  const filters = [];
  // background: the final frame of the previous segment, blurred & darkened
  if (lastSeg) {
    const frame = join(tmp, "endcard-bg.png");
    // decode the last second and keep overwriting one image: robust to short / odd-ended files
    await ffmpeg(["-sseof", "-1", "-i", lastSeg.file, "-update", "1", "-q:v", "2", frame]);
    inputs.push("-loop", "1", "-t", String(dur), "-i", frame);
    filters.push(
      `[0:v]scale=${W}:${H},boxblur=30:3,eq=brightness=-0.32:saturation=1.3,fps=${fps}[bg]`,
    );
  } else {
    inputs.push("-f", "lavfi", "-t", String(dur), "-i", `color=c=0x07060d:s=${W}x${H}:r=${fps}`);
    filters.push("[0:v]null[bg]");
  }
  let cur = "[bg]";
  const logo = card.logo && resolve(card.logo);
  const logoW = Math.round(W * (card.logoWidth ?? 0.72));
  let logoBottom = H * 0.5;
  if (logo && existsSync(logo)) {
    const m = await probe(logo);
    // integer nearest-neighbour so a pixel-art logo stays crisp
    const k = Math.max(1, Math.floor(logoW / m.video.width));
    const lw = m.video.width * k;
    const lh = m.video.height * k;
    const ly = Math.round(H * (card.logoY ?? 0.4) - lh / 2);
    logoBottom = ly + lh;
    inputs.push("-loop", "1", "-t", String(dur), "-i", logo);
    // "slam": logo starts 35% larger and snaps to size in 0.18s
    filters.push(
      `[1:v]scale=${lw}:${lh}:flags=neighbor,format=rgba,` +
        `scale=w='${lw}*(1+0.35*max(0\\,1-t/0.18))':h='${lh}*(1+0.35*max(0\\,1-t/0.18))':eval=frame:flags=neighbor[lg]`,
      `${cur}[lg]overlay=x='(W-w)/2':y='${ly + lh / 2}-h/2':eval=frame:format=auto[c0]`,
    );
    cur = "[c0]";
  } else {
    if (card.logo) console.warn(`  ! logo not found at ${card.logo}; using a text wordmark`);
    const t = join(tmp, "wordmark.txt");
    writeFileSync(t, card.wordmark || "GLYDRIFT");
    const size = Math.round(W * 0.15);
    const y = Math.round(H * (card.logoY ?? 0.4) - size / 2);
    logoBottom = y + size;
    filters.push(
      `${cur}drawtext=fontfile='${fpath(font)}':textfile='${fpath(t)}':fontcolor=white:` +
        `fontsize='${size}*(1+0.35*max(0\\,1-t/0.18))':borderw=${Math.round(size * 0.08)}:bordercolor=black:` +
        `x=(w-text_w)/2:y=${y + size / 2}-text_h/2[c0]`,
    );
    cur = "[c0]";
  }
  let y = logoBottom + Math.round(H * 0.035);
  (card.lines || []).forEach((line, i) => {
    const text = typeof line === "string" ? { text: line } : line;
    const size = Math.round(text.size ?? W * 0.068);
    const f = join(tmp, `card-line-${i}.txt`);
    writeFileSync(f, text.text);
    filters.push(
      `${cur}drawtext=fontfile='${fpath(font)}':textfile='${fpath(f)}':fontcolor=${text.color || "white"}:` +
        `fontsize=${size}:borderw=${Math.round(size * 0.1)}:bordercolor=black:x=(w-text_w)/2:y=${Math.round(y)}:` +
        `alpha='min(1\\,max(0\\,(t-${0.1 + i * 0.12})/0.12))'[l${i}]`,
    );
    cur = `[l${i}]`;
    y += size * 1.3;
  });
  filters.push(`${cur}format=yuv444p[v]`);
  // audio: the previous source keeps playing under the card and fades out
  const vIdx = inputs.filter((x) => x === "-i").length;
  if (lastSeg?.tail) {
    inputs.push("-ss", lastSeg.tail.start.toFixed(4), "-t", String(dur), "-i", lastSeg.tail.file);
    filters.push(
      `[${vIdx}:a]aresample=${SR},aformat=channel_layouts=stereo,apad,atrim=0:${dur},afade=in:d=0.006,afade=out:st=${dur * 0.35}:d=${dur * 0.65}[a]`,
    );
  } else filters.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${dur}[a]`);
  await ffmpeg([
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    String(dur),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "10",
    "-r",
    String(fps),
    "-c:a",
    "pcm_s16le",
    "-ar",
    String(SR),
    outFile,
  ]);
  return dur;
}

/** Greedy word wrap using an approximate glyph width for heavy sans fonts. */
function wrap(text, size, maxW) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length * size * 0.6 > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function captionFilters(texts, timeline, cv, safe, tmp) {
  const font = captionFont();
  const { w: W, h: H } = cv;
  const usableTop = safe.top;
  const usableBottom = H - safe.bottom;
  const maxW = W - safe.left - safe.right;
  const filters = [];
  texts.forEach((t, i) => {
    let start = t.start ?? 0;
    let end = t.end;
    if (t.seg) {
      const seg = timeline.find((s) => s.id === t.seg);
      if (!seg) throw new Error(`text "${t.text}": unknown segment "${t.seg}"`);
      start = seg.t0 + (t.start ?? 0);
      // beat snapping may have shortened the segment: never let its text bleed into the next one
      end =
        t.end != null && !t.overflow
          ? Math.min(seg.t0 + t.end, seg.t1)
          : t.end != null
            ? seg.t0 + t.end
            : seg.t1;
    }
    if (t.segEnd) {
      const seg = timeline.find((s) => s.id === t.segEnd);
      end = seg.t1 + (t.end ?? 0);
    }
    start = Math.max(0, start);
    let size = t.size ?? Math.round(W * 0.078);
    let lines = wrap(t.text, size, maxW);
    while (lines.some((l) => l.length * size * 0.6 > maxW) && size > 30) {
      size -= 4;
      lines = wrap(t.text, size, maxW);
    }
    const lh = Math.round(size * 1.18);
    const blockH = lh * lines.length;
    const anchors = {
      upper: usableTop + (usableBottom - usableTop) * 0.12,
      center: H / 2 - blockH / 2,
      lower: usableBottom - blockH - (usableBottom - usableTop) * 0.06,
    };
    let y0 = typeof t.pos === "number" ? t.pos * H - blockH / 2 : anchors[t.pos || "upper"];
    y0 = Math.round(Math.min(Math.max(y0, usableTop), usableBottom - blockH));
    const pop = t.pop !== false && start > 0.001;
    lines.forEach((line, j) => {
      const f = join(tmp, `cap-${i}-${j}.txt`);
      writeFileSync(f, line);
      const fs = pop ? `'${size}*(1+0.28*max(0\\,1-(t-${start.toFixed(3)})/0.11))'` : String(size);
      const yy = y0 + j * lh;
      // y is anchored on the line's centre so the pop grows evenly
      filters.push(
        `drawtext=fontfile='${fpath(font)}':textfile='${fpath(f)}':fontcolor=${t.color || "white"}:` +
          `fontsize=${fs}:borderw=${Math.max(4, Math.round(size * 0.11))}:bordercolor=black:` +
          `x=(w-text_w)/2:y=${yy + size / 2}-(ascent-descent)/2:` +
          `enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'`,
      );
    });
    log(
      `text  ${start.toFixed(2)}–${end.toFixed(2)}s  "${t.text}"  (${size}px, y ${y0}–${y0 + blockH})`,
    );
  });
  return filters;
}

/**
 * Render one video.
 * @param edl     edit config (see config/edits/*.json)
 * @param sources (segment) => { file, hasAudio, w, h, meta?, prefilter? }
 */
export async function renderEdl(edl, sources, { outDir, tmpRoot, scaleMode = "pixel" }) {
  const cv = edl.canvas;
  const fps = edl.fps || 30;
  const safe = { top: 150, bottom: 400, left: 60, right: 60, ...(edl.safe || {}) };
  const tmp = join(tmpRoot, edl.id);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  console.log(`\n▶ ${edl.id}  ${cv.w}x${cv.h}@${fps}`);

  // pass 1: resolve every window and snap its cut points onto the music's beat grid
  const grids = new Map();
  const plan = [];
  for (const [i, seg] of edl.segments.entries()) {
    const src = await sources(seg);
    const win = resolveWindow(seg, src);
    let grid = null;
    if (edl.beatSnap !== false && src.hasAudio && seg.snap !== false) {
      if (!grids.has(src.file)) grids.set(src.file, await detectBeats(src.file));
      const g = grids.get(src.file);
      if (g.confidence > 1.6) {
        grid = g;
        const max = edl.beatSnapMax ?? 0.22;
        // the opening frame is chosen precisely (hook / poster frame), so never move it
        const s = i === 0 ? win.start : snap(win.start, g, max);
        const e = snap(s + win.dur, g, max);
        if (e - s > 0.4) Object.assign(win, { start: s, dur: e - s });
      }
    }
    plan.push({ seg, src, win, grid });
  }
  // pass 2: snapping rounds to whole beats, so nudge segment ends (a beat at a time, longest
  // segments first) until the total lands inside the requested duration range
  const [lo, hi] = edl.duration || [0, Infinity];
  const card = edl.endCard ? (edl.endCard.dur ?? 1.5) : 0;
  const outLen = (p) => p.win.dur / (p.seg.speed || 1);
  const total = () => plan.reduce((a, p) => a + outLen(p), 0) + card;
  const target = (lo + hi) / 2;
  for (let guard = 0; guard < 200 && (total() < lo || total() > hi); guard++) {
    const grow = total() < lo;
    const cands = plan.filter(
      (p) => p.seg.fixed !== true && !(grow && p.full) && (grow || outLen(p) > 0.9),
    );
    if (!cands.length) break;
    // prefer the segment whose change brings us closest to the middle of the range
    cands.sort((a, b) => (grow ? outLen(a) - outLen(b) : outLen(b) - outLen(a)));
    const p = cands[guard % cands.length];
    const step = p.grid?.period || 0.25;
    // keep cuts fast: never grow a segment past maxDur (default 1.5x its planned length, ≤3.5s)
    const cap = p.seg.maxDur ?? Math.min(3.5, Math.max(p.seg.dur * 1.5, p.seg.dur + step));
    const room = (p.src.duration ?? Infinity) - p.win.start - 0.05;
    const next = Math.max(0.6, p.win.dur + (grow ? step : -step));
    if (grow && (next > cap || next > room)) {
      p.full = true;
      if (plan.every((q) => q.full || q.seg.fixed)) break;
      continue;
    }
    p.win.dur = next;
    if (Math.abs(total() - target) < step / 2) break;
  }
  // pass 3: render
  const timeline = [];
  let t = 0;
  for (const [i, { seg, src, win }] of plan.entries()) {
    if (src.duration) win.dur = Math.min(win.dur, src.duration - win.start - 0.02);
    win.dur = Math.round(win.dur * fps) / fps; // whole frames, so nothing drifts
    const file = join(tmp, `seg-${String(i).padStart(2, "0")}.mkv`);
    const outDur = await renderSegment(seg, src, win, cv, fps, src.scaleMode || scaleMode, file);
    timeline.push({
      id: seg.id,
      file,
      t0: t,
      t1: t + outDur,
      tail: src.hasAudio ? { file: src.file, start: win.start + win.dur } : null,
    });
    log(
      `seg   ${(seg.id || "").padEnd(14)} ${basename(src.file)} @${win.start.toFixed(2)}s  ${outDur.toFixed(2)}s`,
    );
    t += outDur;
  }
  if (edl.endCard) {
    const file = join(tmp, "seg-end.mkv");
    const d = await renderEndCard(edl.endCard, timeline[timeline.length - 1], cv, fps, file, tmp);
    timeline.push({ id: "end", file, t0: t, t1: t + d });
    log(`seg   end card       ${d.toFixed(2)}s`);
    t += d;
  }

  // concat (all segments share codec params, so this is a lossless stream copy)
  const list = join(tmp, "list.txt");
  writeFileSync(list, timeline.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = join(tmp, "joined.mkv");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);

  // loudness: two-pass *linear* normalisation, so The Calm stays quiet relative to the rest
  const lufs = edl.lufs ?? -14;
  let loud = "anull";
  try {
    // loudnorm prints its measurement JSON on stderr
    const r = spawnSync(FFMPEG, [
      "-hide_banner",
      "-i",
      joined,
      "-af",
      `loudnorm=I=${lufs}:TP=-1.5:LRA=20:print_format=json`,
      "-f",
      "null",
      "-",
    ]);
    const js = JSON.parse(
      r.stderr
        .toString()
        .match(/\{[^{}]*"input_i"[^{}]*\}/)
        .pop(),
    );
    if (Number(js.input_i) > -70) {
      loud =
        `loudnorm=I=${lufs}:TP=-1.5:LRA=20:measured_I=${js.input_i}:measured_TP=${js.input_tp}:` +
        `measured_LRA=${js.input_lra}:measured_thresh=${js.input_thresh}:offset=${js.target_offset}:linear=true`;
    }
  } catch (e) {
    console.warn(`  ! loudness measurement failed (${e.message}); leaving levels as recorded`);
  }

  const caps = captionFilters(edl.texts || [], timeline, cv, safe, tmp);
  const vf = [...caps, "format=yuv420p"].join(",");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, edl.out || `${edl.id}.mp4`);
  const encode = (extra) =>
    ffmpeg([
      "-i",
      joined,
      "-vf",
      vf,
      "-af",
      `${loud},aresample=${SR}`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-tune",
      "animation",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-g",
      String(fps * 2),
      ...extra,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      String(SR),
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      out,
    ]);
  await encode(["-crf", "18", "-maxrate", "14M", "-bufsize", "28M"]);
  if (statSync(out).size > MAX_BYTES) {
    const kbps = Math.floor((MAX_BYTES * 8 * 0.92) / t / 1000 - 192);
    log(`size over limit, re-encoding at ${kbps}kbps`);
    await encode(["-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`]);
  }
  // poster = exact first frame (what people see before it plays)
  await ffmpeg(["-i", out, "-frames:v", "1", "-q:v", "2", out.replace(/\.mp4$/, ".jpg")]);

  const info = await probe(out);
  const mb = (info.size / 1024 / 1024).toFixed(1);
  console.log(
    `✔ ${out}  ${info.duration.toFixed(2)}s  ${info.video.width}x${info.video.height}  ${info.video.fps}fps  ${mb}MB`,
  );
  if (info.duration < lo - 0.05 || info.duration > hi + 0.05) {
    console.warn(`  ! duration ${info.duration.toFixed(2)}s is outside the ${lo}–${hi}s target`);
  }
  if (!process.env.KEEP_TMP) rmSync(tmp, { recursive: true, force: true });
  return { out, ...info };
}

export const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
