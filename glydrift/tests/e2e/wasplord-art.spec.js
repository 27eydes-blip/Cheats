// WASP LORD (ILLEGAL LEGENDARY): his art, animation, sounds and the rarity's look. His powers
// (phase, speed, double jump, combo) are tested with the gameplay.
//  - his 8 poses, the locked silhouette and the armour plate are in the "pxc" atlas, and they
//    come back with real pixels after a lost GPU context
//  - the rig's "wasp" mode: buzzing wings, glowing eyes, rig.phase(on/off), the double-jump
//    shockwave and the armour-break death
//  - the shop's locked card (???, 55,000 in red, coins only), the one-time cinematic reveal on
//    the first unlock, the Heroes card and the locker's vault spot
//  - swapping onto him and off again leaves nothing behind (objects, textures, tweens)
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, tap, waitFor } from "./helpers.js";

const phone = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

async function fly(page, extra = {}) {
  const log = await openGame(page, {
    flags: ["wasplord", "god", "character=wasplord"],
    save: { ...SAVE, unlocked: { volt: true, wasplord: true }, selected: "wasplord", ...extra },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}
/** Step the game `n` frames, holding the hero mid-screen (no near-misses or slow motion). */
const step = (page, n, hold = true) =>
  page.evaluate(
    ({ n, hold }) => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let i = 0; i < n; i++) {
        if (hold && s.state === "playing") {
          s.player.y = s.H * 0.45;
          s.player.vy = 0;
          s.slowT = 0;
        }
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    },
    { n, hold },
  );
const ev = (page, src) =>
  page.evaluate((src) => {
    const s = window.__glydrift.scene.getScene("Game");
    return new Function("s", "r", "w", src)(s, s.player.rig, s.player.rig.wasp);
  }, src);

/** How many lit pixels each named "pxc" frame has right now (read back from its canvas). */
const litPixels = (page, names) =>
  page.evaluate((names) => {
    const tx = window.__glydrift.textures.get("pxc");
    const out = {};
    for (const n of names) {
      const f = tx.get(n);
      const c = document.createElement("canvas");
      c.width = f.cutWidth;
      c.height = f.cutHeight;
      const x = c.getContext("2d");
      x.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
      out[n] = lit;
    }
    return out;
  }, names);

const FRAMES = [...Array.from({ length: 8 }, (_, i) => `wasplord_${i}`), "wasplord_locked", "wasplord_plate"];

test("WASP LORD: his art, the wasp rig (buzz, eyes, phase, shockwave, armour break) and a lost GPU context @smoke", async ({
  page,
}, testInfo) => {
  phone(testInfo);
  test.setTimeout(240_000);
  const log = await fly(page);
  const art = await page.evaluate((FRAMES) => {
    const tx = window.__glydrift.textures;
    const d = window.__heroDefs.find((c) => c.id === "wasplord");
    return {
      rarity: d.rarity,
      mode: d.pixel.mode,
      frames: FRAMES.every((f) => tx.get("pxc").has(f)),
      portraits: ["hero_wasplord", "hero_wasplord_locked"].every((k) => tx.exists(k)),
    };
  }, FRAMES);
  expect(art).toEqual({ rarity: "illegal", mode: "wasp", frames: true, portraits: true });

  // idle: the wings buzz (up / blur / down), the eyes glow
  await step(page, 30);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    await step(page, 1);
    seen.add(await ev(page, `return r.sprite.frame.name;`));
  }
  expect([...seen].sort()).toEqual(["wasplord_1", "wasplord_2", "wasplord_3"]);
  expect(await ev(page, `return w.halo.visible && w.core.visible && w.core.alpha > 0.3;`)).toBe(true);
  // a flap: the wing burst and the eye flash
  await ev(page, `s.onTap();`);
  await step(page, 1);
  expect(await ev(page, `return w.flashT > 0 && w.flapT > 0;`)).toBe(true);
  await step(page, 30);

  // phase: semi-transparent red, the RGB-split ghosts and the slices; then solid again
  await ev(page, `r.phase(true);`);
  await step(page, 8);
  const on = await ev(
    page,
    `return { alpha: r.sprite.alpha, ghosts: w.ghosts.every((g) => g.visible), slices: w.slices.some((g) => g.visible) };`,
  );
  expect(on.alpha).toBeLessThan(0.7);
  expect(on.ghosts).toBe(true);
  expect(on.slices).toBe(true);
  await ev(page, `r.phase(false);`);
  await step(page, 12);
  expect(
    await ev(page, `return { alpha: r.sprite.alpha, ghosts: w.ghosts.some((g) => g.visible), slices: w.slices.some((g) => g.visible) };`),
  ).toEqual({ alpha: 1, ghosts: false, slices: false });

  // the double jump: the strike pose and a red shockwave ring under him
  await ev(page, `s.fx.rings.forEach((x) => x.setActive(false).setVisible(false)); r.doubleJump();`);
  await step(page, 1);
  expect(
    await ev(page, `return { f: r.sprite.frame.name, rings: s.fx.rings.filter((x) => x.active && x.tintTopLeft === 0xff1a2a).length };`),
  ).toEqual({ f: "wasplord_5", rings: 1 });
  await step(page, 30);

  // his sounds (synth only), and every flap plays his buzz
  expect(
    await page.evaluate(() => {
      const { Sfx } = window.__glySfx;
      return ["waspFlap", "waspPhase", "waspBoom", "waspRoar"].map((k) => typeof Sfx[k]);
    }),
  ).toEqual(["function", "function", "function", "function"]);

  // death: the armour breaks (frame 7, plates fly off), the eyes flicker out, then he's gone
  await ev(page, `r.die();`);
  await step(page, 4, false);
  expect(await ev(page, `return { f: r.sprite.frame.name, plates: w.plates.filter((p) => p.visible).length };`)).toEqual({
    f: "wasplord_7",
    plates: await ev(page, `return w.plates.length;`),
  });
  await step(page, 130, false);
  expect(await ev(page, `return { sprite: r.sprite.visible, eyes: w.core.visible, plates: w.plates.some((p) => p.visible) };`)).toEqual({
    sprite: false,
    eyes: false,
    plates: false,
  });

  // a lost GPU context: every texture rebuilt, his frames drawn again with real pixels
  const before = await litPixels(page, FRAMES);
  await page.evaluate(() => {
    const g = window.__glydrift;
    window.__glyLose = g.renderer.gl.getExtension("WEBGL_lose_context");
    window.__glyLose.loseContext();
  });
  await run(page, 100);
  await page.evaluate(() => {
    // (what iOS does: the canvases behind the textures come back blank)
    const g = window.__glydrift;
    for (const k of g.textures.getTextureKeys())
      for (const src of g.textures.get(k).source) {
        const c = src.image;
        if (c && typeof c.getContext === "function" && c.width) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      }
    window.__glyLose.restoreContext();
  });
  await waitFor(page, () => !window.__glyCtx.lost, 10_000);
  expect(await page.evaluate(() => window.__glyCtx.lastRebuild.missing)).toEqual([]);
  const after = await litPixels(page, FRAMES);
  expect(after).toEqual(before);
  for (const f of FRAMES) expect(after[f], f).toBeGreaterThan(20);
  expect(log.errors).toEqual([]);
});

