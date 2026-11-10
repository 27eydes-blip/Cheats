import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beatWav, check, finish, launch, OUT, URL, voiceWav } from "./helpers.mjs";

const { browser, page, errors } = await launch();
await page.goto(URL);
if (await page.locator("[data-new-project]").count()) await page.locator("[data-new-project]").click();
await page.waitForSelector(".transport");

await page.fill('input[aria-label="Project name"]', "Midnight: Demo/1");
await page.setInputFiles('input[data-import="beat"]', beatWav(8));
await page.setInputFiles('input[data-import="vocal"]', voiceWav(4));
await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 2);
const card = page.locator(".track.vocal").first();
await card.locator('input[aria-label="Track name"]').fill("Hook");
await card.locator('select[aria-label="Vocal preset"]').selectOption("melodicTrap");

async function runExport(what, format) {
  await page.click('button[aria-label="Export"]');
  if (what) await page.selectOption('select[aria-label="What to export"]', { label: what });
  await page.click(`.segmented button:has-text("${format.toUpperCase()}")`);
  await page.click("[data-export-run]");
  await page.waitForSelector("[data-export-save]", { timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-export-save]")]);
  const path = join(OUT, `dl-${download.suggestedFilename()}`);
  await download.saveAs(path);
  await page.click('.sheet-head button:has-text("Close")');
  return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

function parseWav(b) {
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const dataBytes = b.readUInt32LE(40);
  const n = dataBytes / 2 / channels;
  const rms = (from, to) => {
    let s = 0;
    let c = 0;
    for (let i = Math.floor(from * rate); i < Math.min(n, Math.floor(to * rate)); i++) {
      const v = b.readInt16LE(44 + i * 2 * channels) / 32768;
      s += v * v;
      c++;
    }
    return Math.sqrt(s / Math.max(1, c));
  };
  return { channels, rate, bits: b.readUInt16LE(34), seconds: n / rate, rms, riffOk: b.readUInt32LE(4) === b.length - 8 };
}

// --- Full song, WAV ---
const wav = await runExport(null, "wav");
check("WAV named after the project", wav.name === "Midnight Demo 1.wav", wav.name);
const w = parseWav(wav.bytes);
check("WAV: valid stereo 16-bit RIFF", wav.bytes.toString("latin1", 0, 4) === "RIFF" && w.channels === 2 && w.bits === 16 && w.riffOk);
check("WAV: song length + 3 s tail", Math.abs(w.seconds - 11) < 0.02, w.seconds.toFixed(2));
check("WAV: has audio in the song", w.rms(0.5, 4) > 0.01, w.rms(0.5, 4).toFixed(4));
check("WAV: reverb rings into the tail, then fades", w.rms(8.05, 9) > 5e-6 && w.rms(10.5, 11) < w.rms(8.05, 9), `${w.rms(8.05, 9).toExponential(1)} → ${w.rms(10.5, 11).toExponential(1)}`);
check('WAV metadata contains "Sam Eyde Studios"', wav.bytes.includes(Buffer.from("ISFT")) && wav.bytes.includes(Buffer.from("Sam Eyde Studios")));
check("WAV metadata contains the title", wav.bytes.includes(Buffer.from("Midnight: Demo/1")));

// Export must equal what the playback graph renders
const same = await page.evaluate(async () => {
  const { renderMix, getState } = window.__ses;
  const buf = await renderMix(getState().project);
  let s = 0;
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return { rms: Math.sqrt(s / d.length), seconds: buf.duration };
});
const full = (() => {
  let s = 0;
  const n = Math.floor(w.seconds * w.rate);
  for (let i = 0; i < n; i++) {
    const v = wav.bytes.readInt16LE(44 + i * 4) / 32768;
    s += v * v;
  }
  return Math.sqrt(s / n);
})();
check("exported file matches the playback graph render", Math.abs(full - same.rms) / same.rms < 0.01, `${full.toFixed(5)} vs ${same.rms.toFixed(5)}`);

// --- Full song, MP3 ---
const mp3 = await runExport(null, "mp3");
check("MP3 named after the project", mp3.name === "Midnight Demo 1.mp3", mp3.name);
check("MP3: starts with an ID3 tag", mp3.bytes.toString("latin1", 0, 3) === "ID3");
check('MP3 metadata contains "Sam Eyde Studios"', mp3.bytes.includes(Buffer.from("Sam Eyde Studios", "utf16le")) && mp3.bytes.includes(Buffer.from("TPUB")));
const tagSize = (mp3.bytes[6] << 21) | (mp3.bytes[7] << 14) | (mp3.bytes[8] << 7) | mp3.bytes[9];
check("MP3: audio frames follow the tag", mp3.bytes[10 + tagSize] === 0xff && (mp3.bytes[11 + tagSize] & 0xe0) === 0xe0);
const decoded = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = await window.__ses.engine.ctx.decodeAudioData(bin.buffer);
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return { seconds: buf.duration, channels: buf.numberOfChannels, rms: Math.sqrt(s / d.length) };
}, mp3.bytes.toString("base64"));
check("MP3: decodes to the same song", Math.abs(decoded.seconds - 11) < 0.15 && decoded.channels === 2 && Math.abs(decoded.rms - same.rms) / same.rms < 0.05, `${decoded.seconds.toFixed(2)} s, rms ${decoded.rms.toFixed(5)}`);
check("MP3 is much smaller than WAV", mp3.bytes.length < wav.bytes.length / 4, `${(mp3.bytes.length / 1024).toFixed(0)} KB vs ${(wav.bytes.length / 1024).toFixed(0)} KB`);

// --- Single track ---
await page.click('button[aria-label="Export"]');
await page.screenshot({ path: join(OUT, "p4-export.png") });
await page.click('.sheet-head button:has-text("Close")');
const solo = await runExport("Only: Hook", "wav");
check("single-track file named project - track", solo.name === "Midnight Demo 1 - Hook.wav", solo.name);
const sw = parseWav(solo.bytes);
check("single track: its own length + tail", Math.abs(sw.seconds - 7) < 0.02, sw.seconds.toFixed(2));
check("single track: reverb tail rings after the vocal ends", sw.rms(4.1, 5) > 1e-3, sw.rms(4.1, 5).toExponential(1));
check("single track: only the vocal (no beat after it ends)", sw.rms(0.5, 3.5) > 0.01 && sw.rms(6.5, 7) < 0.003, sw.rms(6.5, 7).toExponential(1));

await browser.close();
finish(errors);
