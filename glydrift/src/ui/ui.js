// Juicy UI kit: neon text, bouncy buttons, rolling counters, progress bars, toasts.
import Phaser from "phaser";
import { FONT } from "../config.js";
import { Sfx } from "../systems/audio.js";

export const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

export function neonText(scene, x, y, str, size, color = 0xffffff, opts = {}) {
  const t = scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: opts.weight || "900",
      color: opts.fill || "#ffffff",
      align: opts.align || "center",
      stroke: opts.stroke || hex(color),
      strokeThickness: opts.strokeThickness ?? Math.max(2, Math.round(size / 14)),
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    })
    .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
  if (opts.glow !== false) {
    const blur = opts.blur ?? Math.round(size * 0.45);
    // pad the text canvas so the glow is never clipped into a hard box
    t.setPadding(blur, blur, blur, blur);
    t.setShadow(0, 0, hex(color), blur, true, true);
    if ((opts.ox ?? 0.5) === 0) t.x -= blur;
    if ((opts.ox ?? 0.5) === 1) t.x += blur;
  }
  return t;
}

export function plainText(scene, x, y, str, size, color = "#ffffff", opts = {}) {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: opts.weight || "700",
      color,
      align: opts.align || "center",
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
      lineSpacing: opts.lineSpacing || 4,
    })
    .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
}

export function drawNeonRect(
  g,
  x,
  y,
  w,
  h,
  r,
  color,
  { fill = 0x0a0418, fillAlpha = 0.82, glow = true, width = 3 } = {},
) {
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(x, y, w, h, r);
  if (glow) {
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(width + i * 5, color, 0.06 * (4 - i));
      g.strokeRoundedRect(x, y, w, h, r);
    }
  }
  g.lineStyle(width, color, 1);
  g.strokeRoundedRect(x, y, w, h, r);
}

/** Bouncy neon button. Returns a Container with `.setLabel()` and `.setEnabled()`. */
export function button(
  scene,
  x,
  y,
  w,
  h,
  label,
  { color = 0x3ef4ff, size = 30, onClick, sub, fill = 0x0a0418 } = {},
) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (col) => {
    g.clear();
    drawNeonRect(g, -w / 2, -h / 2, w, h, Math.min(22, h / 2), col, { fill });
    // glossy highlight
    g.fillStyle(0xffffff, 0.06);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.38, Math.min(16, h / 3));
  };
  draw(color);
  const t = neonText(scene, 0, sub ? -10 : 0, label, size, color, { blur: 12 });
  c.add([g, t]);
  let st = null;
  if (sub) {
    st = plainText(scene, 0, h / 2 - 20, sub, Math.round(size * 0.45), "#d8d0ff");
    c.add(st);
  }
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
  c.enabled = true;
  let pressed = false;
  c.on("pointerdown", (p, lx, ly, e) => {
    e?.stopPropagation?.();
    if (!c.enabled) return;
    pressed = true;
    scene.tweens.add({ targets: c, scale: 0.9, duration: 70, ease: "Quad.easeOut" });
  });
  c.on("pointerup", (p, lx, ly, e) => {
    e?.stopPropagation?.();
    if (!pressed) return;
    pressed = false;
    scene.tweens.add({
      targets: c,
      scale: 1,
      duration: 420,
      ease: "Elastic.easeOut",
      easeParams: [1.2, 0.4],
    });
    Sfx.ui();
    onClick?.();
  });
  c.on("pointerout", () => {
    if (!pressed) return;
    pressed = false;
    scene.tweens.add({ targets: c, scale: 1, duration: 200, ease: "Back.easeOut" });
  });
  c.label = t;
  c.subLabel = st;
  c.setLabel = (s) => t.setText(s);
  c.setColor = (col) => {
    draw(col);
    t.setStroke(hex(col), t.style.strokeThickness);
    t.setShadow(0, 0, hex(col), 12, true, true);
  };
  c.setEnabled = (v) => {
    c.enabled = v;
    c.setAlpha(v ? 1 : 0.45);
  };
  return c;
}

/** Pop-in entrance with overshoot. */
export function popIn(scene, targets, delay = 0, { from = 0.4, duration = 520 } = {}) {
  const arr = Array.isArray(targets) ? targets : [targets];
  arr.forEach((t, i) => {
    const sx = t.scaleX;
    const sy = t.scaleY;
    const a = t.alpha;
    t.setScale(sx * from, sy * from).setAlpha(0);
    scene.tweens.add({
      targets: t,
      scaleX: sx,
      scaleY: sy,
      alpha: a,
      delay: delay + i * 70,
      duration,
      ease: "Back.easeOut",
      easeParams: [2.2],
    });
  });
}

export function slideIn(scene, targets, delay = 0, dy = 60) {
  const arr = Array.isArray(targets) ? targets : [targets];
  arr.forEach((t, i) => {
    const y = t.y;
    const a = t.alpha;
    t.y = y + dy;
    t.alpha = 0;
    scene.tweens.add({
      targets: t,
      y,
      alpha: a,
      delay: delay + i * 60,
      duration: 480,
      ease: "Cubic.easeOut",
    });
  });
}