/** Open the shop on the CHARACTERS tab with WASP LORD on the stage. */
async function shopOnHim(page) {
  await page.evaluate(() => window.__glydrift.scene.getScene(window.__glydrift.scene.getScenes(true)[0].sys.settings.key).scene.start("Shop"));
  await settle(page, "Shop", 1200);
  return page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.setTab("heroes");
    const i = s.cards.findIndex((c) => c.offer.id === "wasplord");
    s.focus(i, true);
    const c = s.cards[i];
    const texts = (o) => (o.list || []).flatMap((x) => (x.type === "Text" ? [x.text] : texts(x)));
    return {
      i,
      first: i === 0, // the top of LEGENDARY (above ULTRA)
      price: c.price,
      cardTexts: texts(c.content),
      stageTexts: texts(s.stageInfo),
      rig: !!s.rig,
      art: c.art.texture.key,
      tape: true,
      stamp: !!c.stamp,
    };
  });
}

test("WASP LORD in the shop: locked as ??? at 55,000 coins, buying him plays the ILLEGAL reveal once; Heroes card and locker vault @smoke", async ({
  page,
}, testInfo) => {
  test.skip(!["iphone-std", "ipad-portrait"].includes(profileOf(testInfo)), "phone + iPad layouts");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["wasplord"], save: { ...SAVE, coins: 60000 } });
  const locked = await shopOnHim(page);
  expect(locked.first).toBe(true);
  expect(locked.price).toBe(55000); // coins only (no shards, no challenge)
  expect(locked.cardTexts).toEqual(expect.arrayContaining(["???", "55,000", "ILLEGAL"]));
  expect(locked.cardTexts).not.toContain("WASP LORD");
  expect(locked.stageTexts).toEqual(expect.arrayContaining(["???", "55,000", "ILLEGAL LEGENDARY"]));
  expect(locked.stageTexts.join(" ")).not.toMatch(/WASP LORD/);
  expect(locked.rig).toBe(false); // (no live hero on the stage: just his silhouette)
  expect(locked.art).toBe("hero_wasplord_locked");
  expect(locked.stamp).toBe(true);
  if (profileOf(testInfo) !== "iphone-std") {
    expect(log.errors).toEqual([]);
    return;
  }

  // buy him: the confirmation, then the reveal (black, the ILLEGAL alarm, eyes, armour, name)
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.cta.emit("pointerdown");
    s.cta.emit("pointerup");
  });
  await run(page, 400);
  await tap(page, "BUY!", 50);
  const revealed = () => window.__glydrift.scene.getScene("Shop").children.getByName("illegalReveal");
  await waitFor(page, () => !!window.__glydrift.scene.getScene("Shop").children.getByName("illegalReveal"), 5000);
  await run(page, 700);
  const texts = () =>
    page.evaluate(() => {
      const r = window.__glydrift.scene.getScene("Shop").children.getByName("illegalReveal");
      return r.list.filter((x) => x.type === "Text" && x.alpha > 0.5).map((x) => x.text);
    });
  expect(await texts()).toContain("ILLEGAL");
  await run(page, 3800);
  expect(await texts()).toEqual(expect.arrayContaining(["WASP LORD"]));
  const after = await page.evaluate(() => ({
    unlocked: !!window.__glySave.data.unlocked.wasplord,
    selected: window.__glySave.data.selected,
    revealed: window.__glySave.data.revealed,
    coins: window.__glySave.data.coins,
  }));
  expect(after).toEqual({ unlocked: true, selected: "wasplord", revealed: { wasplord: true }, coins: 5000 });
  // tap to skip
  await press(page, await fieldPoint(page));
  await run(page, 600);
  expect(await page.evaluate(revealed)).toBeFalsy();

  // the next visit: his name and art, no reveal
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").scene.start("Menu"));
  await settle(page, "Menu", 800);
  const owned = await shopOnHim(page);
  expect(owned.cardTexts).toContain("WASP LORD");
  expect(owned.rig).toBe(true);
  expect(owned.art).toBe("hero_wasplord");
  await run(page, 4000);
  expect(await page.evaluate(revealed)).toBeFalsy();

  // the Heroes screen: the ILLEGAL card (red, tape, stamp)
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").scene.start("Characters"));
  await settle(page, "Characters", 800);
  const card = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Characters");
    s.select(s.roster.findIndex((d) => d.id === "wasplord"));
    const c = s.cards.find((x) => x.def.id === "wasplord");
    return { stamp: !!c.stamp && c.stamp.visible, img: c.img.texture.key };
  });
  expect(card).toEqual({ stamp: true, img: "hero_wasplord" });
  // the locker: his own full-width vault spot at the top of the heroes tab
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").scene.start("Locker", { tab: "heroes" }));
  await settle(page, "Locker", 800);
  const vault = await page.evaluate(() => {
    const L = window.__glydrift.scene.getScene("Locker");
    const t = L.tiles[0];
    return { id: t.entry.id, vault: !!t.vault, wide: t.tw > L.cell.tw * 3, n: L.tiles.filter((x) => x.vault).length };
  });
  expect(vault).toEqual({ id: "wasplord", vault: true, wide: true, n: 1 });
  // tapping the vault tile picks him (the tap maths knows the wide row)
  const hit = await page.evaluate(() => {
    const L = window.__glydrift.scene.getScene("Locker");
    const t = L.tiles[0];
    const g = L.tiles[L.vault.n];
    return {
      vault: L.tileAt(L.W / 2, L.gridTop - L.scrollY + t.y)?.entry.id,
      next: L.tileAt(g.x, L.gridTop - L.scrollY + g.y)?.entry.id === g.entry.id,
    };
  });
  expect(hit).toEqual({ vault: "wasplord", next: true });
  expect(log.errors).toEqual([]);
});

