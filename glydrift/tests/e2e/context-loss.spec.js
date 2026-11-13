// A lost GPU context (iPad Safari under memory pressure): the run pauses at once, every texture
// is rebuilt when the context is back (even if the browser wiped the canvases they came from),
// and the game shows everything again. If it never comes back, the run ends safely.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, reseed, run, settle, tap, waitFor } from "./helpers.js";

/** Fly a god run forward `frames` frames (logic only), keeping the game's clock continuous. */
const fly = (page, frames) =>
  page.evaluate((frames) => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    window.__T ??= performance.now();
    const frozen = Date.now;
    const base = frozen();
    const t0 = window.__T;
    Date.now = () => base + (window.__T - t0);
    window.__glyNoRender = true;
    for (let i = 0; i < frames && s.state === "playing"; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      window.__T += 1000 / 60;
      g.step(window.__T, 1000 / 60);
    }
    window.__glyNoRender = false;
    Date.now = frozen;
    return { m: Math.floor(s.meters), zone: s.zoneId, state: s.state };
  }, frames);

const loseContext = (page) =>
  page.evaluate(() => {
    const gl = window.__glydrift.renderer.gl;
    window.__glyLose = gl.getExtension("WEBGL_lose_context");
    window.__glyLose.loseContext();
  });

/** What iOS does to the 2D canvases in a GPU reset: every one of them comes back blank. */
const wipeCanvases = (page) =>
  page.evaluate(() => {
    const g = window.__glydrift;
    let n = 0;
    const seen = new Set();
    const wipe = (c) => {
      if (!c || seen.has(c) || typeof c.getContext !== "function" || !c.width) return;
      seen.add(c);
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      n++;
    };
    for (const k of g.textures.getTextureKeys())
      for (const src of g.textures.get(k).source) wipe(src.image);
    return n;
  });

/**
 * The game's own frame (read from the WebGL canvas: page screenshots of it come out black in
 * Firefox), as the average colour of each cell of a 12 x 16 grid, plus the share of lit pixels.
 */
async function grabFrame(page) {
  await page.evaluate(() => {
    window.__glyFrame = null;
    window.__glyRender = true;
    window.__glydrift.renderer.snapshot((img) => {
      const W = 120;
      const H = 160;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      const cells = [];
      let lit = 0;
      for (let cy = 0; cy < 16; cy++)
        for (let cx = 0; cx < 12; cx++) {
          const m = [0, 0, 0];
          for (let y = cy * 10; y < cy * 10 + 10; y++)
            for (let xx = cx * 10; xx < cx * 10 + 10; xx++) {
              const i = (y * W + xx) * 4;
              m[0] += d[i];
              m[1] += d[i + 1];
              m[2] += d[i + 2];
              if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
            }
          cells.push(m.map((v) => v / 100));
        }
      window.__glyFrame = { cells, lit: lit / (W * H) };
    });
  });
  await waitFor(page, () => window.__glyFrame !== null, 5000);
  return page.evaluate(() => window.__glyFrame);
}

/**
 * Share of grid cells whose average colour changed a lot. Blank textures change most cells;
 * rebuilt scenery (its decorations are placed at random again) only a few.
 */
function diffRatio(a, b) {
  let changed = 0;
  a.cells.forEach((ca, i) => {
    const cb = b.cells[i];
    if (Math.max(...ca.map((v, k) => Math.abs(v - cb[k]))) > 24) changed++;
  });
  return { diff: changed / a.cells.length, lit: b.lit };
}

async function startGodRun(page) {
  const log = await openGame(page, { flags: ["god"] });
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}

