// GLYDRIFT SHOP — a neon, high-tech storefront on a vivid magenta-to-blue gradient. Up top a big
// holo stage previews the selected item on your hero (live CharacterRig) with its price and buy
// button; below it a scrolling grid of glowing tiles, grouped into sections: today's deals (with
// live countdowns) on FEATURED / DAILY, and rarity sections (LEGENDARY first, down to COMMON) for
// the heroes and every cosmetic tab. Coins only — never real money — and nothing here buys
// leaderboard rank. (Drift Pass+ is bought in the Pass screen, never here.)
import Phaser from "phaser";
import { fitCamera, NUM_FONT, PIXEL_FONT, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter, visibleCharacters } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Analytics } from "../systems/analytics.js";
import { Progression } from "../data/progression.js";
import { Save } from "../data/save.js";
import { Seasons } from "../data/seasons.js";
import { DriftPass, passTrack, tierXp } from "../data/driftPass.js";
import {
  CATEGORIES,
  COLLECTIONS,
  COSMETICS,
  forSale,
  getCosmetic,
  POD_ODDS,
  POD_PRICE,
  Shop,
  SKINS,
} from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { canvasTexture } from "../pixel/px.js";
import { killTweensDeep, button, fadeTo, RollingCounter } from "../ui/ui.js";

// each tab glows its own colour when selected
const TABS = [
  { id: "featured", label: "FEATURED", col: 0xffb020 },
  { id: "daily", label: "DAILY", col: 0x4ac81a },
  { id: "heroes", label: "CHARACTERS", col: 0xff4fb8 },
  { id: "trail", label: "TRAILS", col: 0xff6a1a },
  { id: "skin", label: "SKINS", col: 0x10b8e8 },
  { id: "hat", label: "HATS", col: 0xe0a010 },
  { id: "effects", label: "EFFECTS", col: 0x9a3aff },
  { id: "boosts", label: "BOOSTS", col: 0x7a6ac0 },
  { id: "pods", label: "PODS", col: 0xc04aff },
];

// bright colours for the buy confirmation: fill (lower) / light (upper) / band (title strip)
const THEMES = {
  void: { fill: 0x14a8d0, light: 0x5ae0ff, band: 0x0a6a8a },
  solar: { fill: 0xff5a1a, light: 0xffa030, band: 0xb02a08 },
  frozen: { fill: 0x46b4ff, light: 0xb4ecff, band: 0x1a6aaa },
  glitch: { fill: 0x22c860, light: 0x6aff9a, band: 0x0a7a3a },
  prism: { fill: 0x9a3aff, light: 0xff7ad9, band: 0x5a1aa8 },
  gold: { fill: 0xffa21a, light: 0xffd84a, band: 0xb85a00 },
  common: { fill: 0x6a86c8, light: 0xa8bcec, band: 0x3a4e8a },
  rare: { fill: 0x2a7aff, light: 0x6ab0ff, band: 0x1444aa },
  epic: { fill: 0xa040ff, light: 0xd27aff, band: 0x5a18a8 },
  legendary: { fill: 0xffa21a, light: 0xffd84a, band: 0xb85a00 },
  mega: { fill: 0xff3a8a, light: 0xff9ac8, band: 0xa01050 },
  ultra: { fill: 0x22c860, light: 0x8affa8, band: 0x0a7a3a },
  drop: { fill: 0x5ad41e, light: 0xa8ff5a, band: 0x2a8a0a },
  pass: { fill: 0x10b8e8, light: 0x6af0ff, band: 0x0a6a9a },
  pod: { fill: 0xa040ff, light: 0xd27aff, band: 0x5a18a8 },
  off: { fill: 0x6a5aa8, light: 0x9a8ad8, band: 0x3a2e70 },
};
const SET_THEME = {
  set_void: "void",
  set_solar: "solar",
  set_frozen: "frozen",
  set_glitch: "glitch",
  set_prism: "prism",
};
// pod reveal rays by rarity
const RAY_COL = { common: 0x9ab0e0, rare: 0x2a8aff, epic: 0xb45cff, legendary: 0xffd23f };
// the rarity sections, best first; MEGA / ULTRA LEGENDARY heroes go at the top of LEGENDARY
export const RARITY_SECTIONS = ["legendary", "epic", "rare", "common"];
const SECTION_TIERS = {
  legendary: ["ultra", "mega", "legendary"],
  epic: ["epic"],
  rare: ["rare"],
  common: ["common"],
};

const BTN_H = 104; // well over 44pt on a phone
const OUTLINE = "#1a0630";
const GLASS = 0x12052a; // the dark glass every neon panel is filled with
const TILE_GAP = 12;
const SIDE = 16;
const HEAD_H = 70; // section header row

/** Chunky pixel header: thick dark outline, hard drop shadow, tight letter spacing. */
export function pixelText(scene, x, y, str, size, color = "#ffffff", opts = {}) {
  const t = scene.add
    .text(x, y, str, {
      fontFamily: PIXEL_FONT,
      fontSize: `${size}px`,
      fontStyle: "700",
      color,
      stroke: OUTLINE,
      strokeThickness: opts.stroke ?? Math.max(5, Math.round(size / 4.5)),
      align: "center",
      resolution: VIEW.Z,
    })
    .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
  t.setLetterSpacing?.(opts.spacing ?? -Math.round(size / 14));
  if (opts.shadow !== false)
    t.setShadow(0, Math.max(3, Math.round(size / 12)), OUTLINE, 0, true, true);
  return t;
}

/** The faint scrolling pixel-icon pattern behind the shop and the pass. */
export function ensureShopPattern(scene) {
  if (scene.textures.exists("shop_pattern")) return;
  const T = 256;
  const cv = document.createElement("canvas");
  cv.width = T;
  cv.height = T;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.16;
  const draw = (tex, frame, x, y, sc) => {
    const f = scene.textures.getFrame(tex, frame);
    if (!f) return;
    ctx.drawImage(
      f.source.image,
      f.cutX,
      f.cutY,
      f.cutWidth,
      f.cutHeight,
      x,
      y,
      f.cutWidth * sc,
      f.cutHeight * sc,
    );
  };
  draw("pxc", "coin_0", 18, 20, 0.9);
  draw("cosm", "icon_flap_stars", 150, 30, 1.2);
  draw("pxc", "yarms_3", 92, 132, 0.45);
  draw("cosm", "pod_0", 20, 150, 0.6);
  draw("pxc", "coin_2", 200, 190, 0.9);
  draw("cosm", "icon_flap_stars", 120, 220, 0.8);
  canvasTexture(scene, "shop_pattern", cv).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

const fmtTime = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const css = (c) => `#${c.toString(16).padStart(6, "0")}`;
/** A colour pushed toward white (neon highlights). */
const lighten = (c, k) => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v) => Math.round(v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

/**
 * A neon glass panel: soft outer glow in `col`, dark glass fill, a tint of `col` fading down
 * from the top, a bright border and little pixel corner brackets (the high-tech look).
 */
function neonPanel(g, x, y, w, h, r, col, { glow = true, tint = 0.4, width = 5, fill = GLASS } = {}) {
  if (glow) {
    g.lineStyle(16, col, 0.12).strokeRoundedRect(x - 5, y - 5, w + 10, h + 10, r + 5);
    g.lineStyle(8, col, 0.22).strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);
  }
  g.fillStyle(0x07010f, 1).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, r + 3);
  g.fillStyle(fill, 0.96).fillRoundedRect(x, y, w, h, r);
  if (tint > 0)
    g.fillGradientStyle(col, col, fill, fill, tint, tint, 0, 0).fillRect(
      x + width,
      y + width,
      w - width * 2,
      Math.min(h * 0.62, h - width * 2),
    );
  g.lineStyle(width, col, 1).strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(2, lighten(col, 0.6), 0.55).strokeRoundedRect(x + width, y + width, w - width * 2, h - width * 2, Math.max(4, r - width));
  // pixel corner brackets
  const L = Math.min(26, w / 6);
  const p = width + 6;
  g.fillStyle(lighten(col, 0.7), 1);
  for (const [cx, sx] of [
    [x + p, 1],
    [x + w - p, -1],
  ])
    for (const [cy, sy] of [
      [y + p, 1],
      [y + h - p, -1],
    ]) {
      g.fillRect(sx > 0 ? cx : cx - L, sy > 0 ? cy : cy - 4, L, 4);
      g.fillRect(sx > 0 ? cx : cx - 4, sy > 0 ? cy : cy - L, 4, L);
    }
}

function themeForItem(id) {
  const set = COLLECTIONS.find((c) => c.items.includes(id));
  if (set) return THEMES[SET_THEME[set.id]];
  return THEMES[getCosmetic(id).rarity];
}

export class ShopScene extends Phaser.Scene {
  constructor() {
    super("Shop");
  }

