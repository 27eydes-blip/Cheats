import { join } from "node:path";
import { beatWav, check, finish, launch, OUT, sleep, URL, voiceWav } from "./helpers.mjs";

const { browser, page, errors } = await launch();
await page.goto(URL);
await page.click("[data-new-project]");
await page.waitForSelector(".transport");
const st = () => page.evaluate(() => window.__ses.getState());
const vt = async () => (await st()).project.tracks.find((t) => t.kind === "vocal");

await page.setInputFiles('input[data-import="beat"]', beatWav(8));
await page.setInputFiles('input[data-import="vocal"]', voiceWav(4));
await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 2);
const lane = page.locator(".track.vocal .lane");
const box = await lane.boundingBox();
const pps = box.width / 20; // 20 s visible when the song is short
const y = box.y + box.height / 2;

async function drag(fromX, dx) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + dx / 2, y, { steps: 4 });
  await page.mouse.move(fromX + dx, y, { steps: 4 });
  await page.mouse.up();
}

// Drag the take right by 5 s
await drag(box.x + 2 * pps, 5 * pps);
let t = await vt();
check("drag right moves the take", Math.abs(t.startSec - 5) < 0.06, t.startSec.toFixed(2));
check("dragging does not move the playhead", (await page.evaluate(() => window.__ses.engine.position())) === 0);
// Drag left past zero -> clamps at 0
await drag(box.x + 7 * pps, -9 * pps);
t = await vt();
check("drag left clamps at the start of the song", t.startSec === 0, String(t.startSec));
// Beat lane is not draggable
const beatBox = await page.locator(".track.beat .lane").boundingBox();
await page.mouse.move(beatBox.x + 40, beatBox.y + 30);
await page.mouse.down();
await page.mouse.move(beatBox.x + 140, beatBox.y + 30, { steps: 5 });
await page.mouse.up();
check("the beat stays put", (await st()).project.tracks[0].startSec === 0);

// Move to 2 s, then trim 1 s off the start and 0.5 s off the end
await drag(box.x + 2 * pps, 2 * pps);
t = await vt();
const start0 = t.startSec;
await drag(box.x + start0 * pps + 3, 1 * pps);
t = await vt();
check("trim start hides audio and keeps the rest in place", Math.abs(t.trimStart - 1) < 0.06 && Math.abs(t.startSec - (start0 + 1)) < 0.06, `trim ${t.trimStart.toFixed(2)}, start ${t.startSec.toFixed(2)}`);
const endX = box.x + (t.startSec + 4 - t.trimStart) * pps;
await drag(endX - 3, -0.5 * pps);
t = await vt();
check("trim end", Math.abs(t.trimEnd - 0.5) < 0.06, t.trimEnd.toFixed(2));
check("start unchanged by end trim", Math.abs(t.startSec - (start0 + 1)) < 0.06);
await page.screenshot({ path: join(OUT, "p6-edit.png") });

// Trims can be undone by dragging back out, but not past the audio
await drag(box.x + t.startSec * pps + 3, -3 * pps);
t = await vt();
check("trim start can be pulled back out (not past the audio)", t.trimStart === 0 && Math.abs(t.startSec - start0) < 0.06, `trim ${t.trimStart}, start ${t.startSec.toFixed(2)}`);

// Tap still seeks
await lane.click({ position: { x: 10 * pps, y: 30 } });
check("tap on a lane still seeks", Math.abs((await page.evaluate(() => window.__ses.engine.position())) - 10) < 0.3);

// Trim is respected by playback/export: clip = 4 - 0.5 = 3.5 s at start0, + 3 s tail (beat is 8 s)
await drag(box.x + start0 * pps + 3, 1 * pps); // trim start 1 s again
t = await vt();
const out = await page.evaluate(async (id) => {
  const { renderMix, getState } = window.__ses;
  const buf = await renderMix(getState().project, id);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const rms = (a, b) => {
    let s = 0;
    for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) s += d[i] * d[i];
    return Math.sqrt(s / ((b - a) * sr));
  };
  return { seconds: buf.duration, before: rms(0.2, 2.8), inside: rms(3.3, 5.2), after: rms(5.8, 6.3) };
}, t.id);
check("export follows move + trim", Math.abs(out.seconds - (t.startSec + 2.5 + 3)) < 0.05 && out.before < 1e-4 && out.inside > 0.02 && out.after < out.inside * 0.05,
  `len ${out.seconds.toFixed(2)}, before ${out.before.toExponential(1)}, inside ${out.inside.toFixed(3)}, after ${out.after.toExponential(1)}`);

// Editing while playing keeps playing
await page.click('button[aria-label="Back to start"]');
await page.click('button[aria-label="Play"]');
const moved0 = (await vt()).startSec;
await drag(box.x + (t.startSec + 1.25) * pps, 1 * pps);
check("can drag during playback", (await st()).ui.playing && Math.abs((await vt()).startSec - moved0 - 1) < 0.06);
await page.click('button[aria-label="Pause"]');

// Saved
const before = await vt();
await sleep(800);
await page.reload();
await page.locator(".project-open").click();
await page.waitForFunction(() => window.__ses.engine.buffers.size === 2);
const after = await vt();
check("edits are saved", after.startSec === before.startSec && after.trimStart === before.trimStart && after.trimEnd === before.trimEnd);

await browser.close();
finish(errors);
