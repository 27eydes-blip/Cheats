// GLYDRIFT SHOP — bright, bold offer cards you swipe through on a vivid magenta-to-blue
// gradient. Featured: the free Daily Drift Drop, the Drift Pass, a YARMS spotlight and today's
// biome bundles. Coins only — never real money — and nothing here buys leaderboard rank.
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

// bright card colours: fill (lower) / light (upper) / band (title strip, darker same hue)
const THEMES = {
  void: { fill: 0x14a8d0, light: 0x5ae0ff, band: 0x0a6a8a, fx: "sparks" },
  solar: { fill: 0xff5a1a, light: 0xffa030, band: 0xb02a08, fx: "embers" },
  frozen: { fill: 0x46b4ff, light: 0xb4ecff, band: 0x1a6aaa, fx: "snow" },
  glitch: { fill: 0x22c860, light: 0x6aff9a, band: 0x0a7a3a, fx: "glitch" },
  prism: { fill: 0x9a3aff, light: 0xff7ad9, band: 0x5a1aa8, fx: "prism", rainbow: true },
  gold: { fill: 0xffa21a, light: 0xffd84a, band: 0xb85a00, fx: "gold", rays: 0xff6a00 },
  common: { fill: 0x6a86c8, light: 0xa8bcec, band: 0x3a4e8a, fx: "stars" },
  rare: { fill: 0x2a7aff, light: 0x6ab0ff, band: 0x1444aa, fx: "stars" },
  epic: { fill: 0xa040ff, light: 0xd27aff, band: 0x5a18a8, fx: "stars" },
  legendary: { fill: 0xffa21a, light: 0xffd84a, band: 0xb85a00, fx: "gold", rays: 0xff6a00 },
  drop: { fill: 0x5ad41e, light: 0xa8ff5a, band: 0x2a8a0a, fx: "sparks" },
  pass: { fill: 0x10b8e8, light: 0x6af0ff, band: 0x0a6a9a, fx: "stars" },
  pod: { fill: 0xa040ff, light: 0xd27aff, band: 0x5a18a8, fx: "prism" },
  off: { fill: 0x6a5aa8, light: 0x9a8ad8, band: 0x3a2e70, fx: "stars" },
};
THEMES.mega = THEMES.legendary;
THEMES.ultra = THEMES.legendary;
const SET_THEME = {
  set_void: "void",
  set_solar: "solar",
  set_frozen: "frozen",
  set_glitch: "glitch",
  set_prism: "prism",
};
// pod reveal rays by rarity
const RAY_COL = { common: 0x9ab0e0, rare: 0x2a8aff, epic: 0xb45cff, legendary: 0xffd23f };

