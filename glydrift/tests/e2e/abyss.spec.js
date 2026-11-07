// The Abyss entrance: exactly 0.2 s of blackout (whatever the music's tempo), then the title
// slam, red flash and shake; no new obstacles during the blackout or the first second after it.
// Endless, levels 41-50 and their practice runs. Reduce Flashing softens it.
import { expect, test } from "@playwright/test";
import { fieldPoint, gameState, openGame, press, profileOf, reseed, run, SAVE, settle, tap } from "./helpers.js";

/** Step frame by frame through the entrance; reports timing, effects and spawns. */
function watchEntrance({ maxFrames, tapFirst = false }) {
  const g = window.__glydrift;
  const s = g.scene.getScene("Game");
  if (tapFirst) s.onTap(); // a level's first tap starts the run (and its entrance)
  const cam = s.cameras.main;
  const hud = g.scene.getScene("Hud");
  const shakes = [];
  const origShake = cam.shake.bind(cam);
  cam.shake = (d, i, ...a) => {
    shakes.push(i);
    return origShake(d, i, ...a);
  };
  const flashes = [];
  const origFlash = s.flashFx.flash.bind(s.flashFx);
  s.flashFx.flash = (c, o) => {
    flashes.push({ c, peak: o?.peak });
    return origFlash(c, o);
  };
  let t = (s.__t || 1e6);
  const step = () => {
    if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
    t += 1000 / 60;
    s.__t = t;
    s.stepFrame(t, 1000 / 60);
  };
  // fly until the blackout starts (endless) — a level has already started it on its first tap
  let i = 0;
  while (!(s.blackoutT > 0) && i < maxFrames && s.state === "playing") {
    step();
    i++;
  }
  if (!(s.blackoutT > 0)) return { started: false, m: s.meters, state: s.state };
  const blackoutAlpha = s.blackout.alpha;
  const hudHidden = hud.cameras.main.alpha === 0;
  const before = new Set(s.obstacles.active);
  const flashesBefore = flashes.length;
  const shakesBefore = shakes.length;
  let frames = 0;
  while (s.blackoutT > 0 && frames < 200) {
    step();
    frames++;
  }
  const atEnd = {
    inAbyss: s.inAbyss,
    blackout: s.blackout.alpha,
    hudShown: hud.cameras.main.alpha === 1,
    redFlash: flashes.slice(flashesBefore).some((f) => f.c === 0xff0820),
    shake: shakes.slice(shakesBefore)[0] ?? null,
    newDuringBlackout: s.obstacles.active.filter((o) => !before.has(o)).length,
  };
  // the first second after the blackout: still nothing new
  const seen = new Set(s.obstacles.active);
  for (let k = 0; k < 58; k++) step();
  const newInSecond = s.obstacles.active.filter((o) => !seen.has(o) && o.type !== "portal").length;
  // and after that, obstacles come again
  let later = 0;
  for (let k = 0; k < 60 * 6 && !later; k++) {
    step();
    later = s.obstacles.active.filter((o) => !seen.has(o)).length;
  }
  return { started: true, frames, blackoutAlpha, hudHidden, atEnd, newInSecond, later, state: s.state };
}

async function startRunFrom(page, label) {
  await tap(page, label, 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 50);
}

for (const reduce of [false, true])
  test(`the Abyss entrance: 0.2 s blackout, then the slam; nothing spawns for a second${reduce ? " (Reduce Flashing)" : ""}`, async ({
    page,
  }, testInfo) => {
    test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
    test.setTimeout(240_000);
    const log = await openGame(page, {
      flags: ["god"],
      save: { ...SAVE, settings: { ...SAVE.settings, reduceFlash: reduce } },
    });
    await startRunFrom(page, "ENDLESS");
    expect((await gameState(page)).state).toBe("playing");
    const r = await page.evaluate(watchEntrance, { maxFrames: 60 * 60 * 6 });
    expect(r.started).toBe(true);
    // 0.2 s at 60 fps: 12 frames (one frame either way for rounding)
    expect(r.frames).toBeGreaterThanOrEqual(11);
    expect(r.frames).toBeLessThanOrEqual(13);
    expect(r.hudHidden).toBe(true);
    expect(r.blackoutAlpha).toBe(reduce ? 0.8 : 1);
    expect(r.atEnd.inAbyss).toBe(true);
    expect(r.atEnd.hudShown).toBe(true); // the title slam shows on the HUD straight away
    expect(r.atEnd.redFlash).toBe(true);
    expect(r.atEnd.shake).toBe(reduce ? 0.004 : 0.012);
    if (!reduce) expect(r.atEnd.blackout).toBe(0); // (Reduce Flashing fades it out instead)
    expect(r.atEnd.newDuringBlackout).toBe(0);
    expect(r.newInSecond).toBe(0);
    expect(r.later).toBeGreaterThan(0);
    expect(r.state).toBe("playing");
    expect(log.errors).toEqual([]);
  });

for (const practice of [false, true])
  test(`levels 41-50 open with the same Abyss entrance${practice ? " (practice)" : ""}`, async ({ page }, testInfo) => {
    test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
    test.setTimeout(240_000);
    const log = await openGame(page, { flags: ["god"] });
    for (const n of [41, 50]) {
      await page.evaluate(
        ({ n, practice }) => {
          const g = window.__glydrift;
          for (const k of ["LevelComplete", "Hud", "Game"]) g.scene.stop(k);
          g.scene.start("Game", { mode: "level", level: n, practice });
        },
        { n, practice },
      );
      await run(page, 900);
      const r = await page.evaluate(watchEntrance, { maxFrames: 0, tapFirst: true });
      expect(r.started, `level ${n}`).toBe(true);
      expect(r.frames, `level ${n}`).toBeGreaterThanOrEqual(11);
      expect(r.frames, `level ${n}`).toBeLessThanOrEqual(13);
      expect(r.atEnd.redFlash, `level ${n}`).toBe(true);
      expect(r.atEnd.shake, `level ${n}`).toBe(0.012);
      expect(r.atEnd.newDuringBlackout, `level ${n}`).toBe(0);
      expect(r.newInSecond, `level ${n}`).toBe(0);
      expect(r.later, `level ${n}`).toBeGreaterThan(0);
    }
    // a checkpoint respawn doesn't replay the entrance
    const again = await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      s.respawnWait = true;
      s.startRun();
      return s.blackoutT;
    });
    expect(again).toBe(0);
    expect(log.errors).toEqual([]);
  });
