// Overnight check B (Sakura Skies): regressions for the bugs found and fixed that night.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, tap } from "./helpers.js";

async function startRun(page) {
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
}

// A Sakura hazard's hitbox must follow its drawn pixels: the bird (its hit circle) dies only
// when it really touches the art (a miss off a bamboo blade's tip used to kill ~16 px away),
// and can't sit visibly on the art and live (a bell's lip corners / a lantern's caps were
// ~20 px of "safe" art). Measured straight from the atlas the game draws, at many angles.
test("Sakura hazards: hitboxes match the drawn art at every angle @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "pure geometry: once per browser");
  test.setTimeout(600_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const out = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    const mgr = s.obstacles;
    const tex = g.textures.get("skh");
    const img = tex.getSourceImage();
    const ctx = img.getContext("2d", { willReadFrequently: true });
    const R = 21; // the hero's hit radius (config.js PLAYER.radius)
    // opaque pixels of a frame (sampled every 2 px), placed with the image's origin + rotation
    const artOf = (frame, ox, oy, rot, cx, cy) => {
      const f = tex.get(frame);
      const d = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const pts = [];
      for (let y = 0; y <= f.cutHeight; y += 2)
        for (let x = 0; x <= f.cutWidth; x += 2) {
          // a sample point counts if any pixel touching it is opaque
          let on = false;
          for (const [i, j] of [[x, y], [x - 1, y], [x, y - 1], [x - 1, y - 1]])
            if (i >= 0 && j >= 0 && i < f.cutWidth && j < f.cutHeight && d[(j * f.cutWidth + i) * 4 + 3] > 0)
              on = true;
          if (!on) continue;
          const lx = x - ox * f.cutWidth;
          const ly = y - oy * f.cutHeight;
          pts.push([cx + lx * c - ly * sn, cy + lx * sn + ly * c]);
        }
      return pts;
    };
    // worst "died without touching" (phantom) and "touched without dying" (lenient), in px
    const measure = (o, pts, cx, cy, ext) => {
      let phantom = -1e9;
      let lenient = -1e9;
      for (let py = cy - ext; py <= cy + ext; py += 3)
        for (let px = cx - ext; px <= cx + ext; px += 3) {
          const c = o.clearance(px, py, R);
          if (c > 30) continue;
          let d = 1e18;
          for (const [x, y] of pts) d = Math.min(d, (x - px) ** 2 + (y - py) ** 2);
          d = Math.sqrt(d) - R;
          if (c < 0) phantom = Math.max(phantom, d);
          else lenient = Math.max(lenient, -d);
        }
      return { phantom: Math.round(phantom * 10) / 10, lenient: Math.round(lenient * 10) / 10 };
    };
    // (obtain() puts a hazard in the live list: take it out again, the run carries on clean)
    const done = (o) => {
      o.kill();
      mgr.active.splice(mgr.active.indexOf(o), 1);
    };
    const res = [];
    const X = 300;
    const Y = 400;
    // bamboo blades, short and long, a quarter turn in its 32 steps (the shape is symmetric)
    for (const long of [false, true]) {
      const o = mgr.obtain("bamboo");
      o.spawn(X, { y: Y, long });
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 32;
        o.x = X;
        o.y = Y;
        o.ca = Math.cos(a);
        o.sa = Math.sin(a);
        const pts = artOf(long ? "bamboo_l" : "bamboo_s", 0.5, 0.5, a, X, Y);
        res.push({ id: `bamboo_${long ? "l" : "s"} ${k}/32`, ...measure(o, pts, X, Y, o.hl + 40) });
      }
      done(o);
    }
    // temple bell across its swing (the bell turns by -angle about its centre)
    {
      const o = mgr.obtain("bell");
      o.spawn(X, { L: 300, amp: 0.48 });
      const b = o.bell;
      for (const a of [-0.48, -0.25, 0, 0.25, 0.48]) {
        o.bx = X;
        o.by = Y;
        o.bc = Math.cos(a);
        o.bs = Math.sin(a);
        const pts = artOf("bell", b.originX, b.originY, -a, X, Y);
        res.push({ id: `bell ${a}`, ...measure(o, pts, X, Y, 90) });
      }
      done(o);
    }
    // paper lantern, lit and dark frames
    for (const frame of ["lantern_0", "lantern_1"]) {
      const o = mgr.obtain("lantern");
      o.spawn(X, { y: Y });
      o.cx = X;
      o.y = Y;
      const pts = artOf(frame, 0.5, 0.5, 0, X, Y);
      res.push({ id: frame, ...measure(o, pts, X, Y, 70) });
      done(o);
    }
    return res;
  });
  for (const r of out) {
    // (a few px either way is the 12% hitbox shrink every hazard has, plus pixel rounding)
    expect(r.phantom, `${r.id}: hit while clear of the art`).toBeLessThanOrEqual(4);
    expect(r.lenient, `${r.id}: overlapping the art without a hit`).toBeLessThanOrEqual(13);
  }
  expect(log.errors).toEqual([]);
});

// The title screen shows Neon Void and the furthest realm the player has flown. Sakura Skies
// isn't on stats.maxBiome's ladder (it has its own discovered flag), so a player whose furthest
// realm was Sakura Skies only ever saw Neon Void there.
test("home backdrop: Sakura Skies is shown when it's the furthest realm reached @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "save logic: once per browser");
  const cases = [
    [{ stats: { maxBiome: 0 }, realms: { sakura: true } }, ["void", "sakura"]],
    [{ stats: { maxBiome: 0 } }, ["void"]],
    [{ stats: { maxBiome: 2 }, realms: { sakura: true } }, ["void", "frozen"]],
  ];
  const log = await openGame(page, { save: { ...SAVE, ...cases[0][0] } });
  for (const [extra, want] of cases) {
    await page.evaluate((extra) => {
      const d = window.__glySave.data;
      Object.assign(d.stats, extra.stats);
      d.realms = { ...(extra.realms || {}) };
      const m = window.__glydrift.scene.getScene("Menu");
      m.showIds = null; // (re-picked on the next frame, as on every visit to the home screen)
    }, extra);
    await run(page, 100);
    const got = await page.evaluate(() => window.__glydrift.scene.getScene("Menu").showIds);
    expect(got, JSON.stringify(extra)).toEqual(want);
  }
  expect(log.errors).toEqual([]);
});
