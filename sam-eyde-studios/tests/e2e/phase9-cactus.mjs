import { join } from "node:path";
import { check, finish, launch, OUT, sleep, URL, voiceWav, wavFile } from "./helpers.mjs";

const click = wavFile("click.wav", 1, (t) => (t >= 0.1 && t < 0.1005 ? 0.9 : 0), 48000);
const tone = wavFile("tone.wav", 2, (t) => Math.sin(2 * Math.PI * 330 * t) * 0.5, 48000);

const { browser, page, errors } = await launch();
await page.goto(URL);
await page.click("[data-new-project]");
await page.waitForSelector(".transport");
const st = () => page.evaluate(() => window.__ses.getState());
const tuningDone = () => page.waitForSelector(".badge.tuning", { state: "detached", timeout: 60000 });

await page.selectOption('select[aria-label="Key"]', "9");
await page.selectOption('select[aria-label="Scale"]', "minor");
await page.setInputFiles('input[data-import="vocal"]', voiceWav(4));
await page.waitForSelector(".track.vocal");
const card = page.locator(".track.vocal").first();
const preset = card.locator('select[aria-label="Vocal preset"]');

check('preset is listed as "Cactus Wave"', (await preset.locator("option").first().innerText()) === "Cactus Wave");
const uiText = (await page.locator("body").innerText()).toLowerCase();
check("UI uses only the preset's own name", !uiText.includes("toliver"));

await preset.selectOption("cactusWave");
let s = await st();
check("sets instant retune + autotune on", s.project.tracks[0].autotune === true && s.project.tracks[0].retune === 1);
await page.waitForSelector(".badge.tuning", { timeout: 5000 });
await tuningDone();

// Tuned audio: lead + octave-up layer
const tuned = await page.evaluate(() => {
  const { engine, getState } = window.__ses;
  const buf = engine.bufferFor(getState().project.tracks[0]);
  const sr = buf.sampleRate;
  const hz = (x) => {
    const a = Math.floor(sr * 1.0);
    const n = Math.floor(sr * 0.5);
    const lags = [];
    let best = 0;
    for (let lag = Math.floor(sr / 900); lag < sr / 100; lag++) {
      let acc = 0;
      for (let i = a; i < a + n; i += 2) acc += x[i] * x[i + lag];
      lags.push([lag, acc]);
      if (acc > best) best = acc;
    }
    let k = lags.findIndex(([, acc]) => acc > best * 0.9);
    while (k + 1 < lags.length && lags[k + 1][1] > lags[k][1]) k++;
    return sr / lags[k][0];
  };
  return { channels: buf.numberOfChannels, lead: hz(buf.getChannelData(0)), layer: buf.numberOfChannels > 1 ? hz(buf.getChannelData(1)) : 0 };
});
check("lead snaps hard to A3", Math.abs(tuned.lead - 220) < 2, tuned.lead.toFixed(1));
check("octave-up ad-lib layer is generated (A4)", tuned.channels === 2 && Math.abs(tuned.layer - 440) < 6, tuned.layer.toFixed(1));

const render = (fn) =>
  page.evaluate(async (body) => {
    const { renderMix, getState } = window.__ses;
    const buf = await renderMix(getState().project);
    return new Function("L", "R", "sr", body)(buf.getChannelData(0), buf.getChannelData(1), buf.sampleRate);
  }, fn);
const stats = `
  const e = (ch, a, b) => { let s = 0; for (let i = Math.floor(a*sr); i < Math.floor(b*sr); i++) s += ch[i]*ch[i]; return Math.sqrt(s / ((b-a)*sr)); };
  const goertzel = (ch, hz, a, b) => { let re = 0, im = 0; for (let i = Math.floor(a*sr); i < Math.floor(b*sr); i++) { re += ch[i]*Math.cos(2*Math.PI*hz*i/sr); im += ch[i]*Math.sin(2*Math.PI*hz*i/sr); } return Math.sqrt(re*re+im*im) / ((b-a)*sr); };
`;

