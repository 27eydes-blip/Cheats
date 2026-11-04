// Juicy UI kit: neon text, bouncy buttons, rolling counters, progress bars, toasts.
import Phaser from "phaser";
import { FONT, NUM_FONT, VIEW } from "../config.js";
import { Sfx } from "../audio/sfx.js";

export const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

/** Body copy & anything with digits uses Rajdhani (clean zeros); headings use Orbitron. */
export function fontFor(str, opts = {}) {
  if (opts.font) return opts.font;
  return /\d/.test(String(str)) || opts.body ? NUM_FONT : FONT;
}

export function neonText(scene, x, y, str, size, color = 0xffffff, opts = {}) {
  const family = fontFor(str, opts);
  const isNum = family === NUM_FONT;
  const fs = isNum ? Math.round(size * 1.15) : size;
  const t = scene.add
    .text(x, y, str, {
      fontFamily: family,
      fontSize: `${fs}px`,
      fontStyle: isNum ? "700" : opts.weight || "900",
      color: opts.fill || "#ffffff",
      align: opts.align || "center",
      stroke: opts.stroke || hex(color),
      strokeThickness: opts.strokeThickness ?? Math.max(2, Math.round(size / 16)),
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
      resolution: VIEW.Z,
    })
    .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
  if (opts.glow !== false) {
    const blur = opts.blur ?? Math.round(size * 0.3);
    // pad the text canvas so the glow is never clipped into a hard box
    t.setPadding(blur, blur, blur, blur);
    // canvas shadowBlur ignores the resolution transform: scale it so glow size is constant
    t.setShadow(0, 0, hex(color), blur * VIEW.Z, true, true);
    if ((opts.ox ?? 0.5) === 0) t.x -= blur;
    if ((opts.ox ?? 0.5) === 1) t.x += blur;
  }
  return t;
}

