// Full-screen moments: the hero unlock reveal (dark → spotlight → hero spins in → rarity
// burst) and the level-up celebration. Built from plain images/tweens (no shaders); they
// never pause gameplay because they only ever run on menu / results screens.
import Phaser from "phaser";
import { PIXEL_FONT, RARITY, VIEW } from "../config.js";
import { Save } from "../data/save.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { addAtlas, PixelCanvas } from "../pixel/px.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { hex, neonText, plainText } from "./ui.js";
import { tapeBand } from "./illegal.js";

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
  // ILLEGAL LEGENDARY: the first unlock gets its own cinematic (once per save)
  if (def.rarity === "illegal" && !Save.data.revealed?.[def.id]) return revealIllegal(scene, def, { depth, title });
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
  const surf = def.id === "sonjuwon"; // a lightning strike, then it surfs in
  const name = neonText(
    scene,
    W / 2,
    cy + 270,
    yarms ? "YARMS UNLOCKED" : surf ? `${def.name} UNLOCKED` : def.name,
    yarms ? 58 : surf ? 54 : 64,
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
  scene.tweens.add({ targets: dark, fillAlpha: surf ? 0.96 : 0.9, duration: 260 });
  if (!surf) scene.tweens.add({ targets: beam, alpha: 1, duration: 300, delay: 180 });
  scene.tweens.add({ targets: pool, alpha: 0.9, duration: 300, delay: 260 });
  if (surf) {
    // the dark screen splits with a lightning strike…
    scene.time.delayedCall(220, () => {
      const g = scene.add.graphics().setBlendMode(ADD);
      cont.addAt(g, 2);
      let px = W / 2 + 40;
      let py = -20;
      const pts = [[px, py]];
      while (py < cy + 120) {
        px = W / 2 + (Math.random() - 0.5) * 140;
        py += 50 + Math.random() * 40;
        pts.push([px, py]);
      }
      for (const [w, c, a] of [
        [22, 0x3ef4ff, 0.35],
        [9, 0xbffcff, 0.9],
        [4, 0xffffff, 1],
      ]) {
        g.lineStyle(w, c, a).beginPath().moveTo(pts[0][0], pts[0][1]);
        for (const [qx, qy] of pts) g.lineTo(qx, qy);
        g.strokePath();
      }
      scene.tweens.add({ targets: g, alpha: 0, duration: 500, delay: 100 });
      flash.fillColor = 0xbfe8ff;
      flash.fillAlpha = reduceFlashing() ? 0.08 : 0.5;
      scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 300 });
      Sfx.thunder();
      scene.cameras.main.shake(160, 0.01);
    });
  }
  // the hero drops into the light, spinning (scaleX through ±), slowing to face us
  const spin = { k: 0 };
  if (surf) {
    // …then the tiger surfs in from the side on its board, spraying cyan sparks
    hero.setScale(base).setPosition(-260, cy).setAngle(-14);
    scene.tweens.add({
      targets: hero,
      x: W / 2,
      angle: 0,
      duration: 820,
      delay: 520,
      ease: "Cubic.easeOut",
      onStart: () => hero.setAlpha(1),
      onUpdate: (tw) => {
        hero.y = cy + Math.sin(tw.progress * Math.PI * 2) * 18;
        if (Math.random() < 0.6) burst(scene, cont, hero.x - 140, hero.y + 120, 0x3ef4ff, 2, 160);
      },
    });
  } else
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
      if (surf) {
        // electric flash + the name slams in
        flash.fillColor = 0x3ef4ff;
        Sfx.thunder(0.5);
        scene.tweens.add({ targets: hero, scaleY: hero.scaleY * 1.1, duration: 120, yoyo: true });
      }
      if (yarms) {
        // he lands... and FLEXES: swap to the flex pose, gold flash, the title slams in
        hero.setTexture("hero_yarms_flex");
        flash.fillColor = 0xffd23f;
        Sfx.flex();
        scene.tweens.add({ targets: hero, scaleY: hero.scaleY * 1.12, duration: 120, yoyo: true });
      }
      flash.fillAlpha = reduceFlashing() ? 0.08 : 0.38; // Reduce Flashing: a soft glow only
      scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 380 });
      burst(scene, cont, W / 2, cy, rc, { illegal: 80, ultra: 70, mega: 56, legendary: 44 }[def.rarity] ?? 30);
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
        scale: { from: yarms || surf ? 3 : 1.5, to: 1 },
        duration: yarms || surf ? 260 : 360,
        ease: yarms || surf ? "Cubic.easeIn" : "Back.easeOut",
        onComplete: () => (yarms || surf) && scene.cameras.main.shake(220, 0.012),
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

