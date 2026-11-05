// Shared Playwright setup: a 390x844 "iPhone" page with the demo script injected and a
// clean demo save (best 400 so the run ends on NEW BEST!, every hero unlocked for the reel).
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const DEMO_JS = fs.readFileSync(path.join(__dirname, "..", "demo-bot.js"), "utf8");

function demoSave() {
  const d = new Date();
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // every hero in src/player/characterDefs.js (2026-11-05), so the carousel shows them all
  const heroes = ["volt", "ember", "frost", "shade", "glitch", "nova", "bloom", "tide", "mecha", "draco", "pip", "coral", "sprout", "ruby", "pengu", "jelly", "comet", "ronin", "seraph", "leviathan", "zephyr", "hoot", "lumen", "buzz", "cinder", "nyx", "koi", "kitsu", "griffo", "aurora", "yarms", "springer", "dzr", "wallrunner", "manny", "milzzz", "smash", "sonjuwon", "bunbun", "puddles", "snoozy", "kai", "bao", "glassfrog", "shardcrab", "flicker", "spectra", "prismara", "gloombat", "grimrat", "murktoad", "hollowcrow", "lurkeel", "ashspider", "anglerfiend", "riftwolf", "grimvulture", "levijr", "mittens", "pengo", "hollyhog", "frostfox", "jinglemoose", "cocoacub", "snowl", "glowotter", "captainacorn", "aurorastag", "voidcat", "hexowl", "wraithmoth", "triphound", "phantomray", "scorpyre", "krakkie", "crimsonmantis", "gloomeleon", "umbradrake"];
  return {
    coins: 2480, best: 400, selected: "volt",
    unlocked: Object.fromEntries(heroes.map((h) => [h, true])),
    login: { last: k, streak: 5, claimed: k },
    settings: { gfxChecked: true, musicVol: 0.8, sfxVol: 0.8 },
    profile: { username: "GlyPilot" },
  };
}

async function openDemo(url, { audio = false } = {}) {
  const args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(DEMO_JS);
  await page.addInitScript((save) => {
    if (!localStorage.getItem("__demoInit")) {
      localStorage.setItem("glydrift.save.v1", JSON.stringify(save));
      localStorage.setItem("__demoInit", "1");
    }
  }, demoSave());
  if (audio) await page.addInitScript(require("./audioTap.cjs").INIT);
  await page.goto(url + "?demo");
  const G = (f, a) => page.evaluate(f, a);
  for (let i = 0; i < 600 && !(await G(() => window.__glydrift?.scene.isActive("Menu"))); i++) await page.waitForTimeout(50);
  // the one real tap: unlocks the game's audio exactly like a player's first touch
  await page.mouse.click(195, 300);
  await page.waitForTimeout(400);
  await G(() => window.__glydrift.loop.sleep());
  return { browser, page, G, errors };
}
module.exports = { openDemo };
