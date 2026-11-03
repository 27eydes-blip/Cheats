// Full-screen moments: the hero unlock reveal (dark → spotlight → hero spins in → rarity
// burst) and the level-up celebration. Built from plain images/tweens (no shaders); they
// never pause gameplay because they only ever run on menu / results screens.
import Phaser from "phaser";
import { RARITY, VIEW } from "../config.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { addAtlas, PixelCanvas } from "../pixel/px.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { hex, neonText, plainText } from "./ui.js";

const ADD = Phaser.BlendModes.ADD;

/** Stepped pixel spotlight beam (narrow at the top, wide at the bottom). */
function beamTexture(scene) {
  if (scene.textures.exists("spotbeam")) return;
  const w = 40;
  const h = 64;
  const c = scene.textures.createCanvas("spotbeam", w, h);
  const ctx = c.getContext();
  for (let y = 0; y < h; y++) {
    const half = 4 + (y / h) * 15;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - w / 2) / half;
      if (d > 1) continue;
      const a = d < 0.35 ? 0.34 : d < 0.7 ? 0.2 : 0.1;
      ctx.fillStyle = `rgba(255,255,255,${a * (0.55 + 0.45 * (y / h))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  c.refresh();
  c.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Burst of glowing pixels flying out from (x, y). */
function burst(scene, cont, x, y, color, n = 28, dist = 420) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const r = dist * (0.5 + Math.random() * 0.5);
    const p = scene.add
      .image(x, y, "pxglow")
      .setScale(4 * (Math.random() < 0.3 ? 2 : 1))
      .setTint(Math.random() < 0.25 ? 0xffffff : color)
      .setBlendMode(ADD);
    cont.add(p);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * r,
      y: y + Math.sin(a) * r,
      alpha: 0,
      duration: 700 + Math.random() * 400,
      ease: "Cubic.easeOut",
    });
  }
}

/**
 * Character unlock reveal. Tap to close after the burst (auto-closes after ~3.4 s).
 * @returns Promise that resolves when it has closed
 */
export function revealHero(scene, def, { depth = 900, title = "UNLOCKED!" } = {}) {
  beamTexture(scene);
  const W = VIEW.W;
  const H = VIEW.H;
  const rc = RARITY[def.rarity]?.color ?? def.color;
  const cy = H * 0.44;
  const cont = scene.add.container(0, 0).setDepth(depth);
  const dark = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x000000, 0).setInteractive();
  const beam = scene.add
    .image(W / 2, -20, "spotbeam")
    .setOrigin(0.5, 0)
    .setDisplaySize(W * 0.9, cy + 220)
    .setBlendMode(ADD)
    .setTint(0xfff6e0)
    .setAlpha(0);
  const pool = scene.add
    .image(W / 2, cy + 200, "pxglow")
    .setScale(4 * 7, 4 * 2)
    .setBlendMode(ADD)
    .setTint(rc)
    .setAlpha(0);
  const hero = scene.add.image(W / 2, cy - 160, def.texture).setAlpha(0);
  const base = 440 / Math.max(hero.width, hero.height);
  const yarms = def.id === "yarms";
  const name = neonText(
    scene,
    W / 2,
    cy + 270,
    yarms ? "YARMS UNLOCKED" : def.name,
    yarms ? 58 : 64,
    def.color,
    { blur: 18 },
  ).setAlpha(0);
  const sub = plainText(
    scene,
    W / 2,
    cy + 336,
    `${RARITY[def.rarity]?.label ?? ""} · ${title}`,
    24,
    hex(rc),
  ).setAlpha(0);
  const hint = plainText(scene, W / 2, H * 0.9, "TAP TO CONTINUE", 18, "#cfc6ff").setAlpha(0);
  const flash = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0xffffff, 0);
  cont.add([dark, beam, pool, hero, name, sub, hint, flash]);

  Sfx.reveal();
  scene.tweens.add({ targets: dark, fillAlpha: 0.9, duration: 260 });
  scene.tweens.add({ targets: beam, alpha: 1, duration: 300, delay: 180 });
  scene.tweens.add({ targets: pool, alpha: 0.9, duration: 300, delay: 260 });
  // the hero drops into the light, spinning (scaleX through ±), slowing to face us
  const spin = { k: 0 };
  scene.tweens.add({
    targets: spin,
    k: 1,
    duration: 950,
    delay: 250,
    ease: "Cubic.easeOut",
    onStart: () => hero.setAlpha(1),
    onUpdate: () => {
      const k = spin.k;
      hero
        .setScale(base * Math.cos(k * Math.PI * 6) * (0.35 + 0.65 * k), base * (0.35 + 0.65 * k))
        .setY(cy - 160 * (1 - k));
    },
  });
  let closable = false;
  let closed = false;
  return new Promise((resolve) => {
    const close = () => {
      if (closed) return;
      closed = true;
      scene.tweens.add({
        targets: cont,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          cont.destroy();
          resolve();
        },
      });
    };
    scene.time.delayedCall(1200, () => {
      // the burst, in the rarity colour
      if (yarms) {
        // he lands... and FLEXES: swap to the flex pose, gold flash, the title slams in
        hero.setTexture("hero_yarms_flex");
        flash.fillColor = 0xffd23f;
        Sfx.flex();
        scene.tweens.add({ targets: hero, scaleY: hero.scaleY * 1.12, duration: 120, yoyo: true });
      }
      flash.fillAlpha = reduceFlashing() ? 0.08 : 0.38; // Reduce Flashing: a soft glow only
      scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 380 });
      burst(scene, cont, W / 2, cy, rc, { ultra: 70, mega: 56, legendary: 44 }[def.rarity] ?? 30);
      for (const [s, d] of [
        [7, 0],
        [10, 120],
      ]) {
        const ring = scene.add
          .image(W / 2, cy, "pxglow")
          .setScale(4 * 2)
          .setTint(rc)
          .setBlendMode(ADD);
        cont.add(ring);
        scene.tweens.add({
          targets: ring,
          scale: 4 * s,
          alpha: 0,
          duration: 650,
          delay: d,
          ease: "Cubic.easeOut",
        });
      }
      scene.tweens.add({ targets: [name, sub], alpha: 1, duration: 260 });
      scene.tweens.add({
        targets: name,
        scale: { from: yarms ? 3 : 1.5, to: 1 },
        duration: yarms ? 260 : 360,
        ease: yarms ? "Cubic.easeIn" : "Back.easeOut",
        onComplete: () => yarms && scene.cameras.main.shake(220, 0.012),
      });
      scene.cameras.main.shake(180, 0.006);
      Haptics.strong();
    });
    scene.time.delayedCall(1500, () => {
      closable = true;
      scene.tweens.add({ targets: hint, alpha: 0.8, duration: 300 });
    });
    scene.time.delayedCall(3400, close);
    dark.on("pointerdown", () => closable && close());
  });
}

/**
 * Full-screen level-up celebration (non-blocking: it never captures input and fades out
 * on its own in ~1.4 s).
 */
export function levelUpCelebration(scene, level, subText, { depth = 800 } = {}) {
  const W = VIEW.W;
  const H = VIEW.H;
  const cont = scene.add.container(0, 0).setDepth(depth);
  const dim = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x041018, 0);
  const glow = scene.add
    .image(W / 2, H * 0.42, "pxglow")
    .setScale(4 * 3)
    .setTint(0x3ef4ff)
    .setBlendMode(ADD)
    .setAlpha(reduceFlashing() ? 0.3 : 0.9);
  const big = neonText(scene, W / 2, H * 0.38, "LEVEL UP!", 74, 0x3ef4ff, { blur: 22 });
  const lv = neonText(scene, W / 2, H * 0.46, `LV ${level}`, 96, 0xffffff, { blur: 26 });
  const sub = plainText(scene, W / 2, H * 0.53, subText || "", 24, "#bdf9ff");
  cont.add([dim, glow, big, lv, sub]);
  Sfx.levelUp();
  Haptics.strong();
  scene.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 160 });
  scene.tweens.add({
    targets: glow,
    scale: 4 * 14,
    alpha: 0,
    duration: 900,
    ease: "Cubic.easeOut",
  });
  scene.tweens.add({
    targets: [big, lv],
    scale: { from: 0.4, to: 1 },
    duration: 380,
    ease: "Back.easeOut",
  });
  burst(scene, cont, W / 2, H * 0.44, 0x3ef4ff, 36, 520);
  burst(scene, cont, W / 2, H * 0.44, 0xffd23f, 14, 380);
  scene.time.delayedCall(1100, () =>
    scene.tweens.add({
      targets: cont,
      alpha: 0,
      duration: 320,
      onComplete: () => cont.destroy(),
    }),
  );
}

/** Pixel treasure chest (closed / open) for the daily reward. */
function chestTextures(scene) {
  if (scene.textures.exists("chest")) return;
  const W = 22;
  const H = 20;
  const wood = 0x8a4a1a;
  const woodL = 0xb86a2a;
  const woodD = 0x5a2a0a;
  const gold = 0xffd23f;
  const goldD = 0xc8901a;
  const make = (open) => {
    const pc = new PixelCanvas(W, H);
    // body
    pc.rect(1, 9, 20, 10, wood).hline(1, 20, 9, woodL).hline(1, 20, 18, woodD);
    for (const x of [1, 10, 11, 20]) pc.vline(x, 9, 18, goldD);
    pc.rect(9, 10, 4, 4, gold).set(10, 12, woodD).set(11, 12, woodD); // lock
    if (open) {
      // lid tipped back + treasure glow spilling out
      pc.rect(2, 1, 18, 4, wood).hline(2, 19, 1, woodL).hline(2, 19, 4, goldD);
      pc.rect(3, 5, 16, 4, 0xfff1a0).hline(4, 17, 6, 0xffffff);
      for (const x of [5, 9, 13, 16]) pc.set(x, 8, gold).set(x + 1, 7, gold);
    } else {
      pc.rect(1, 4, 20, 6, wood).hline(1, 20, 4, woodL).hline(2, 19, 3, woodL);
      pc.hline(1, 20, 9, goldD);
      for (const x of [1, 10, 11, 20]) pc.vline(x, 3, 9, goldD);
    }
    return pc.outline(0x1a0a02, 1);
  };
  addAtlas(scene, "chest", { chest_0: make(false), chest_1: make(true) });
}

/**
 * Animated daily-reward chest at (x, y): pops in, shakes, bursts open.
 * Resolves (with the chest's position) the moment it opens, so coins can fly out.
 */
export function openChest(scene, x, y, { depth = 450 } = {}) {
  chestTextures(scene);
  const W = VIEW.W;
  const H = VIEW.H;
  const cont = scene.add.container(0, 0).setDepth(depth);
  const dim = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x020107, 0);
  const glow = scene.add
    .image(x, y, "pxglow")
    .setScale(4 * 3)
    .setTint(0xffd23f)
    .setBlendMode(ADD)
    .setAlpha(0);
  const chest = scene.add.image(x, y, "chest", "chest_0").setScale(0);
  cont.add([dim, glow, chest]);
  scene.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 200 });
  scene.tweens.add({ targets: chest, scale: 6, duration: 320, ease: "Back.easeOut" });
  return new Promise((resolve) => {
    // three shakes, each a little stronger, the glow building up behind it
    [0, 1, 2].forEach((i) => {
      scene.time.delayedCall(420 + i * 230, () => {
        Sfx.chestShake();
        scene.tweens.add({
          targets: chest,
          angle: { from: -6 - i * 3, to: 6 + i * 3 },
          duration: 60,
          yoyo: true,
          repeat: 1,
          onComplete: () => chest.setAngle(0),
        });
        glow.setAlpha((0.25 + i * 0.2) * (reduceFlashing() ? 0.4 : 1));
      });
    });
    scene.time.delayedCall(1150, () => {
      chest.setFrame("chest_1");
      Sfx.chestOpen();
      Haptics.strong();
      scene.tweens.add({
        targets: chest,
        scale: { from: 7, to: 6 },
        duration: 260,
        ease: "Back.easeOut",
      });
      scene.tweens.add({
        targets: glow,
        scale: 4 * 16,
        alpha: 0,
        duration: 800,
        ease: "Cubic.easeOut",
      });
      burst(scene, cont, x, y - 30, 0xffd23f, 30, 360);
      resolve({ x, y: y - 40 });
      scene.time.delayedCall(1300, () =>
        scene.tweens.add({
          targets: cont,
          alpha: 0,
          duration: 300,
          onComplete: () => cont.destroy(),
        }),
      );
    });
  });
}
