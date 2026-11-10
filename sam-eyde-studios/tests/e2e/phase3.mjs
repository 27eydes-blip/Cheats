import { join } from "node:path";
import { check, finish, launch, OUT, sleep, URL, wavFile } from "./helpers.mjs";

// A 1-second "vocal" that is just one click at t = 0.1 s: lets us see every echo and tail.
const click = wavFile("click.wav", 1, (t) => (t >= 0.1 && t < 0.1005 ? 0.9 : 0), 48000);
// A sustained tone for level / stereo checks.
const tone = wavFile("tone.wav", 2, (t) => Math.sin(2 * Math.PI * 330 * t) * 0.3, 48000);

const { browser, page, errors } = await launch();
await page.goto(URL);
if (await page.locator("[data-new-project]").count()) await page.locator("[data-new-project]").click();
await page.waitForSelector(".transport");
const st = () => page.evaluate(() => window.__ses.getState());

/** Render the mix offline and return measurements. */
const measure = () =>
  page.evaluate(async () => {
    const { renderMix, getState } = window.__ses;
    const buf = await renderMix(getState().project);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const sr = buf.sampleRate;
    const rms = (a, b, ch = L) => {
      let s = 0;
      for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) s += ch[i] * ch[i];
      return Math.sqrt(s / Math.max(1, Math.floor((b - a) * sr)));
    };
    let diff = 0;
    let peak = 0;
    for (let i = 0; i < L.length; i++) {
      diff += (L[i] - R[i]) ** 2;
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    // loudest 10 ms window between 0.2 s and 1.0 s (first echo of the click)
    let echoT = 0;
    let echoE = 0;
    const win = Math.floor(sr * 0.01);
    for (let s = Math.floor(sr * 0.17); s < sr * 1.0; s += win >> 2) {
      let e = 0;
      for (let i = s; i < s + win; i++) e += L[i] * L[i] + R[i] * R[i];
      if (e > echoE) {
        echoE = e;
        echoT = (s + win / 2) / sr;
      }
    }
    return {
      seconds: buf.duration,
      tail: rms(1.5, 3.5),
      late: rms(3.0, 3.9),
      body: rms(0.2, 1.0),
      stereo: Math.sqrt(diff / L.length),
      peak,
      echoT,
    };
  });

await page.setInputFiles('input[data-import="vocal"]', click);
await page.waitForSelector(".track.vocal");
const card = page.locator(".track.vocal").first();
const preset = card.locator('select[aria-label="Vocal preset"]');
check("the 5 classic presets are still offered", (await preset.locator("option").allInnerTexts()).filter((n) => ["Melodic Trap", "R&B Smooth", "Country", "Pop Polish", "Clean"].includes(n)).length === 5);

// Clean: nothing but the click
let m = await measure();
check("render adds a 3 s tail", Math.abs(m.seconds - 4) < 0.01, m.seconds.toFixed(2));
check("Clean: no reverb/delay tail", m.tail < 1e-5, m.tail.toExponential(1));
check("Clean: mono-compatible (no doubler)", m.stereo < 1e-6, m.stereo.toExponential(1));

// Melodic Trap
await preset.selectOption("melodicTrap");
let s = await st();
check("Melodic Trap sets hard autotune", s.project.tracks[0].autotune === true && s.project.tracks[0].retune === 1);
m = await measure();
const trap = m;
check("Melodic Trap: long reverb tail", m.tail > 1e-4 && m.late > 1e-6, `tail ${m.tail.toExponential(1)} late ${m.late.toExponential(1)}`);
check("Melodic Trap: wide stereo doubles", m.stereo > 1e-4, m.stereo.toExponential(1));
// dotted 8th at 120 BPM = 0.375 s after the click at 0.1 s
check("Melodic Trap: dotted-8th delay (0.475 s)", Math.abs(m.echoT - 0.475) < 0.02, m.echoT.toFixed(3));

