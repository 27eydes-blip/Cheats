import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beatWav, check, finish, launch, OUT, sleep, URL, voiceWav } from "./helpers.mjs";

const { browser, page, errors } = await launch({ mic: voiceWav(6) });
await page.goto(URL);
const st = () => page.evaluate(() => window.__ses.getState());
const audioRows = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("sam-eyde-studios");
        req.onsuccess = () => {
          const r = req.result.transaction("audio").objectStore("audio").count();
          r.onsuccess = () => resolve(r.result);
        };
      }),
  );
const titles = () => page.locator(".project-title").allInnerTexts();

await page.waitForSelector(".projects");
check('project list is titled "Sam Eyde Studios"', (await page.locator(".projects-head .logo").innerText()).replace(/\s+/g, " ").includes("Sam Eyde Studios"));
check("starts empty", (await page.locator(".project-item").count()) === 0);

// Create + work
await page.click("[data-new-project]");
await page.waitForSelector(".transport");
await page.fill('input[aria-label="Project name"]', "Night Drive");
await page.selectOption('select[aria-label="Key"]', "4");
await page.fill('input[aria-label="BPM"]', "96");
await page.locator('input[aria-label="BPM"]').blur();
await page.setInputFiles('input[data-import="beat"]', beatWav(8));
await page.waitForSelector(".track.beat");
await page.click('button[aria-label="Count-in, 1 bar"]'); // off
await page.click('button[aria-label="Record"]');
await sleep(2200);
await page.click('button[aria-label="Stop recording"]');
await page.waitForSelector(".track.vocal:not(.recording-track)");
const vocal = page.locator(".track.vocal").first();
await vocal.locator('select[aria-label="Vocal preset"]').selectOption("rnbSmooth");
await vocal.locator('input[aria-label="Volume"]').fill("0.7");
await page.locator('input[aria-label="Latency compensation"]').fill("150");
await sleep(900); // autosave debounce
check("audio stored in IndexedDB (beat + take)", (await audioRows()) === 2);

// Hard reload: everything comes back
await page.reload();
await page.waitForSelector(".project-item");
check("project listed after reload", (await titles()).join() === "Night Drive");
check("list shows track count", (await page.locator(".project-meta").innerText()).startsWith("2 tracks"));
await page.locator(".project-open").click();
await page.waitForFunction(() => window.__ses.engine.buffers.size === 2);
let s = await st();
const t = s.project.tracks;
check("settings restored", s.project.bpm === 96 && s.project.key === 4 && s.project.latencyMs === 150 && s.project.countIn === false);
check("tracks restored", t.length === 2 && t[0].kind === "beat" && t[1].name === "Take 1" && t[1].preset === "rnbSmooth" && t[1].volume === 0.7 && t[1].autotune === true);
const rms = await page.evaluate((id) => {
  const d = window.__ses.engine.buffers.get(id).getChannelData(0);
  let sum = 0;
  for (const v of d) sum += v * v;
  return Math.sqrt(sum / d.length);
}, t[1].audioId);
check("recorded audio restored", rms > 0.01, rms.toFixed(4));
await page.waitForSelector(".track.vocal canvas");
await page.click('button[aria-label="Play"]');
await sleep(500);
check("restored project plays", (await page.evaluate(() => window.__ses.engine.position())) > 0.2);
await page.click('button[aria-label="Pause"]');

// Autosave after a change, without leaving the studio
await page.fill('input[aria-label="BPM"]', "101");
await page.locator('input[aria-label="BPM"]').blur();
await sleep(900);
await page.reload();
await page.waitForSelector(".project-item");
check("autosave persisted the last change", (await page.locator(".project-meta").innerText()).includes("101 BPM"));

// Rename / duplicate / delete from the list
const options = () => page.locator(".project-item").first().locator('button[aria-label^="Options"]');
await options().click();
await page.click('.project-menu button:has-text("Rename")');
await page.fill('input[aria-label="New name"]', "Night Drive v2");
await page.click('.rename-form button[type="submit"]');
await page.waitForFunction(() => document.querySelector(".project-title")?.textContent === "Night Drive v2");
check("rename", true);
await page.click('.project-menu button:has-text("Duplicate")');
await page.waitForFunction(() => document.querySelectorAll(".project-item").length === 2);
check("duplicate", (await titles()).sort().join("|") === "Night Drive v2|Night Drive v2 copy");
check("duplicate copies the audio", (await audioRows()) === 4);
await page.screenshot({ path: join(OUT, "p5-projects.png") });

// Back up the original
const origId = await page.evaluate(() => [...document.querySelectorAll(".project-item")].find((el) => el.querySelector(".project-title").textContent === "Night Drive v2").dataset.projectId);
const orig = page.locator(`.project-item[data-project-id="${origId}"]`);
if (!(await orig.locator(".project-menu").count())) await orig.locator('button[aria-label^="Options"]').click();
await orig.locator('.project-menu button:has-text("Back up")').click();
await page.waitForSelector("[data-export-save]");
const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-export-save]")]);
const backupPath = join(OUT, download.suggestedFilename());
await download.saveAs(backupPath);
check("backup is one file named after the project", download.suggestedFilename() === "Night Drive v2.sesproject", download.suggestedFilename());
const bytes = readFileSync(backupPath);
check("backup contains project + audio", bytes.toString("latin1", 0, 8) === "SESPROJ1" && bytes.length > 300000, `${(bytes.length / 1024).toFixed(0)} KB`);
await page.click('.sheet-head button:has-text("Close")');

// Delete both (two taps each)
for (let i = 0; i < 2; i++) {
  const item = page.locator(".project-item").first();
  if (!(await item.locator(".project-menu").count())) await item.locator('button[aria-label^="Options"]').click();
  const del = item.locator(".project-menu button.danger");
  await del.click();
  if (i === 0) check("first delete tap only arms", (await page.locator(".project-item").count()) === 2);
  await del.click();
  await page.waitForFunction((n) => document.querySelectorAll(".project-item").length === n, 1 - i);
}
check("delete removes projects and their audio", (await audioRows()) === 0);

// Restore from the backup file (as if on another device)
await page.setInputFiles("[data-restore]", backupPath);
await page.waitForSelector(".project-item");
check("restore brings the project back", (await titles()).join() === "Night Drive v2" && (await audioRows()) === 2);
await page.locator(".project-open").click();
await page.waitForFunction(() => window.__ses.engine.buffers.size === 2);
s = await st();
check("restored project is intact", s.project.bpm === 101 && s.project.tracks.length === 2 && s.project.tracks[1].preset === "rnbSmooth");

// Bad file is rejected politely
await page.click('button[aria-label="Back to projects"]');
await page.waitForSelector(".projects");
await page.setInputFiles("[data-restore]", beatWav(1));
await page.waitForSelector(".toast");
check("non-backup file is rejected", (await page.locator(".toast").innerText()).includes("isn't a Sam Eyde Studios backup"));

// Deleting a track frees its audio
await page.locator(".project-open").click();
await page.waitForSelector(".track.vocal");
const del = page.locator(".track.vocal").first().locator("button.danger");
await del.click();
await del.click();
await sleep(900);
check("deleting a track removes its audio from storage", (await audioRows()) === 1);
await page.click('button[aria-label="Back to projects"]');
await page.waitForSelector(".project-item");
check("back button returns to the list (saved)", (await page.locator(".project-meta").innerText()).startsWith("1 track "));

await browser.close();
finish(errors.filter((e) => !e.includes("backup")));
