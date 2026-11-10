import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beatWav, check, finish, launch, OUT, sleep, URL, voiceWav } from "./helpers.mjs";

const MIN_TAP = 40;
const SIZES = [
  { name: "iPhone SE (320)", width: 320, height: 568 },
  { name: "iPhone mini (375)", width: 375, height: 667 },
  { name: "iPhone (390)", width: 390, height: 844 },
  { name: "iPhone Pro (402)", width: 402, height: 874 },
  { name: "iPhone Max (430)", width: 430, height: 932 },
];
const allErrors = [];

/** Finds horizontal overflow, clipped text and tap targets that are too small. */
const audit = (page) =>
  page.evaluate((MIN) => {
    const vw = window.innerWidth;
    const problems = [];
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().slice(0, 30);
    for (const el of document.querySelectorAll("button, select, input:not([hidden]), label.btn, [role=slider], [role=switch]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (r.right > vw + 1 || r.left < -1) {
        // Trim handles may legitimately sit at the lane edge (the lane clips them).
        if (!el.closest(".lane")) problems.push(`off-screen: ${label(el)} (${Math.round(r.left)}–${Math.round(r.right)})`);
      }
      const isText = el.tagName === "INPUT" && (el.type === "text" || !el.getAttribute("type"));
      const minW = el.closest(".lane") ? 20 : MIN;
      if (r.height < MIN - 0.5 || (!isText && r.width < minW - 0.5)) problems.push(`too small to tap: ${label(el)} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    // Text that is cut off without an ellipsis
    for (const el of document.querySelectorAll(".btn, .chip, .tbtn, .time, .slider-value, .slider-label, .field-label, .badge, .count-label")) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis") problems.push(`text clipped: ${label(el)}`);
    }
    return problems;
  }, MIN_TAP);

for (const size of SIZES) {
  const { browser, page, errors } = await launch({ viewport: { width: size.width, height: size.height } });
  await page.goto(URL);
  await page.waitForSelector(".projects");
  await page.click("[data-new-project]");
  await page.waitForSelector(".transport");
  await page.click('button[aria-label="Back to projects"]');
  await page.waitForSelector(".project-item");
  await page.locator('button[aria-label^="Options"]').first().click();
  let problems = await audit(page);
  check(`${size.name}: project list`, problems.length === 0, problems.join("; "));
  await page.screenshot({ path: join(OUT, `q-${size.width}-projects.png`) });

  await page.locator(".project-open").first().click();
  await page.waitForSelector(".transport");
  await page.fill('input[aria-label="Project name"]', "A really long project name to test the header");
  await page.selectOption('select[aria-label="Scale"]', "minorPent");
  await page.setInputFiles('input[data-import="beat"]', beatWav(8));
  await page.setInputFiles('input[data-import="vocal"]', voiceWav(4));
  await page.waitForFunction(() => window.__ses.getState().project.tracks.length === 2);
  const card = page.locator(".track.vocal").first();
  await card.locator('input[aria-label="Track name"]').fill("A very long vocal track name here");
  await card.locator('select[aria-label="Vocal preset"]').selectOption("cactusWave");
  await page.waitForSelector(".badge.tuning");
  problems = await audit(page);
  check(`${size.name}: studio (tuning, all controls)`, problems.length === 0, problems.join("; "));
  await page.screenshot({ path: join(OUT, `q-${size.width}-studio.png`), fullPage: true });

  // Transport must not cover the last control: scroll to bottom and check the latency slider is tappable
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const covered = await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Latency compensation"]');
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== el;
  });
  check(`${size.name}: bottom controls not hidden behind the transport`, !covered);

  await page.click('button[aria-label="Export"]');
  await page.click("[data-export-run]");
  await page.waitForSelector("[data-export-save]", { timeout: 120000 });
  problems = await audit(page);
  check(`${size.name}: export sheet`, problems.length === 0, problems.join("; "));
  await page.screenshot({ path: join(OUT, `q-${size.width}-export.png`) });
  allErrors.push(...errors);
  await browser.close();
}

// ---------- Friendly errors ----------
{
  const { browser, page, errors } = await launch({ denyMic: true });
  await page.goto(URL);
  await page.click("[data-new-project]");
  await page.waitForSelector(".transport");
  await page.click('button[aria-label="Record"]');
  await page.waitForSelector(".toast", { timeout: 10000 });
  const msg = await page.locator(".toast").innerText();
  check("mic blocked → friendly message", /microphone/i.test(msg) && /allow|settings/i.test(msg), msg);
  const s = await page.evaluate(() => window.__ses.getState().ui);
  check("mic blocked → app stays usable (not stuck recording)", !s.recording && !s.playing && !s.loading);
  await browser.close();
  allErrors.push(...errors.filter((e) => !/NotAllowedError|NotSupportedError|Permission/i.test(e)));
}
{
  const { browser, page, errors } = await launch({ mic: voiceWav(3) });
  await page.goto(URL);
  await page.click("[data-new-project]");
  await page.waitForSelector(".transport");
  const toastText = async () => {
    await page.waitForSelector(".toast", { timeout: 10000 });
    return page.locator(".toast").innerText();
  };

  const txt = join(OUT, "notes.txt");
  writeFileSync(txt, "this is not audio");
  await page.setInputFiles('input[data-import="beat"]', txt);
  let msg = await toastText();
  check("unsupported file → friendly message", /notes\.txt/.test(msg) && /MP3|WAV|M4A/.test(msg), msg);
  check("unsupported file → nothing added", (await page.evaluate(() => window.__ses.getState().project.tracks.length)) === 0);

  const bad = join(OUT, "broken.mp3");
  writeFileSync(bad, Buffer.alloc(4000, 7));
  await page.setInputFiles('input[data-import="vocal"]', bad);
  await sleep(300);
  msg = await toastText();
  check("corrupt audio file → friendly message", /broken\.mp3/.test(msg) && /couldn't|could not/i.test(msg), msg);

  const empty = join(OUT, "empty.wav");
  writeFileSync(empty, Buffer.alloc(0));
  await page.setInputFiles('input[data-import="beat"]', empty);
  await sleep(300);
  msg = await toastText();
  check("empty file → friendly message", /empty/i.test(msg), msg);

  // Take too short (count-in off, stop right away)
  await page.click('button[aria-label="Count-in, 1 bar"]');
  await page.click('button[aria-label="Record"]');
  await page.waitForFunction(() => window.__ses.getState().ui.recording);
  await page.click('button[aria-label="Stop recording"]');
  await page.waitForFunction(() => /too short/i.test(document.querySelector(".toast")?.textContent ?? ""), null, { timeout: 10000 });
  check("take too short → friendly message, no empty track", (await page.evaluate(() => window.__ses.getState().project.tracks.length)) === 0, await page.locator(".toast").innerText());

  // Stopping during the count-in cancels cleanly
  await page.click('button[aria-label="Count-in, 1 bar"]');
  await page.click('button[aria-label="Record"]');
  await page.waitForFunction(() => window.__ses.getState().ui.countingIn);
  await page.click('button[aria-label="Stop recording"]');
  await page.waitForFunction(() => /cancel/i.test(document.querySelector(".toast")?.textContent ?? ""), null, { timeout: 10000 });
  check("stop during count-in → cancelled, no track", (await page.evaluate(() => window.__ses.getState().project.tracks.length)) === 0);

  // Export with nothing to export
  await page.click('button[aria-label="Export"]');
  check("export with no tracks → disabled with an explanation", (await page.locator("[data-export-run]").isDisabled()) && /add|import|record/i.test(await page.locator(".sheet").innerText()));
  await page.click('.sheet-head button:has-text("Close")');

  // A normal take still works after all those errors
  await page.click('button[aria-label="Count-in, 1 bar"]');
  await page.click('button[aria-label="Record"]');
  await sleep(1500);
  await page.click('button[aria-label="Stop recording"]');
  await page.waitForSelector(".track.vocal:not(.recording-track)");
  check("recording still works after the error cases", true);
  await browser.close();
  allErrors.push(...errors.filter((e) => !/decode|EncodingError|Unable to decode/i.test(e)));
}
finish(allErrors);
