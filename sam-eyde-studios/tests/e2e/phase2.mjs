import { join } from "node:path";
import { check, finish, launch, OUT, sleep, URL, voiceWav } from "./helpers.mjs";

const { browser, page, errors } = await launch();
await page.goto(URL);
if (await page.locator("[data-new-project]").count()) await page.locator("[data-new-project]").click();
await page.waitForSelector(".transport");
const st = () => page.evaluate(() => window.__ses.getState());

/** Estimate the pitch the track will actually play (autocorrelation on 0.5–1.5 s). */
const playedHz = () =>
  page.evaluate(() => {
    const { engine, getState } = window.__ses;
    const track = getState().project.tracks[0];
    const buf = engine.bufferFor(track);
    const x = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const a = Math.floor(sr * 0.5);
    const n = Math.floor(sr * 1.0);
    // Smallest lag whose correlation is within 5 % of the maximum (avoids octave-down picks).
    const lags = [];
    let best = 0;
    for (let lag = Math.floor(sr / 400); lag < sr / 100; lag++) {
      let acc = 0;
      for (let i = a; i < a + n; i += 3) acc += x[i] * x[i + lag];
      lags.push([lag, acc]);
      if (acc > best) best = acc;
    }
    const idx = lags.findIndex(([, acc]) => acc > best * 0.95);
    let k = idx;
    while (k + 1 < lags.length && lags[k + 1][1] > lags[k][1]) k++;
    const bestLag = lags[k][0];
    return sr / bestLag;
  });

await page.selectOption('select[aria-label="Key"]', "9"); // A
await page.selectOption('select[aria-label="Scale"]', "minor");
await page.setInputFiles('input[data-import="vocal"]', voiceWav(4));
await page.waitForSelector(".track.vocal");
const raw = await playedHz();
check("raw vocal is off-key (~212 Hz)", Math.abs(raw - 212) < 3, raw.toFixed(1));

// Turn autotune on, hard
const card = page.locator(".track.vocal").first();
await card.locator('button[aria-label="Autotune"]').click();
await card.locator('input[aria-label="Retune speed"]').fill("1");
await page.waitForSelector(".badge.tuning", { timeout: 3000 });
check("Tuning… badge shows while the worker runs", true);
await page.screenshot({ path: join(OUT, "p2-tuning.png") });
await page.waitForSelector(".badge.tuning", { state: "detached", timeout: 30000 });
const hard = await playedHz();
check("Hard tune snaps to A3 (220 Hz)", Math.abs(hard - 220) < 1.5, hard.toFixed(1));

// Change key -> auto re-tune
await page.selectOption('select[aria-label="Key"]', "8"); // G# major contains G#3 = 207.65
await page.selectOption('select[aria-label="Scale"]', "major");
await sleep(100);
check("changing key/scale triggers re-tune", Object.keys((await st()).ui.tuning).length === 1);
await page.waitForSelector(".badge.tuning", { state: "detached", timeout: 30000 });
const gs = await playedHz();
check("re-tuned to G#3 (207.7 Hz)", Math.abs(gs - 207.65) < 1.5, gs.toFixed(1));

// Back to the first settings -> served from cache, no worker run
await page.selectOption('select[aria-label="Scale"]', "minor");
await page.waitForSelector(".badge.tuning", { state: "detached", timeout: 30000 });
await page.selectOption('select[aria-label="Key"]', "9");
await sleep(50);
const cachedNow = Object.keys((await st()).ui.tuning).length === 0;
const back = await playedHz();
check("cached result is applied instantly", cachedNow && Math.abs(back - 220) < 1.5, back.toFixed(1));

// Retune speed change -> re-tune
await card.locator('input[aria-label="Retune speed"]').fill("0");
await sleep(100);
check("changing retune speed triggers re-tune", Object.keys((await st()).ui.tuning).length === 1);
await page.waitForSelector(".badge.tuning", { state: "detached", timeout: 30000 });
check("label shows Natural", (await card.locator(".vocal-controls .slider-value").innerText()) === "Natural");

// UI stays responsive while tuning + playback swaps live
await page.click('button[aria-label="Play"]');
await card.locator('input[aria-label="Retune speed"]').fill("0.5");
const t0 = Date.now();
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
check("UI thread stays free during tuning", Date.now() - t0 < 250, `${Date.now() - t0} ms for 2 frames`);
await page.waitForSelector(".badge.tuning", { state: "detached", timeout: 30000 });
check("still playing after live re-tune", (await st()).ui.playing);
await page.click('button[aria-label="Pause"]');

// Toggle off -> original audio
await card.locator('button[aria-label="Autotune"]').click();
await sleep(100);
const off = await playedHz();
check("autotune off plays the original", Math.abs(off - raw) < 0.5, off.toFixed(1));
await card.locator('button[aria-label="Autotune"]').click();
await page.screenshot({ path: join(OUT, "p2-studio.png"), fullPage: true });

await browser.close();
finish(errors);