// Tempo sync
await page.fill('input[aria-label="BPM"]', "90");
await page.locator('input[aria-label="BPM"]').blur();
m = await measure();
check("delay follows tempo (90 BPM → 0.6 s)", Math.abs(m.echoT - 0.6) < 0.02, m.echoT.toFixed(3));
await page.fill('input[aria-label="BPM"]', "120");
await page.locator('input[aria-label="BPM"]').blur();

// FX amount
await card.locator('input[aria-label="FX amount"]').fill("0");
m = await measure();
check("FX 0 %: effects gone", m.tail < 1e-5 && m.stereo < 1e-6, m.tail.toExponential(1));
await card.locator('input[aria-label="FX amount"]').fill("2");
m = await measure();
check("FX 200 %: about twice the wet level", m.tail > trap.tail * 1.5, `${(m.tail / trap.tail).toFixed(2)}×`);
await card.locator('input[aria-label="FX amount"]').fill("1");

// Other presets
await preset.selectOption("rnbSmooth");
s = await st();
m = await measure();
check("R&B Smooth: medium tune + 8th delay (0.35 s)", s.project.tracks[0].retune === 0.6 && Math.abs(m.echoT - 0.35) < 0.02, m.echoT.toFixed(3));
const rnbTail = m.tail;
await preset.selectOption("country");
s = await st();
m = await measure();
check("Country: light tune + slapback (0.215 s)", s.project.tracks[0].retune === 0.2 && Math.abs(m.echoT - 0.215) < 0.02, m.echoT.toFixed(3));
check("Country: small room (short tail)", m.tail < rnbTail * 0.2 && m.tail < trap.tail * 0.2, m.tail.toExponential(1));
await preset.selectOption("popPolish");
s = await st();
m = await measure();
check("Pop Polish: medium tune, moderate reverb", s.project.tracks[0].retune === 0.6 && m.body > 1e-4 && m.tail > 1e-8 && m.tail < trap.tail * 0.5, `body ${m.body.toExponential(1)} tail ${m.tail.toExponential(1)}`);
await preset.selectOption("clean");
check("Clean turns autotune off", (await st()).project.tracks[0].autotune === false);

// Brightness: Pop Polish boosts highs vs Clean (white-ish click spectrum)
// + master limiter keeps a hot mix under full scale
await card.locator("button.danger").click();
await card.locator("button.danger").click();
await page.setInputFiles('input[data-import="beat"]', tone);
await page.setInputFiles('input[data-import="vocal"]', tone);
await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 2);
for (const c of await page.locator('input[aria-label="Volume"]').all()) await c.fill("1.5");
await page.setInputFiles('input[data-import="beat"]', tone);
await page.setInputFiles('input[data-import="beat"]', tone);
await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 4);
for (const c of await page.locator('input[aria-label="Volume"]').all()) await c.fill("1.5");
m = await measure();
check("master limiter holds a hot mix below clipping", m.peak < 1.0 && m.body > 0.2, `peak ${m.peak.toFixed(3)}, raw sum would be 1.8`);

// Live: change preset + FX during playback, playback keeps going
await page.click('button[aria-label="Play"]');
await sleep(300);
const p0 = await page.evaluate(() => window.__ses.engine.position());
const liveCard = page.locator(".track.vocal").first();
await liveCard.locator('select[aria-label="Vocal preset"]').selectOption("melodicTrap");
await liveCard.locator('input[aria-label="FX amount"]').fill("1.6");
await liveCard.locator('select[aria-label="Vocal preset"]').selectOption("rnbSmooth");
await sleep(600);
s = await st();
const p1 = await page.evaluate(() => window.__ses.engine.position());
check("presets/FX change during playback without stopping", s.ui.playing && p1 > p0 + 0.5, `${p0.toFixed(2)} → ${p1.toFixed(2)}`);
await page.click('button[aria-label="Pause"]');
await page.screenshot({ path: join(OUT, "p3-studio.png"), fullPage: true });

await browser.close();
finish(errors);