export function plainText(scene, x, y, str, size, color = "#ffffff", opts = {}) {
  return scene.add
    .text(x, y, str, {
      fontFamily: opts.font || NUM_FONT,
      fontSize: `${Math.round(size * 1.12)}px`,
      fontStyle: opts.weight || "700",
      color,
      align: opts.align || "center",
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
      lineSpacing: opts.lineSpacing || 2,
      resolution: VIEW.Z,
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
  // crisp label: white fill, thin coloured stroke, restrained glow (readable at small sizes)
  const t = neonText(scene, 0, sub ? -12 : 0, label, size, color, {
    blur: Math.max(4, Math.round(size * 0.22)),
    strokeThickness: Math.max(1, Math.round(size / 24)),
  });
  c.add([g, t]);
  let st = null;
  if (sub) {
    st = plainText(scene, 0, h / 2 - 22, sub, Math.max(15, Math.round(size * 0.6)), "#d8d0ff");
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
  c.setLabel = (s) => {
    // switch to the numeric font when the label gains digits (clean zeros)
    const fam = fontFor(s);
    if (t.style.fontFamily !== fam)
      t.setFontFamily(fam).setFontStyle(fam === NUM_FONT ? "700" : "900");
    t.setText(s);
  };
  c.setColor = (col) => {
    draw(col);
    t.setStroke(hex(col), t.style.strokeThickness);
    t.setShadow(0, 0, hex(col), Math.max(4, Math.round(size * 0.22)) * VIEW.Z, true, true);
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
  constructor(scene, textObj, { format = (v) => `${Math.round(v)}`, value = 0, onTick } = {}) {
    this.scene = scene;
    this.text = textObj;
    this.format = format;
    this.onTick = onTick; // called whenever the shown whole number changes (roll-up ticks)
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
        if (this.onTick && Math.round(obj.v) !== Math.round(this.shown)) this.onTick();
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
export function toast(
  scene,
  text,
  color = 0x3ef4ff,
  { y = 140, depth = 500, sub, side = false } = {},
) {
  const W = VIEW.W;
  const queue = (scene.__toastQueue ||= { t: 0 });
  const now = scene.time.now;
  const delay = Math.max(0, queue.t - now);
  queue.t = now + delay + 1100;
  const c = scene.add.container(side ? W + 320 : W / 2, side ? y : -80).setDepth(depth);
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
    ...(side ? { x: W / 2 } : { y }),
    alpha: 1,
    delay,
    duration: side ? 220 : 420,
    ease: side ? "Cubic.easeOut" : "Back.easeOut",
    onStart: () => Sfx.reward(),
  });
  scene.tweens.add({
    targets: c,
    ...(side ? { x: -320 } : { y: -80 }),
    alpha: 0,
    delay: delay + 1900,
    duration: side ? 220 : 360,
    ease: "Cubic.easeIn",
    onComplete: () => c.destroy(),
  });
  return c;
}

export function rarityColor(rarity, time = 0) {
  if (rarity === "ultra") {
    // spectrum cycle that flares to white on a heartbeat — the rarest glow in the game
    const c = Phaser.Display.Color.HSVToRGB((time * 0.3) % 1, 0.75, 1);
    const w = Math.max(0, Math.sin(time * 5)) ** 6;
    const mix = (v) => Math.round(v + (255 - v) * w);
    return (mix(c.r) << 16) | (mix(c.g) << 8) | mix(c.b);
  }
  if (rarity === "mega") {
    // fast, fully saturated spectrum cycle — louder than legendary
    const c = Phaser.Display.Color.HSVToRGB((time * 0.45) % 1, 0.85, 1);
    return (c.r << 16) | (c.g << 8) | c.b;
  }
  if (rarity === "legendary") {
    const c = Phaser.Display.Color.HSVToRGB((time * 0.15) % 1, 0.55, 1);
    return (c.r << 16) | (c.g << 8) | c.b;
  }
  return { common: 0xbfd3e6, rare: 0x3fa9ff, epic: 0xb45cff }[rarity];
}

/**
 * Horizontal slider (0..1). Objects are added at absolute coordinates; pass a container
 * to collect them. Drag anywhere on the track.
 */
export function slider(scene, x, y, w, value, color, onChange, { container, label } = {}) {
  const g = scene.add.graphics();
  const knob = scene.add.graphics();
  const zone = scene.add.zone(x + w / 2, y, w + 40, 64).setInteractive({ useHandCursor: true });
  const items = [g, knob, zone];
  let txt = null;
  if (label) {
    txt = plainText(scene, x, y - 34, label, 20, "#e8e0ff", { ox: 0 });
    items.push(txt);
  }
  const pct = plainText(scene, x + w, y - 34, "", 20, hex(color), { ox: 1 });
  items.push(pct);
  let v = value;
  const draw = () => {
    g.clear();
    g.fillStyle(0x1a1030, 1).fillRoundedRect(x, y - 6, w, 12, 6);
    g.fillStyle(color, 0.3).fillRoundedRect(x - 2, y - 9, w * v + 4, 18, 9);
    g.fillStyle(color, 1).fillRoundedRect(x, y - 6, Math.max(12, w * v), 12, 6);
    knob.clear();
    knob.fillStyle(color, 0.3).fillCircle(x + w * v, y, 24);
    knob.fillStyle(0xffffff, 1).fillCircle(x + w * v, y, 15);
    knob.lineStyle(4, color, 1).strokeCircle(x + w * v, y, 15);
    pct.setText(`${Math.round(v * 100)}%`);
  };
  const setFrom = (p) => {
    v = Phaser.Math.Clamp((p.worldX - x) / w, 0, 1);
    draw();
    onChange?.(v);
  };
  let dragging = false;
  zone.on("pointerdown", (p) => {
    dragging = true;
    setFrom(p);
  });
  scene.input.on("pointermove", (p) => {
    if (dragging && p.isDown) setFrom(p);
  });
  scene.input.on("pointerup", () => {
    dragging = false;
  });
  draw();
  if (container) container.add(items);
  return { items, set: (nv) => ((v = nv), draw()) };
}

/** Fade the camera to a dark colour, then start another scene (every screen change uses this). */
/** Stop every tween on a container and everything inside it (before destroying it). */
export function killTweensDeep(scene, obj) {
  if (!obj) return;
  scene.tweens.killTweensOf(obj);
  for (const c of obj.list || []) killTweensDeep(scene, c);
}

export function fadeTo(scene, key, data, { ms = 200, rgb = [5, 1, 13] } = {}) {
  scene.cameras.main.fadeOut(ms, ...rgb);
  scene.time.delayedCall(ms, () => scene.scene.start(key, data));
}