/**
 * The ILLEGAL LEGENDARY unlock (WASP LORD), played once, on his first unlock:
 *   1. the screen goes black and an alarm flashes "ILLEGAL" between bands of warning tape
 *      (Reduce Flashing: a steady red glow, no strobe)
 *   2. two red eyes open in the dark, and the buzz-roar plays
 *   3. the armour slams on (he drops in with a metallic boom, plates and sparks fly)
 *   4. his name drops in big metal letters: WASP LORD
 * Tap to skip (from a moment in) like the other reveals. Resolves when it has closed.
 */
export function revealIllegal(scene, def, { depth = 900, title = "UNLOCKED!" } = {}) {
  (Save.data.revealed ||= {})[def.id] = true;
  Save.write?.();
  const W = VIEW.W;
  const H = VIEW.H;
  const calm = reduceFlashing();
  const RED = 0xff1a2a;
  const cy = H * 0.42;
  const cont = scene.add.container(0, 0).setDepth(depth);
  cont.name = "illegalReveal";
  const timers = [];
  const later = (ms, fn) => timers.push(scene.time.delayedCall(ms, fn));
  const dark = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x000000, 0).setInteractive();
  // 1. the alarm: a red wash, tape bands and the word
  const alarm = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x9a0010, 0);
  const tape = scene.add.graphics().setAlpha(0);
  tapeBand(tape, -40, H * 0.27, W + 80, 54, { stripe: 26 });
  tapeBand(tape, -40, H * 0.56, W + 80, 54, { stripe: 26 });
  const word = scene.add
    .text(W / 2, H * 0.445, "ILLEGAL", {
      fontFamily: PIXEL_FONT,
      fontSize: "112px",
      fontStyle: "700",
      color: "#ff1a2a",
      stroke: "#140004",
      strokeThickness: 16,
      resolution: VIEW.Z,
    })
    .setOrigin(0.5)
    .setAlpha(0);
  word.setScale(Math.min(1, (W - 60) / word.width));
  const warn = plainText(scene, W / 2, H * 0.53, "⚠ UNAUTHORISED HERO DETECTED ⚠", 22, "#ffd0d0").setAlpha(0);
  // 2. the eyes in the dark: two angled slits that open, with a glow
  const eyes = scene.add.container(W / 2, cy).setAlpha(0);
  const eg = scene.add.graphics();
  for (const s of [-1, 1]) {
    eg.fillStyle(RED, 1).fillPoints(
      [
        { x: s * 18, y: -10 },
        { x: s * 96, y: -22 },
        { x: s * 104, y: 4 },
        { x: s * 30, y: 16 },
      ],
      true,
    );
    eg.fillStyle(0xffe0e0, 1).fillPoints(
      [
        { x: s * 40, y: -8 },
        { x: s * 80, y: -14 },
        { x: s * 84, y: 0 },
        { x: s * 46, y: 6 },
      ],
      true,
    );
  }
  const eyeGlow = scene.add.image(0, 0, "pxglow").setScale(4 * 9, 4 * 3).setTint(RED).setBlendMode(ADD).setAlpha(0.8);
  eyes.add([eyeGlow, eg]);
  eyes.setScale(1.5, 0.05);
  // 3. the hero (armour on) and 4. his name
  const hero = scene.add.image(W / 2, cy, def.texture).setAlpha(0);
  const base = 460 / Math.max(hero.width, hero.height);
  const heroGlow = scene.add.image(W / 2, cy, "pxglow").setScale(4 * 12).setTint(RED).setBlendMode(ADD).setAlpha(0);
  const name = scene.add
    .text(W / 2, cy + 300, def.name, {
      fontFamily: PIXEL_FONT,
      fontSize: "92px",
      fontStyle: "700",
      color: "#e4e8f2",
      stroke: "#1a1c24",
      strokeThickness: 14,
      resolution: VIEW.Z,
    })
    .setOrigin(0.5)
    .setAlpha(0);
  name.setShadow(0, 8, "#ff1a2a", 0, true, true);
  const nameK = Math.min(1, (W - 50) / name.width);
  // a metal sheen across the letters (a bright band that sweeps once when they land)
  const sub = plainText(scene, W / 2, cy + 378, `${RARITY[def.rarity]?.label ?? ""} · ${title}`, 24, hex(RED)).setAlpha(0);
  const hint = plainText(scene, W / 2, H * 0.9, "TAP TO CONTINUE", 18, "#ffb0b0").setAlpha(0);
  const flash = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0xffffff, 0);
  cont.add([dark, alarm, tape, word, warn, heroGlow, eyes, hero, name, sub, hint, flash]);

  scene.tweens.add({ targets: dark, fillAlpha: 1, duration: 180 });
  // 1. the alarm (0.2 s - 1.5 s): three red flashes, or one steady glow with Reduce Flashing
  later(200, () => {
    Sfx.waspPhase?.();
    tape.setAlpha(1);
    word.setAlpha(1);
    warn.setAlpha(1);
    if (calm) alarm.fillAlpha = 0.35;
    else
      scene.tweens.add({
        targets: alarm,
        fillAlpha: { from: 0.7, to: 0.08 },
        duration: 200,
        repeat: 2,
        repeatDelay: 140,
      });
    scene.tweens.add({ targets: word, scale: { from: word.scale * 1.25, to: word.scale }, duration: 160, ease: "Cubic.easeIn" });
  });
  later(1000, () => !calm && Sfx.waspPhase?.());
  later(1500, () => {
    scene.tweens.add({ targets: [alarm, tape, word, warn], alpha: 0, duration: 260 });
    alarm.fillAlpha = calm ? alarm.fillAlpha : 0;
  });
  // 2. the eyes open (1.8 s) and the buzz-roar
  later(1800, () => {
    Sfx.waspRoar?.();
    eyes.setAlpha(1);
    scene.tweens.add({ targets: eyes, scaleY: 1.5, duration: 420, ease: "Back.easeOut" });
    if (!calm)
      scene.tweens.add({ targets: eyeGlow, alpha: { from: 0.5, to: 1 }, duration: 380, yoyo: true, repeat: 2 });
  });
  // 3. the armour slams on (3.0 s)
  later(3000, () => {
    scene.tweens.add({ targets: eyes, alpha: 0, duration: 160 });
    hero.setAlpha(1).setScale(base * 1.8);
    scene.tweens.add({
      targets: hero,
      scale: base,
      duration: 220,
      ease: "Cubic.easeIn",
      onComplete: () => {
        Sfx.waspBoom?.();
        Haptics.strong();
        flash.fillColor = calm ? RED : 0xffffff;
        flash.fillAlpha = calm ? 0.12 : 0.55;
        scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 360 });
        scene.cameras.main.shake(calm ? 120 : 260, calm ? 0.004 : 0.014);
        heroGlow.setAlpha(0.55);
        burst(scene, cont, W / 2, cy, RED, 60, 460);
        burst(scene, cont, W / 2, cy, 0x8a90a6, 24, 360);
        scene.tweens.add({ targets: heroGlow, alpha: 0.3, duration: 900 });
      },
    });
  });
  // 4. the name drops in big metal letters (3.6 s)
  later(3600, () => {
    name.setAlpha(1).setScale(nameK).setY(cy + 120);
    scene.tweens.add({
      targets: name,
      y: cy + 300,
      duration: 420,
      ease: "Bounce.easeOut",
      onComplete: () => Sfx.waspBoom?.(0.5),
    });
    scene.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 380 });
  });
  let closable = false;
  let closed = false;
  return new Promise((resolve) => {
    const close = () => {
      if (closed) return;
      closed = true;
      for (const t of timers) t.remove(false);
      scene.tweens.add({
        targets: cont,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          killTree(scene, cont);
          cont.destroy();
          resolve();
        },
      });
    };
    later(350, () => (closable = true)); // (the buy tap itself never skips it)
    later(4200, () => scene.tweens.add({ targets: hint, alpha: 0.85, duration: 300 }));
    later(7000, close);
    dark.on("pointerdown", () => closable && close());
  });
}

/** Stop every tween on a container and its children (so nothing animates a destroyed object). */
function killTree(scene, cont) {
  scene.tweens.killTweensOf(cont);
  for (const o of cont.list) {
    scene.tweens.killTweensOf(o);
    if (o.list) killTree(scene, o);
  }
}