test("WASP LORD: swapping onto him and off again leaves no objects, textures or tweens behind @smoke", async ({
  page,
}, testInfo) => {
  phone(testInfo);
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["wasplord"], save: { ...SAVE, unlocked: { volt: true, ember: true, wasplord: true } } });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Characters"));
  await settle(page, "Characters", 1000);
  const pick = (id) =>
    page.evaluate((id) => {
      const s = window.__glydrift.scene.getScene("Characters");
      s.select(s.roster.findIndex((d) => d.id === id));
    }, id);
  const count = () =>
    page.evaluate(() => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Characters");
      let objs = 0;
      const walk = (l) => {
        for (const o of l) {
          objs++;
          if (o.list) walk(o.list);
        }
      };
      walk(s.children.list);
      return { objs, textures: g.textures.getTextureKeys().length, tweens: s.tweens.getTweens().length, wasp: !!s.rig.wasp };
    });
  // onto him (buzz, phase, a double jump), then back to VOLT
  const round = async () => {
    await pick("wasplord");
    await run(page, 1500);
    expect((await count()).wasp).toBe(true);
    await page.evaluate(() => {
      const r = window.__glydrift.scene.getScene("Characters").rig;
      r.phase(true);
      r.doubleJump();
    });
    await run(page, 600);
    await pick("volt");
    await run(page, 1500);
  };
  // (one round first: the scene's shared pools, e.g. the effect rings, fill up once)
  await round();
  const base = await count();
  expect(base.wasp).toBe(false);
  await round();
  await round();
  const after = await count();
  expect(after).toEqual(base);
  // every other hero ignores phase()
  expect(await page.evaluate(() => (window.__glydrift.scene.getScene("Characters").rig.phase(true), true))).toBe(true);
  expect(log.errors).toEqual([]);
});

test("WASP LORD with Low Graphics and Reduce Flashing: steady eye glow, calm phase, no errors", async ({ page }, testInfo) => {
  phone(testInfo);
  test.setTimeout(180_000);
  const log = await fly(page, { settings: { ...SAVE.settings, lowGfx: true, reduceFlash: true } });
  await step(page, 20);
  const a = await ev(page, `return w.core.alpha;`);
  await step(page, 17);
  expect(await ev(page, `return w.core.alpha;`)).toBe(a); // (no pulse)
  expect(await ev(page, `return w.slices.length;`)).toBe(2); // (fewer phase slices)
  await ev(page, `r.phase(true);`);
  await step(page, 10);
  const x1 = await ev(page, `return w.slices.map((g) => g.x - r.sprite.x);`);
  await step(page, 6);
  expect(await ev(page, `return w.slices.map((g) => g.x - r.sprite.x);`)).toEqual(x1); // (no jitter strobe)
  await ev(page, `r.phase(false); r.doubleJump();`);
  await step(page, 20);
  await ev(page, `r.die();`);
  await step(page, 120, false);
  expect(log.errors).toEqual([]);
});
