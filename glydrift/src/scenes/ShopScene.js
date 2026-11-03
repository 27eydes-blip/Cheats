// GLYDRIFT SHOP — big tilted neon offer cards you swipe through, themed by biome, over a dark
// pixel skyline. Featured: the free Daily Drift Drop, the Drift Pass, a YARMS spotlight and
// today's biome bundles. Coins only — never real money — and nothing here buys leaderboard rank.
import Phaser from "phaser";
import { fitCamera, NUM_FONT, PIXEL_FONT, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter, visibleCharacters } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Analytics } from "../systems/analytics.js";
import { Progression } from "../data/progression.js";
import { Save } from "../data/save.js";
import { DriftPass, FREE_TRACK, PASS_TIER_XP } from "../data/driftPass.js";
import {
  CATEGORIES,
  COLLECTIONS,
  COSMETICS,
  getCosmetic,
  POD_ODDS,
  POD_PRICE,
  Shop,
  SKINS,
} from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { button, fadeTo, hex, RollingCounter } from "../ui/ui.js";

const TABS = [
  { id: "featured", label: "FEATURED" },
  { id: "daily", label: "DAILY" },
  { id: "heroes", label: "CHARACTERS" },
  { id: "trail", label: "TRAILS" },
  { id: "skin", label: "SKINS" },
  { id: "hat", label: "HATS" },
  { id: "effects", label: "EFFECTS" },
  { id: "boosts", label: "BOOSTS" },
  { id: "pods", label: "PODS" },
];

// card looks: neon edge, two-tone background, the tiny animated background inside
const THEMES = {
  void: { col: 0x3ef4ff, bg1: 0x0f3a55, bg2: 0x07182c, fx: "sparks" },
  solar: { col: 0xff8a1a, bg1: 0x6a2008, bg2: 0x260a04, fx: "embers" },
  frozen: { col: 0x9fe8ff, bg1: 0x1c5274, bg2: 0x0a1c32, fx: "snow" },
  glitch: { col: 0x39ff88, bg1: 0x0c4a2c, bg2: 0x041a10, fx: "glitch" },
  prism: { col: 0xff7ad9, bg1: 0x461870, bg2: 0x160828, fx: "prism" },
  gold: { col: 0xffd23f, bg1: 0x6a4608, bg2: 0x241204, fx: "gold" },
  common: { col: 0xbfd3e6, bg1: 0x2c3650, bg2: 0x10142a, fx: "stars" },
  rare: { col: 0x3fa9ff, bg1: 0x15306a, bg2: 0x080f2c, fx: "stars" },
  epic: { col: 0xb45cff, bg1: 0x3a1666, bg2: 0x140828, fx: "stars" },
  legendary: { col: 0xffd23f, bg1: 0x5a3a08, bg2: 0x201004, fx: "gold" },
  drop: { col: 0x39ff88, bg1: 0x0e4a3a, bg2: 0x051a16, fx: "sparks" },
  pass: { col: 0x3ef4ff, bg1: 0x182a6a, bg2: 0x080c2a, fx: "stars" },
  pod: { col: 0xb45cff, bg1: 0x3a1666, bg2: 0x120624, fx: "prism" },
  off: { col: 0x6a608a, bg1: 0x1c1830, bg2: 0x0c0a18, fx: "stars" },
};
const SET_THEME = {
  set_void: "void",
  set_solar: "solar",
  set_frozen: "frozen",
  set_glitch: "glitch",
  set_prism: "prism",
};

const BTN_H = 96; // ≥ 44pt on a phone