test("lost GPU context mid-run: pauses at once, rebuilds every texture, everything visible again @smoke", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const log = await startGodRun(page);
  // into Sakura Skies, with hazards and the realm's own art on screen
  const at = await fly(page, 60 * 30);
  expect(at.state).toBe("playing");
  // (the frame to compare against, with the world held still so it's the very frame the
  // context is lost on)
  await page.evaluate(() => window.__glydrift.scene.pause("Game"));
  const before = await grabFrame(page);

  // flying again, and the context goes in the same moment (no frame in between)
  await page.evaluate(() => {
    window.__glydrift.scene.resume("Game");
    const gl = window.__glydrift.renderer.gl;
    window.__glyLose = gl.getExtension("WEBGL_lose_context");
    window.__glyLose.loseContext();
  });
  await run(page, 50);
  const lost = await page.evaluate(() => {
    const gs = window.__glydrift.scene.getScene("Game");
    return {
      lost: window.__glyCtx.lost,
      paused: gs.sys.isPaused(),
      state: gs.state,
      m: gs.meters,
      note: document.getElementById("gfx-note")?.textContent || null,
      checkpoint: !!localStorage.getItem("glydrift.liveRun"),
    };
  });
  expect(lost.lost).toBe(true);
  expect(lost.paused, "the run stops the moment the graphics go").toBe(true);
  expect(lost.state).toBe("playing");
  expect(lost.note).toMatch(/Restoring graphics/);
  expect(lost.checkpoint, "the run is checkpointed").toBe(true);
  // nothing moves while the screen can't be drawn
  await run(page, 2000);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").meters)).toBe(lost.m);

  // the canvases behind every texture are wiped too (iOS), then the context comes back
  expect(await wipeCanvases(page)).toBeGreaterThan(100);
  await page.evaluate(() => window.__glyLose.restoreContext());
  await waitFor(page, () => !window.__glyCtx.lost, 10_000);
  const back = await page.evaluate(() => {
    const g = window.__glydrift;
    const hud = g.scene.getScene("Hud");
    return {
      rebuild: window.__glyCtx.lastRebuild,
      note: !!document.getElementById("gfx-note"),
      paused: g.scene.getScene("Game").sys.isPaused(),
      pauseMenu: !!hud.pauseLayer,
      gaveUp: window.__glyCtx.gaveUp,
    };
  });
  expect(back.gaveUp).toBeNull();
  expect(back.rebuild.missing).toEqual([]);
  expect(back.rebuild.rebuilt).toBeGreaterThan(100);
  expect(back.note).toBe(false);
  expect(back.paused, "still paused: the player resumes").toBe(true);
  expect(back.pauseMenu, "the PAUSED menu is up").toBe(true);

  // the frozen frame looks the same as before the loss (pause menu out of the way)
  await page.evaluate(() => window.__glydrift.scene.getScene("Hud").pauseLayer.setVisible(false));
  const after = await grabFrame(page);
  const cmp = diffRatio(before, after);
  console.log("context restore diff", JSON.stringify(cmp));
  // (without the rebuild: ~88% of the cells change and only a third of the screen is lit;
  // with it: a few cells, where the rebuilt scenery placed its decorations differently)
  expect(cmp.diff, "hero, hazards and scenery are all drawn again").toBeLessThan(0.3);
  expect(cmp.lit).toBeGreaterThan(0.6);

  // RESUME: the run carries on and keeps scoring
  await page.evaluate(() => window.__glydrift.scene.getScene("Hud").pauseLayer.setVisible(true));
  await page.evaluate(() => window.__glydrift.scene.getScene("Hud").resume());
  const go = await fly(page, 60 * 5);
  expect(go.state).toBe("playing");
  expect(go.m).toBeGreaterThan(at.m);
  expect(log.errors).toEqual([]);
});