/** Number counter that rolls up with easing. */
export class RollingCounter {
  constructor(scene, textObj, { format = (v) => `${Math.round(v)}`, value = 0 } = {}) {
    this.scene = scene;
    this.text = textObj;
    this.format = format;
    this.value = value;
    this.shown = value;
    this.text.setText(format(value));
    this.tween = null;
  }
  set(v) {
    this.value = v;
    this.shown = v;
    this.tween?.stop();
    this.text.setText(this.format(v));
  }
  to(v, duration = 900, delay = 0, onDone) {
    this.value = v;
    this.tween?.stop();
    const obj = { v: this.shown };
    this.tween = this.scene.tweens.add({
      targets: obj,
      v,
      duration,
      delay,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        this.shown = obj.v;
        this.text.setText(this.format(obj.v));
      },
      onComplete: () => {
        this.shown = v;
        this.text.setText(this.format(v));
        this.scene.tweens.add({
          targets: this.text,
          scale: { from: this.text.scale * 1.18, to: this.text.scale },
          duration: 260,
          ease: "Back.easeOut",
        });
        onDone?.();
      },
    });
  }
  /** Small instant tick + punch, for in-game HUD. */
  bump(v) {
    this.set(v);
    this.scene.tweens.add({
      targets: this.text,
      scale: { from: 1.25, to: 1 },
      duration: 180,
      ease: "Quad.easeOut",
    });
  }
}

export class ProgressBar {
  constructor(scene, x, y, w, h, color, { bg = 0x1a1030 } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.color = color;
    this.bgColor = bg;
    this.frac = 0;
    this.g = scene.add.graphics();
    this.draw();
  }
  draw() {
    const { g, x, y, w, h } = this;
    g.clear();
    g.fillStyle(this.bgColor, 0.9);
    g.fillRoundedRect(x, y, w, h, h / 2);
    const fw = Math.max(0, Math.min(1, this.frac)) * w;
    if (fw > 1) {
      g.fillStyle(this.color, 0.25);
      g.fillRoundedRect(x - 2, y - 3, fw + 4, h + 6, (h + 6) / 2);
      g.fillStyle(this.color, 1);
      g.fillRoundedRect(x, y, Math.max(fw, h), h, h / 2);
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(x + 3, y + 2, Math.max(fw - 6, 2), h * 0.35, h * 0.2);
    }
    g.lineStyle(2, this.color, 0.6);
    g.strokeRoundedRect(x, y, w, h, h / 2);
  }
  set(f) {
    this.frac = f;
    this.draw();
  }
  to(f, duration = 800, delay = 0, onDone) {
    const obj = { f: this.frac };
    return this.scene.tweens.add({
      targets: obj,
      f,
      duration,
      delay,
      ease: "Cubic.easeOut",
      onUpdate: () => this.set(obj.f),
      onComplete: () => onDone?.(),
    });
  }
  setDepth(d) {
    this.g.setDepth(d);
    return this;
  }
  setScrollFactor(f) {
    this.g.setScrollFactor(f);
    return this;
  }
}

/** Slide-down toast from the top of the screen. */
export function toast(scene, text, color = 0x3ef4ff, { y = 140, depth = 500, sub } = {}) {
  const W = scene.scale.width;
  const queue = (scene.__toastQueue ||= { t: 0 });
  const now = scene.time.now;
  const delay = Math.max(0, queue.t - now);
  queue.t = now + delay + 1100;
  const c = scene.add.container(W / 2, -80).setDepth(depth);
  const g = scene.add.graphics();
  const w = Math.min(W - 40, 560);
  const h = sub ? 92 : 70;
  drawNeonRect(g, -w / 2, -h / 2, w, h, 20, color, { fillAlpha: 0.92 });
  const t = neonText(scene, 0, sub ? -14 : 0, text, 26, color, { blur: 10 });
  c.add([g, t]);
  if (sub) c.add(plainText(scene, 0, 22, sub, 17, "#d8d0ff"));
  c.setAlpha(0);
  scene.tweens.add({
    targets: c,
    y,
    alpha: 1,
    delay,
    duration: 420,
    ease: "Back.easeOut",
    onStart: () => Sfx.reward(),
  });
  scene.tweens.add({
    targets: c,
    y: -80,
    alpha: 0,
    delay: delay + 1900,
    duration: 360,
    ease: "Cubic.easeIn",
    onComplete: () => c.destroy(),
  });
  return c;
}

export function rarityColor(rarity, time = 0) {
  if (rarity === "legendary") {
    const c = Phaser.Display.Color.HSVToRGB((time * 0.15) % 1, 0.55, 1);
    return (c.r << 16) | (c.g << 8) | c.b;
  }
  return { common: 0xbfd3e6, rare: 0x3fa9ff, epic: 0xb45cff }[rarity];
}