  init(data) {
    this.tab = data?.tab || "featured";
    this.openPassOnStart = !!data?.openPass; // the home-screen season banner opens the pass
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    const top = (this.registry.get("safeTop") || 0) + 12;
    const bottom = this.registry.get("safeBottom") || 0;
    this.top = top;
    this.cameras.main.fadeIn(220, 40, 10, 60);
    this.scene.get("Backdrop")?.scene.setVisible(false);
    this.events.once("shutdown", () => this.scene.get("Backdrop")?.scene.setVisible(true));
    this.fx = new Effects(this, { lowGfx: s.settings.lowGfx, depth: 300 });
    this.t = 0;
    this.modal = null;
    this.index = 0;
    this.lowGfx = s.settings.lowGfx;
    this.timers = [];
    this.timerT = 0;
    Analytics.log("shop_opened", { coins: s.coins });

    this.buildBackground();

    // ---- top bar: back · SHOP · home, then the two balance pills
    button(this, 72, top + 52, 116, 96, "◀", {
      color: 0xffffff,
      size: 36,
      fill: 0xb01a7a,
      onClick: () => this.leave(),
    }).setDepth(210);
    const title = pixelText(this, W / 2, top + 52, "SHOP", 80, "#ffd23f", { stroke: 18 }).setDepth(210);
    title.setShadow(0, 6, "#ff2a8a", 0, true, true);
    button(this, W - 72, top + 52, 116, 96, "⌂", {
      color: 0xffffff,
      size: 40,
      fill: 0x1a5af0,
      onClick: () => this.leave(),
    }).setDepth(210);
    const pillY = top + 146;
    this.pill(W / 2 - 150, pillY, 0xffd23f);
    this.coinGlyph = this.add
      .image(W / 2 - 238, pillY, "pxc", "coin_0")
      .setScale(1.2)
      .setDepth(212);
    this.coinText = this.add
      .text(W / 2 - 202, pillY, `${s.coins}`, this.priceStyle(46, "#ffffff"))
      .setOrigin(0, 0.5)
      .setDepth(212);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });
    this.pill(W / 2 + 150, pillY, 0x3ef4ff);
    this.shardX = W / 2 + 62;
    this.shardY = pillY;
    this.shardText = this.add
      .text(W / 2 + 98, pillY, `${this.shardCount()}`, this.priceStyle(46, "#ffffff"))
      .setOrigin(0, 0.5)
      .setDepth(212);
    this.shardG = this.add.graphics().setDepth(212);

    // ---- category tabs (horizontal scroll)
    this.tabY = top + 240;
    this.tabRow = this.add.container(0, this.tabY).setDepth(190);
    this.tabObjs = [];
    let tx = 20;
    for (const t of TABS) {
      const w = t.label.length * 22 + 50;
      const c = this.add.container(tx + w / 2, 0);
      const g = this.add.graphics();
      const txt = pixelText(this, 0, -1, t.label, 28, "#ffffff", { stroke: 7, shadow: false });
      c.add([g, txt]);
      c.setSize(w, 88).setInteractive();
      c.on("pointerup", () => {
        if ((this.tabDrag?.moved || 0) > 12) return; // live drag (fires before the scene's)
        Sfx.ui();
        this.setTab(t.id);
      });
      const rib = this.tabRibbon(t.id);
      if (rib) {
        const r = this.add.container(w / 2 - 24, -42).setAngle(12);
        const rg = this.add.graphics();
        rg.fillStyle(0x1a0630, 1).fillRect(-44, -17, 88, 34);
        rg.fillStyle(rib.col, 1).fillRect(-40, -13, 80, 26);
        rg.fillStyle(0xffffff, 0.35).fillRect(-40, -13, 80, 8);
        r.add([rg, pixelText(this, 0, 0, rib.text, 18, "#ffffff", { stroke: 5, shadow: false })]);
        c.add(r);
        this.tweens.add({
          targets: r,
          y: -49,
          duration: 520,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          delay: tx,
        });
      }
      this.tabRow.add(c);
      this.tabObjs.push({ ...t, c, g, txt, w });
      tx += w + 12;
    }
    this.tabsW = tx + 8;
    this.tabX = 0;

    // ---- the holo stage: a big live preview of the selected item, its price and buy button
    this.stageTop = this.tabY + 60;
    const avail = H - bottom - this.stageTop;
    this.stageW = W - SIDE * 2;
    this.stageH = Phaser.Math.Clamp(Math.round(avail * 0.45), 400, 560);
    this.stage = this.add.container(W / 2, this.stageTop + this.stageH / 2).setDepth(120);
    this.stageBg = this.add.graphics();
    this.stageRays = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.stageFx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.stageArt = this.add.container(0, 0);
    this.stageInfo = this.add.container(0, 0);
    this.stageShine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.stage.add([this.stageBg, this.stageRays, this.stageFx, this.stageArt, this.stageShine, this.stageInfo]);
    this.shineT = 1.2;
    this.stageMotes = Array.from({ length: this.lowGfx ? 6 : 16 }, () => ({
      x: (Math.random() - 0.5) * this.stageW,
      y: (Math.random() - 0.5) * this.stageH,
      v: 14 + Math.random() * 30,
      p: Math.random() * 6,
    }));
    this.rig = null;
    this.cta = null;

    // ---- the scrolling list of tiles under it (clipped to its window)
    this.listTop = this.stageTop + this.stageH + 14;
    this.listBot = H - bottom - 6;
    this.list = this.add.container(0, this.listTop).setDepth(100);
    const clip = this.make.graphics({}, false);
    clip.fillStyle(0xffffff).fillRect(0, this.listTop, W, this.listBot - this.listTop);
    this.list.setMask(clip.createGeometryMask());
    this.listFx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD); // selection + shine
    this.scrollY = 0;
    this.scrollV = 0;
    this.scrollMax = 0;
    this.scrollBar = this.add.graphics().setDepth(105);

    // ---- input: drag tabs / scroll the list
    this.input.on("pointerdown", (p) => {
      if (this.modal) return;
      if (Math.abs(p.worldY - this.tabY) < 48) {
        this.tabDrag = { x: p.worldX, start: this.tabX, moved: 0 };
      } else if (p.worldY > this.listTop && p.worldY < this.listBot) {
        this.listDrag = { y: p.worldY, start: this.scrollY, moved: 0, lastY: p.worldY, t: this.time.now };
        this.scrollV = 0;
        this.scrollTween?.stop();
      }
    });
    this.input.on("pointermove", (p) => {
      if (!p.isDown) return;
      if (this.tabDrag) {
        this.tabDrag.moved = Math.max(this.tabDrag.moved, Math.abs(p.worldX - this.tabDrag.x));
        this.setTabX(this.tabDrag.start + (p.worldX - this.tabDrag.x));
      } else if (this.listDrag) {
        const d = this.listDrag;
        d.moved = Math.max(d.moved, Math.abs(p.worldY - d.y));
        const dtm = Math.max(1, this.time.now - d.t);
        d.v = (-(p.worldY - d.lastY) / dtm) * 1000;
        d.lastY = p.worldY;
        d.t = this.time.now;
        // rubber band past either end
        let y = d.start - (p.worldY - d.y);
        if (y < 0) y *= 0.4;
        if (y > this.scrollMax) y = this.scrollMax + (y - this.scrollMax) * 0.4;
        this.setScroll(y, true);
      }
    });
    this.input.on("pointerup", () => {
      if (this.listDrag) {
        const d = this.listDrag;
        this.lastSwipe = d.moved;
        this.listDrag = null;
        if (d.moved > 12 && this.time.now - d.t < 120) this.scrollV = Phaser.Math.Clamp(d.v || 0, -4000, 4000);
      }
      if (this.tabDrag) {
        this.lastTabDrag = this.tabDrag.moved;
        this.tabDrag = null;
      } else this.lastTabDrag = 0;
    });
    this.input.on("wheel", (p, objs, dx, dy) => {
      if (this.modal) return;
      this.scrollV = 0;
      this.setScroll(this.scrollY + dy);
    });

    this.setTab(this.tab);
    if (this.openPassOnStart) this.time.delayedCall(250, () => this.openPass());
    this.yarmsPeekT = 6;
  }

  /** A neon balance pill: dark glass, glowing border in the currency's colour. */
  pill(x, y, col) {
    const g = this.add.graphics().setDepth(211);
    g.lineStyle(12, col, 0.18).strokeRoundedRect(x - 128, y - 38, 256, 76, 38);
    g.fillStyle(0x07010f, 1).fillRoundedRect(x - 130, y - 40, 260, 80, 40);
    g.fillStyle(GLASS, 1).fillRoundedRect(x - 124, y - 34, 248, 68, 34);
    g.fillGradientStyle(col, col, GLASS, GLASS, 0.35, 0.35, 0, 0).fillRoundedRect(x - 120, y - 30, 240, 34, 16);
    g.lineStyle(4, col, 1).strokeRoundedRect(x - 124, y - 34, 248, 68, 34);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(x - 100, y - 28, 200, 8, 4);
    return g;
  }

  shardCount() {
    return Object.values(Save.data.shards || {}).reduce((a, n) => a + (n || 0), 0);
  }

  tabRibbon(id) {
    const deal = getCosmetic(Shop.daily().deal);
    const dealTab = !deal ? null : ["death", "flap", "coin"].includes(deal.cat) ? "effects" : deal.cat;
    if ((id === "daily" || id === "pods") && Shop.dropReady())
      return { text: "FREE", col: 0x1fae5a };
    if (id === "featured" && DriftPass.claimable()) return { text: "FREE", col: 0x1fae5a };
    if (id === "heroes") return { text: "NEW", col: 0xe0203a };
    if (id === dealTab) return { text: "SALE", col: 0xd89a10 };
    return null;
  }

  setTabX(x) {
    const min = Math.min(0, this.W - this.tabsW);
    this.tabX = Phaser.Math.Clamp(x, min, 0);
    this.tabRow.x = this.tabX;
  }

  // ---------------------------------------------------------------- background
  buildBackground() {
    const W = this.W;
    const H = this.H;
    // vivid gradient: deep magenta → electric purple → blue
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0xc0187a, 0xc0187a, 0x6a1ad8, 0x6a1ad8, 1).fillRect(0, 0, W, H * 0.5);
    bg.fillGradientStyle(0x6a1ad8, 0x6a1ad8, 0x1a5af0, 0x1a5af0, 1).fillRect(
      0,
      H * 0.5,
      W,
      H * 0.5 + 2,
    );
    // slowly scrolling pattern of faint pixel icons (coins, stars, tiny YARMS arms, pods)
    ensureShopPattern(this);
    this.pattern = this.add.tileSprite(W / 2, H / 2, W, H, "shop_pattern").setDepth(-9);
    const glow = this.add.graphics().setDepth(-8).setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(0xff4fd8, 0.12).fillCircle(W * 0.15, H * 0.25, 300);
    glow.fillStyle(0x3ef4ff, 0.1).fillCircle(W * 0.9, H * 0.75, 340);
    // a neon perspective grid on the floor (drawn once: costs nothing per frame)
    const grid = this.add.graphics().setDepth(-8).setBlendMode(Phaser.BlendModes.ADD);
    const hz = H * 0.62;
    for (let i = 0; i < 9; i++) {
      const y = hz + (H - hz) * Math.pow(i / 8, 1.8);
      grid.lineStyle(2, 0x3ef4ff, 0.05 + 0.1 * (i / 8)).lineBetween(0, y, W, y);
    }
    for (let i = -8; i <= 8; i++)
      grid.lineStyle(2, 0xff4fd8, 0.1).lineBetween(W / 2 + i * 30, hz, W / 2 + i * 150, H);
    // drifting bright pixels
    this.motes = [];
    const cols = [0xffffff, 0xffd23f, 0x3ef4ff, 0xff7ad9];
    for (let i = 0; i < (this.lowGfx ? 16 : 34); i++) {
      const r = this.add
        .rectangle(
          Math.random() * W,
          Math.random() * H,
          6,
          6,
          cols[i % 4],
          0.45 + Math.random() * 0.4,
        )
        .setDepth(-7);
      r.vx = -6 - Math.random() * 16;
      r.vy = -8 - Math.random() * 16;
      this.motes.push(r);
    }
  }

  // ---------------------------------------------------------------- offers
  offersFor(tab) {
    const s = Save.data;
    const daily = Shop.daily();
    const cos = (id) => ({ kind: "cos", id, deal: daily.deal === id });
    switch (tab) {
      case "featured":
        return [
          { kind: "drop" },
          { kind: "pass" },
          // the live season: its event, then its exclusive items
          ...(Seasons.active() ? [{ kind: "event" }] : []),
          ...Seasons.shopItems().map((c) => ({ ...cos(c.id), seasonal: true })),
          { kind: "yarms" },
          ...Shop.bundlesToday().map((id) => ({ kind: "bundle", id })),
          cos(daily.deal),
        ];
      case "daily":
        return [{ kind: "drop" }, ...daily.items.map(cos)];
      case "heroes": {
        // Lucky Spin and DRIFT PASS+ heroes are never sold for coins
        const list = visibleCharacters(s.unlocked).filter((c) => !c.lottery && !c.passPlus);
        list.sort((a, b) => (a.id === "yarms" ? -1 : b.id === "yarms" ? 1 : 0));
        return list.map((c) => (c.id === "yarms" ? { kind: "yarms" } : { kind: "hero", id: c.id }));
      }
      case "effects":
        return COSMETICS.filter(
          (c) =>
            ["death", "flap", "coin"].includes(c.cat) &&
            !c.plus && // Drift Pass+ items never appear in the shop (equip them in HEROES)
            (forSale(c) || Shop.owns(c.id)),
        ).map((c) => cos(c.id));
      case "boosts":
        return [{ kind: "boosts" }];
      case "pods":
        return [{ kind: "drop" }, { kind: "pod" }];
      default:
        return COSMETICS.filter(
          (c) =>
            (c.cat === tab || (tab === "skin" && (c.cat === "dskin" || c.cat === "tskin"))) && // (DAWSON's and TUNG's skins too)
            !c.plus &&
            (forSale(c) || Shop.owns(c.id)),
        ).map((c) =>
          cos(c.id),
        );
    }
  }

  /** An offer's rarity key (heroes and cosmetics), or null for the special offers. */
  offerRarity(o) {
    if (o.kind === "cos") return getCosmetic(o.id).rarity;
    if (o.kind === "hero") return getCharacter(o.id).rarity;
    if (o.kind === "yarms") return getCharacter("yarms").rarity || "legendary";
    return null;
  }

  /**
   * The offers of a tab grouped into sections, in the order they're shown. Nothing is added or
   * dropped: every offer of offersFor() lands in exactly one section, keeping its own order.
   */
  sectionsFor(tab, offers) {
    const season = Seasons.active();
    const timer = { fn: () => Shop.msToRefresh(), fmt: (ms) => `RESETS IN ${fmtTime(ms)}` };
    if (tab === "featured") {
      const deals = offers.filter((o) => o.kind === "drop" || o.kind === "bundle" || o.deal);
      const seasonal = offers.filter((o) => o.kind === "pass" || o.kind === "event" || o.seasonal);
      const spot = offers.filter((o) => !deals.includes(o) && !seasonal.includes(o));
      const sc = season ? Seasons.colors(season) : null;
      return [
        { label: "TODAY'S DEALS", col: 0xffd23f, timer, big: true, items: deals },
        {
          label: season ? `SEASON ${season.number}` : "DRIFT PASS",
          col: sc ? lighten(sc.accent, 0.2) : 0x3ef4ff,
          items: seasonal,
          sub: season ? `ENDS IN ${Seasons.countdown(season)}` : "",
        },
        { label: "SPOTLIGHT", col: 0xff4fb8, items: spot },
      ].filter((x) => x.items.length);
    }
    if (tab === "daily")
      return [{ label: "DAILY SHOP", col: 0x6aff3a, timer: { ...timer, fmt: (ms) => `NEW IN ${fmtTime(ms)}` }, big: true, items: offers }];
    if (tab === "pods") return [{ label: "MYSTERY PODS", col: 0xd27aff, items: offers, big: true }];
    if (tab === "boosts") return [{ label: "BOOSTS", col: 0x9a8ad8, items: offers, big: true }];
    // heroes and every cosmetic tab: one section per rarity, the best first (MEGA and ULTRA
    // LEGENDARY heroes lead the LEGENDARY section, each still in its own colour)
    const out = [];
    for (const r of RARITY_SECTIONS) {
      const tiers = SECTION_TIERS[r];
      const items = offers
        .filter((o) => tiers.includes(this.offerRarity(o)))
        .map((o, n) => ({ o, n, k: tiers.indexOf(this.offerRarity(o)) }))
        .sort((a, b) => a.k - b.k || a.n - b.n)
        .map((x) => x.o);
      if (!items.length) continue;
      const owned = items.filter((o) => this.offerOwned(o)).length;
      out.push({
        label: RARITY[r].label,
        col: RARITY[r].color,
        rarity: r,
        items,
        sub: `${owned}/${items.length} OWNED`,
      });
    }
    const known = Object.values(SECTION_TIERS).flat();
    const rest = offers.filter((o) => !known.includes(this.offerRarity(o)));
    if (rest.length) out.push({ label: "MORE", col: 0xffffff, items: rest });
    return out;
  }

  offerOwned(o) {
    if (o.kind === "cos") return Shop.owns(o.id);
    if (o.kind === "hero" || o.kind === "yarms")
      return Progression.isUnlocked(o.kind === "yarms" ? "yarms" : o.id);
    return false;
  }

  setTab(id) {
    this.tab = id;
    for (const t of this.tabObjs) {
      const on = t.id === id;
      const g = t.g;
      g.clear();
      if (on) g.lineStyle(14, t.col, 0.3).strokeRoundedRect(-t.w / 2 - 2, -40, t.w + 4, 84, 18);
      g.fillStyle(0x07010f, 1).fillRoundedRect(-t.w / 2 - 4, -42, t.w + 8, 88, 18);
      g.fillStyle(on ? t.col : GLASS, 1).fillRoundedRect(-t.w / 2, -38, t.w, 80, 15);
      if (on) g.fillStyle(0xffffff, 0.35).fillRoundedRect(-t.w / 2 + 6, -34, t.w - 12, 20, 9);
      else
        g.fillGradientStyle(t.col, t.col, GLASS, GLASS, 0.35, 0.35, 0, 0).fillRoundedRect(-t.w / 2 + 4, -34, t.w - 8, 40, 12);
      g.lineStyle(4, on ? 0xffffff : t.col, on ? 0.9 : 0.85).strokeRoundedRect(-t.w / 2, -38, t.w, 80, 15);
      t.txt.setColor(on ? "#ffffff" : css(lighten(t.col, 0.45)));
      t.c.setScale(on ? 1.06 : 1);
    }
    this.buildCards();
    this.focus(0, true);
    this.setScroll(0);
  }

  /** Lay out the tab: section headers and a grid of tiles under each. */
  buildCards() {
    this.list.remove(this.listFx); // (kept: it's reused for every tab)
    killTweensDeep(this, this.list);
    this.list.removeAll(true);
    this.timers = [];
    // (an item this build doesn't know — e.g. from an older or newer save / season config —
    // is skipped instead of crashing the whole shop: crash reports "i.cat", 5x)
    const raw = this.offersFor(this.tab).filter((o) => o.kind !== "cos" || getCosmetic(o.id));
    this.sections = this.sectionsFor(this.tab, raw);
    this.offers = [];
    this.cards = [];
    this.headers = [];
    const W = this.W;
    let y = 4;
    for (const sec of this.sections) {
      this.headers.push(this.makeHeader(sec, y));
      y += HEAD_H;
      const cols = sec.big ? 2 : 3;
      const tw = Math.floor((W - SIDE * 2 - TILE_GAP * (cols - 1)) / cols);
      const th = sec.big ? 300 : 262;
      sec.items.forEach((o, j) => {
        const col = j % cols;
        const row = Math.floor(j / cols);
        const x = SIDE + tw / 2 + col * (tw + TILE_GAP);
        const ty = y + th / 2 + row * (th + TILE_GAP);
        const i = this.cards.length;
        this.offers.push(o);
        this.cards.push(this.makeCard(o, i, x, ty, tw, th));
      });
      y += Math.ceil(sec.items.length / cols) * (th + TILE_GAP) + 10;
    }
    this.list.add(this.listFx); // (drawn over the tiles)
    this.contentH = y + 20;
    this.scrollMax = Math.max(0, this.contentH - (this.listBot - this.listTop));
  }

  /** A section header: its name in its colour, a neon rule, and a count or a live countdown. */
  makeHeader(sec, y) {
    const W = this.W;
    const c = this.add.container(0, y + HEAD_H / 2 - 4);
    const g = this.add.graphics();
    const label = pixelText(this, SIDE + 6, 0, sec.label, sec.big ? 34 : 32, css(sec.col), {
      stroke: 8,
      ox: 0,
    });
    label.setShadow(0, 4, OUTLINE, 0, true, true);
    // the rule: a bright line with a glow, ending in a pixel diamond
    const x0 = SIDE + 14 + label.width;
    g.lineStyle(10, sec.col, 0.18).lineBetween(x0, 2, W - SIDE, 2);
    g.lineStyle(3, sec.col, 1).lineBetween(x0, 2, W - SIDE, 2);
    g.fillStyle(sec.col, 1).fillRect(x0 - 2, -4, 12, 12);
    c.add([g, label]);
    let right = null;
    if (sec.timer || sec.sub) {
      const txt = this.add
        .text(0, 0, sec.timer ? sec.timer.fmt(sec.timer.fn()) : sec.sub, this.priceStyle(22, "#ffffff"))
        .setOrigin(0.5);
      const w = Math.max(120, txt.width + 30);
      const x = W - SIDE - w / 2;
      const chip = this.add.graphics();
      const chipCol = sec.timer ? 0xff2a5a : GLASS;
      chip.fillStyle(0x07010f, 1).fillRoundedRect(x - w / 2 - 3, -20, w + 6, 42, 14);
      chip.fillStyle(chipCol, 1).fillRoundedRect(x - w / 2, -17, w, 36, 12);
      chip.lineStyle(3, sec.timer ? 0xffffff : sec.col, sec.timer ? 0.6 : 1).strokeRoundedRect(x - w / 2, -17, w, 36, 12);
      txt.setX(x);
      c.add([chip, txt]);
      right = txt;
      if (sec.timer) this.timers.push({ text: txt, fn: sec.timer.fn, fmt: sec.timer.fmt });
    }
    c.right = right;
    this.list.add(c);
    return c;
  }

  offerTheme(o) {
    const season = Seasons.active();
    if (season && (o.kind === "pass" || o.kind === "event" || o.seasonal)) {
      const sc = Seasons.colors(season);
      return { fill: sc.primary, light: sc.accent, band: sc.dark };
    }
    if (o.kind === "cos") return themeForItem(o.id);
    if (o.kind === "bundle") return THEMES[SET_THEME[o.id]];
    if (o.kind === "yarms") return THEMES.gold;
    if (o.kind === "hero") return THEMES[getCharacter(o.id).rarity] || THEMES.legendary;
    return THEMES[o.kind] || THEMES.off;
  }

  /** The neon colour of an offer's border: its rarity's colour, or its own for the specials. */
  offerColor(o) {
    const r = this.offerRarity(o);
    if (r) return RARITY[r]?.color ?? 0xffffff;
    const season = Seasons.active();
    if (season && (o.kind === "pass" || o.kind === "event")) return lighten(Seasons.colors(season).accent, 0.15);
    if (o.kind === "bundle") return THEMES[SET_THEME[o.id]].light;
    return { drop: 0x6aff3a, pass: 0x3ef4ff, pod: 0xd27aff }[o.kind] ?? 0x9a8ad8;
  }

  /** One tile in the grid: a neon glass panel with a rarity-coloured border. */
  makeCard(o, i, x, y, w, h) {
    const c = this.add.container(x, y);
    c.offer = o;
    c.theme = this.offerTheme(o);
    c.col = this.offerColor(o);
    c.tw = w;
    c.th = h;
    c.legend = this.isLegendary(o);
    const g = this.add.graphics();
    neonPanel(g, -w / 2, -h / 2, w, h, 18, c.col, { tint: c.legend ? 0.55 : 0.38, glow: !this.lowGfx });
    // the price strip along the bottom
    g.fillStyle(0x07010f, 0.75).fillRect(-w / 2 + 5, h / 2 - 64, w - 10, 59);
    g.lineStyle(2, c.col, 0.6).lineBetween(-w / 2 + 5, h / 2 - 64, w / 2 - 5, h / 2 - 64);
    c.content = this.add.container(0, 0);
    c.add([g, c.content]);
    this.fillCard(c);
    c.setSize(w, h).setInteractive();
    c.on("pointerup", (p) => {
      if (this.modal || (this.listDrag?.moved || 0) > 12) return;
      if (p.worldY < this.listTop || p.worldY > this.listBot) return; // (clipped away)
      this.pop(c);
      if (i !== this.index) this.focus(i);
    });
    this.list.add(c);
    return c;
  }

  isLegendary(o) {
    const r = this.offerRarity(o);
    return ["legendary", "mega", "ultra"].includes(r);
  }

  /** Icon for a cosmetic (hat / coin skin / skin / trail / effect), sized for big cards. */
  iconCos(id, x, y, scale = 1) {
    const cc = getCosmetic(id);
    if (!cc) return this.add.image(x, y, "__DEFAULT").setVisible(false); // (an unknown item)
    if (cc.cat === "hat")
      return this.add.image(x, y, "cosm", HAT_FIT[id].frame).setScale(4.2 * scale);
    if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${id}_0`).setScale(5 * scale);
    if (cc.cat === "dskin" || cc.cat === "tskin")
      return this.add.image(x, y, `hero_${cc.forHero}_${id}`).setScale((0.9 / HI) * PORTRAIT_K * scale);
    if (cc.cat === "skin")
      return this.add
        .image(x, y, greyPortrait(this, getCharacter(Save.data.selected)))
        .setScale((0.9 / HI) * PORTRAIT_K * scale)
        .setTint(SKINS[id].tint);
    return this.add.image(x, y, "cosm", `icon_${id}`).setScale(3.8 * scale);
  }

  /** The picture of an offer, fitted into a w × h box (tiles, and the buy animation). */
  offerArt(o, x, y, w, h) {
    const fit = (im, cap) => {
      const s0 = im.scaleX;
      im.setScale(Math.min(cap ?? s0, w / Math.max(1, im.width), h / Math.max(1, im.height)));
      return im;
    };
    switch (o.kind) {
      case "hero":
        return fit(this.add.image(x, y, getCharacter(o.id).texture), (0.9 / HI) * PORTRAIT_K);
      case "yarms":
        return fit(this.add.image(x, y, "hero_yarms_flex"), (0.9 / HI) * PORTRAIT_K);
      case "cos":
        return fit(this.iconCos(o.id, x, y, 0.8));
      case "drop":
      case "pod":
        return fit(this.add.image(x, y, "cosm", "pod_0"), 2.6);
      case "bundle": {
        const b = Shop.bundle(o.id);
        const c = this.add.container(x, y);
        b.items.forEach((id, j) => {
          const im = this.iconCos(id, (j - 1) * (w / 3), j === 1 ? -h * 0.12 : h * 0.12, 0.6);
          im.setScale(Math.min(im.scaleX, w / 3 / Math.max(1, im.width), (h * 0.7) / Math.max(1, im.height)));
          if (Shop.owns(id)) im.setAlpha(0.45);
          c.add(im);
        });
        return c;
      }
      case "pass": {
        const next = DriftPass.nextTier();
        if (next === null) return pixelText(this, x, y, "★", Math.round(h * 0.6), "#ffd23f");
        const r = passTrack()[next];
        const ic = this.rewardIcon(r, x, y, 1);
        if (ic.list) ic.setScale(Math.min(1, h / 200));
        else fit(ic);
        return ic;
      }
      case "event": {
        const season = Seasons.active();
        return pixelText(this, x, y, `S${season?.number ?? ""}`, Math.round(h * 0.55), css(this.offerColor(o)), {
          stroke: 12,
        });
      }
      default:
        return pixelText(this, x, y, "OFF", Math.round(h * 0.45), "#ffffff", { stroke: 12 });
    }
  }

  /**
   * Everything an offer shows and does: title, subtitle, ribbon, a countdown, the art preview
   * spec (a hero rig) and the call to action (price + buy, equip, claim …). Prices, purchase
   * calls and equip logic are exactly the old card's.
   */
  describe(o, card) {
    const s = Save.data;
    const m = { title: "", sub: "", ribbon: null, timer: null, cta: null, rigSpec: null, preview: null };
    switch (o.kind) {
      case "drop": {
        m.title = "DAILY DRIFT DROP";
        const ready = Shop.dropReady();
        m.sub = ready ? "A free Mystery Pod, every day!" : "Come back for tomorrow's drop";
        m.ribbon = { text: "FREE", col: 0x1fae5a };
        if (ready)
          m.cta = { label: "CLAIM!", col: 0xffffff, fill: 0x2a8a0a, act: () => this.claimDrop(card) };
        else m.timer = { fn: () => Shop.msToRefresh(), fmt: (ms) => `NEXT ${fmtTime(ms)}` };
        break;
      }
      case "event": {
        const season = Seasons.active();
        m.title = season.event.name;
        m.sub = `Season ${season.number} event · ends in ${Seasons.countdown(season)}`;
        m.ribbon = { text: `SEASON ${season.number}`, col: 0xc8102e };
        m.cta = { label: "SEASON PASS", col: 0xffffff, fill: 0x7a0418, act: () => this.openPass() };
        break;
      }
      case "pass": {
        const season = Seasons.active();
        m.title = season ? `SEASON ${season.number} PASS` : "DRIFT PASS";
        const next = DriftPass.nextTier();
        const claimable = DriftPass.claimable();
        m.sub = next === null ? "Season complete!" : `Tier ${next + 1} of ${passTrack().length} · free with XP`;
        if (claimable) m.ribbon = { text: `${claimable} READY`, col: 0x1fae5a };
        m.cta = {
          label: claimable ? "CLAIM!" : "VIEW PASS",
          col: 0xffffff,
          fill: claimable ? 0x2a8a0a : 0x0a4a9a,
          act: () => this.openPass(),
        };
        break;
      }
      case "yarms": {
        const def = getCharacter("yarms");
        m.title = "YARMS";
        m.sub = "Never Skip Arm Day";
        m.ribbon = { text: "LEGENDARY", col: 0xe0203a };
        m.rigSpec = { hero: "yarms", flexLoop: true };
        m.cta = this.heroCta(def);
        break;
      }
      case "hero": {
        const def = getCharacter(o.id);
        m.title = def.name;
        m.sub = def.title;
        if (!["common", "rare"].includes(def.rarity))
          m.ribbon = { text: RARITY[def.rarity].label.split(" ")[0], col: 0xe0203a };
        m.rigSpec = { hero: def.id };
        m.cta = this.heroCta(def);
        break;
      }
      case "bundle": {
        const b = Shop.bundle(o.id);
        m.title = b.set.name.replace(" Set", "").toUpperCase();
        m.sub = "BUNDLE · Trail + Hat + Death FX";
        m.ribbon = { text: "-25%", col: 0xe0203a };
        m.timer = { fn: () => Shop.msToRefresh(), fmt: (ms) => `⏱ ${fmtTime(ms)}` };
        m.rigSpec = { hero: s.selected, extra: b.items };
        m.preview = () => b.items.map((id, j) => this.iconCos(id, (j - 1) * 130, 0, 0.55));
        if (!b.need.length) m.cta = { label: "OWNED", col: 0xffffff, fill: 0x3a2e70, act: null };
        else
          m.cta = {
            label: `${b.price}`,
            coin: true,
            was: b.full,
            act: () =>
              this.buy(card, m.title, b.price, () => this.tryBuy(card, Shop.buyBundle(o.id, b.price))),
          };
        break;
      }
      case "cos": {
        const cc = getCosmetic(o.id);
        m.title = cc.name.toUpperCase();
        m.sub = `${cc.cat === "dskin" ? "Dawson skin" : cc.cat === "tskin" ? "Tung skin" : CATEGORIES.find((x) => x.id === cc.cat).one} · ${RARITY[cc.rarity].label}`;
        if (o.deal) {
          m.ribbon = { text: "-30%", col: 0xe0203a };
          m.timer = { fn: () => Shop.msToRefresh(), fmt: (ms) => `⏱ ${fmtTime(ms)}` };
        } else if (o.seasonal) {
          m.ribbon = { text: "SEASON ONLY", col: 0xc8102e };
        } else if (cc.rarity === "legendary") m.ribbon = { text: "LEGENDARY", col: 0xe0203a };
        m.badge = ["coin", "hat", "skin", "dskin", "tskin"].includes(cc.cat);
        // a hero's signature item previews on that hero (SXE flies the Afterburner; DAWSON's
        // skins show on DAWSON)
        m.rigSpec = { hero: cc.hero || cc.forHero || s.selected, extra: [o.id] };
        m.preview = () => [this.iconCos(o.id, 0, 0, 0.8)];
        const owned = Shop.owns(o.id);
        const on = Shop.equipped(cc.cat) === o.id;
        if (on)
          m.cta = {
            label: "EQUIPPED",
            col: 0xffffff,
            fill: 0x3a2e70,
            act: () => {
              Shop.unequip(cc.cat);
              this.refreshCard(card);
            },
          };
        else if (owned)
          m.cta = {
            label: "EQUIP",
            col: 0xffffff,
            fill: 0x2a8a0a,
            act: () => {
              Shop.equip(o.id);
              Sfx.ui();
              this.refreshCard(card);
            },
          };
        else {
          const price = Shop.priceOf(o.id);
          m.cta = {
            label: `${price}`,
            coin: true,
            was: price < cc.price ? cc.price : 0,
            act: () =>
              this.buy(card, cc.name.toUpperCase(), price, () =>
                this.tryBuy(card, Shop.buy(o.id, "shop", price)),
              ),
          };
        }
        break;
      }
      case "pod": {
        m.title = "MYSTERY POD";
        m.sub = "A random cosmetic you don't own";
        m.preview = () => [this.add.image(0, 0, "cosm", "pod_0").setScale(2.6)];
        m.cta = {
          label: `${POD_PRICE}`,
          coin: true,
          act: () => this.buy(card, "MYSTERY POD", POD_PRICE, () => this.openPod(Shop.openPod())),
        };
        break;
      }
      case "boosts": {
        m.title = "BOOSTS";
        m.sub = "Off — every run stays fair on the leaderboard";
        break;
      }
    }
    return m;
  }

  /** (Re)build a tile's content: art, name, ribbon, timer and its price / status. */
  fillCard(c) {
    const o = c.offer;
    const w = c.tw;
    const h = c.th;
    const k = c.content;
    k.removeAll(true);
    this.timers = this.timers.filter((t) => t.card !== c);
    const m = this.describe(o, c);
    c.model = m;
    c.preview = m.preview;
    c.price = m.cta?.coin ? Number(m.cta.label) : null;
    const add = (x) => k.add(x);
    const artH = h - 64 - 44 - 18;
    const artY = -h / 2 + 12 + artH / 2;
    // a soft glow behind the art in the tile's colour
    const halo = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    halo.fillStyle(c.col, 0.16).fillCircle(0, artY, artH * 0.5);
    halo.fillStyle(c.col, 0.14).fillCircle(0, artY, artH * 0.32);
    add(halo);
    const art = this.offerArt(o, 0, artY, w - 40, artH - 6);
    add(art);
    c.art = art;
    if (o.kind === "drop" || o.kind === "pod") c.wobble = art;
    // name
    const nm = pixelText(this, 0, h / 2 - 64 - 22, m.title, 22, "#ffffff", { stroke: 6, shadow: false });
    nm.setScale(Math.min(1, (w - 24) / nm.width));
    add(nm);
    // price / status on the strip
    const sy = h / 2 - 34;
    const s = Save.data;
    if (m.cta?.coin) {
      const afford = s.coins >= c.price;
      const txt = this.add
        .text(0, sy, m.cta.label, this.priceStyle(34, afford ? "#ffe680" : "#ff8a9a"))
        .setOrigin(0, 0.5);
      const ic = this.add.image(0, sy, "pxc", "coin_0").setScale(0.85);
      const total = ic.displayWidth + 10 + txt.width;
      ic.setX(-total / 2 + ic.displayWidth / 2);
      txt.setX(-total / 2 + ic.displayWidth + 10);
      add([ic, txt]);
      c.priceText = txt;
      if (m.cta.was) {
        const wt = this.add
          .text(w / 2 - 14, -h / 2 + 30, `${m.cta.was}`, this.priceStyle(20, "#ffffff"))
          .setOrigin(1, 0.5);
        add([wt, this.add.rectangle(wt.x - wt.width / 2, wt.y, wt.width + 6, 3, 0xff2a5a)]);
      }
    } else {
      let label = m.cta?.label || "";
      let col = "#ffffff";
      if (label === "EQUIPPED") col = "#6aff9a";
      else if (label === "EQUIP") label = "OWNED ✓";
      else if (label === "CLAIM!") col = "#6aff3a";
      else if (label === "LOCKED" || label === "CHALLENGE") col = "#b8a8e0";
      if (o.kind === "boosts") label = "OFF";
      const st = pixelText(this, 0, sy, label, 22, col, { stroke: 6, shadow: false });
      st.setScale(Math.min(1, (w - 24) / st.width));
      add(st);
      if (m.timer) {
        st.setText(m.timer.fmt(m.timer.fn())).setColor("#ffd23f");
        this.timers.push({ text: st, fn: m.timer.fn, fmt: m.timer.fmt, card: c });
      }
    }
    // ribbon in the top-left corner (not a plain "LEGENDARY": the border and section say it)
    if (m.ribbon && m.ribbon.text !== RARITY[this.offerRarity(o)]?.label) {
      const r = this.add.container(-w / 2 + 14, -h / 2 + 18);
      const t = pixelText(this, 0, 0, m.ribbon.text, 16, "#ffffff", { stroke: 4, shadow: false, ox: 0 });
      const rw = t.width + 16;
      const rg = this.add.graphics();
      rg.fillStyle(0x07010f, 1).fillRoundedRect(-3, -16, rw + 6, 32, 8);
      rg.fillStyle(m.ribbon.col, 1).fillRoundedRect(0, -13, rw, 26, 6);
      rg.fillStyle(0xffffff, 0.3).fillRect(3, -11, rw - 6, 6);
      t.setX(8);
      r.add([rg, t]);
      add(r);
    }
    // a live timer chip on deals (top right)
    if (m.timer && m.cta) {
      const tt = this.add.text(w / 2 - 14, -h / 2 + 30, "", this.priceStyle(18, "#ffffff")).setOrigin(1, 0.5);
      const tg = this.add.graphics();
      add([tg, tt]);
      tt.setText(m.timer.fmt(m.timer.fn()));
      tg.fillStyle(0xff2a5a, 1).fillRoundedRect(tt.x - tt.width - 8, tt.y - 14, tt.width + 16, 28, 9);
      this.timers.push({ text: tt, fn: m.timer.fn, fmt: m.timer.fmt, card: c });
      if (m.cta.was) k.list.filter((x) => x.y === -h / 2 + 30 && x !== tt).forEach((x) => (x.y += 32));
    }
    // what VoiceOver reads for the tile
    c.a11yLabel = `${m.title}, ${c.price !== null ? `${c.price} coins` : m.cta?.label || m.sub}`;
  }

  /** A buy that didn't go through (e.g. the daily deal changed at midnight): show the new price. */
  tryBuy(card, ok) {
    if (!ok) {
      this.fx.floatText(this.W / 2, this.stageTop + this.stageH / 2, "PRICE UPDATED", "#ffd23f", 34);
      this.refreshAll();
    }
    return ok;
  }

  priceStyle(size, color) {
    return {
      fontFamily: NUM_FONT,
      fontSize: `${size}px`,
      fontStyle: "700",
      color,
      resolution: VIEW.Z,
      stroke: OUTLINE,
      strokeThickness: Math.max(4, Math.round(size / 6)),
    };
  }

  rewardIcon(r, x, y, scale = 1) {
    if (r.coins) {
      const c = this.add.container(x, y);
      c.add([
        this.add.image(0, -18 * scale, "pxc", "coin_0").setScale(2.4 * scale),
        pixelText(this, 0, 60 * scale, `${r.coins}`, Math.round(40 * scale), "#ffd23f", {
          stroke: Math.max(4, Math.round(9 * scale)),
        }),
      ]);
      return c;
    }
    if (r.pod) return this.add.image(x, y, "cosm", "pod_0").setScale(2.0 * scale);
    if (r.hero)
      return this.add
        .image(x, y, getCharacter(r.hero).texture)
        .setScale((0.62 / HI) * PORTRAIT_K * scale);
    return this.iconCos(r.item, x, y, 0.8 * scale);
  }

  rewardRarity(r) {
    if (r.coins) return "coins";
    if (r.pod) return "pod";
    if (r.hero) return getCharacter(r.hero).rarity;
    return getCosmetic(r.item).rarity;
  }

  heroCta(def) {
    const s = Save.data;
    if (Progression.isUnlocked(def.id)) {
      const on = s.selected === def.id;
      return on
        ? { label: "EQUIPPED", col: 0xffffff, fill: 0x3a2e70, act: null }
        : {
            label: "EQUIP",
            col: 0xffffff,
            fill: 0x2a8a0a,
            act: () => {
              s.selected = def.id;
              Save.write();
              Sfx.ui();
              this.refreshAll();
            },
          };
    }
    const cost = def.cost || Seasons.afterPrice(def.id);
    if (!cost) return { label: "CHALLENGE", col: 0xffffff, fill: 0x3a2e70, act: null };
    if (def.requires && !Progression.requirementsMet(def))
      return { label: "LOCKED", col: 0xffffff, fill: 0x3a2e70, act: null };
    return {
      label: `${cost}`,
      coin: true,
      act: () =>
        this.buy(this.cards[this.index], def.name, cost, () => {
          const ok = Progression.buy(def.id);
          if (ok) {
            s.selected = def.id;
            Save.write();
            Analytics.log("item_purchased", { item: def.id, price: cost, category: "hero" });
          }
          return ok;
        }),
    };
  }

  refreshCard(c) {
    this.fillCard(c);
    if (this.cards[this.index] === c) this.buildStage(c);
    this.refreshHeaders();
    this.coins.to(Save.data.coins, 500);
  }

  refreshAll() {
    for (const c of this.cards) this.fillCard(c);
    this.buildStage(this.cards[this.index]);
    this.refreshHeaders();
    this.coins.to(Save.data.coins, 500);
  }

  /** The "3/9 OWNED" counts on the rarity headers. */
  refreshHeaders() {
    this.sections.forEach((sec, i) => {
      const t = this.headers[i]?.right;
      if (!t || sec.timer || !sec.rarity) return;
      const owned = sec.items.filter((o) => this.offerOwned(o)).length;
      t.setText(`${owned}/${sec.items.length} OWNED`);
    });
  }

  // ---------------------------------------------------------------- scrolling
  setScroll(y, free = false) {
    this.scrollY = free ? y : Phaser.Math.Clamp(y, 0, this.scrollMax);
    this.list.y = this.listTop - this.scrollY;
    this.cull();
  }

  /** Scroll so the list shows `y` at the top (tweened). */
  scrollTo(y, ms = 380) {
    this.scrollTween?.stop();
    this.scrollV = 0;
    const o = { v: this.scrollY };
    this.scrollTween = this.tweens.add({
      targets: o,
      v: Phaser.Math.Clamp(y, 0, this.scrollMax),
      duration: ms,
      ease: "Cubic.easeOut",
      onUpdate: () => this.setScroll(o.v),
    });
  }

  /** Only the tiles in (or next to) the list window are drawn and tappable. */
  cull() {
    const vh = this.listBot - this.listTop;
    const vis = (y, h) => y + h / 2 > this.scrollY - 10 && y - h / 2 < this.scrollY + vh + 10;
    for (const c of this.cards || []) c.setVisible(vis(c.y, c.th));
    for (const hd of this.headers || []) hd.setVisible(vis(hd.y, HEAD_H));
  }

  /** A tile's centre on screen. */
  cardPoint(c) {
    return { x: c.x, y: this.list.y + c.y };
  }

  // ---------------------------------------------------------------- focus + preview
  focus(i, instant = false) {
    i = Phaser.Math.Clamp(i, 0, this.cards.length - 1);
    const changed = i !== this.index || instant;
    this.index = i;
    const c = this.cards[i];
    if (!c) return;
    // keep the chosen tile in view
    const vh = this.listBot - this.listTop;
    const top = c.y - c.th / 2 - 10;
    const bot = c.y + c.th / 2 + 10;
    let want = null;
    if (top < this.scrollY) want = top - HEAD_H;
    else if (bot > this.scrollY + vh) want = bot - vh;
    if (want !== null) instant ? this.setScroll(want) : this.scrollTo(want);
    if (changed) {
      this.buildStage(c);
      if (c.offer.id) Analytics.log("item_viewed", { item: c.offer.id, kind: c.offer.kind });
    }
  }

  /** The holo stage for the selected tile: frame, art or live hero, name, price, buy button. */
  buildStage(c) {
    const W = this.stageW;
    const H = this.stageH;
    killTweensDeep(this, this.stageArt);
    this.stageArt.removeAll(true);
    this.stageInfo.removeAll(true);
    this.rig?.destroy();
    this.rig = null;
    this.rigSpec = null;
    this.stageWobble = null;
    this.cta = null;
    this.stageCountdown = null;
    this.stageCountdown2 = null;
    if (!c) return;
    const o = c.offer;
    const m = c.model || this.describe(o, c);
    const col = c.col;
    this.stageCol = col;
    this.stageLegend = c.legend;
    const g = this.stageBg;
    g.clear();
    neonPanel(g, -W / 2, -H / 2, W, H, 26, col, { tint: 0.5, width: 6 });
    // spotlight + holo floor grid + scanlines
    const infoH = 138;
    const artTop = -H / 2 + 56;
    const artBot = H / 2 - infoH;
    this.stageArtY = (artTop + artBot) / 2;
    g.fillStyle(col, 0.08).fillEllipse(0, artBot - 16, W * 0.7, 60);
    g.lineStyle(2, col, 0.25);
    for (let k = -6; k <= 6; k++) g.lineBetween(k * 30, artBot - 40, k * 80, artBot + 6);
    for (let k = 0; k < 3; k++) g.lineBetween(-W / 2 + 20, artBot - 40 + k * 16, W / 2 - 20, artBot - 40 + k * 16);
    if (!this.lowGfx) {
      g.fillStyle(0xffffff, 0.035);
      for (let y = -H / 2 + 10; y < H / 2 - 10; y += 8) g.fillRect(-W / 2 + 8, y, W - 16, 2);
    }
    // the info band
    g.fillStyle(0x07010f, 0.7).fillRect(-W / 2 + 6, H / 2 - infoH, W - 12, infoH - 6);
    g.lineStyle(3, col, 0.8).lineBetween(-W / 2 + 6, H / 2 - infoH, W / 2 - 6, H / 2 - infoH);
    // spinning rays behind legendary offers
    this.stageRays.clear();
    this.stageRays.setPosition(0, this.stageArtY);
    if (c.legend) {
      this.stageRays.fillStyle(col, 0.16);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        this.stageRays.slice(0, 0, W * 0.6, a, a + 0.18, false).fillPath();
      }
    }

    // top row: rarity chip (left), ribbon / timer (right)
    const r = this.offerRarity(o);
    const chipText = r
      ? RARITY[r].label
      : { drop: "FREE DAILY", pass: "DRIFT PASS", event: "EVENT", bundle: "BUNDLE", pod: "MYSTERY", boosts: "BOOSTS" }[o.kind] || "";
    const chip = this.chip(-W / 2 + 22, -H / 2 + 30, chipText, col, 0);
    this.stageInfo.add(chip);
    if (m.timer) {
      const tx = this.add.text(W / 2 - 22, -H / 2 + 30, m.timer.fmt(m.timer.fn()), this.priceStyle(24, "#ffffff")).setOrigin(1, 0.5);
      const tg = this.add.graphics();
      tg.fillStyle(0x07010f, 1).fillRoundedRect(tx.x - tx.width - 15, tx.y - 21, tx.width + 26, 42, 13);
      tg.fillStyle(0xff2a5a, 1).fillRoundedRect(tx.x - tx.width - 12, tx.y - 18, tx.width + 20, 36, 11);
      this.stageInfo.add([tg, tx]);
      this.stageCountdown = { text: tx, ...m.timer };
    } else if (m.ribbon && !chipText.startsWith(m.ribbon.text)) this.stageInfo.add(this.chip(W / 2 - 22, -H / 2 + 30, m.ribbon.text, m.ribbon.col, 1, true));

    // the art: a live hero rig for heroes and wearables, a picture for everything else
    const artH = artBot - artTop;
    if (m.rigSpec) {
      this.buildRig(m.rigSpec);
      if (m.badge || o.kind === "bundle") {
        // the item itself, small, in a corner (hats and coin skins are tiny on the hero)
        const bx = -W / 2 + 78;
        const bg = this.add.graphics();
        bg.fillStyle(0x07010f, 0.8).fillRoundedRect(bx - 56, this.stageArtY - 56, 112, 112, 16);
        bg.lineStyle(3, col, 0.9).strokeRoundedRect(bx - 56, this.stageArtY - 56, 112, 112, 16);
        this.stageArt.add([bg, this.offerArt(o, bx, this.stageArtY, 92, 92)]);
      }
    } else this.stageDetail(o, m, artTop, artH);

    // title + subtitle (left), call to action (right)
    const ctaW = 250;
    const textW = W - ctaW - 60;
    const iy = H / 2 - infoH / 2 - 2;
    const tt = pixelText(this, -W / 2 + 24, iy - 26, m.title, 40, "#ffffff", { stroke: 10, ox: 0 });
    tt.setScale(Math.min(1, textW / tt.width));
    const st = this.add
      .text(-W / 2 + 26, iy + 24, m.sub, this.priceStyle(22, css(lighten(col, 0.55))))
      .setOrigin(0, 0.5)
      .setWordWrapWidth(textW / 0.9);
    st.setScale(Math.min(1, textW / Math.max(1, st.width), 56 / Math.max(1, st.height)));
    this.stageInfo.add([tt, st]);
    const cta = m.cta;
    if (cta) {
      const bx = W / 2 - 22 - ctaW / 2;
      const b = button(this, bx, iy + 4, ctaW, 96, cta.coin ? "" : cta.label, {
        color: cta.col ?? 0xffd23f,
        size: cta.label.length > 8 ? 30 : 38,
        fill: cta.fill ?? 0x2a1460,
        onClick: () => {
          if (this.modal || !cta.act) return;
          cta.act();
        },
      });
      if (!cta.act) b.setEnabled(false);
      if (cta.coin) {
        const afford = Save.data.coins >= Number(cta.label);
        const txt = this.add
          .text(0, 0, cta.label, this.priceStyle(50, afford ? "#ffffff" : "#ffb0b0"))
          .setOrigin(0, 0.5);
        const ic = this.add.image(0, 0, "pxc", "coin_0").setScale(1.15);
        const total = ic.displayWidth + 12 + txt.width;
        ic.setX(-total / 2 + ic.displayWidth / 2);
        txt.setX(-total / 2 + ic.displayWidth + 12);
        b.add([ic, txt]);
        b.priceText = txt;
        b.a11yLabel = `Buy ${m.title} for ${cta.label} coins`;
        if (cta.was) {
          const w2 = this.add
            .text(ctaW / 2 - 16, -62, `${cta.was}`, this.priceStyle(26, "#ffffff"))
            .setOrigin(1, 0.5);
          b.add([w2, this.add.rectangle(w2.x - w2.width / 2, w2.y, w2.width + 8, 4, 0xff2a5a)]);
        }
      }
      this.stageInfo.add(b);
      this.cta = b;
    }
  }

  /** A small neon label chip. `align` 0 = grows right from x, 1 = grows left. */
  chip(x, y, text, col, align = 0, filled = false) {
    const c = this.add.container(x, y);
    const t = pixelText(this, 0, 0, text, 20, filled ? "#ffffff" : css(lighten(col, 0.25)), { stroke: 5, shadow: false, ox: 0 });
    const w = t.width + 24;
    const x0 = align ? -w : 0;
    t.setX(x0 + 12);
    const g = this.add.graphics();
    g.fillStyle(0x07010f, 1).fillRoundedRect(x0 - 3, -20, w + 6, 40, 12);
    g.fillStyle(filled ? col : GLASS, 1).fillRoundedRect(x0, -17, w, 34, 10);
    g.lineStyle(3, filled ? 0xffffff : col, filled ? 0.5 : 1).strokeRoundedRect(x0, -17, w, 34, 10);
    c.add([g, t]);
    return c;
  }

  /** Stage art for the offers that aren't worn by a hero: pods, the pass, the event, boosts. */
  stageDetail(o, m, top, h) {
    const W = this.stageW;
    const y = top + h / 2;
    const add = (x) => this.stageArt.add(x);
    switch (o.kind) {
      case "drop":
      case "pod": {
        const pod = this.add.image(o.kind === "pod" ? -W * 0.22 : 0, y, "cosm", "pod_0");
        pod.setScale(Math.min(3.4, (h - 20) / pod.height));
        add(pod);
        this.stageWobble = pod;
        if (o.kind === "pod") {
          const odds = Object.entries(POD_ODDS)
            .map(([r, v]) => `${RARITY[r].label}  ${v}%`)
            .reverse();
          odds.forEach((line, i) => {
            const r = Object.keys(POD_ODDS).reverse()[i];
            add(
              this.add
                .text(W * 0.02, y - 66 + i * 44, line, this.priceStyle(26, css(RARITY[r].color)))
                .setOrigin(0, 0.5),
            );
          });
        } else if (!Shop.dropReady()) {
          const cd = this.add
            .text(0, y + h / 2 - 22, `NEXT DROP ${fmtTime(Shop.msToRefresh())}`, this.priceStyle(30, "#ffffff"))
            .setOrigin(0.5);
          add(cd);
          this.stageCountdown2 = { text: cd, fn: () => Shop.msToRefresh(), fmt: (ms) => `NEXT DROP ${fmtTime(ms)}` };
        }
        break;
      }
      case "pass": {
        const next = DriftPass.nextTier();
        if (next === null) {
          add(pixelText(this, 0, y, "SEASON COMPLETE!", 44, "#ffd23f", { stroke: 10 }));
          break;
        }
        const r = passTrack()[next];
        const ic = this.rewardIcon(r, -W * 0.28, y - 4, 1);
        if (!ic.list) ic.setScale(Math.min(ic.scaleX, (h - 30) / Math.max(1, ic.height)));
        else ic.setScale(Math.min(1, (h - 20) / 190));
        add(ic);
        const bw = W * 0.5;
        const bx = -W * 0.06;
        const by = y - 10;
        const pr = DriftPass.isUnlocked(next) ? 1 : DriftPass.progressTo(next);
        const bar = this.add.graphics();
        bar.fillStyle(0x07010f, 1).fillRoundedRect(bx - 5, by - 5, bw + 10, 52, 16);
        bar.fillStyle(0x0a4a7a, 1).fillRoundedRect(bx, by, bw, 42, 12);
        bar.fillStyle(0xffd23f, 1).fillRoundedRect(bx, by, Math.max(24, Math.round(bw * pr)), 42, 12);
        bar.fillStyle(0xffffff, 0.4).fillRect(bx + 8, by + 5, Math.max(8, Math.round(bw * pr) - 16), 10);
        add(bar);
        const xpIn = Math.max(0, Math.min(tierXp(), DriftPass.xp() - next * tierXp()));
        add(this.add.text(bx + bw / 2, by + 21, `${xpIn} / ${tierXp()} XP`, this.priceStyle(26, "#ffffff")).setOrigin(0.5));
        add(pixelText(this, bx, by - 34, `NEXT: TIER ${next + 1}`, 24, "#ffffff", { stroke: 6, ox: 0 }));
        break;
      }
      case "event": {
        const season = Seasons.active();
        const chs = season.event.challenges;
        const rowH = Math.min(70, (h - 10) / Math.max(1, chs.length));
        chs.forEach((ch, i) => {
          const ry = top + 10 + rowH * i + rowH / 2 - 10;
          const pr = Seasons.challengeProgress(season, ch);
          const t = this.add
            .text(-W / 2 + 30, ry - 6, ch.text, this.priceStyle(20, "#ffffff"))
            .setOrigin(0, 0.5);
          t.setScale(Math.min(1, (W - 190) / t.width));
          add(t);
          const bw = W - 60;
          const bar = this.add.graphics();
          bar.fillStyle(0x07010f, 1).fillRoundedRect(-bw / 2 - 2, ry + 10, bw + 4, 16, 7);
          bar.fillStyle(pr.frac >= 1 ? 0x39ff88 : 0xffd23f, 1).fillRoundedRect(-bw / 2, ry + 12, Math.max(10, bw * pr.frac), 12, 6);
          add(bar);
          add(
            this.add
              .text(W / 2 - 30, ry - 6, pr.label, this.priceStyle(20, pr.frac >= 1 ? "#39ff88" : "#ffd23f"))
              .setOrigin(1, 0.5),
          );
        });
        break;
      }
      default:
        add(pixelText(this, 0, y, "OFF", 110, "#ffffff", { stroke: 18 }));
    }
  }

  buildRig(spec) {
    this.rig?.destroy();
    this.rig = null;
    if (!spec) return;
    const lo = Shop.loadout();
    for (const id of spec.extra || []) lo[getCosmetic(id).cat] = id;
    this.rig = new CharacterRig(this, getCharacter(spec.hero), this.fx, {
      x: 0,
      y: 0,
      depth: 150,
      scale: spec.flexLoop ? 2.6 : 2.3,
      cosmetics: lo,
    });
    this.rigSpec = spec;
    this.rigT = 0;
    this.flapT = 0.4;
    this.flexT = 0.3;
  }

  /** Where the hero (or the art) sits on the stage, on screen. */
  stagePoint() {
    const x = this.stage.x + (this.rigSpec && !this.rigSpec.flexLoop ? this.stageW * 0.12 : 0);
    return { x, y: this.stage.y + this.stageArtY };
  }

  pop(c) {
    Sfx.ui();
    this.tweens.killTweensOf(c);
    c.setScale(1.06, 0.95);
    this.tweens.add({
      targets: c,
      scaleX: 1,
      scaleY: 1,
      duration: 520,
      ease: "Elastic.easeOut",
      easeParams: [1.1, 0.4],
    });
  }

  // ---------------------------------------------------------------- buying
  buy(c, title, price, doBuy) {
    this.confirm(c, title, price, () => {
      if (!doBuy()) return;
      this.gotIt(c);
    });
  }

  /**
   * The purchase: coins pour out of the balance into the buy button, the tile bursts in its
   * rarity colour, the item flies up into your hero on the stage, and the hero lights up with
   * "GOT IT!". Reduce Flashing drops the screen shake and the bright wash; Low Graphics thins
   * the particles.
   */
  gotIt(c) {
    const calm = reduceFlashing();
    const lo = this.lowGfx;
    const col = c.col;
    const from = { x: this.coinGlyph.x, y: this.coinGlyph.y };
    const btn = this.cta ? { x: this.stage.x + this.cta.x, y: this.stage.y + this.cta.y } : this.stagePoint();
    // 1. coins arc from the balance into the buy button (the counter rolls down with them)
    const n = lo ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const im = this.add.image(from.x, from.y, "pxc", "coin_0").setScale(1).setDepth(420);
      const p = { t: 0 };
      const cx = (from.x + btn.x) / 2 + (Math.random() - 0.5) * 260;
      const cy = Math.min(from.y, btn.y) - 60 - Math.random() * 60;
      this.tweens.add({
        targets: p,
        t: 1,
        delay: i * 35,
        duration: 420,
        ease: "Sine.easeIn",
        onUpdate: () => {
          const u = p.t;
          im.x = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * cx + u * u * btn.x;
          im.y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * cy + u * u * btn.y;
          im.setFrame(`coin_${Math.floor((u * 8 + i) % 4)}`);
          im.setScale(1 - u * 0.4);
        },
        onComplete: () => {
          im.destroy();
          Sfx.coin(i);
        },
      });
    }
    this.coins.to(Save.data.coins, 600);
    if (this.cta) {
      this.tweens.add({ targets: this.cta, scaleX: 1.1, scaleY: 0.9, duration: 90, yoyo: true, repeat: 2, delay: 300 });
      this.fx.burst("star", btn.x, btn.y, 10, 0xffd23f, { speed: { min: 120, max: 360 } });
    }
    // 2. the tile bursts and the item takes off from it toward the hero
    this.time.delayedCall(520, () => {
      const tp = this.cardPoint(c);
      const inView = c.visible && tp.y > this.listTop && tp.y < this.listBot;
      const start = inView ? tp : btn;
      if (inView) {
        this.fx.ring(start.x, start.y, col, { scale: 2.2, duration: 500 });
        this.fx.burst("star", start.x, start.y, 18, col, { speed: { min: 150, max: 450 } });
      }
      const to = this.stagePoint();
      const art = this.offerArt(c.offer, start.x, start.y, 150, 150).setDepth(430);
      const s1 = art.scaleX;
      const glow = this.add.graphics().setDepth(429).setBlendMode(Phaser.BlendModes.ADD);
      glow.fillStyle(col, 0.35).fillCircle(0, 0, 70);
      glow.fillStyle(0xffffff, calm ? 0.15 : 0.3).fillCircle(0, 0, 36);
      glow.setPosition(start.x, start.y);
      art.setScale(s1 * 0.6);
      const p = { t: 0 };
      const mx = (start.x + to.x) / 2 + (start.x < to.x ? -120 : 120);
      const my = Math.min(start.y, to.y) - 120;
      let sp = 0;
      this.tweens.add({ targets: art, scale: s1 * 1.15, duration: 180, ease: "Back.easeOut" });
      this.tweens.add({
        targets: p,
        t: 1,
        delay: 160,
        duration: 520,
        ease: "Cubic.easeIn",
        onUpdate: () => {
          const u = p.t;
          const x = (1 - u) * (1 - u) * start.x + 2 * (1 - u) * u * mx + u * u * to.x;
          const y = (1 - u) * (1 - u) * start.y + 2 * (1 - u) * u * my + u * u * to.y;
          art.setPosition(x, y).setScale(s1 * (1.15 - 0.75 * u)).setAngle(u * 360);
          glow.setPosition(x, y).setScale(1 - 0.5 * u);
          if (!lo && (sp++ & 1) === 0) this.fx.burst("star", x, y, 1, col, { speed: { min: 10, max: 60 } });
        },
        onComplete: () => {
          art.destroy();
          glow.destroy();
          this.landed(c, to, calm);
        },
      });
    });
  }

  /** 3. the item lands on the hero: the stage rebuilds (now owned / equipped) and lights up. */
  landed(c, to, calm) {
    const col = c.col;
    Sfx.reward();
    Haptics.light();
    this.refreshCard(c);
    if (this.rigSpec?.flexLoop) this.rig?.flex({ big: true, shine: true });
    this.fx.ring(to.x, to.y, col, { scale: 3.2, duration: 650 });
    this.fx.ring(to.x, to.y, 0xffffff, { scale: 1.8, duration: 420, alpha: calm ? 0.4 : 0.9 });
    this.fx.burst("star", to.x, to.y, 30, 0xffffff, { speed: { min: 200, max: 600 } });
    for (const cc of [col, 0xffd23f, 0x3ef4ff, 0xff4fd8])
      this.fx.burst("confetti", to.x, to.y, 10, cc, { speed: { min: 250, max: 650 } });
    // the stage glows in the item's colour (a soft wash; none with Reduce Flashing)
    if (!calm) {
      const wash = this.add
        .rectangle(this.stage.x, this.stage.y, this.stageW, this.stageH, col, 0.35)
        .setDepth(140)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: wash, alpha: 0, duration: 450, onComplete: () => wash.destroy() });
    }
    const stamp = pixelText(this, this.stage.x, this.stage.y - this.stageH / 2 + 110, "GOT IT!", 92, "#ffd23f", {
      stroke: 20,
    })
      .setAngle(-8)
      .setDepth(410)
      .setScale(2.6)
      .setAlpha(0);
    stamp.setShadow(0, 8, css(col), 0, true, true);
    this.tweens.add({
      targets: stamp,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: "Cubic.easeIn",
      onComplete: () => {
        if (!calm) this.cameras.main.shake(120, 0.004);
      },
    });
    this.tweens.add({
      targets: stamp,
      alpha: 0,
      y: stamp.y - 30,
      delay: 1100,
      duration: 300,
      onComplete: () => stamp.destroy(),
    });
  }

  claimDrop(c) {
    const res = Shop.claimDrop();
    if (!res) return;
    const p = this.stagePoint();
    this.fx.burst("star", p.x, p.y, 30, 0xffffff, {
      speed: { min: 150, max: 500 },
    });
    this.openPod(res, () => this.refreshCard(c));
  }

  // ---------------------------------------------------------------- drift pass
  openPass() {
    // the full-screen Drift Pass
    fadeTo(this, "Pass", { from: "Shop" });
  }

  // ---------------------------------------------------------------- modals
  /** Big, colourful buy confirmation with the item preview inside. */
  confirm(card, title, price, onYes) {
    const W = this.W;
    const H = this.H;
    const th = card.theme;
    const c = this.add.container(0, 0).setDepth(500);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x2a0850, 0.75).setInteractive();
    const pw = W - 70;
    const ph = 660;
    const x0 = W / 2 - pw / 2;
    const y0 = H / 2 - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(0x1a0630, 1).fillRoundedRect(x0 - 9, y0 - 9, pw + 18, ph + 18, 34);
    g.fillStyle(th.fill, 1).fillRoundedRect(x0, y0, pw, ph, 26);
    g.fillGradientStyle(th.light, th.light, th.fill, th.fill, 1).fillRect(
      x0 + 10,
      y0 + 10,
      pw - 20,
      300,
    );
    g.fillStyle(th.band, 1).fillRect(x0, y0 + 300, pw, 160);
    g.lineStyle(6, 0xffffff, 0.85).strokeRoundedRect(x0 + 3, y0 + 3, pw - 6, ph - 6, 24);
    c.add([dim, g]);
    // the preview: the item itself, or the hero for character offers
    const pv = this.add.container(W / 2, y0 + 160);
    const o = card.offer;
    if (o.kind === "hero" || o.kind === "yarms") {
      const def = getCharacter(o.kind === "yarms" ? "yarms" : o.id);
      pv.add(
        this.add
          .image(0, 0, o.kind === "yarms" ? "hero_yarms_flex" : def.texture)
          .setScale((1.0 / HI) * PORTRAIT_K),
      );
    } else if (card.preview) pv.add(card.preview());
    c.add(pv);
    this.tweens.add({
      targets: pv,
      y: pv.y - 10,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    const t = pixelText(this, W / 2, y0 + 350, title, 46, "#ffffff", { stroke: 11 });
    t.setScale(Math.min(1, (pw - 50) / t.width));
    const coin = this.add.image(0, y0 + 415, "pxc", "coin_0").setScale(1.2);
    const pr = this.add
      .text(0, y0 + 415, `${price}`, this.priceStyle(56, "#ffd23f"))
      .setOrigin(0, 0.5);
    const total = coin.displayWidth + 14 + pr.width;
    coin.setX(W / 2 - total / 2 + coin.displayWidth / 2);
    pr.setX(W / 2 - total / 2 + coin.displayWidth + 14);
    const left = this.add
      .text(
        W / 2,
        y0 + 494,
        `You'll have ${Save.data.coins - price} left`,
        this.priceStyle(30, "#ffffff"),
      )
      .setOrigin(0.5);
    const yes = button(this, W / 2 - pw / 4 - 6, y0 + ph - 84, pw / 2 - 40, BTN_H, "BUY!", {
      color: 0xffffff,
      size: 42,
      fill: 0x2a8a0a,
      onClick: () => {
        this.closeModal();
        onYes();
      },
    });
    const no = button(this, W / 2 + pw / 4 + 6, y0 + ph - 84, pw / 2 - 40, BTN_H, "NOPE", {
      color: 0xffffff,
      size: 36,
      fill: 0xb01a4a,
      onClick: () => this.closeModal(),
    });
    c.add([t, coin, pr, left, yes, no]);
    c.setScale(0.85).setAlpha(0);
    c.setPosition(W * 0.075, H * 0.075);
    this.tweens.add({
      targets: c,
      scale: 1,
      x: 0,
      y: 0,
      alpha: 1,
      duration: 220,
      ease: "Back.easeOut",
    });
    this.modal = c;
  }

  closeModal() {
    killTweensDeep(this, this.modal);
    this.modal?.destroy();
    this.modal = null;
  }

  /** Pod opening: shakes harder and harder, cracks, bursts in the rarity colour, reveals. */
  openPod(res, after) {
    if (!res) return;
    this.coins.to(Save.data.coins, 500);
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(500);
    this.modal = c;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x2a0850, 0.85).setInteractive();
    const pod = this.add.image(W / 2, H * 0.42, "cosm", "pod_0").setScale(3.6);
    c.add([dim, pod]);
    const col = RAY_COL[res.rarity] ?? 0xffffff;
    this.tweens.add({
      targets: pod,
      angle: { from: -6, to: 6 },
      duration: 70,
      yoyo: true,
      repeat: 9,
      onRepeat: () => Sfx.chestShake?.(),
      onComplete: () => {
        pod.setFrame("pod_1");
        this.cameras.main.shake(200, 0.006);
        this.tweens.add({
          targets: pod,
          angle: { from: -12, to: 12 },
          scale: 6,
          duration: 50,
          yoyo: true,
          repeat: 7,
          onComplete: () => this.podReveal(c, pod, res, col, after),
        });
      },
    });
  }

  podReveal(c, pod, res, col, after) {
    const W = this.W;
    const H = this.H;
    const cy = H * 0.42;
    pod.setVisible(false);
    Sfx.chestOpen?.();
    Sfx.reward();
    Haptics.strong();
    const legend = res.rarity === "legendary";
    // rays in the rarity colour (legendary: a rainbow of rays) + confetti
    const rays = this.add.graphics({ x: W / 2, y: cy }).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      rays.fillStyle(legend ? Phaser.Display.Color.HSVToRGB(i / 14, 0.6, 1).color : col, 0.32);
      rays.slice(0, 0, 900, a, a + 0.2, false).fillPath();
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    c.addAt(rays, 1);
    // a soft colour wash instead of a white flash (Reduce Flashing makes it fainter)
    const wash = this.add.rectangle(W / 2, H / 2, W, H, col, reduceFlashing() ? 0.1 : 0.3);
    c.add(wash);
    this.tweens.add({ targets: wash, alpha: 0, duration: 500 });
    this.fx.ring(W / 2, cy, col, { scale: 4, duration: 800 });
    this.fx.burst("star", W / 2, cy, 60, col, { speed: { min: 250, max: 900 } });
    for (const cc of [0xff3a5a, 0xffe14d, 0x39ff88, 0x3ef4ff, 0xff4fd8])
      this.fx.burst("confetti", W / 2, cy, 14, cc, {
        angle: { min: 200, max: 340 },
        speed: { min: 300, max: 800 },
      });
    const label = RARITY[res.rarity].label;
    const done = () => {
      this.closeModal();
      after?.();
      this.refreshAll();
    };
    if (res.item) {
      const icon = this.rewardIcon({ item: res.item.id }, W / 2, cy, 2.0);
      const s0 = icon.scaleX;
      icon.setScale(0.1);
      this.tweens.add({ targets: icon, scale: s0, duration: 600, ease: "Back.easeOut" });
      c.add([
        icon,
        pixelText(this, W / 2, H * 0.2, label, 50, `#${col.toString(16).padStart(6, "0")}`, {
          stroke: 12,
        }),
        pixelText(this, W / 2, H * 0.6, res.item.name.toUpperCase(), 60, "#ffffff", { stroke: 13 }),
      ]);
      c.add(
        button(this, W / 2 - 150, H * 0.72, 270, BTN_H, "EQUIP", {
          color: 0xffffff,
          size: 40,
          fill: 0x2a8a0a,
          onClick: () => {
            Shop.equip(res.item.id);
            done();
          },
        }),
      );
      c.add(
        button(this, W / 2 + 150, H * 0.72, 270, BTN_H, "NICE!", {
          color: 0xffffff,
          size: 40,
          fill: 0x2a5af0,
          onClick: done,
        }),
      );
    } else {
      c.add([
        pixelText(this, W / 2, H * 0.36, `ALL ${label} OWNED`, 42, "#ffffff", { stroke: 10 }),
        pixelText(this, W / 2, H * 0.46, `+${res.refund} COINS`, 58, "#ffd23f", { stroke: 13 }),
        button(this, W / 2, H * 0.62, 300, BTN_H, "NICE!", {
          color: 0xffffff,
          size: 40,
          fill: 0x2a5af0,
          onClick: done,
        }),
      ]);
    }
  }

  leave() {
    if (this.modal) return this.closeModal();
    fadeTo(this, "Menu");
  }

  // ---------------------------------------------------------------- per frame
  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    const W = this.W;
    this.pattern.tilePositionX += dt * 10;
    this.pattern.tilePositionY += dt * 6;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < -10) m.x = W + 10;
      if (m.y < -10) m.y = this.H + 10;
    }
    // balance icons: spinning coin, glinting shard
    this.coinGlyph.setFrame(`coin_${Math.floor(this.t * 8) % 4}`);
    const sx = this.shardX;
    const sy = this.shardY;
    const k = Math.abs(Math.cos(this.t * 2.4));
    this.shardG.clear();
    this.shardG.fillStyle(0x1a0630, 1).fillPoints(
      [
        { x: sx, y: sy - 26 },
        { x: sx + 15 * k + 7, y: sy },
        { x: sx, y: sy + 26 },
        { x: sx - 15 * k - 7, y: sy },
      ],
      true,
    );
    this.shardG.fillStyle(0x9ffcff, 1).fillPoints(
      [
        { x: sx, y: sy - 19 },
        { x: sx + 12 * k + 2, y: sy },
        { x: sx, y: sy + 19 },
        { x: sx - 12 * k - 2, y: sy },
      ],
      true,
    );

    // list momentum + springing back from past either end
    if (!this.listDrag && !this.scrollTween?.isPlaying()) {
      if (this.scrollY < 0 || this.scrollY > this.scrollMax) {
        const end = this.scrollY < 0 ? 0 : this.scrollMax;
        this.scrollV = 0;
        const y = end + (this.scrollY - end) * Math.exp(-dt * 14);
        this.setScroll(Math.abs(y - end) < 0.5 ? end : y, true);
      } else if (Math.abs(this.scrollV) > 5) {
        this.scrollV *= Math.exp(-dt * 4);
        this.setScroll(this.scrollY + this.scrollV * dt, true);
        if (this.scrollY < -60 || this.scrollY > this.scrollMax + 60) this.scrollV = 0;
      }
    }
    this.drawScrollBar();

    // tiles: pods wobble; the selected tile pulses; a shine sweeps across legendary tiles
    const fx = this.listFx;
    fx.clear();
    const sel = this.cards[this.index];
    if (sel?.visible) {
      const a = 0.55 + 0.45 * Math.sin(this.t * 5);
      const w = sel.tw;
      const h = sel.th;
      fx.lineStyle(14, sel.col, 0.25 * a).strokeRoundedRect(sel.x - w / 2 - 8, sel.y - h / 2 - 8, w + 16, h + 16, 24);
      fx.lineStyle(5, 0xffffff, 0.5 + 0.5 * a).strokeRoundedRect(sel.x - w / 2 - 6, sel.y - h / 2 - 6, w + 12, h + 12, 22);
    }
    const sweep = (this.t * 0.45) % 1.6; // one pass every 3.5 s, then a rest
    for (const c of this.cards) {
      if (!c.visible) continue;
      if (c.wobble) c.wobble.setAngle(Math.sin(this.t * 3 + c.x) * 6);
      if (c.legend && sweep < 1 && !this.lowGfx) {
        const x = c.x - c.tw / 2 - 60 + sweep * (c.tw + 120);
        const y0 = c.y - c.th / 2 + 6;
        const y1 = c.y + c.th / 2 - 6;
        fx.fillStyle(0xffffff, 0.12);
        // (kept inside the tile: the slanted band is clipped to its edges)
        const l = c.x - c.tw / 2 + 6;
        const r = c.x + c.tw / 2 - 6;
        const cl = (v) => Phaser.Math.Clamp(v, l, r);
        fx.fillPoints(
          [
            { x: cl(x), y: y1 },
            { x: cl(x + 34), y: y1 },
            { x: cl(x + 34 + 70), y: y0 },
            { x: cl(x + 70), y: y0 },
          ],
          true,
        );
      }
    }

    this.updateStage(dt);

    // live countdowns (a few times a second is plenty)
    this.timerT -= dt;
    if (this.timerT <= 0) {
      this.timerT = 0.25;
      const now = new Date(Date.now());
      for (const tm of this.timers) if (tm.text.active) tm.text.setText(tm.fmt(tm.fn(now)));
      for (const tm of [this.stageCountdown, this.stageCountdown2])
        if (tm?.text.active) tm.text.setText(tm.fmt(tm.fn(now)));
    }

    this.fx.update(dt);
    this.yarmsPeekT -= dt;
    if (this.yarmsPeekT <= 0 && !this.modal) {
      this.yarmsPeekT = 12 + Math.random() * 8;
      this.yarmsPeek();
    }
  }

  drawScrollBar() {
    const g = this.scrollBar;
    g.clear();
    if (this.scrollMax <= 0) return;
    const vh = this.listBot - this.listTop;
    const bh = Math.max(60, (vh * vh) / this.contentH);
    const p = Phaser.Math.Clamp(this.scrollY / this.scrollMax, 0, 1);
    const y = this.listTop + 6 + p * (vh - 12 - bh);
    g.fillStyle(0x07010f, 0.6).fillRoundedRect(this.W - 9, this.listTop + 6, 6, vh - 12, 3);
    g.fillStyle(0xffffff, 0.75).fillRoundedRect(this.W - 9, y, 6, bh, 3);
  }

  /** The stage: border pulse, drifting holo motes, the shine sweep and the live hero. */
  updateStage(dt) {
    const W = this.stageW;
    const H = this.stageH;
    const col = this.stageCol ?? 0xffffff;
    if (this.stageLegend) this.stageRays.rotation += dt * 0.25;
    if (this.stageWobble) this.stageWobble.setAngle(Math.sin(this.t * 3) * 6);
    const g = this.stageFx;
    g.clear();
    // a breathing glow just inside the border
    const a = 0.25 + 0.2 * Math.sin(this.t * 2.2);
    g.lineStyle(10, col, a).strokeRoundedRect(-W / 2 + 8, -H / 2 + 8, W - 16, H - 16, 20);
    for (const m of this.stageMotes) {
      m.p += dt;
      m.y -= m.v * dt;
      if (m.y < -H / 2 + 14) {
        m.y = H / 2 - 150;
        m.x = (Math.random() - 0.5) * (W - 40);
      }
      g.fillStyle(m.p % 2 < 1 ? col : 0xffffff, 0.35 + 0.35 * Math.abs(Math.sin(m.p * 2)));
      g.fillRect(Math.round(m.x / 6) * 6, Math.round(m.y / 6) * 6, 6, 6);
    }
    // the shine: a bright slanted band sweeps across every few seconds (dimmer with Reduce
    // Flashing; none with Low Graphics)
    const sh = this.stageShine;
    sh.clear();
    if (!this.lowGfx) {
      this.shineT -= dt;
      if (this.shineT < 0.9) {
        const p = 1 - Math.max(0, this.shineT) / 0.9;
        const x = -W / 2 - 160 + p * (W + 220);
        const al = reduceFlashing() ? 0.06 : 0.13;
        const l = -W / 2 + 8;
        const r = W / 2 - 8;
        const cl = (v) => Phaser.Math.Clamp(v, l, r);
        for (const [o, w] of [
          [0, 50],
          [70, 16],
        ]) {
          sh.fillStyle(0xffffff, al);
          sh.fillPoints(
            [
              { x: cl(x + o), y: H / 2 - 8 },
              { x: cl(x + o + w), y: H / 2 - 8 },
              { x: cl(x + o + w + 130), y: -H / 2 + 8 },
              { x: cl(x + o + 130), y: -H / 2 + 8 },
            ],
            true,
          );
        }
        if (this.shineT <= 0) this.shineT = 3 + Math.random() * 1.5;
      }
    }
    // the hero flies in place on the stage (its trail streams out behind); YARMS flexes on loop
    if (this.rig) {
      this.rigT += dt;
      const p = this.stagePoint();
      if (this.rigSpec.flexLoop) {
        this.rig.setPosition(p.x, p.y + Math.sin(this.t * 2) * 8);
        this.flexT -= dt;
        if (this.flexT <= 0) {
          this.flexT = 1.6;
          this.rig.flex({ big: true, shine: true });
        }
        this.rig.update(dt, 120);
      } else {
        this.rig.setPosition(p.x + Math.sin(this.rigT * 1.3) * 24, p.y + Math.sin(this.rigT * 2.6) * 26);
        this.rig.angle = Math.cos(this.rigT * 2.6) * -8;
        this.flapT -= dt;
        if (this.flapT <= 0 && !this.rig.dead) {
          this.flapT = 0.55;
          this.rig.flap();
        }
        this.rig.update(dt, 200);
      }
    }
  }

  yarmsPeek() {
    const W = this.W;
    const y = this.H * (0.55 + Math.random() * 0.2);
    const im = this.add
      .image(W + 120, y, "hero_yarms")
      .setScale((0.85 / HI) * PORTRAIT_K)
      .setAngle(-70)
      .setDepth(220);
    this.tweens.chain({
      targets: im,
      tweens: [
        { x: W - 110, duration: 420, ease: "Back.easeOut" },
        {
          scaleX: im.scaleX * 1.15,
          duration: 120,
          yoyo: true,
          repeat: 2,
          onStart: () => {
            im.setTexture("hero_yarms_flex");
            this.fx.burst("star", W - 60, y - 30, 6, 0xffd23f, { speed: { min: 40, max: 140 } });
          },
        },
        { x: W + 140, duration: 360, delay: 500, ease: "Cubic.easeIn" },
      ],
      onComplete: () => im.destroy(),
    });
  }
}