test("GPU context that never comes back: the run ends safely, the score is saved, home screen @smoke", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const log = await startGodRun(page);
  const at = await fly(page, 60 * 12);
  expect(at.state).toBe("playing");
  const before = await page.evaluate(() => {
    const st = window.__glySave.data.stats;
    return { runs: st.runs ?? st.totalRuns ?? 0, dist: st.totalDistance ?? st.distance ?? 0 };
  });
  await loseContext(page);
  await run(page, 50);
  expect(await page.evaluate(() => window.__glyCtx.lost)).toBe(true);
  // no context for 8 s of the game on screen → the run ends, the page starts again
  const reloaded = page.waitForEvent("load", { timeout: 60_000 });
  for (let i = 0; i < 12 && (await page.evaluate(() => !window.__glyCtx.gaveUp)); i++) await run(page, 1000);
  const ended = await page.evaluate(() => ({
    gaveUp: window.__glyCtx.gaveUp,
    note: document.getElementById("gfx-note")?.textContent || "",
    over: window.__glydrift.scene.isActive("GameOver"),
    live: localStorage.getItem("glydrift.liveRun"),
    save: JSON.parse(localStorage.getItem("glydrift.save.v1")).stats,
  }));
  expect(ended.gaveUp).toBe("timeout");
  expect(ended.note).toMatch(/saved/);
  expect(ended.over, "ended the normal way (score committed)").toBe(true);
  expect(ended.live, "no half-finished run left behind").toBeNull();
  const runsNow = ended.save.runs ?? ended.save.totalRuns ?? 0;
  expect(runsNow).toBe(before.runs + 1);
  await run(page, 2000); // → reload
  await reloaded;
  await page.waitForTimeout(500);
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  const home = await page.evaluate(() => ({
    lost: window.__glyCtx.lost,
    runs: window.__glySave.data.stats.runs ?? window.__glySave.data.stats.totalRuns ?? 0,
  }));
  expect(home.lost).toBe(false);
  expect(home.runs).toBe(runsNow); // (counted once: not again at the next launch)
  expect(log.errors).toEqual([]);
});

test("GPU context lost on the home screen: comes back with the screen rebuilt", async ({ page }) => {
  const log = await openGame(page);
  const before = await grabFrame(page);
  await loseContext(page);
  await run(page, 300);
  expect(await page.evaluate(() => window.__glyCtx.lost)).toBe(true);
  await wipeCanvases(page);
  await page.evaluate(() => window.__glyLose.restoreContext());
  await waitFor(page, () => !window.__glyCtx.lost, 10_000);
  expect(await page.evaluate(() => window.__glyCtx.lastRebuild.missing)).toEqual([]);
  await run(page, 3000); // (the home screen starts again: let its fade-in finish)
  const after = await grabFrame(page);
  const cmp = diffRatio(before, after);
  console.log("home restore diff", JSON.stringify(cmp));
  expect(cmp.lit).toBeGreaterThan(0.05);
  expect(cmp.diff).toBeLessThan(0.15); // (the home screen animates: its ticker, the hero)
  expect(log.errors).toEqual([]);
});

test("GPU context lost while the next realm's art is still uploading: rebuilt in full", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const log = await startGodRun(page);
  await fly(page, 60 * 3);
  // the next realm's uploads are part-way through (they're spread over ~20 frames)
  const mid = await page.evaluate(() => {
    const a = window.__glyArt;
    const id = ["solar", "frozen", "glitch"].find((r) => !a.builtBiomes().includes(r));
    a.queueBiomeArt(id);
    for (let i = 0; i < 3; i++) a.pumpBiomeArt();
    return { id, pending: a.pendingBiomes() };
  });
  expect(mid.pending).toContain(mid.id);
  await loseContext(page);
  await run(page, 50);
  await wipeCanvases(page);
  await page.evaluate(() => window.__glyLose.restoreContext());
  await waitFor(page, () => !window.__glyCtx.lost, 10_000);
  const back = await page.evaluate(() => ({
    gaveUp: window.__glyCtx.gaveUp,
    missing: window.__glyCtx.lastRebuild?.missing,
    built: window.__glyArt.builtBiomes(),
    pending: window.__glyArt.pendingBiomes(),
  }));
  expect(back.gaveUp, "the run isn't ended: everything could be rebuilt").toBeNull();
  expect(back.missing).toEqual([]);
  expect(back.built).toContain(mid.id);
  expect(back.pending).toEqual([]);
  expect(log.errors).toEqual([]);
});