const BTN_H = 104; // well over 44pt on a phone
const OUTLINE = "#1a0630";

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
    Analytics.log("shop_opened", { coins: s.coins });

    this.buildBackground();

    // ---- top bar: back · SHOP · home, then the two balance pills
    button(this, 72, top + 52, 116, 96, "◀", {
      color: 0xffffff,
      size: 36,
      fill: 0xb01a7a,
      onClick: () => this.leave(),
    }).setDepth(210);
    pixelText(this, W / 2, top + 52, "SHOP", 80, "#ffd23f", { stroke: 18 }).setDepth(210);
    button(this, W - 72, top + 52, 116, 96, "⌂", {
      color: 0xffffff,
      size: 40,
      fill: 0x1a5af0,
      onClick: () => this.leave(),
    }).setDepth(210);
    const pillY = top + 146;
    this.pill(W / 2 - 150, pillY, 0xffd23f, 0x8a4a00);
    this.coinGlyph = this.add
      .image(W / 2 - 238, pillY, "pxc", "coin_0")
      .setScale(1.2)
      .setDepth(212);
    this.coinText = this.add
      .text(W / 2 - 202, pillY, `${s.coins}`, this.priceStyle(46, "#ffffff"))
      .setOrigin(0, 0.5)
      .setDepth(212);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });
    this.pill(W / 2 + 150, pillY, 0x9ffcff, 0x0a4a8a);
    this.shardX = W / 2 + 62;
    this.shardY = pillY;
    this.shardText = this.add
      .text(W / 2 + 98, pillY, `${this.shardCount()}`, this.priceStyle(46, "#ffffff"))
      .setOrigin(0, 0.5)
      .setDepth(212);
    this.shardG = this.add.graphics().setDepth(212);

    // ---- category tabs (horizontal scroll)
    this.tabY = top + 246;
    this.tabRow = this.add.container(0, this.tabY).setDepth(190);
    this.tabObjs = [];
    let tx = 20;
    for (const t of TABS) {
      const w = t.label.length * 24 + 56;
      const c = this.add.container(tx + w / 2, 0);
      const g = this.add.graphics();
      const txt = pixelText(this, 0, -2, t.label, 30, "#ffffff", { stroke: 7, shadow: false });
      c.add([g, txt]);
      c.setSize(w, 96).setInteractive();
      c.on("pointerup", () => {
        if ((this.tabDrag?.moved || 0) > 12) return; // live drag (fires before the scene's)
        Sfx.ui();
        this.setTab(t.id);
      });
      const rib = this.tabRibbon(t.id);
      if (rib) {
        const r = this.add.container(w / 2 - 24, -46).setAngle(12);
        const rg = this.add.graphics();
        rg.fillStyle(0x1a0630, 1).fillRect(-46, -19, 92, 38);
        rg.fillStyle(rib.col, 1).fillRect(-42, -15, 84, 30);
        rg.fillStyle(0xffffff, 0.35).fillRect(-42, -15, 84, 9);
        r.add([rg, pixelText(this, 0, 0, rib.text, 20, "#ffffff", { stroke: 5, shadow: false })]);
        c.add(r);
        this.tweens.add({
          targets: r,
          y: -54,
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

    // ---- the card carousel: ~3/4 of the screen tall, neighbours peeking in at the sides
    const areaTop = this.tabY + 64;
    const areaBot = H - bottom - 40;
    this.cardH = Math.min(Math.round(H * 0.75), areaBot - areaTop - 24);
    this.cardW = Math.min(Math.round(W * 0.76), Math.round(this.cardH * 0.68));
    this.cardY = Math.round(areaTop + (areaBot - areaTop) / 2 - 10);
    this.spacing = this.cardW + 30;
    this.strip = this.add.container(W / 2, this.cardY).setDepth(100);
    this.dots = this.add.graphics().setDepth(180);
    this.dotsY = areaBot + 12;
    this.rig = null;

    // ---- input: drag tabs / swipe cards
    this.input.on("pointerdown", (p) => {
      if (this.modal) return;
      if (Math.abs(p.worldY - this.tabY) < 52) {
        this.tabDrag = { x: p.worldX, start: this.tabX, moved: 0 };
      } else if (p.worldY > this.tabY + 56) {
        this.drag = { x: p.worldX, start: this.stripX, moved: 0, t: this.time.now };
        this.snapTween?.stop();
      }
    });
    this.input.on("pointermove", (p) => {
      if (!p.isDown) return;
      if (this.tabDrag) {
        this.tabDrag.moved = Math.max(this.tabDrag.moved, Math.abs(p.worldX - this.tabDrag.x));
        this.setTabX(this.tabDrag.start + (p.worldX - this.tabDrag.x));
      } else if (this.drag) {
        this.drag.moved = Math.max(this.drag.moved, Math.abs(p.worldX - this.drag.x));
        this.stripX = this.drag.start + (p.worldX - this.drag.x);
        this.strip.x = W / 2 + this.stripX;
      }
    });
    this.input.on("pointerup", (p) => {
      if (this.drag) {
        const d = this.drag;
        this.lastSwipe = d.moved;
        this.drag = null;
        if (d.moved > 12) {
          const fast = (p.worldX - d.x) / Math.max(1, this.time.now - d.t);
          let i = Math.round(-this.stripX / this.spacing);
          if (Math.abs(fast) > 0.6) i = this.index + (fast < 0 ? 1 : -1);
          this.focus(i);
        }
      }
      if (this.tabDrag) {
        this.lastTabDrag = this.tabDrag.moved;
        this.tabDrag = null;
      } else this.lastTabDrag = 0;
    });

    this.setTab(this.tab);
    if (this.openPassOnStart) this.time.delayedCall(250, () => this.openPass());
    this.yarmsPeekT = 6;
  }

  /** A rounded balance pill with a thick dark outline. */
  pill(x, y, col, dark) {
    const g = this.add.graphics().setDepth(211);
    g.fillStyle(0x1a0630, 1).fillRoundedRect(x - 130, y - 40, 260, 80, 40);
    g.fillStyle(dark, 1).fillRoundedRect(x - 124, y - 34, 248, 68, 34);
    g.lineStyle(4, col, 1).strokeRoundedRect(x - 124, y - 34, 248, 68, 34);
    g.fillStyle(0xffffff, 0.15).fillRoundedRect(x - 116, y - 30, 232, 22, 11);
    return g;
  }

  shardCount() {
    return Object.values(Save.data.shards || {}).reduce((a, n) => a + (n || 0), 0);
  }

  tabRibbon(id) {
    const deal = getCosmetic(Shop.daily().deal);
    const dealTab = ["death", "flap", "coin"].includes(deal.cat) ? "effects" : deal.cat;
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
          (c) => c.cat === tab && !c.plus && (forSale(c) || Shop.owns(c.id)),
        ).map((c) =>
          cos(c.id),
        );
    }
  }

  setTab(id) {
    this.tab = id;
    for (const t of this.tabObjs) {
      const on = t.id === id;
      const g = t.g;
      g.clear();
      g.fillStyle(0x1a0630, 1).fillRoundedRect(-t.w / 2 - 4, -46, t.w + 8, 96, 18);
      g.fillStyle(on ? t.col : 0x6a3ab8, 1).fillRoundedRect(-t.w / 2, -42, t.w, 88, 15);
      g.fillStyle(0xffffff, on ? 0.4 : 0.18).fillRoundedRect(-t.w / 2 + 6, -38, t.w - 12, 24, 10);
      t.c.setScale(on ? 1.06 : 1);
    }
    this.buildCards();
    this.focus(0, true);
  }

  buildCards() {
    this.strip.removeAll(true);
    this.offers = this.offersFor(this.tab);
    this.cards = this.offers.map((o, i) => this.makeCard(o, i));
    this.stripX = 0;
    this.strip.x = this.W / 2;
  }

  offerTheme(o) {
    const season = Seasons.active();
    if (season && (o.kind === "pass" || o.kind === "event" || o.seasonal)) {
      const sc = Seasons.colors(season);
      return { fill: sc.primary, light: sc.accent, band: sc.dark, fx: "embers" };
    }
    if (o.kind === "cos") return themeForItem(o.id);
    if (o.kind === "bundle") return THEMES[SET_THEME[o.id]];
    if (o.kind === "yarms") return THEMES.gold;
    if (o.kind === "hero") return THEMES[getCharacter(o.id).rarity] || THEMES.legendary;
    return THEMES[o.kind] || THEMES.off;
  }

  /** One big, bright, slightly tilted offer card. */
  makeCard(o, i) {
    const W = this.cardW;
    const H = this.cardH;
    const th = this.offerTheme(o);
    const bandY = -H / 2 + H * 0.6; // top of the title band
    const c = this.add.container(i * this.spacing, 0).setAngle(i % 2 ? 3 : -2.5);
    c.offer = o;
    c.theme = th;
    c.bandY = bandY;
    const g = this.add.graphics();
    // drop shadow, outer glow, thick dark outline
    g.fillStyle(0x1a0630, 0.45).fillRoundedRect(-W / 2 + 14, -H / 2 + 18, W, H, 26);
    c.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    c.glow
      .lineStyle(18, th.light, 0.4)
      .strokeRoundedRect(-W / 2 - 6, -H / 2 - 6, W + 12, H + 12, 30);
    g.fillStyle(0x1a0630, 1).fillRoundedRect(-W / 2 - 9, -H / 2 - 9, W + 18, H + 18, 30);
    // the whole card in its own bright colour: light top fading into the base colour
    g.fillStyle(th.fill, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    g.fillGradientStyle(th.light, th.light, th.fill, th.fill, 1).fillRect(
      -W / 2 + 10,
      -H / 2 + 10,
      W - 20,
      bandY + H / 2 - 10,
    );
    if (th.rainbow) {
      for (let k = 0; k < 6; k++) {
        g.fillStyle(Phaser.Display.Color.HSVToRGB(k / 6, 0.55, 1).color, 0.22);
        g.fillRect(
          -W / 2 + 10 + ((W - 20) * k) / 6,
          -H / 2 + 10,
          (W - 20) / 6 + 1,
          bandY + H / 2 - 10,
        );
      }
    }
    // title band: a darker strip of the card's own colour
    g.fillStyle(th.band, 1).fillRect(-W / 2, bandY, W, H * 0.165);
    g.fillStyle(0xffffff, 0.22).fillRect(-W / 2, bandY, W, 6);
    g.fillStyle(0x1a0630, 0.25).fillRect(-W / 2, bandY + H * 0.165 - 6, W, 6);
    g.lineStyle(6, 0xffffff, 0.85).strokeRoundedRect(-W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 20);
    c.fxG = this.add.graphics();
    c.motes = Array.from({ length: this.lowGfx ? 6 : 14 }, () => ({
      x: (Math.random() - 0.5) * W,
      y: -H / 2 + 20 + Math.random() * (bandY + H / 2 - 40),
      v: 20 + Math.random() * 40,
      p: Math.random() * 6,
    }));
    c.add([c.glow, g, c.fxG]);
    if (th.rays || o.kind === "yarms") {
      const rays = this.add
        .graphics({ x: 0, y: (-H / 2 + bandY) / 2 })
        .setBlendMode(Phaser.BlendModes.ADD);
      rays.fillStyle(th.rays ?? 0xff6a00, 0.32);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        rays.slice(0, 0, W * 0.75, a, a + 0.2, false).fillPath();
      }
      c.add(rays);
      c.rays = rays;
    }
    c.content = this.add.container(0, 0);
    c.add(c.content);
    this.fillCard(c);
    if (this.isLegendary(o)) {
      c.shine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      c.add(c.shine);
      c.shineT = 1 + Math.random() * 2;
    }
    c.setSize(W, H).setInteractive();
    c.on("pointerup", () => {
      if (this.modal || (this.drag?.moved || 0) > 12) return;
      this.pop(c);
      if (i !== this.index) this.focus(i);
    });
    this.strip.add(c);
    return c;
  }

  isLegendary(o) {
    if (o.kind === "cos") return getCosmetic(o.id).rarity === "legendary";
    if (o.kind === "hero")
      return ["legendary", "mega", "ultra"].includes(getCharacter(o.id).rarity);
    return o.kind === "yarms";
  }

  /** Icon for a cosmetic (hat / coin skin / skin / trail / effect), sized for big cards. */
  iconCos(id, x, y, scale = 1) {
    const cc = getCosmetic(id);
    if (cc.cat === "hat")
      return this.add.image(x, y, "cosm", HAT_FIT[id].frame).setScale(4.2 * scale);
    if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${id}_0`).setScale(5 * scale);
    if (cc.cat === "skin")
      return this.add
        .image(x, y, greyPortrait(this, getCharacter(Save.data.selected)))
        .setScale((0.9 / HI) * PORTRAIT_K * scale)
        .setTint(SKINS[id].tint);
    return this.add.image(x, y, "cosm", `icon_${id}`).setScale(3.8 * scale);
  }

  /** (Re)build a card's content: ribbon, timer, art, title, description, call to action. */
  fillCard(c) {
    const o = c.offer;
    const W = this.cardW;
    const H = this.cardH;
    const k = c.content;
    k.removeAll(true);
    const s = Save.data;
    const artY = (-H / 2 + c.bandY) / 2 + 10;
    let title = "";
    let sub = "";
    let ribbon = null;
    let timer = null;
    let cta = null;
    const add = (x) => k.add(x);

    switch (o.kind) {
      case "drop": {
        title = "DAILY DRIFT DROP";
        const ready = Shop.dropReady();
        sub = ready ? "A free Mystery Pod, every day!" : "Come back for tomorrow's drop";
        ribbon = { text: "FREE", col: 0x1fae5a };
        const pod = this.add.image(0, artY, "cosm", "pod_0").setScale(3.6);
        add(pod);
        c.wobble = pod;
        if (ready)
          cta = { label: "CLAIM!", col: 0xffffff, fill: 0x2a8a0a, act: () => this.claimDrop(c) };
        else {
          const cd = this.add
            .text(0, H / 2 - 80, "", this.priceStyle(40, "#ffffff"))
            .setOrigin(0.5);
          add(cd);
          c.countdown = cd;
          c.countdownTo = () => Shop.msToRefresh();
          c.countdownFmt = (ms) => `NEXT DROP ${fmtTime(ms)}`;
          cd.setText(c.countdownFmt(Shop.msToRefresh()));
        }
        break;
      }
      case "event": {
        // the season's event: its challenges with progress bars
        const season = Seasons.active();
        title = season.event.name;
        sub = `Season ${season.number} event · ends in ${Seasons.countdown(season)}`;
        ribbon = { text: `SEASON ${season.number}`, col: 0xc8102e };
        const top = -H / 2 + 74;
        const rowH = Math.min(
          88,
          (c.bandY - top + H / 2 - 20) / Math.max(1, season.event.challenges.length) + 0,
        );
        season.event.challenges.forEach((ch, i) => {
          const y = -H / 2 + 80 + i * rowH;
          const pr = Seasons.challengeProgress(season, ch);
          add(
            this.add
              .text(-W / 2 + 34, y, ch.text, this.priceStyle(24, "#ffffff"))
              .setOrigin(0, 0.5)
              .setWordWrapWidth(W - 150),
          );
          const bw = W - 68;
          const bar = this.add.graphics();
          bar.fillStyle(0x1a0630, 1).fillRoundedRect(-bw / 2 - 3, y + 20, bw + 6, 22, 9);
          bar.fillStyle(0x3a0610, 1).fillRoundedRect(-bw / 2, y + 23, bw, 16, 7);
          bar
            .fillStyle(pr.frac >= 1 ? 0x39ff88 : 0xffd23f, 1)
            .fillRoundedRect(-bw / 2, y + 23, Math.max(10, bw * pr.frac), 16, 7);
          add(bar);
          add(
            this.add
              .text(
                W / 2 - 34,
                y,
                pr.label,
                this.priceStyle(22, pr.frac >= 1 ? "#39ff88" : "#ffd23f"),
              )
              .setOrigin(1, 0.5),
          );
        });
        cta = { label: "SEASON PASS", col: 0xffffff, fill: 0x7a0418, act: () => this.openPass() };
        break;
      }
      case "pass": {
        const season = Seasons.active();
        title = season ? `SEASON ${season.number} PASS` : "DRIFT PASS";
        const next = DriftPass.nextTier();
        const claimable = DriftPass.claimable();
        if (next === null) sub = "Season complete!";
        else {
          const r = passTrack()[next];
          add(this.rewardIcon(r, 0, artY - 50, 1.4));
          const bw = W - 90;
          const by = artY + 110;
          const pr = DriftPass.isUnlocked(next) ? 1 : DriftPass.progressTo(next);
          const bar = this.add.graphics();
          bar.fillStyle(0x1a0630, 1).fillRoundedRect(-bw / 2 - 5, by - 5, bw + 10, 52, 16);
          bar.fillStyle(0x0a4a7a, 1).fillRoundedRect(-bw / 2, by, bw, 42, 12);
          bar
            .fillStyle(0xffd23f, 1)
            .fillRoundedRect(-bw / 2, by, Math.max(24, Math.round(bw * pr)), 42, 12);
          bar
            .fillStyle(0xffffff, 0.4)
            .fillRect(-bw / 2 + 8, by + 5, Math.max(8, Math.round(bw * pr) - 16), 10);
          add(bar);
          const xpIn = Math.max(0, Math.min(tierXp(), DriftPass.xp() - next * tierXp()));
          add(
            this.add
              .text(0, by + 21, `${xpIn} / ${tierXp()} XP`, this.priceStyle(28, "#ffffff"))
              .setOrigin(0.5),
          );
          sub = `Tier ${next + 1} of ${passTrack().length} · free with XP`;
        }
        if (claimable) ribbon = { text: `${claimable} READY`, col: 0x1fae5a };
        cta = {
          label: claimable ? "CLAIM!" : "VIEW PASS",
          col: 0xffffff,
          fill: claimable ? 0x2a8a0a : 0x0a4a9a,
          act: () => this.openPass(),
        };
        break;
      }
      case "yarms": {
        const def = getCharacter("yarms");
        title = "YARMS";
        sub = "Never Skip Arm Day";
        ribbon = { text: "LEGENDARY", col: 0xe0203a };
        c.rigSpec = { hero: "yarms", flexLoop: true };
        cta = this.heroCta(def);
        break;
      }
      case "hero": {
        const def = getCharacter(o.id);
        title = def.name;
        sub = def.title;
        if (!["common", "rare"].includes(def.rarity))
          ribbon = { text: RARITY[def.rarity].label.split(" ")[0], col: 0xe0203a };
        c.rigSpec = { hero: def.id };
        cta = this.heroCta(def);
        break;
      }
      case "bundle": {
        const b = Shop.bundle(o.id);
        title = b.set.name.replace(" Set", "").toUpperCase();
        sub = "BUNDLE · Trail + Hat + Death FX";
        ribbon = { text: "-25%", col: 0xe0203a };
        timer = Shop.msToRefresh;
        b.items.forEach((id, j) => {
          const im = this.iconCos(id, (j - 1) * (W * 0.3), artY + 110, 0.62);
          if (Shop.owns(id)) im.setAlpha(0.45);
          add(im);
        });
        c.rigSpec = { hero: s.selected, extra: b.items };
        c.preview = () => b.items.map((id, j) => this.iconCos(id, (j - 1) * 130, 0, 0.55));
        if (!b.need.length) cta = { label: "OWNED", col: 0xffffff, fill: c.theme.band, act: null };
        else
          cta = {
            label: `${b.price}`,
            coin: true,
            was: b.full,
            act: () =>
              this.buy(c, title, b.price, () => this.tryBuy(c, Shop.buyBundle(o.id, b.price))),
          };
        break;
      }
      case "cos": {
        const cc = getCosmetic(o.id);
        title = cc.name.toUpperCase();
        sub = `${CATEGORIES.find((x) => x.id === cc.cat).one} · ${RARITY[cc.rarity].label}`;
        if (o.deal) {
          ribbon = { text: "-30%", col: 0xe0203a };
          timer = Shop.msToRefresh;
        } else if (o.seasonal) {
          ribbon = { text: "SEASON ONLY", col: 0xc8102e };
        } else if (cc.rarity === "legendary") ribbon = { text: "LEGENDARY", col: 0xe0203a };
        if (["coin", "hat", "skin"].includes(cc.cat)) add(this.iconCos(o.id, 0, artY + 90, 0.85));
        c.rigSpec = { hero: s.selected, extra: [o.id] };
        c.preview = () => [this.iconCos(o.id, 0, 0, 0.8)];
        const owned = Shop.owns(o.id);
        const on = Shop.equipped(cc.cat) === o.id;
        if (on)
          cta = {
            label: "EQUIPPED",
            col: 0xffffff,
            fill: c.theme.band,
            act: () => {
              Shop.unequip(cc.cat);
              this.refreshCard(c);
            },
          };
        else if (owned)
          cta = {
            label: "EQUIP",
            col: 0xffffff,
            fill: 0x2a8a0a,
            act: () => {
              Shop.equip(o.id);
              Sfx.ui();
              this.refreshCard(c);
            },
          };
        else {
          const price = Shop.priceOf(o.id);
          cta = {
            label: `${price}`,
            coin: true,
            was: price < cc.price ? cc.price : 0,
            act: () =>
              this.buy(c, cc.name.toUpperCase(), price, () =>
                this.tryBuy(c, Shop.buy(o.id, "shop", price)),
              ),
          };
        }
        break;
      }
      case "pod": {
        title = "MYSTERY POD";
        sub = "A random cosmetic you don't own";
        const pod = this.add.image(0, artY - 40, "cosm", "pod_0").setScale(3.2);
        add(pod);
        c.wobble = pod;
        const odds = Object.entries(POD_ODDS)
          .map(([r, v]) => `${RARITY[r].label} ${v}%`)
          .join("  ·  ");
        add(
          this.add
            .text(0, artY + 170, odds, this.priceStyle(24, "#ffffff"))
            .setOrigin(0.5)
            .setWordWrapWidth(W - 50)
            .setAlign("center"),
        );
        c.preview = () => [this.add.image(0, 0, "cosm", "pod_0").setScale(2.6)];
        cta = {
          label: `${POD_PRICE}`,
          coin: true,
          act: () => this.buy(c, "MYSTERY POD", POD_PRICE, () => this.openPod(Shop.openPod())),
        };
        break;
      }
      case "boosts": {
        title = "BOOSTS";
        sub = "Off — every run stays fair on the leaderboard";
        add(pixelText(this, 0, artY, "OFF", 120, "#ffffff", { stroke: 18 }));
        break;
      }
    }

    // title + description on the darker band
    const tt = pixelText(this, 0, c.bandY + 52, title, 48, "#ffffff", { stroke: 11 });
    tt.setScale(Math.min(1, (W - 40) / tt.width));
    add(tt);
    const st = this.add
      .text(0, c.bandY + 112, sub, this.priceStyle(32, "#ffffff"))
      .setOrigin(0.5)
      .setWordWrapWidth(W - 50)
      .setAlign("center");
    st.setScale(Math.min(1, (H * 0.165 - 84) / Math.max(1, st.height)));
    add(st);
    if (ribbon) {
      const r = this.add.container(-W / 2 + 82, -H / 2 + 32).setAngle(-12);
      const rg = this.add.graphics();
      const rw = Math.max(136, ribbon.text.length * 23 + 40);
      rg.fillStyle(0x1a0630, 1).fillRect(-rw / 2 - 5, -27, rw + 10, 54);
      rg.fillStyle(ribbon.col, 1).fillRect(-rw / 2, -22, rw, 44);
      rg.fillStyle(0xffffff, 0.35).fillRect(-rw / 2, -22, rw, 11);
      r.add([rg, pixelText(this, 0, 0, ribbon.text, 26, "#ffffff", { stroke: 6, shadow: false })]);
      add(r);
    }
    if (timer) {
      const tb = this.add.container(W / 2 - 130, -H / 2 - 4);
      const tg = this.add.graphics();
      tg.fillStyle(0x1a0630, 1).fillRoundedRect(-116, -34, 232, 68, 18);
      tg.fillStyle(0xff2a5a, 1).fillRoundedRect(-110, -28, 220, 56, 14);
      tg.fillStyle(0xffffff, 0.3).fillRoundedRect(-104, -24, 208, 12, 6);
      const tx = this.add.text(0, 1, "", this.priceStyle(32, "#ffffff")).setOrigin(0.5);
      tb.add([tg, tx]);
      add(tb);
      c.countdown = tx;
      c.countdownTo = timer;
      c.countdownFmt = (ms) => `⏱ ${fmtTime(ms)}`;
      tx.setText(c.countdownFmt(timer()));
    }
    if (cta) {
      const b = button(this, 0, H / 2 - 82, W - 70, BTN_H, cta.coin ? "" : cta.label, {
        color: cta.col ?? 0xffd23f,
        size: 42,
        fill: cta.fill ?? 0x2a1460,
        onClick: () => {
          if (this.modal || !cta.act) return;
          cta.act();
        },
      });
      if (!cta.act) b.setEnabled(false);
      if (cta.coin) {
        const afford = s.coins >= Number(cta.label);
        const txt = this.add
          .text(0, 0, cta.label, this.priceStyle(54, afford ? "#ffffff" : "#ffb0b0"))
          .setOrigin(0, 0.5);
        const ic = this.add.image(0, 0, "pxc", "coin_0").setScale(1.2);
        const total = ic.displayWidth + 14 + txt.width;
        ic.setX(-total / 2 + ic.displayWidth / 2);
        txt.setX(-total / 2 + ic.displayWidth + 14);
        b.add([ic, txt]);
        if (cta.was) {
          const w2 = this.add
            .text(W / 2 - 110, -BTN_H / 2 - 22, `${cta.was}`, this.priceStyle(30, "#ffffff"))
            .setOrigin(0.5);
          b.add([w2, this.add.rectangle(w2.x, w2.y, w2.width + 8, 4, 0xff2a5a)]);
        }
      }
      add(b);
      c.cta = b;
    }
  }

  /** A buy that didn't go through (e.g. the daily deal changed at midnight): show the new price. */
  tryBuy(card, ok) {
    if (!ok) {
      this.fx.floatText(this.W / 2, this.cardY - 120, "PRICE UPDATED", "#ffd23f", 34);
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
    if (this.cards[this.index] === c) this.buildRig(c);
    this.coins.to(Save.data.coins, 500);
  }

  refreshAll() {
    for (const c of this.cards) this.fillCard(c);
    this.buildRig(this.cards[this.index]);
    this.coins.to(Save.data.coins, 500);
  }

  // ---------------------------------------------------------------- focus + preview
  focus(i, instant = false) {
    i = Phaser.Math.Clamp(i, 0, this.cards.length - 1);
    const changed = i !== this.index || instant;
    this.index = i;
    const target = -i * this.spacing;
    this.snapTween?.stop();
    if (instant) {
      this.stripX = target;
      this.strip.x = this.W / 2 + target;
    } else {
      const o = { v: this.stripX };
      this.snapTween = this.tweens.add({
        targets: o,
        v: target,
        duration: 360,
        ease: "Back.easeOut",
        onUpdate: () => {
          this.stripX = o.v;
          this.strip.x = this.W / 2 + o.v;
        },
      });
    }
    if (changed) {
      const c = this.cards[i];
      this.buildRig(c);
      if (c.offer.id) Analytics.log("item_viewed", { item: c.offer.id, kind: c.offer.kind });
    }
  }

  buildRig(c) {
    this.rig?.destroy();
    this.rig = null;
    const spec = c?.rigSpec;
    if (!spec) return;
    const lo = Shop.loadout();
    for (const id of spec.extra || []) lo[getCosmetic(id).cat] = id;
    this.rig = new CharacterRig(this, getCharacter(spec.hero), this.fx, {
      x: 0,
      y: 0,
      depth: 150,
      scale: spec.flexLoop ? 2.6 : 2,
      cosmetics: lo,
    });
    this.rigSpec = spec;
    this.rigT = 0;
    this.flapT = 0.4;
    this.flexT = 0.3;
  }

  pop(c) {
    Sfx.ui();
    this.tweens.killTweensOf(c);
    c.setScale(1.08, 0.94);
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

  /** Coins fly from the balance into the card, then "GOT IT!" stamps on. */
  gotIt(c) {
    const from = { x: this.coinGlyph.x, y: this.coinGlyph.y };
    const to = { x: this.strip.x + c.x, y: this.cardY };
    for (let i = 0; i < 10; i++) {
      const im = this.add.image(from.x, from.y, "pxc", "coin_0").setScale(1).setDepth(400);
      this.tweens.add({
        targets: im,
        x: to.x + (Math.random() - 0.5) * 140,
        y: to.y + (Math.random() - 0.5) * 140,
        duration: 380 + i * 40,
        ease: "Cubic.easeIn",
        onComplete: () => {
          im.destroy();
          Sfx.coin(i);
        },
      });
    }
    this.coins.to(Save.data.coins, 600);
    this.time.delayedCall(600, () => {
      Sfx.reward();
      Haptics.light();
      const stamp = pixelText(this, to.x, to.y - 40, "GOT IT!", 96, "#ffd23f", { stroke: 20 })
        .setAngle(-10)
        .setDepth(410)
        .setScale(3)
        .setAlpha(0);
      this.tweens.add({
        targets: stamp,
        scale: 1,
        alpha: 1,
        duration: 200,
        ease: "Cubic.easeIn",
        onComplete: () => this.cameras.main.shake(120, 0.004),
      });
      this.tweens.add({
        targets: stamp,
        alpha: 0,
        delay: 1100,
        duration: 300,
        onComplete: () => stamp.destroy(),
      });
      this.fx.burst("star", to.x, to.y, 30, 0xffffff, { speed: { min: 200, max: 600 } });
      this.fx.burst("confetti", to.x, to.y, 30, c.theme.light, { speed: { min: 250, max: 650 } });
      this.refreshCard(c);
    });
  }

  claimDrop(c) {
    const res = Shop.claimDrop();
    if (!res) return;
    this.fx.burst("star", this.strip.x + c.x, this.cardY - this.cardH * 0.2, 30, 0xffffff, {
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
    const now = Date.now();
    this.cards.forEach((c, i) => {
      const onScreen = Math.abs(this.strip.x + c.x - W / 2) < W * 0.95;
      c.setVisible(onScreen);
      if (!onScreen) return;
      c.glow.setAlpha(0.55 + 0.45 * Math.sin(this.t * 2.2 + i));
      if (c.rays) c.rays.rotation += dt * 0.3;
      if (c.wobble) c.wobble.setAngle(Math.sin(this.t * 3) * 6);
      this.drawCardFx(c, dt);
      if (c.shine) {
        c.shineT -= dt;
        c.shine.clear();
        if (c.shineT < 0.7) {
          const p = 1 - Math.max(0, c.shineT) / 0.7;
          const x = -this.cardW / 2 - 100 + p * (this.cardW + 200);
          for (let j = 0; j < 6; j++) {
            c.shine.fillStyle(Phaser.Display.Color.HSVToRGB(j / 6, 0.6, 1).color, 0.22);
            c.shine.fillPoints(
              [
                { x: x + j * 12, y: this.cardH / 2 },
                { x: x + j * 12 + 12, y: this.cardH / 2 },
                { x: x + j * 12 + 110, y: -this.cardH / 2 },
                { x: x + j * 12 + 98, y: -this.cardH / 2 },
              ],
              true,
            );
          }
          if (c.shineT <= 0) c.shineT = 3.5 + Math.random() * 2;
        }
      }
      if (c.countdown && c.countdownTo && Math.floor(this.t * 4) % 2 === 0)
        c.countdown.setText(c.countdownFmt(c.countdownTo(new Date(now))));
    });
    // the focused card's preview: the hero flies across it (YARMS flexes on loop)
    const fc = this.cards[this.index];
    if (this.rig && fc) {
      this.rigT += dt;
      const cx = this.strip.x + fc.x;
      const cy = this.cardY + (-this.cardH / 2 + fc.bandY) / 2 - 20;
      if (this.rigSpec.flexLoop) {
        this.rig.setPosition(cx, cy + Math.sin(this.t * 2) * 8);
        this.flexT -= dt;
        if (this.flexT <= 0) {
          this.flexT = 1.6;
          this.rig.flex({ big: true, shine: true });
        }
        this.rig.update(dt, 120);
      } else {
        const span = this.cardW * 0.78;
        const p = (this.rigT * 0.3) % 1;
        this.rig.setPosition(cx - span / 2 + p * span, cy - 40 + Math.sin(this.rigT * 4) * 30);
        this.rig.angle = Math.cos(this.rigT * 4) * -10;
        this.flapT -= dt;
        if (this.flapT <= 0 && !this.rig.dead) {
          this.flapT = 0.55;
          this.rig.flap();
        }
        if (p < 0.02) this.rig.points.length = 0;
        this.rig.update(dt, 220);
      }
    }
    this.fx.update(dt);
    // page dots
    this.dots.clear();
    const n = this.cards.length;
    if (n > 1) {
      const dw = Math.min(30, (W - 100) / n);
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * dw;
        this.dots.fillStyle(0x1a0630, 1).fillRect(x - 9, this.dotsY - 9, 18, 18);
        this.dots
          .fillStyle(i === this.index ? 0xffd23f : 0xd8b0ff, 1)
          .fillRect(x - 6, this.dotsY - 6, 12, 12);
      }
    }
    this.yarmsPeekT -= dt;
    if (this.yarmsPeekT <= 0 && !this.modal) {
      this.yarmsPeekT = 12 + Math.random() * 8;
      this.yarmsPeek();
    }
  }

  drawCardFx(c, dt) {
    const g = c.fxG;
    g.clear();
    const W = this.cardW;
    const top = -this.cardH / 2 + 14;
    const bot = c.bandY - 10;
    const fx = c.theme.fx;
    for (const m of c.motes) {
      m.p += dt;
      if (fx === "embers" || fx === "gold" || fx === "sparks") m.y -= m.v * dt;
      else if (fx === "snow") {
        m.y += m.v * 0.6 * dt;
        m.x += Math.sin(m.p * 2) * 12 * dt;
      } else m.y -= m.v * 0.3 * dt;
      if (m.y < top) m.y = bot;
      if (m.y > bot) m.y = top;
      const x = Phaser.Math.Clamp(m.x, -W / 2 + 14, W / 2 - 20);
      let col = 0xffffff;
      let a = 0.7;
      if (fx === "embers") col = m.p % 1 < 0.5 ? 0xfff0a0 : 0xffd23f;
      if (fx === "prism") col = Phaser.Display.Color.HSVToRGB((m.p * 0.2) % 1, 0.4, 1).color;
      if (fx === "glitch") {
        if (Math.random() < 0.08) m.x = (Math.random() - 0.5) * W;
        col = [0xff2050, 0xffffff, 0x20c8ff][Math.floor(m.p * 3) % 3];
        a = Math.random() < 0.3 ? 0.95 : 0.5;
      }
      if (fx === "stars") a = 0.4 + 0.5 * Math.abs(Math.sin(m.p * 2));
      g.fillStyle(col, a).fillRect(
        Math.round(x / 6) * 6,
        Math.round(m.y / 6) * 6,
        fx === "glitch" ? 18 : 6,
        6,
      );
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