/** Chunky pixel header text with a thick dark outline. */
function pixelText(scene, x, y, str, size, color = "#ffffff", opts = {}) {
  return scene.add
    .text(x, y, str, {
      fontFamily: PIXEL_FONT,
      fontSize: `${size}px`,
      fontStyle: "700",
      color,
      stroke: "#07020f",
      strokeThickness: opts.stroke ?? Math.max(4, Math.round(size / 5)),
      align: "center",
      resolution: VIEW.Z,
    })
    .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
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
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    const top = (this.registry.get("safeTop") || 0) + 16;
    this.top = top;
    this.cameras.main.fadeIn(220, 4, 1, 10);
    this.scene.get("Backdrop")?.scene.setVisible(false);
    this.events.once("shutdown", () => this.scene.get("Backdrop")?.scene.setVisible(true));
    this.fx = new Effects(this, { lowGfx: s.settings.lowGfx, depth: 300 });
    this.t = 0;
    this.modal = null;
    this.index = 0;
    this.lowGfx = s.settings.lowGfx;
    Analytics.log("shop_opened", { coins: s.coins });

    this.buildBackground();

    // ---- top bar: back, SHOP, balances, home
    const bar = this.add.graphics().setDepth(200);
    bar.fillStyle(0x07020f, 0.92).fillRect(0, 0, W, top + 96);
    bar.fillStyle(0x3ef4ff, 0.5).fillRect(0, top + 94, W, 3);
    button(this, 70, top + 48, 112, BTN_H - 8, "◀", {
      color: 0xff4fd8,
      size: 30,
      onClick: () => this.leave(),
    }).setDepth(210);
    pixelText(this, 230, top + 48, "SHOP", 52, "#ffd23f", { stroke: 12 })
      .setShadow(0, 0, "#ffb000", 14, true, true)
      .setDepth(210);
    this.coinIcon = this.add
      .image(W - 300, top + 30, "pxc", "coin_0")
      .setScale(0.85)
      .setDepth(210);
    this.coinText = this.add
      .text(W - 276, top + 30, `${s.coins}`, {
        fontFamily: NUM_FONT,
        fontSize: "32px",
        fontStyle: "700",
        color: "#ffd23f",
        resolution: VIEW.Z,
      })
      .setOrigin(0, 0.5)
      .setDepth(210);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });
    this.shardG = this.add.graphics().setDepth(210);
    this.shardText = this.add
      .text(W - 276, top + 70, `${this.shardCount()}`, {
        fontFamily: NUM_FONT,
        fontSize: "28px",
        fontStyle: "700",
        color: "#9ffcff",
        resolution: VIEW.Z,
      })
      .setOrigin(0, 0.5)
      .setDepth(210);
    button(this, W - 64, top + 48, 100, BTN_H - 8, "⌂", {
      color: 0x3ef4ff,
      size: 34,
      onClick: () => this.leave(),
    }).setDepth(210);

    // ---- category tabs (horizontal scroll)
    this.tabY = top + 152;
    this.tabRow = this.add.container(0, this.tabY).setDepth(190);
    this.tabObjs = [];
    let tx = 24;
    for (const t of TABS) {
      const w = Math.max(150, t.label.length * 17 + 44);
      const c = this.add.container(tx + w / 2, 0);
      const g = this.add.graphics();
      const txt = pixelText(this, 0, 2, t.label, 20, "#ffffff", { stroke: 5 });
      c.add([g, txt]);
      c.setSize(w, 84).setInteractive();
      c.on("pointerup", () => {
        if ((this.tabDrag?.moved || 0) > 12) return;
        Sfx.ui();
        this.setTab(t.id);
      });
      const rib = this.tabRibbon(t.id);
      if (rib) {
        const r = this.add.container(w / 2 - 22, -38).setAngle(12);
        const rg = this.add.graphics();
        rg.fillStyle(rib.col, 1).fillRect(-34, -13, 68, 26);
        rg.lineStyle(3, 0x07020f, 1).strokeRect(-34, -13, 68, 26);
        r.add([rg, pixelText(this, 0, 1, rib.text, 13, "#ffffff", { stroke: 3 })]);
        c.add(r);
        this.tweens.add({
          targets: r,
          y: -44,
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
    this.tabsW = tx + 12;
    this.tabX = 0;

    // ---- the card carousel
    this.cardY = Math.round((this.tabY + 60 + H - (this.registry.get("safeBottom") || 0)) / 2);
    this.cardH = Math.min(820, H - (this.registry.get("safeBottom") || 0) - this.tabY - 110);
    this.cardW = Math.min(520, Math.round(this.cardH * 0.7));
    this.spacing = this.cardW + 46;
    this.strip = this.add.container(W / 2, this.cardY).setDepth(100);
    this.dots = this.add.graphics().setDepth(180);

    // preview rig flies across the focused card
    this.rig = null;

    // ---- input: drag tabs / swipe cards
    this.input.on("pointerdown", (p) => {
      if (this.modal) return;
      if (Math.abs(p.worldY - this.tabY) < 46) {
        this.tabDrag = { x: p.worldX, start: this.tabX, moved: 0 };
      } else if (p.worldY > this.tabY + 50) {
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
        setTimeout(() => (this.tabDrag = null), 0);
      }
    });

    this.setTab(this.tab);
    this.yarmsPeekT = 6;
  }

  shardCount() {
    return Object.values(Save.data.shards || {}).reduce((a, n) => a + (n || 0), 0);
  }

  tabRibbon(id) {
    const deal = getCosmetic(Shop.daily().deal);
    const dealTab =
      deal.cat === "death" || deal.cat === "flap" || deal.cat === "coin" ? "effects" : deal.cat;
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
    this.add.rectangle(W / 2, H / 2, W, H, 0x07041a).setDepth(-10);
    const glow = this.add.graphics().setDepth(-9);
    glow.fillStyle(0x2a1060, 0.35).fillCircle(W * 0.2, H * 0.3, 380);
    glow.fillStyle(0x0c3050, 0.3).fillCircle(W * 0.85, H * 0.7, 420);
    // two parallax layers of pixel skyline, generated once
    for (const [key, col, hMax, win] of [
      ["shop_sky_far", 0x150a34, 260, 0x3a2a6a],
      ["shop_sky_near", 0x0b0620, 200, 0x7a4aff],
    ]) {
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        let x = 0;
        let seed = key.length * 97;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        while (x < 720) {
          const w = 40 + Math.floor(rnd() * 70);
          const h = 60 + Math.floor(rnd() * hMax);
          g.fillStyle(col, 1).fillRect(x, 300 - h, w, h);
          for (let wy = 300 - h + 12; wy < 290; wy += 18)
            for (let wx = x + 8; wx < x + w - 8; wx += 14)
              if (rnd() < 0.3) g.fillStyle(win, 0.8).fillRect(wx, wy, 6, 8);
          x += w + 4;
        }
        g.generateTexture(key, 720, 300);
        g.destroy();
      }
    }
    this.skyFar = this.add
      .tileSprite(W / 2, H - 230, W, 300, "shop_sky_far")
      .setDepth(-8)
      .setAlpha(0.9);
    this.skyNear = this.add.tileSprite(W / 2, H - 150, W, 300, "shop_sky_near").setDepth(-7);
    // drifting pixel particles
    this.motes = [];
    const cols = [0x3ef4ff, 0xff4fd8, 0xffd23f, 0xb45cff];
    for (let i = 0; i < (this.lowGfx ? 18 : 40); i++) {
      const r = this.add
        .rectangle(
          Math.random() * W,
          Math.random() * H,
          4,
          4,
          cols[i % 4],
          0.5 + Math.random() * 0.4,
        )
        .setDepth(-6);
      r.vx = -8 - Math.random() * 18;
      r.vy = -6 - Math.random() * 14;
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
          { kind: "yarms" },
          ...Shop.bundlesToday().map((id) => ({ kind: "bundle", id })),
          cos(daily.deal),
        ];
      case "daily":
        return [{ kind: "drop" }, ...daily.items.map(cos)];
      case "heroes": {
        const list = visibleCharacters(s.unlocked).filter((c) => !c.lottery);
        list.sort((a, b) => (a.id === "yarms" ? -1 : b.id === "yarms" ? 1 : 0));
        return list.map((c) => (c.id === "yarms" ? { kind: "yarms" } : { kind: "hero", id: c.id }));
      }
      case "effects":
        return COSMETICS.filter((c) => ["death", "flap", "coin"].includes(c.cat)).map((c) =>
          cos(c.id),
        );
      case "boosts":
        return [{ kind: "boosts" }];
      case "pods":
        return [{ kind: "drop" }, { kind: "pod" }];
      default:
        return COSMETICS.filter((c) => c.cat === tab).map((c) => cos(c.id));
    }
  }

  setTab(id) {
    this.tab = id;
    for (const t of this.tabObjs) {
      const on = t.id === id;
      t.g.clear();
      t.g.fillStyle(0x07020f, 1).fillRect(-t.w / 2 - 4, -38, t.w + 8, 80);
      t.g.fillStyle(on ? 0xffd23f : 0x1c1438, 1).fillRect(-t.w / 2, -34, t.w, 72);
      t.g.fillStyle(on ? 0xfff0a0 : 0x2c2058, 1).fillRect(-t.w / 2, -34, t.w, 10);
      t.txt.setColor(on ? "#2a1400" : "#d8d0ff").setStroke(on ? "#fff6c0" : "#07020f", on ? 2 : 5);
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
    if (o.kind === "cos") return themeForItem(o.id);
    if (o.kind === "bundle") return THEMES[SET_THEME[o.id]];
    if (o.kind === "yarms") return THEMES.gold;
    if (o.kind === "hero") return THEMES[getCharacter(o.id).rarity] || THEMES.rare;
    return THEMES[o.kind] || THEMES.off;
  }

  /** One big tilted offer card. */
  makeCard(o, i) {
    const W = this.cardW;
    const H = this.cardH;
    const th = this.offerTheme(o);
    const c = this.add.container(i * this.spacing, 0).setAngle(i % 2 ? 3 : -2.5);
    c.offer = o;
    c.theme = th;
    // shadow, neon glow, body, thick outline
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(-W / 2 + 12, -H / 2 + 16, W, H, 22);
    c.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    c.glow.lineStyle(14, th.col, 0.35).strokeRoundedRect(-W / 2 - 4, -H / 2 - 4, W + 8, H + 8, 26);
    g.fillStyle(0x07020f, 1).fillRoundedRect(-W / 2 - 8, -H / 2 - 8, W + 16, H + 16, 26);
    g.fillStyle(th.bg2, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 20);
    g.fillStyle(th.bg1, 1).fillRoundedRect(-W / 2, -H / 2, W, H * 0.58, {
      tl: 20,
      tr: 20,
      bl: 0,
      br: 0,
    });
    g.fillStyle(th.col, 0.9).fillRect(-W / 2, -H / 2 + H * 0.58 - 4, W, 6); // bright band
    g.lineStyle(4, th.col, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 20);
    c.fxG = this.add.graphics(); // tiny animated background
    c.motes = Array.from({ length: this.lowGfx ? 6 : 14 }, () => ({
      x: (Math.random() - 0.5) * W,
      y: (Math.random() - 0.5) * H * 0.56 - H * 0.21,
      v: 20 + Math.random() * 40,
      p: Math.random() * 6,
    }));
    c.add([c.glow, g, c.fxG]);
    if (th === THEMES.gold || th === THEMES.legendary || o.kind === "yarms") {
      // gold rays behind legendary offers
      const rays = this.add.graphics({ x: 0, y: -H * 0.2 }).setBlendMode(Phaser.BlendModes.ADD);
      rays.fillStyle(0xffd23f, 0.1);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        rays.slice(0, 0, W * 0.8, a, a + 0.22, false).fillPath();
      }
      c.add(rays);
      c.rays = rays;
    }
    c.content = this.add.container(0, 0);
    c.add(c.content);
    this.fillCard(c);
    // legendary shimmer sweep
    if (this.isLegendary(o)) {
      c.shine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      c.add(c.shine);
      c.shineT = 1 + Math.random() * 2;
    }
    c.setSize(W, H).setInteractive();
    c.on("pointerup", () => {
      if (this.modal || (this.lastSwipe || 0) > 12) return;
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

  /** (Re)build a card's content: ribbon, timer, art, title, subtitle, CTA. */
  fillCard(c) {
    const o = c.offer;
    const W = this.cardW;
    const H = this.cardH;
    const k = c.content;
    k.removeAll(true);
    const s = Save.data;
    const artY = -H * 0.21;
    let title = "";
    let sub = "";
    let ribbon = null;
    let timer = null;
    let cta = null;
    const add = (o2) => k.add(o2);
    const iconCos = (id, x, y, scale = 1) => {
      const cc = getCosmetic(id);
      let im;
      if (cc.cat === "hat")
        im = this.add.image(x, y, "cosm", HAT_FIT[id].frame).setScale(3.4 * scale);
      else if (cc.cat === "coin") im = this.add.image(x, y, "cosm", `${id}_0`).setScale(4 * scale);
      else if (cc.cat === "skin")
        im = this.add
          .image(x, y, greyPortrait(this, getCharacter(s.selected)))
          .setScale((0.75 / HI) * PORTRAIT_K * scale)
          .setTint(SKINS[id].tint);
      else im = this.add.image(x, y, "cosm", `icon_${id}`).setScale(3 * scale);
      return im;
    };

    switch (o.kind) {
      case "drop": {
        title = "DAILY DRIFT DROP";
        const ready = Shop.dropReady();
        sub = ready ? "A free Mystery Pod, every day" : "Come back for tomorrow's drop";
        ribbon = { text: "FREE", col: 0x1fae5a };
        const pod = this.add.image(0, artY, "cosm", "pod_0").setScale(4.2);
        add(pod);
        c.wobble = pod;
        if (ready) cta = { label: "CLAIM!", col: 0x39ff88, act: () => this.claimDrop(c) };
        else {
          c.countdown = this.add
            .text(0, H / 2 - 74, "", this.priceStyle(34, "#b8ffd8"))
            .setOrigin(0.5);
          add(c.countdown);
          c.countdownTo = () => Shop.msToRefresh();
          c.countdownFmt = (ms) => `NEXT DROP ${fmtTime(ms)}`;
          c.countdown.setText(c.countdownFmt(Shop.msToRefresh()));
        }
        break;
      }
      case "pass": {
        title = "DRIFT PASS";
        const next = DriftPass.nextTier();
        const claimable = DriftPass.claimable();
        if (next === null) {
          sub = "Season complete — every reward claimed!";
        } else {
          const r = FREE_TRACK[next];
          sub = `Tier ${next + 1} of ${FREE_TRACK.length} · free with XP from playing`;
          add(this.rewardIcon(r, 0, artY, 1.25));
          const bw = W - 100;
          const by = -H / 2 + H * 0.58 + 40;
          const bar = this.add.graphics();
          const pr = DriftPass.isUnlocked(next) ? 1 : DriftPass.progressTo(next);
          bar.fillStyle(0x07020f, 1).fillRect(-bw / 2 - 4, by - 4, bw + 8, 30);
          bar.fillStyle(0x16244a, 1).fillRect(-bw / 2, by, bw, 22);
          bar.fillStyle(0x3ef4ff, 1).fillRect(-bw / 2, by, Math.round(bw * pr), 22);
          bar.fillStyle(0xffffff, 0.35).fillRect(-bw / 2, by, Math.round(bw * pr), 6);
          add(bar);
          const xpIn = Math.min(PASS_TIER_XP, DriftPass.xp() - next * PASS_TIER_XP);
          add(
            this.add
              .text(
                0,
                by + 52,
                `${Math.max(0, xpIn)} / ${PASS_TIER_XP} XP`,
                this.priceStyle(24, "#9ffcff"),
              )
              .setOrigin(0.5),
          );
        }
        if (claimable) ribbon = { text: `${claimable} READY`, col: 0x1fae5a };
        cta = {
          label: claimable ? "CLAIM!" : "VIEW PASS",
          col: claimable ? 0x39ff88 : 0x3ef4ff,
          act: () => this.openPass(),
        };
        break;
      }
      case "yarms": {
        const def = getCharacter("yarms");
        title = "YARMS";
        sub = "Never Skip Arm Day";
        ribbon = { text: "LEGENDARY", col: 0xd89a10 };
        c.rigSpec = { hero: "yarms", flexLoop: true };
        cta = this.heroCta(def);
        break;
      }
      case "hero": {
        const def = getCharacter(o.id);
        title = def.name;
        sub = `${def.title} · ${RARITY[def.rarity].label}`;
        if (def.rarity !== "common" && def.rarity !== "rare")
          ribbon = { text: RARITY[def.rarity].label.split(" ")[0], col: 0xd89a10 };
        c.rigSpec = { hero: def.id };
        cta = this.heroCta(def);
        break;
      }
      case "bundle": {
        const b = Shop.bundle(o.id);
        title = b.set.name.replace(" Set", " BUNDLE").toUpperCase();
        sub = "Trail + Hat + Death effect";
        ribbon = { text: "-25%", col: 0xe0203a };
        timer = Shop.msToRefresh;
        b.items.forEach((id, j) => {
          const im = iconCos(id, (j - 1) * 140, artY + 70, 0.8);
          if (Shop.owns(id)) im.setAlpha(0.35);
          add(im);
        });
        c.rigSpec = { hero: s.selected, extra: b.items };
        if (!b.need.length) cta = { label: "OWNED", col: 0x6a608a, act: null };
        else
          cta = {
            label: `${b.price}`,
            coin: true,
            was: b.full,
            col: 0xffd23f,
            act: () =>
              this.buy(c, `Get the ${b.set.name.replace(" Set", " Bundle")}?`, b.price, () =>
                Shop.buyBundle(o.id),
              ),
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
        } else if (cc.rarity === "legendary") ribbon = { text: "LEGENDARY", col: 0xd89a10 };
        if (cc.cat === "coin" || cc.cat === "hat" || cc.cat === "skin")
          add(iconCos(o.id, 0, artY + 60, 0.9));
        c.rigSpec = { hero: s.selected, extra: [o.id] };
        const owned = Shop.owns(o.id);
        const on = Shop.equipped(cc.cat) === o.id;
        if (on)
          cta = {
            label: "EQUIPPED",
            col: 0x6a608a,
            act: () => {
              Shop.unequip(cc.cat);
              this.refreshCard(c);
            },
          };
        else if (owned)
          cta = {
            label: "EQUIP",
            col: 0x39ff88,
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
            col: 0xffd23f,
            act: () => this.buy(c, `Buy ${cc.name}?`, price, () => Shop.buy(o.id)),
          };
        }
        break;
      }
      case "pod": {
        title = "MYSTERY POD";
        sub = "A random cosmetic you don't own";
        const pod = this.add.image(0, artY - 20, "cosm", "pod_0").setScale(3.6);
        add(pod);
        c.wobble = pod;
        const odds = Object.entries(POD_ODDS)
          .map(([r, v]) => `${RARITY[r].label} ${v}%`)
          .join("   ");
        add(
          this.add
            .text(0, artY + 150, odds, this.priceStyle(17, "#e8d8ff"))
            .setOrigin(0.5)
            .setWordWrapWidth(W - 60),
        );
        cta = {
          label: `${POD_PRICE}`,
          coin: true,
          col: 0xb45cff,
          act: () =>
            this.buy(c, "Open a Mystery Pod?", POD_PRICE, () => this.openPod(Shop.openPod())),
        };
        break;
      }
      case "boosts": {
        title = "BOOSTS";
        sub = "Switched off: every run stays fair on the worldwide leaderboard";
        add(pixelText(this, 0, artY, "OFF", 90, "#8a80b0", { stroke: 14 }));
        break;
      }
    }

    // title + subtitle
    const tt = pixelText(
      this,
      0,
      -H / 2 + H * 0.58 + (o.kind === "pass" ? -36 : 44),
      title,
      34,
      "#ffffff",
      { stroke: 8 },
    );
    tt.setScale(Math.min(1, (W - 50) / tt.width));
    add(tt);
    const st = this.add
      .text(0, tt.y + 50, sub, this.priceStyle(20, "#e0d8ff"))
      .setOrigin(0.5)
      .setWordWrapWidth(W - 60)
      .setAlign("center");
    if (o.kind !== "pass") add(st);
    else {
      st.setY(H / 2 - 150).setColor("#9ffcff");
      add(st);
    }
    // ribbon (angled, top-left)
    if (ribbon) {
      const r = this.add.container(-W / 2 + 70, -H / 2 + 26).setAngle(-14);
      const rg = this.add.graphics();
      const rw = Math.max(110, ribbon.text.length * 17 + 30);
      rg.fillStyle(0x07020f, 1).fillRect(-rw / 2 - 4, -21, rw + 8, 42);
      rg.fillStyle(ribbon.col, 1).fillRect(-rw / 2, -17, rw, 34);
      rg.fillStyle(0xffffff, 0.25).fillRect(-rw / 2, -17, rw, 8);
      r.add([rg, pixelText(this, 0, 1, ribbon.text, 17, "#ffffff", { stroke: 4 })]);
      add(r);
    }
    // limited-offer countdown badge on the top edge
    if (timer) {
      const tb = this.add.container(W / 2 - 120, -H / 2);
      const tg = this.add.graphics();
      tg.fillStyle(0x07020f, 1).fillRoundedRect(-96, -26, 192, 52, 14);
      tg.fillStyle(0xe0203a, 1).fillRoundedRect(-92, -22, 184, 44, 12);
      const tx = this.add.text(4, 0, "", this.priceStyle(24, "#ffffff")).setOrigin(0.5);
      tb.add([tg, tx]);
      add(tb);
      c.countdown = tx;
      c.countdownTo = timer;
      c.countdownFmt = (ms) => `⏱ ${fmtTime(ms)}`;
      tx.setText(c.countdownFmt(timer()));
    }
    // call to action
    if (cta) {
      const b = button(this, 0, H / 2 - 74, W - 120, BTN_H, cta.coin ? "" : cta.label, {
        color: cta.col,
        size: 34,
        onClick: () => {
          if (this.modal || !cta.act) return;
          cta.act();
        },
      });
      if (!cta.act) b.setEnabled(false);
      if (cta.coin) {
        const afford = s.coins >= Number(cta.label);
        b.add(this.add.image(-60, 0, "pxc", "coin_0").setScale(0.85));
        b.add(
          this.add
            .text(-30, 0, cta.label, this.priceStyle(38, afford ? "#ffffff" : "#ff8a8a"))
            .setOrigin(0, 0.5),
        );
        if (cta.was) {
          const w2 = this.add
            .text(W / 2 - 90, -BTN_H / 2 - 14, `${cta.was}`, this.priceStyle(20, "#ffb0b0"))
            .setOrigin(0.5);
          b.add([w2, this.add.rectangle(w2.x, w2.y, w2.width + 6, 3, 0xff3a5a)]);
        }
      }
      add(b);
      c.cta = b;
    }
  }

  priceStyle(size, color) {
    return {
      fontFamily: NUM_FONT,
      fontSize: `${size}px`,
      fontStyle: "700",
      color,
      resolution: VIEW.Z,
      stroke: "#07020f",
      strokeThickness: Math.round(size / 8),
    };
  }

  rewardIcon(r, x, y, scale = 1) {
    if (r.coins) {
      const c = this.add.container(x, y);
      c.add([
        this.add.image(0, -20, "pxc", "coin_0").setScale(2 * scale),
        pixelText(this, 0, 56 * scale, `${r.coins}`, Math.round(34 * scale), "#ffd23f", {
          stroke: 7,
        }),
      ]);
      return c;
    }
    if (r.pod) return this.add.image(x, y, "cosm", "pod_0").setScale(3 * scale);
    const cc = getCosmetic(r.item);
    if (cc.cat === "hat")
      return this.add.image(x, y, "cosm", HAT_FIT[r.item].frame).setScale(3.4 * scale);
    if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${r.item}_0`).setScale(4 * scale);
    return this.add.image(x, y, "cosm", `icon_${r.item}`).setScale(3 * scale);
  }

  heroCta(def) {
    const s = Save.data;
    if (Progression.isUnlocked(def.id)) {
      const on = s.selected === def.id;
      return on
        ? { label: "EQUIPPED", col: 0x6a608a, act: null }
        : {
            label: "EQUIP",
            col: 0x39ff88,
            act: () => {
              s.selected = def.id;
              Save.write();
              Sfx.ui();
              this.refreshAll();
            },
          };
    }
    if (def.requires && !Progression.requirementsMet(def))
      return { label: "LOCKED", col: 0x6a608a, act: null };
    return {
      label: `${def.cost}`,
      coin: true,
      col: 0xffd23f,
      act: () =>
        this.buy(this.cards[this.index], `Unlock ${def.name}?`, def.cost, () => {
          const ok = Progression.buy(def.id);
          if (ok) {
            s.selected = def.id;
            Save.write();
            Analytics.log("item_purchased", { item: def.id, price: def.cost, category: "hero" });
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
      const o = c.offer;
      if (o.id) Analytics.log("item_viewed", { item: o.id, kind: o.kind });
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
      scale: spec.flexLoop ? 2.2 : 1.6,
      cosmetics: lo,
    });
    this.rigSpec = spec;
    this.rigT = 0;
    this.flapT = 0.4;
    this.flexT = 0.3;
  }

  /** Squash-and-stretch pop when a card is tapped. */
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
    this.confirm(title, price, () => {
      if (!doBuy()) return;
      this.gotIt(c);
    });
  }

  /** Coins fly from the balance into the card, then "GOT IT!" stamps on. */
  gotIt(c) {
    const cam = this.cameras.main;
    const from = { x: this.coinIcon.x, y: this.coinIcon.y };
    const to = { x: this.strip.x + c.x, y: this.cardY };
    for (let i = 0; i < 9; i++) {
      const im = this.add.image(from.x, from.y, "pxc", "coin_0").setScale(0.8).setDepth(400);
      this.tweens.add({
        targets: im,
        x: to.x + (Math.random() - 0.5) * 120,
        y: to.y + (Math.random() - 0.5) * 120,
        duration: 380 + i * 40,
        ease: "Cubic.easeIn",
        onComplete: () => {
          im.destroy();
          Sfx.coin(i);
        },
      });
    }
    this.coins.to(Save.data.coins, 600);
    this.time.delayedCall(560, () => {
      Sfx.reward();
      Haptics.light();
      const stamp = pixelText(this, to.x, to.y - 30, "GOT IT!", 70, "#ffd23f", { stroke: 14 })
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
        onComplete: () => cam.shake(120, 0.004),
      });
      this.tweens.add({
        targets: stamp,
        alpha: 0,
        delay: 1100,
        duration: 300,
        onComplete: () => stamp.destroy(),
      });
      this.fx.burst("star", to.x, to.y, 30, c.theme.col, { speed: { min: 200, max: 600 } });
      this.refreshCard(c);
    });
  }

  claimDrop(c) {
    const res = Shop.claimDrop();
    if (!res) return;
    const pod = c.wobble;
    if (pod) {
      const x = this.strip.x + c.x;
      this.fx.burst("star", x, this.cardY - this.cardH * 0.21, 30, 0x39ff88, {
        speed: { min: 150, max: 500 },
      });
    }
    this.openPod(res, () => this.refreshCard(c));
  }

  // ---------------------------------------------------------------- drift pass
  openPass() {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(500);
    this.modal = c;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.88).setInteractive();
    const g = this.add.graphics();
    const py = this.top + 60;
    const ph = H - py - 40;
    g.fillStyle(0x07020f, 1).fillRoundedRect(22, py - 8, W - 44, ph + 16, 26);
    g.fillStyle(0x10183a, 1).fillRoundedRect(30, py, W - 60, ph, 22);
    g.lineStyle(4, 0x3ef4ff, 1).strokeRoundedRect(30, py, W - 60, ph, 22);
    c.add([dim, g, pixelText(this, W / 2, py + 54, "DRIFT PASS", 46, "#3ef4ff", { stroke: 10 })]);
    c.add(
      this.add
        .text(
          W / 2,
          py + 104,
          `FREE TRACK · ${DriftPass.xp()} XP earned · ${PASS_TIER_XP} XP per tier`,
          this.priceStyle(19, "#cfe8ff"),
        )
        .setOrigin(0.5),
    );
    const cols = 3;
    const tw = (W - 120) / cols;
    const thh = Math.min(200, (ph - 260) / Math.ceil(FREE_TRACK.length / cols));
    const draw = () => {
      if (c.tiles) c.tiles.destroy();
      const tiles = this.add.container(0, 0);
      c.tiles = tiles;
      c.add(tiles);
      FREE_TRACK.forEach((r, i) => {
        const x = 60 + tw * (i % cols) + tw / 2;
        const y = py + 150 + thh * Math.floor(i / cols) + thh / 2;
        const un = DriftPass.isUnlocked(i);
        const done = DriftPass.isClaimed(i);
        const tg = this.add.graphics();
        tg.fillStyle(0x07020f, 1).fillRoundedRect(
          x - tw / 2 + 6,
          y - thh / 2 + 6,
          tw - 12,
          thh - 12,
          14,
        );
        tg.fillStyle(done ? 0x1a2a20 : un ? 0x0e4a3a : 0x1c1830, 1).fillRoundedRect(
          x - tw / 2 + 10,
          y - thh / 2 + 10,
          tw - 20,
          thh - 20,
          12,
        );
        tg.lineStyle(3, done ? 0x39ff88 : un ? 0xffd23f : 0x3a3060, 1).strokeRoundedRect(
          x - tw / 2 + 10,
          y - thh / 2 + 10,
          tw - 20,
          thh - 20,
          12,
        );
        tiles.add(tg);
        const ic = this.rewardIcon(r, x, y - 10, 0.55);
        if (!un) ic.setAlpha(0.4);
        tiles.add(ic);
        tiles.add(
          pixelText(this, x - tw / 2 + 34, y - thh / 2 + 30, `${i + 1}`, 18, "#ffffff", {
            stroke: 4,
          }),
        );
        const lbl = done ? "✓" : un ? "CLAIM" : "🔒";
        tiles.add(
          this.add
            .text(
              x,
              y + thh / 2 - 34,
              lbl,
              this.priceStyle(20, done ? "#39ff88" : un ? "#ffd23f" : "#8a80b0"),
            )
            .setOrigin(0.5),
        );
        if (un && !done) {
          const z = this.add.zone(x, y, tw - 20, thh - 20).setInteractive();
          z.on("pointerup", () => {
            const res = DriftPass.claim(i);
            if (!res) return;
            Sfx.reward();
            Haptics.light();
            this.fx.burst("star", x, y, 24, 0xffd23f, { speed: { min: 150, max: 450 } });
            this.coins.to(Save.data.coins, 600);
            if (res.pod) {
              this.closeModal();
              this.openPod(res.pod, () => this.refreshAll());
              return;
            }
            this.fx.floatText(x, y - 40, res.item ? res.item.name : `+${res.coins}`, "#ffd23f", 30);
            draw();
          });
          tiles.add(z);
        }
      });
    };
    draw();
    const close = button(this, W / 2, py + ph - 70, 300, BTN_H, "DONE", {
      color: 0x3ef4ff,
      size: 30,
      onClick: () => {
        this.closeModal();
        this.refreshAll();
      },
    });
    c.add(close);
  }

  // ---------------------------------------------------------------- modals
  confirm(title, price, onYes) {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(500);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.8).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x07020f, 1).fillRoundedRect(56, H / 2 - 186, W - 112, 332, 26);
    g.fillStyle(0x1c1438, 1).fillRoundedRect(64, H / 2 - 178, W - 128, 316, 22);
    g.lineStyle(4, 0xffd23f, 1).strokeRoundedRect(64, H / 2 - 178, W - 128, 316, 22);
    const t = pixelText(this, W / 2, H / 2 - 118, title, 30, "#ffd23f", { stroke: 7 });
    t.setScale(Math.min(1, (W - 180) / t.width));
    const coin = this.add.image(W / 2 - 60, H / 2 - 52, "pxc", "coin_0").setScale(1);
    const pr = this.add
      .text(W / 2 - 30, H / 2 - 52, `${price}`, this.priceStyle(44, "#ffffff"))
      .setOrigin(0, 0.5);
    const left = this.add
      .text(
        W / 2,
        H / 2 - 4,
        `You'll have ${Save.data.coins - price} left`,
        this.priceStyle(19, "#cfc6ff"),
      )
      .setOrigin(0.5);
    const yes = button(this, W / 2 - 125, H / 2 + 74, 210, BTN_H, "BUY", {
      color: 0x39ff88,
      size: 30,
      onClick: () => {
        this.closeModal();
        onYes();
      },
    });
    const no = button(this, W / 2 + 125, H / 2 + 74, 210, BTN_H, "CANCEL", {
      color: 0xff4fd8,
      size: 24,
      onClick: () => this.closeModal(),
    });
    c.add([dim, g, t, coin, pr, left, yes, no]);
    this.modal = c;
  }

  closeModal() {
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
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.9).setInteractive();
    const pod = this.add.image(W / 2, H * 0.42, "cosm", "pod_0").setScale(4.6);
    c.add([dim, pod]);
    const col = RARITY[res.rarity]?.color ?? 0xffffff;
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
          scale: 5,
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
    pod.setVisible(false);
    Sfx.chestOpen?.();
    Sfx.reward();
    Haptics.strong();
    this.fx.ring(W / 2, H * 0.42, col, { scale: 4, duration: 800, width: 4 });
    this.fx.burst("star", W / 2, H * 0.42, 70, col, { speed: { min: 250, max: 900 } });
    const rays = this.add.graphics({ x: W / 2, y: H * 0.42 }).setBlendMode(Phaser.BlendModes.ADD);
    rays.fillStyle(col, 0.16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.slice(0, 0, 600, a, a + 0.18, false).fillPath();
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    c.addAt(rays, 1);
    const label = RARITY[res.rarity].label;
    const done = () => {
      this.closeModal();
      after?.();
      this.refreshAll();
    };
    if (res.item) {
      const icon = this.rewardIcon({ item: res.item.id }, W / 2, H * 0.42, 1.6);
      const s0 = icon.scaleX;
      icon.setScale(0.1);
      this.tweens.add({ targets: icon, scale: s0, duration: 600, ease: "Back.easeOut" });
      c.add([
        icon,
        pixelText(this, W / 2, H * 0.24, label, 30, hex(col), { stroke: 7 }),
        pixelText(this, W / 2, H * 0.58, res.item.name.toUpperCase(), 44, "#ffffff", {
          stroke: 10,
        }),
      ]);
      c.add(
        button(this, W / 2 - 130, H * 0.7, 230, BTN_H, "EQUIP", {
          color: 0x39ff88,
          size: 28,
          onClick: () => {
            Shop.equip(res.item.id);
            done();
          },
        }),
      );
      c.add(
        button(this, W / 2 + 130, H * 0.7, 230, BTN_H, "COOL", {
          color: 0x3ef4ff,
          size: 28,
          onClick: done,
        }),
      );
    } else {
      c.add([
        pixelText(this, W / 2, H * 0.4, `ALL ${label} OWNED`, 32, hex(col), { stroke: 7 }),
        pixelText(this, W / 2, H * 0.48, `+${res.refund} COINS`, 40, "#ffd23f", { stroke: 9 }),
        button(this, W / 2, H * 0.62, 260, BTN_H, "OK", {
          color: 0x3ef4ff,
          size: 28,
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
    // background parallax + drifting pixels
    this.skyFar.tilePositionX += dt * 6;
    this.skyNear.tilePositionX += dt * 14;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < -10) m.x = W + 10;
      if (m.y < -10) m.y = this.H + 10;
    }
    // balances: spinning coin, glinting shard
    this.coinIcon.setFrame(`coin_${Math.floor(this.t * 8) % 4}`);
    const sx = W - 300;
    const sy = this.top + 70;
    const k = Math.abs(Math.cos(this.t * 2.4));
    this.shardG.clear();
    this.shardG.fillStyle(0x9ffcff, 1).fillPoints(
      [
        { x: sx, y: sy - 14 },
        { x: sx + 10 * k + 2, y: sy },
        { x: sx, y: sy + 14 },
        { x: sx - 10 * k - 2, y: sy },
      ],
      true,
    );
    // cards: pulsing neon glow, tiny animated backgrounds, wobbling pods, shimmer, timers
    const now = Date.now();
    this.cards.forEach((c, i) => {
      const vis = Math.abs(i - this.index) <= 1;
      c.setVisible(Math.abs(this.strip.x + c.x - W / 2) < W);
      if (!vis) return;
      c.glow.setAlpha(0.55 + 0.45 * Math.sin(this.t * 2.2 + i));
      if (c.rays) c.rays.rotation += dt * 0.25;
      if (c.wobble)
        c.wobble
          .setAngle(Math.sin(this.t * 3) * 6)
          .setScale(c.wobble.scaleX, c.wobble.scaleX * (1 + Math.sin(this.t * 6) * 0.03));
      this.drawCardFx(c, dt);
      if (c.shine) {
        c.shineT -= dt;
        c.shine.clear();
        if (c.shineT < 0.7) {
          const p = 1 - Math.max(0, c.shineT) / 0.7;
          const x = -this.cardW / 2 - 80 + p * (this.cardW + 160);
          for (let j = 0; j < 6; j++) {
            c.shine.fillStyle(Phaser.Display.Color.HSVToRGB(j / 6, 0.6, 1).color, 0.18);
            c.shine.fillPoints(
              [
                { x: x + j * 10, y: this.cardH / 2 },
                { x: x + j * 10 + 10, y: this.cardH / 2 },
                { x: x + j * 10 + 90, y: -this.cardH / 2 },
                { x: x + j * 10 + 80, y: -this.cardH / 2 },
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
    // focused card's preview: the hero flies across it (YARMS flexes on loop)
    const fc = this.cards[this.index];
    if (this.rig && fc) {
      this.rigT += dt;
      const cx = this.strip.x + fc.x;
      const cy = this.cardY - this.cardH * 0.21;
      if (this.rigSpec.flexLoop) {
        this.rig.setPosition(cx, cy + Math.sin(this.t * 2) * 8);
        this.flexT -= dt;
        if (this.flexT <= 0) {
          this.flexT = 1.6;
          this.rig.flex({ big: true, shine: true });
        }
        this.rig.update(dt, 120);
      } else {
        const span = this.cardW * 0.8;
        const p = (this.rigT * 0.32) % 1;
        this.rig.setPosition(cx - span / 2 + p * span, cy - 40 + Math.sin(this.rigT * 4) * 26);
        this.rig.angle = Math.cos(this.rigT * 4) * -10;
        this.flapT -= dt;
        if (this.flapT <= 0 && !this.rig.dead) {
          this.flapT = 0.55;
          this.rig.flap();
        }
        if (p < 0.02 && this.rig.points.length) this.rig.points.length = 0; // re-enter cleanly
        this.rig.update(dt, 200);
      }
    }
    this.fx.update(dt);
    // the page dots
    this.dots.clear();
    const n = this.cards.length;
    if (n > 1) {
      const dw = Math.min(26, (W - 120) / n);
      const y0 = this.cardY + this.cardH / 2 + 34;
      for (let i = 0; i < n; i++) {
        this.dots.fillStyle(i === this.index ? 0xffd23f : 0x3a3060, 1);
        this.dots.fillRect(W / 2 + (i - (n - 1) / 2) * dw - 5, y0 - 5, 10, 10);
      }
    }
    // a tiny YARMS peeks in from the edge now and then and flexes
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
    const H = this.cardH;
    const top = -H / 2 + 10;
    const bot = -H / 2 + H * 0.58 - 10;
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
      const x = Phaser.Math.Clamp(m.x, -W / 2 + 10, W / 2 - 14);
      let col = c.theme.col;
      let a = 0.6;
      if (fx === "embers") col = m.p % 1 < 0.5 ? 0xffa21a : 0xff5a1a;
      if (fx === "snow") col = 0xffffff;
      if (fx === "prism") col = Phaser.Display.Color.HSVToRGB((m.p * 0.2) % 1, 0.6, 1).color;
      if (fx === "glitch") {
        if (Math.random() < 0.08) m.x = (Math.random() - 0.5) * W;
        col = [0xff2050, 0x39ff88, 0x20c8ff][Math.floor(m.p * 3) % 3];
        a = Math.random() < 0.3 ? 0.9 : 0.4;
      }
      if (fx === "stars") a = 0.3 + 0.4 * Math.abs(Math.sin(m.p * 2));
      g.fillStyle(col, a).fillRect(
        Math.round(x / 4) * 4,
        Math.round(m.y / 4) * 4,
        fx === "glitch" ? 12 : 4,
        4,
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
            this.fx.burst("star", W - 40, y - 30, 6, 0xffd23f, { speed: { min: 40, max: 140 } });
          },
        },
        { x: W + 140, duration: 360, delay: 500, ease: "Cubic.easeIn" },
      ],
      onComplete: () => im.destroy(),
    });
  }
}
