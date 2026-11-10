import { join } from "node:path";
import { beatWav, check, finish, launch, OUT, sleep, URL, voiceWav } from "./helpers.mjs";

const beat = beatWav(8);
const { browser, page, errors } = await launch({ mic: voiceWav(6) });
await page.goto(URL);
const st = () => page.evaluate(() => window.__ses.getState());
const pos = () => page.evaluate(() => window.__ses.engine.position());
// On the project list (phase 5+), open a fresh project first.
if (await page.locator("[data-new-project]").count()) await page.locator("[data-new-project]").click();
await page.waitForSelector(".transport");

check("title is Sam Eyde Studios", (await page.title()) === "Sam Eyde Studios");
check("header shows the logo", (await page.locator(".header .logo").innerText()).includes("Sam Eyde"));
check("no AudioContext before a tap", await page.evaluate(() => window.__ses.engine.ctx === null));

// Header controls
await page.selectOption('select[aria-label="Key"]', "9");
await page.selectOption('select[aria-label="Scale"]', "harmonicMinor");
await page.fill('input[aria-label="BPM"]', "120");
await page.locator('input[aria-label="BPM"]').blur();
let s = await st();
check("key/scale/bpm stored", s.project.key === 9 && s.project.scale === "harmonicMinor" && s.project.bpm === 120);
check("6 scales, 12 keys",
  (await page.locator('select[aria-label="Scale"] option').count()) === 6 &&
  (await page.locator('select[aria-label="Key"] option').count()) === 12);

// Import a beat
await page.setInputFiles('input[data-import="beat"]', beat);
await page.waitForSelector(".track.beat");
s = await st();
check("beat imported as a beat track", s.project.tracks.length === 1 && s.project.tracks[0].kind === "beat");
check("beat duration ~8s", Math.abs(s.project.tracks[0].duration - 8) < 0.05, String(s.project.tracks[0].duration));
check("AudioContext running after tap", await page.evaluate(() => window.__ses.engine.ctx.state === "running"));

// Play / pause / playhead
await page.click('button[aria-label="Play"]');
await sleep(1000);
const p1 = await pos();
check("playback advances", p1 > 0.7 && p1 < 1.5, p1.toFixed(2));
check("time display runs", (await page.locator("#time-now").innerText()) !== "0:00.0");
await page.click('button[aria-label="Pause"]');
const p2 = await pos();
await sleep(300);
check("pause holds position", Math.abs((await pos()) - p2) < 0.01);

// Tap waveform to seek
const lane = page.locator(".track.beat .lane");
const box = await lane.boundingBox();
await lane.click({ position: { x: box.width / 2, y: 20 } });
const p3 = await pos();
const expected = (Math.max(8 * 1.04, 20) / 2);
check("tap waveform seeks", Math.abs(p3 - expected) < 0.3, `${p3.toFixed(2)} vs ${expected.toFixed(2)}`);
await page.click('button[aria-label="Back to start"]');
check("back to start", (await pos()) === 0);

// Record a take over the beat with count-in
await page.click('button[aria-label="Record"]');
await sleep(600);
s = await st();
check("count-in shown before recording", s.ui.recording && s.ui.countingIn);
check("position holds during count-in", (await pos()) === 0);
await sleep(2000 + 2500); // 1 bar at 120 BPM = 2 s, then ~2.5 s of take
const meter = await page.locator(".meter-fill").evaluate((el) => el.style.transform);
check("input meter is live", /scaleX\(0\.\d*[1-9]/.test(meter) || meter === "scaleX(1)", meter);
await page.screenshot({ path: join(OUT, "p1-recording.png") });
await page.click('button[aria-label="Stop recording"]');
await page.waitForSelector(".track.vocal:not(.recording-track)");
s = await st();
const takeTrack = s.project.tracks[1];
check("take became its own vocal track", s.project.tracks.length === 2 && takeTrack.kind === "vocal" && takeTrack.name === "Take 1");
check("take placed where recording started", takeTrack.startSec === 0 && takeTrack.latencyComp === true);
check("take length ≈ recorded time (count-in trimmed)", takeTrack.duration > 2.0 && takeTrack.duration < 3.6, takeTrack.duration.toFixed(2));
const takeRms = await page.evaluate((id) => {
  const d = window.__ses.engine.buffers.get(id).getChannelData(0);
  let sum = 0;
  for (const v of d) sum += v * v;
  return Math.sqrt(sum / d.length);
}, takeTrack.audioId);
check("take contains mic audio", takeRms > 0.01, takeRms.toFixed(4));
const constraints = await page.evaluate(async () => {
  const sup = navigator.mediaDevices.getSupportedConstraints();
  return sup.echoCancellation && sup.noiseSuppression && sup.autoGainControl;
});
check("browser supports the processing-off constraints", constraints);

// Latency slider
await page.locator('input[aria-label="Latency compensation"]').fill("200");
check("latency slider updates project", (await st()).project.latencyMs === 200);
check("default latency was 120", s.project.latencyMs === 120);

// Track controls
const vocal = page.locator(".track.vocal").first();
await vocal.locator('input[aria-label="Track name"]').fill("Hook");
await vocal.locator('button[aria-label="Solo"]').click();
await vocal.locator('input[aria-label="Volume"]').fill("0.5");
s = await st();
check("rename / solo / volume", s.project.tracks[1].name === "Hook" && s.project.tracks[1].solo && s.project.tracks[1].volume === 0.5);
await vocal.locator('button[aria-label="Mute"]').click();
check("mute", (await st()).project.tracks[1].muted);

// Metronome + count-in toggles
await page.click('button[aria-label="Metronome"]');
await page.click('button[aria-label="Count-in, 1 bar"]');
s = await st();
check("metronome + count-in toggles", s.project.metronome === true && s.project.countIn === false);

// Import vocal file
await page.setInputFiles('input[data-import="vocal"]', beat);
await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 3);
check("audio file imported as a vocal track", (await st()).project.tracks[2].kind === "vocal");
await page.screenshot({ path: join(OUT, "p1-studio.png"), fullPage: true });

// Delete needs two taps
const del = page.locator(".track").nth(2).locator("button.danger");
await del.click();
check("first delete tap only arms", (await st()).project.tracks.length === 3);
await del.click();
check("second tap deletes", (await st()).project.tracks.length === 2);

// Play to the end -> auto stop
await page.evaluate(() => window.__ses.engine.seek(7.6));
await page.click('button[aria-label="Play"]');
await sleep(1200);
check("stops at the end of the song", (await st()).ui.playing === false);

await browser.close();
finish(errors);
