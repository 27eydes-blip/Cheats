// Shared helpers for the browser end-to-end checks (run with: node tests/e2e/<file>.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

export const URL = process.env.SES_URL ?? "http://localhost:4173/";
export const OUT = process.env.SES_OUT ?? join(tmpdir(), "ses-e2e");
mkdirSync(OUT, { recursive: true });

export function wavFile(name, seconds, fn, sampleRate = 44100) {
  const n = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, fn(i / sampleRate, i)));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  const path = join(OUT, name);
  writeFileSync(path, buf);
  return path;
}

/** A click-track "beat": a short tone burst on every beat at 120 BPM. */
export const beatWav = (seconds = 8) =>
  wavFile("beat.wav", seconds, (t) => {
    const phase = t % 0.5;
    return phase < 0.06 ? Math.sin(2 * Math.PI * 220 * t) * 0.8 * (1 - phase / 0.06) : 0;
  });

/** A buzzy "voice" a bit flat of A3 with vibrato — used as the fake microphone. */
export const voiceWav = (seconds = 6) => {
  let ph = 0;
  return wavFile(
    "voice.wav",
    seconds,
    (t) => {
      const f = 212 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
      ph += f / 48000;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * h * ph) / h;
      return v * 0.3;
    },
    48000,
  );
};

export async function launch({ mic, denyMic = false, viewport = { width: 390, height: 844 } } = {}) {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      ...(denyMic ? ["--deny-permission-prompts"] : ["--use-fake-ui-for-media-stream"]),
      "--autoplay-policy=no-user-gesture-required",
      ...(mic ? [`--use-file-for-fake-audio-capture=${mic}`] : []),
    ],
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    permissions: denyMic ? [] : ["microphone"],
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return { browser, context, page, errors };
}

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
export function finish(errors = []) {
  if (errors.length) {
    failures++;
    console.log("PAGE ERRORS:\n" + errors.join("\n"));
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
