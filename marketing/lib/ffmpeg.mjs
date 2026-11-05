// Thin wrappers around the ffmpeg / ffprobe CLIs.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const FFMPEG = process.env.FFMPEG || "ffmpeg";
export const FFPROBE = process.env.FFPROBE || "ffprobe";

/** Run a command, resolve with stdout (Buffer). Rejects with stderr tail on failure. */
export function run(cmd, args, { input, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 200_000) err = err.slice(-100_000);
      if (!quiet) process.stderr.write(d);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${cmd} exited ${code}\n${args.join(" ")}\n${err.slice(-4000)}`));
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export const ffmpeg = (args, opts) => {
  if (process.env.DEBUG_FFMPEG)
    console.error(
      `$ ffmpeg ${args.map((a) => (/[\s;'[\]]/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
    );
  return run(FFMPEG, ["-hide_banner", "-y", "-loglevel", "error", ...args], opts);
};

export async function probe(file) {
  const out = await run(FFPROBE, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const j = JSON.parse(out.toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const rate = (r) => {
    if (!r) return 0;
    const [n, d] = r.split("/").map(Number);
    return d ? n / d : n;
  };
  let rotation = 0;
  for (const sd of v?.side_data_list || []) if (sd.rotation != null) rotation = Number(sd.rotation);
  if (v?.tags?.rotate) rotation = Number(v.tags.rotate);
  return {
    duration: Number(j.format.duration || v?.duration || 0),
    size: Number(j.format.size || 0),
    video: v && {
      codec: v.codec_name,
      width: v.width,
      height: v.height,
      fps: rate(v.avg_frame_rate || v.r_frame_rate),
      pixFmt: v.pix_fmt,
      transfer: v.color_transfer,
      primaries: v.color_primaries,
      profile: v.profile,
      rotation,
    },
    audio: a && { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels },
  };
}

/** Decode the audio of `file` (optionally a [start, start+dur] window) to mono Float32 PCM. */
export async function decodeMono(file, { rate = 11025, start, dur } = {}) {
  const args = [];
  if (start != null) args.push("-ss", String(start));
  if (dur != null) args.push("-t", String(dur));
  args.push("-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1");
  const buf = await ffmpeg(args);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export function ensureDir(file) {
  const d = dirname(file);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

/** Escape a path for use inside an ffmpeg filtergraph option value. */
export const fpath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