// The octave layer is in the mix, mostly as reverb
const mix = await render(stats + `return { a4: goertzel(L, 440, 4.3, 5.3) + goertzel(R, 440, 4.3, 5.3), a3: goertzel(L, 220, 4.3, 5.3) + goertzel(R, 220, 4.3, 5.3), tail: e(L, 4.5, 6.5), end: e(L, 6.7, 6.95), silence: e(L, 0, 0.02) };`);
check("long dark reverb tail after the vocal ends", mix.tail > 1e-3 && mix.end < mix.tail * 0.3, `${mix.tail.toExponential(1)} → ${mix.end.toExponential(1)}`);
check("octave-up layer rings in the reverb", mix.a4 > mix.a3 * 0.08, `A4/A3 in tail = ${(mix.a4 / mix.a3).toFixed(2)}`);

// Ping-pong delay, dotted 8th at 120 BPM = 0.375 s (click at 0.1 s, +~12 ms master look-ahead)
await card.locator("button.danger").click();
await card.locator("button.danger").click();
await page.setInputFiles('input[data-import="vocal"]', click);
await page.waitForSelector(".track.vocal");
const c2 = page.locator(".track.vocal").first();
await c2.locator('select[aria-label="Vocal preset"]').selectOption("cactusWave");
await tuningDone();
const pp = await render(stats + `
  const w = (t) => ({ l: e(L, t - 0.004, t + 0.03), r: e(R, t - 0.004, t + 0.03) });
  return { first: w(0.487), second: w(0.862), third: w(1.237) };`);
check("delay repeat 1 lands left (dotted 8th)", pp.first.l > pp.first.r * 1.5, `L ${pp.first.l.toExponential(1)} R ${pp.first.r.toExponential(1)}`);
check("delay repeat 2 bounces right", pp.second.r > pp.second.l * 1.5, `L ${pp.second.l.toExponential(1)} R ${pp.second.r.toExponential(1)}`);
check("delay repeat 3 bounces back left", pp.third.l > pp.third.r * 1.2, `L ${pp.third.l.toExponential(1)} R ${pp.third.r.toExponential(1)}`);

// EQ / saturation / compression on a steady tone
await c2.locator("button.danger").click();
await c2.locator("button.danger").click();
await page.setInputFiles('input[data-import="vocal"]', tone);
await page.waitForSelector(".track.vocal");
const c3 = page.locator(".track.vocal").first();
const p3 = c3.locator('select[aria-label="Vocal preset"]');
const measureTone = () => render(stats + `return { h1: goertzel(L, 330, 0.5, 1.5), h2: goertzel(L, 660, 0.5, 1.5), h3: goertzel(L, 990, 0.5, 1.5), level: e(L, 0.5, 1.5), stereo: (() => { let d = 0; for (let i = 0; i < L.length; i++) d += (L[i]-R[i])**2; return Math.sqrt(d / L.length); })() };`);
const clean = await measureTone();
await p3.selectOption("cactusWave");
await c3.locator('button[aria-label="Autotune"]').click(); // tone only: skip tuning here
const cactus = await measureTone();
check("tape saturation adds harmonics", cactus.h3 / cactus.h1 > 5 * (clean.h3 / clean.h1 + 1e-6) && cactus.h3 / cactus.h1 > 0.002, `3rd harmonic ${(20 * Math.log10(cactus.h3 / cactus.h1)).toFixed(0)} dB`);
check("wide doubles + chorus (stereo)", cactus.stereo > 0.01 && clean.stereo < 1e-6, cactus.stereo.toFixed(3));
check("level stays in a sane range", cactus.level > clean.level * 0.4 && cactus.level < clean.level * 2.2, `${(20 * Math.log10(cactus.level / clean.level)).toFixed(1)} dB vs clean`);
await c3.locator('input[aria-label="FX amount"]').fill("0");
const zero = await measureTone();
check("FX 0 %: effects fully out", zero.stereo < 1e-6 && Math.abs(zero.level / clean.level - 1) < 0.05);
await c3.locator('input[aria-label="FX amount"]').fill("1");

// Live: switch presets during playback
await page.click('button[aria-label="Play"]');
await sleep(300);
await p3.selectOption("clean");
await p3.selectOption("cactusWave");
await sleep(500);
check("switching to Cactus Wave during playback keeps playing", (await st()).ui.playing);
await page.click('button[aria-label="Pause"]');
await page.screenshot({ path: join(OUT, "p9-cactus.png"), fullPage: true });

// Survives save + reload
await sleep(700);
await page.reload();
await page.locator(".project-open").click();
await page.waitForSelector(".track.vocal");
check("preset is saved with the project", (await st()).project.tracks[0].preset === "cactusWave");

await browser.close();
finish(errors);
