// DRIFT PASS — full-screen season pass in Glydrift's pixel-neon style (original layout/art).
// Header (season, countdown, tier XP, balances) · the season hero pinned on a pedestal ·
// a momentum-scrolling track of 50 tiers: a glowing line with tier bubbles, FREE rewards on
// the left and the (locked, coming soon) DRIFT PASS+ cards on the right. No real money.
import Phaser from "phaser";
import { fitCamera, NUM_FONT, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Save } from "../data/save.js";
import { Seasons } from "../data/seasons.js";
import { DriftPass, passTrack, tierXp } from "../data/driftPass.js";
import { getCosmetic, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { revealHero } from "../ui/reveal.js";
import { button, fadeTo, RollingCounter } from "../ui/ui.js";
import { ensureShopPattern, pixelText } from "./ShopScene.js";

const OUT = 0x1a0630;
const ROW = 176; // tier row height
const ROW_M = 236; // milestone rows (every 5th tier) are taller
const RAINBOW = [0xff3a5a, 0xff9a1a, 0xffe14d, 0x39ff88, 0x3ab8ff, 0xb45cff];
const TYPE_COL = {
  coins: 0xffa21a,
  pod: 0xa040ff,
  shards: 0x18b8e8,
  xpBoost: 0x2ab86a,
  title: 0xff4fb8,
  banner: 0xd8203a,
  emote: 0x18c8b0,
  common: 0x6a86c8,
  rare: 0x2a7aff,
  epic: 0xa040ff,
  legendary: 0xff8a1a,
  mega: 0xff4fd8,
  ultra: 0xff4fd8,
};

const priceStyle = (size, color = "#ffffff") => ({
  fontFamily: NUM_FONT,
  fontSize: `${size}px`,
  fontStyle: "700",
  color,
  stroke: "#1a0630",
  strokeThickness: Math.max(3, Math.round(size / 6)),
  resolution: VIEW.Z,
});

/** What a reward is called on its card. */
function rewardLabel(r) {
  if (r.label) return r.label;
  if (r.coins) return "COINS";
  if (r.pod) return "MYSTERY POD";
  if (r.shards) return "SHARDS";
  if (r.xpBoost) return "XP BOOST";
  if (r.hero) return "NEW HERO";
  if (r.item) {
    const c = getCosmetic(r.item);
    return `NEW ${{ trail: "TRAIL", hat: "HAT", death: "DEATH FX", flap: "FLAP FX", coin: "COINS", skin: "SKIN" }[c.cat] || "ITEM"}`;
  }
  return "REWARD";
}
function rewardColor(r) {
  if (r.hero) return TYPE_COL[getCharacter(r.hero).rarity] || TYPE_COL.legendary;
  if (r.item) return TYPE_COL[getCosmetic(r.item).rarity];
  if (r.title) return TYPE_COL.title;
  if (r.banner) return TYPE_COL.banner;
  if (r.emote) return TYPE_COL.emote;
  for (const k of ["coins", "pod", "shards", "xpBoost"]) if (r[k]) return TYPE_COL[k];
  return 0x6a5aa8;
}

export class PassScene extends Phaser.Scene {
  constructor() {
    super("Pass");
  }

  init(data) {
    this.from = data?.from || "Menu";
  }

  create() {
    fitCamera(this);
    this.leftForSeason = false;
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.cameras.main.fadeIn(220, 20, 6, 40);
    this.scene.get("Backdrop")?.scene.setVisible(false);
    this.events.once("shutdown", () => this.scene.get("Backdrop")?.scene.setVisible(true));
    this.season = Seasons.active();
    this.track = passTrack();
    this.plus = this.season?.pass.plus || [];
    this.sc = this.season
      ? Seasons.colors(this.season)
      : { primary: 0x2a8aff, accent: 0x3ef4ff, dark: 0x0a1030 };
    this.lowGfx = Save.data.settings.lowGfx;
    this.fx = new Effects(this, { lowGfx: this.lowGfx, depth: 400 });
    this.t = 0;
    this.busy = false;
    const top = (this.registry.get("safeTop") || 0) + 10;
    const bottom = this.registry.get("safeBottom") || 0;
    this.top = top;

    this.buildBackground();
    this.buildHeader(top);
    const heroH = H < 1400 ? 250 : 320;
    this.buildHero(top + 196, heroH);
    // the scrolling track sits under the hero, above the claim-all bar
    this.viewTop = top + 196 + heroH + 46;
    this.viewBot = H - bottom - 104;
    this.buildColumnHeads(this.viewTop - 24);
    this.buildTrack();
    this.buildFooter(H - bottom - 52);

    // input: momentum scrolling inside the track viewport
    this.scrollY = 0;
    this.vel = 0;
    this.input.on("pointerdown", (p) => {
      if (this.busy || p.worldY < this.viewTop || p.worldY > this.viewBot) return;
      this.drag = { y: p.worldY, start: this.scrollY, last: p.worldY, t: this.time.now, moved: 0 };
      this.vel = 0;
      this.scrollTween?.stop();
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag || !p.isDown) return;
      const dt = Math.max(1, this.time.now - this.drag.t);
      this.vel = ((p.worldY - this.drag.last) / dt) * 16.7;
      this.drag.last = p.worldY;
      this.drag.t = this.time.now;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(p.worldY - this.drag.y));
      this.setScroll(this.drag.start - (p.worldY - this.drag.y), true);
    });
    this.input.on("pointerup", () => {
      if (this.drag) this.lastDrag = this.drag.moved;
      this.drag = null;
    });

    // open on the player's current tier
    const cur = Math.min(this.track.length - 1, DriftPass.nextTier() ?? this.track.length - 1);
    this.setScroll(this.scrollFor(Math.max(0, cur - 1)) - 40);
    this.scrollTo(cur, 700, 200);
  }

  // ---------------------------------------------------------------- background
  buildBackground() {
    const { W, H } = this;
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x7a1ad8, 0x7a1ad8, 0x4a1ac8, 0x4a1ac8, 1).fillRect(0, 0, W, H * 0.5);
    bg.fillGradientStyle(0x4a1ac8, 0x4a1ac8, 0x1a5af0, 0x1a5af0, 1).fillRect(
      0,
      H * 0.5,
      W,
      H * 0.5 + 2,
    );
    ensureShopPattern(this);
    this.pattern = this.add.tileSprite(W / 2, H / 2, W, H, "shop_pattern").setDepth(-9);
    // a wash of the season colour from the top
    const wash = this.add.graphics().setDepth(-8);
    const p = this.sc.primary;
    wash.fillGradientStyle(p, p, p, p, 0.55, 0.55, 0, 0).fillRect(0, 0, W, H * 0.45);
  }

  // ---------------------------------------------------------------- header
  buildHeader(top) {
    const { W } = this;
    const s = Save.data;
    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.35).fillRect(0, 0, W, top + 190);
    g.fillStyle(this.sc.primary, 1).fillRect(0, top + 186, W, 5);
    button(this, 62, top + 44, 96, 78, "◀", {
      color: 0xffffff,
      size: 32,
      fill: this.sc.dark,
      onClick: () => this.leave(),
    }).setDepth(310);
    // balances, each in its own pill
    const pill = (x, col, dark) => {
      const pg = this.add.graphics().setDepth(305);
      pg.fillStyle(OUT, 1).fillRoundedRect(x - 104, top + 44 - 30, 208, 60, 30);
      pg.fillStyle(dark, 1).fillRoundedRect(x - 99, top + 44 - 25, 198, 50, 25);
      pg.lineStyle(3, col, 1).strokeRoundedRect(x - 99, top + 44 - 25, 198, 50, 25);
    };
    pill(W - 342, 0xffd23f, 0x6a3a00);
    pill(W - 120, 0x9ffcff, 0x0a3a6a);
    this.coinIcon = this.add
      .image(W - 412, top + 44, "pxc", "coin_0")
      .setScale(0.9)
      .setDepth(306);
    this.coinText = this.add
      .text(W - 386, top + 44, `${s.coins}`, priceStyle(32))
      .setOrigin(0, 0.5)
      .setDepth(306);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });
    const shards = Object.values(s.shards || {}).reduce((a, n) => a + (n || 0), 0);
    this.shardIcon = this.add
      .image(W - 190, top + 44, "shardIcon")
      .setScale(0.55 / HI)
      .setDepth(306);
    this.shardText = this.add
      .text(W - 164, top + 44, `${shards}`, priceStyle(32))
      .setOrigin(0, 0.5)
      .setDepth(306);
    // title
    const name = this.season ? `SEASON ${this.season.number} · ${this.season.name}` : "DRIFT PASS";
    const title = pixelText(this, W / 2, top + 108, name, 40, "#ffffff", { stroke: 10 }).setDepth(
      306,
    );
    title.setScale(Math.min(1, (W - 40) / title.width));
    // countdown chip + tier XP bar
    const cg = this.add.graphics().setDepth(305);
    cg.fillStyle(OUT, 1).fillRoundedRect(20, top + 140, 168, 40, 14);
    cg.fillStyle(this.sc.dark, 1).fillRoundedRect(24, top + 144, 160, 32, 11);
    this.countText = this.add
      .text(
        104,
        top + 160,
        this.season ? `⏱ ${Seasons.countdown(this.season)}` : "⏱ —",
        priceStyle(22, "#ffd8d8"),
      )
      .setOrigin(0.5)
      .setDepth(306);
    this.xpBar = this.add.graphics().setDepth(305);
    this.xpText = this.add
      .text(0, top + 160, "", priceStyle(22))
      .setOrigin(0.5)
      .setDepth(306);
    this.xpY = top + 160;
    this.drawXp();
  }

  drawXp() {
    const { W } = this;
    const x0 = 204;
    const bw = W - x0 - 20;
    const n = DriftPass.unlockedCount();
    const into = DriftPass.xp() - n * tierXp();
    const done = n >= this.track.length;
    const frac = done ? 1 : Math.max(0, Math.min(1, into / tierXp()));
    const y = this.xpY;
    const g = this.xpBar.clear();
    g.fillStyle(OUT, 1).fillRoundedRect(x0, y - 20, bw, 40, 14);
    g.fillStyle(0x2a0a3a, 1).fillRoundedRect(x0 + 4, y - 16, bw - 8, 32, 11);
    g.fillStyle(0xffd23f, 1).fillRoundedRect(x0 + 4, y - 16, Math.max(20, (bw - 8) * frac), 32, 11);
    g.fillStyle(0xffffff, 0.35).fillRect(x0 + 10, y - 13, Math.max(6, (bw - 8) * frac - 12), 8);
    this.xpText
      .setPosition(x0 + bw / 2, y)
      .setText(
        done
          ? `ALL ${this.track.length} TIERS DONE`
          : `TIER ${n + 1} · ${Math.max(0, into)}/${tierXp()} XP`,
      );
  }

  // ---------------------------------------------------------------- the season hero
  buildHero(y0, h) {
    const { W } = this;
    const heroId = this.season?.featuredHero || this.track.find((r) => r.hero)?.hero;
    if (!heroId) return;
    const def = getCharacter(heroId);
    this.heroDef = def;
    const cx = W * 0.38;
    const cy = y0 + h * 0.48;
    this.heroCx = cx;
    this.heroCy = cy;
    // rotating rays + glow
    this.rays = this.add
      .graphics({ x: cx, y: cy })
      .setDepth(150)
      .setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.rays.fillStyle(i % 2 ? this.sc.accent : this.sc.primary, 0.22);
      this.rays.slice(0, 0, h * 0.9, a, a + 0.18, false).fillPath();
    }
    this.add
      .image(cx, cy, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.sc.accent)
      .setScale(3.4)
      .setAlpha(0.5)
      .setDepth(151);
    // pedestal
    const ped = this.add.graphics().setDepth(152);
    const py = y0 + h - 34;
    ped.fillStyle(OUT, 1).fillEllipse(cx, py + 6, 280, 54);
    ped.fillStyle(this.sc.dark, 1).fillEllipse(cx, py, 270, 46);
    ped.lineStyle(4, this.sc.accent, 1).strokeEllipse(cx, py, 270, 46);
    ped.fillStyle(this.sc.primary, 0.6).fillEllipse(cx, py - 4, 200, 22);
    this.rig = new CharacterRig(this, def, this.fx, {
      x: cx,
      y: cy - 10,
      depth: 160,
      scale: h > 280 ? 3.2 : 2.6,
      cosmetics: {},
    });
    this.roarT = 2;
    // name + GET button
    const nx = W * 0.79;
    const nm = pixelText(this, nx, y0 + h * 0.3, def.name, 30, "#ffffff", { stroke: 8 }).setDepth(
      170,
    );
    nm.setScale(Math.min(1, 250 / nm.width));
    const tier = this.track.findIndex((r) => r.hero === def.id);
    this.add
      .text(
        nx,
        y0 + h * 0.3 + 38,
        tier >= 0 ? `TIER ${tier + 1} REWARD` : "SEASON HERO",
        priceStyle(20, "#ffd23f"),
      )
      .setOrigin(0.5)
      .setDepth(170);
    const owned = !!Save.data.unlocked[def.id];
    button(this, nx, y0 + h * 0.62, 190, 76, owned ? "OWNED" : "GET", {
      color: 0xffffff,
      size: 32,
      fill: owned ? 0x2a8a0a : 0xc8102e,
      onClick: () => tier >= 0 && this.scrollTo(tier, 900),
    }).setDepth(170);
  }

  // ---------------------------------------------------------------- the track
  buildColumnHeads(y) {
    const { W } = this;
    const g = this.add.graphics().setDepth(250);
    g.fillStyle(OUT, 0.85).fillRect(0, y - 22, W, 44);
    this.add
      .text(W * 0.25, y, "FREE", priceStyle(24, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(251);
    this.add
      .text(W * 0.75, y, "DRIFT PASS+ · COMING SOON", priceStyle(20, "#ffd23f"))
      .setOrigin(0.5)
      .setDepth(251);
  }

  rowH(i) {
    return (i + 1) % 5 === 0 ? ROW_M : ROW;
  }
  /** Scroll offset that puts tier i's row at the top of the viewport. */
  scrollFor(i) {
    let y = 0;
    for (let k = 0; k < i; k++) y += this.rowH(k);
    return y;
  }

  buildTrack() {
    const { W } = this;
    const viewH = this.viewBot - this.viewTop;
    this.content = this.add.container(0, this.viewTop).setDepth(200);
    const mask = this.make.graphics({ add: false });
    mask.fillStyle(0xffffff).fillRect(0, this.viewTop, W, viewH);
    this.content.setMask(mask.createGeometryMask());
    this.lineG = this.add.graphics();
    this.content.add(this.lineG);
    this.rows = [];
    let y = 20;
    for (let i = 0; i < this.track.length; i++) {
      const h = this.rowH(i);
      const row = this.add.container(0, y + h / 2);
      row.h = h;
      row.i = i;
      this.content.add(row);
      this.rows.push(row);
      this.fillRow(row);
      y += h;
    }
    this.contentH = y + 40;
    this.maxScroll = Math.max(0, this.contentH - viewH);
    this.drawLine();
  }

  /** The glowing centre line: lit up to the player's tier. */
  drawLine() {
    const { W } = this;
    const g = this.lineG.clear();
    const x = W / 2;
    const n = DriftPass.unlockedCount();
    const litTo = n > 0 ? this.rows[Math.min(n, this.rows.length) - 1].y : 0;
    g.fillStyle(OUT, 1).fillRect(x - 9, 0, 18, this.contentH);
    g.fillStyle(0x3a2a6a, 1).fillRect(x - 5, 0, 10, this.contentH);
    if (litTo > 0) {
      g.fillStyle(this.sc.accent, 0.35).fillRect(x - 12, 0, 24, litTo);
      g.fillStyle(0xffd23f, 1).fillRect(x - 5, 0, 10, litTo);
      g.fillStyle(0xffffff, 0.7).fillRect(x - 2, 0, 3, litTo);
    }
  }

  /** (Re)build one tier row: bubble on the line, FREE tile left, DRIFT PASS+ card right. */
  fillRow(row) {
    row.removeAll(true);
    const { W } = this;
    const i = row.i;
    const milestone = (i + 1) % 5 === 0;
    const r = this.track[i];
    const unlocked = DriftPass.isUnlocked(i);
    const claimed = DriftPass.isClaimed(i);
    const state = claimed ? "claimed" : unlocked ? "ready" : "locked";
    row.state = state;
    // free tile (left)
    const fw = milestone ? 290 : 250;
    const fh = milestone ? 206 : 146;
    const free = this.card(r, W * 0.25, 0, fw, fh, {
      milestone,
      state,
      big: false,
      legendary: i === this.track.length - 1,
    });
    row.add(free);
    row.free = free;
    // DRIFT PASS+ card (right): always locked for now
    const pr = this.plus[i];
    if (pr) {
      const pw = milestone ? 320 : 290;
      const ph = milestone ? 216 : 156;
      const plus = this.card(pr, W * 0.75 + 4, 0, pw, ph, { milestone, state: "plus", big: true });
      row.add(plus);
    }
    // tier bubble on the line (a gold star badge for milestones)
    const b = this.add.graphics();
    const rr = milestone ? 34 : 26;
    const col = unlocked ? 0xffd23f : 0x6a3ab8;
    b.fillStyle(OUT, 1).fillCircle(W / 2, 0, rr + 5);
    if (milestone) {
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
        const rad = k % 2 ? rr * 0.78 : rr + 6;
        pts.push({ x: W / 2 + Math.cos(a) * rad, y: Math.sin(a) * rad });
      }
      b.fillStyle(0xffd23f, 1).fillPoints(pts, true);
      b.fillStyle(unlocked ? 0xffa21a : 0x8a5a1a, 1).fillCircle(W / 2, 0, rr * 0.7);
    } else {
      b.fillStyle(col, 1).fillCircle(W / 2, 0, rr);
      b.fillStyle(0xffffff, 0.3).fillCircle(W / 2 - 6, -8, rr * 0.35);
    }
    row.add(b);
    row.add(
      this.add
        .text(
          W / 2,
          1,
          `${i + 1}`,
          priceStyle(milestone ? 28 : 24, unlocked ? "#1a0630" : "#ffffff"),
        )
        .setOrigin(0.5)
        .setStroke(unlocked ? "#ffffff" : "#1a0630", 4),
    );
  }

  /** One reward card: thick outline, rounded, glossy, icon + amount + label, state overlays. */
  card(r, x, y, w, h, { milestone, state, big, legendary }) {
    const c = this.add.container(x, y);
    const col = rewardColor(r);
    const g = this.add.graphics();
    const rad = 20;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 6, -h / 2 + 8, w, h, rad);
    if (legendary) {
      // the season hero: a rainbow Legendary card
      g.fillStyle(OUT, 1).fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, rad + 4);
      RAINBOW.forEach((rc, k) => {
        g.fillStyle(rc, 1).fillRect(-w / 2 + (w / 6) * k, -h / 2, w / 6 + 1, h);
      });
      g.fillStyle(0x2a0a4a, 0.55).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, rad - 4);
    } else {
      g.fillStyle(milestone ? 0xffd23f : OUT, 1).fillRoundedRect(
        -w / 2 - 5,
        -h / 2 - 5,
        w + 10,
        h + 10,
        rad + 3,
      );
      if (milestone) g.fillStyle(OUT, 1).fillRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, rad);
      g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2, w, h, rad);
      g.fillStyle(0xffffff, 0.28).fillRoundedRect(
        -w / 2 + 8,
        -h / 2 + 6,
        w - 16,
        h * 0.28,
        rad - 8,
      );
      g.fillStyle(0x000000, 0.18).fillRoundedRect(-w / 2, h / 2 - h * 0.3, w, h * 0.3, {
        tl: 0,
        tr: 0,
        bl: rad,
        br: rad,
      });
    }
    c.add(g);
    // icon
    const icon = this.icon(r, 0, -h * 0.1, milestone ? 1.25 : 1, h);
    if (icon) c.add(icon);
    // amount + label
    const amt =
      r.coins > 0
        ? `${r.coins}`
        : r.shards
          ? `×${r.shards}`
          : r.xpBoost
            ? `${r.xpBoost.mul}× · ${r.xpBoost.runs} RUNS`
            : r.title
              ? `"${r.title}"`
              : r.hero
                ? getCharacter(r.hero).name
                : r.item
                  ? getCosmetic(r.item).name
                  : "";
    if (amt) {
      const at = this.add
        .text(0, h / 2 - (big ? 50 : 44), amt, priceStyle(milestone ? 26 : 22))
        .setOrigin(0.5);
      at.setScale(Math.min(1, (w - 20) / at.width));
      c.add(at);
    }
    const lb = this.add
      .text(0, h / 2 - 18, rewardLabel(r), priceStyle(milestone ? 19 : 16, "#fff6c0"))
      .setOrigin(0.5);
    lb.setScale(Math.min(1, (w - 20) / lb.width));
    c.add(lb);
    // a shine strip that sweeps across now and then (drawn in update for visible cards)
    c.shine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    c.add(c.shine);
    c.w = w;
    c.h = h;
    c.shineT = Math.random() * 3;
    // states
    if (state === "locked" || state === "plus") {
      c.add(
        this.add
          .graphics()
          .fillStyle(OUT, 0.26)
          .fillRoundedRect(-w / 2, -h / 2, w, h, rad),
      );
      const lk = this.add.graphics({ x: w / 2 - 26, y: -h / 2 + 28 });
      lk.fillStyle(OUT, 1).fillRoundedRect(-15, -6, 30, 24, 5);
      lk.lineStyle(6, OUT, 1).strokeCircle(0, -8, 8);
      lk.fillStyle(0xffd23f, 1).fillRoundedRect(-11, -2, 22, 16, 3);
      lk.fillStyle(OUT, 1).fillRect(-2, 2, 4, 7);
      c.add(lk);
      if (state === "plus") {
        const tag = this.add.graphics();
        tag.fillStyle(0xc8102e, 1).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, 92, 26, 8);
        c.add(tag);
        c.add(this.add.text(-w / 2 + 54, -h / 2 + 21, "PASS+", priceStyle(16)).setOrigin(0.5));
      }
    } else if (state === "claimed") {
      c.add(
        this.add
          .graphics()
          .fillStyle(OUT, 0.3)
          .fillRoundedRect(-w / 2, -h / 2, w, h, rad),
      );
      const chk = this.add.graphics();
      for (const [lw, cl] of [
        [26, OUT],
        [15, 0x39ff88],
      ])
        chk
          .lineStyle(lw, cl, 1)
          .beginPath()
          .moveTo(-38, 2)
          .lineTo(-10, 30)
          .lineTo(42, -30)
          .strokePath();
      chk.setScale(milestone ? 1.2 : 1);
      c.add(chk);
    } else if (state === "ready") {
      // ready to claim: glow, bounce and a CLAIM tag
      const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      glow
        .lineStyle(14, 0xfff6a0, 0.8)
        .strokeRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, rad + 4);
      c.addAt(glow, 0);
      const tag = this.add.graphics();
      tag.fillStyle(OUT, 1).fillRoundedRect(-58, -h / 2 - 22, 116, 38, 12);
      tag.fillStyle(0x39d86a, 1).fillRoundedRect(-54, -h / 2 - 18, 108, 30, 10);
      c.add(tag);
      c.add(this.add.text(0, -h / 2 - 3, "CLAIM", priceStyle(22)).setOrigin(0.5));
      this.tweens.add({
        targets: c,
        scale: 1.05,
        duration: 430,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({ targets: glow, alpha: 0.3, duration: 430, yoyo: true, repeat: -1 });
      c.setSize(w, h).setInteractive();
      c.on("pointerup", (p) => {
        if ((this.lastDrag || 0) > 10 || this.busy) return;
        if (p.worldY < this.viewTop || p.worldY > this.viewBot) return; // under the header
        const row = c.parentContainer;
        this.claim(row.i);
      });
    }
    return c;
  }

  /** The reward's picture, sized to the card. */
  icon(r, x, y, k, h) {
    const s = (h / 146) * k;
    if (r.coins) {
      const im = this.add.image(x, y, "pxc", "coin_0").setScale(1.6 * s);
      if (r.coins >= 1000) {
        const c = this.add.container(0, 0);
        c.add([
          this.add.image(x - 22 * s, y + 6 * s, "pxc", "coin_1").setScale(1.4 * s),
          this.add.image(x + 22 * s, y + 6 * s, "pxc", "coin_2").setScale(1.4 * s),
          im,
        ]);
        return c;
      }
      return im;
    }
    if (r.pod) return this.add.image(x, y, "cosm", "pod_0").setScale(0.85 * s);
    if (r.shards) return this.add.image(x, y, "shardIcon").setScale((0.9 / HI) * s);
    if (r.xpBoost)
      return this.add
        .text(x, y, `${r.xpBoost.mul}×XP`, { ...priceStyle(Math.round(46 * s), "#ffffff") })
        .setOrigin(0.5);
    if (r.hero)
      return this.add
        .image(x, y, getCharacter(r.hero).texture)
        .setScale((0.7 / HI) * PORTRAIT_K * s);
    if (r.item) {
      const cc = getCosmetic(r.item);
      if (cc.cat === "hat")
        return this.add.image(x, y, "cosm", HAT_FIT[r.item].frame).setScale(3.4 * s);
      if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${r.item}_0`).setScale(2.4 * s);
      if (cc.cat === "skin")
        return this.add
          .image(x, y, greyPortrait(this, getCharacter(Save.data.selected)))
          .setScale((0.4 / HI) * PORTRAIT_K * s)
          .setTint(SKINS[r.item].tint);
      return this.add.image(x, y, "cosm", `icon_${r.item}`).setScale(3 * s);
    }
    const g = this.add.graphics({ x, y });
    if (r.title) {
      // a ribbon scroll with the title on it
      g.fillStyle(OUT, 1).fillRect(-62 * s, -18 * s, 124 * s, 36 * s);
      g.fillStyle(0xfff0d8, 1).fillRect(-58 * s, -14 * s, 116 * s, 28 * s);
      g.fillStyle(0xd88a4a, 1)
        .fillRect(-66 * s, -14 * s, 10 * s, 28 * s)
        .fillRect(56 * s, -14 * s, 10 * s, 28 * s);
      g.fillStyle(0xc8102e, 1).fillRect(-40 * s, -2 * s, 80 * s, 4 * s);
    } else if (r.banner) {
      // a player banner on a pole
      g.fillStyle(OUT, 1).fillRect(-34 * s, -40 * s, 8 * s, 80 * s);
      g.fillStyle(0xc8c8d8, 1).fillRect(-32 * s, -38 * s, 4 * s, 76 * s);
      g.fillStyle(OUT, 1).fillRect(-28 * s, -38 * s, 66 * s, 50 * s);
      g.fillStyle(this.sc.primary, 1).fillRect(-26 * s, -36 * s, 62 * s, 46 * s);
      g.fillStyle(this.sc.accent, 1).fillRect(-26 * s, -20 * s, 62 * s, 8 * s);
      g.fillStyle(0xffd23f, 1).fillCircle(5 * s, -26 * s, 6 * s);
    } else if (r.emote) {
      // a speech bubble emote
      g.fillStyle(OUT, 1).fillRoundedRect(-44 * s, -36 * s, 88 * s, 60 * s, 14 * s);
      g.fillStyle(0xffffff, 1).fillRoundedRect(-40 * s, -32 * s, 80 * s, 52 * s, 12 * s);
      g.fillStyle(0xffffff, 1).fillTriangle(-16 * s, 18 * s, 0, 18 * s, -22 * s, 34 * s);
      g.fillStyle(0xc8102e, 1)
        .fillRect(-26 * s, -18 * s, 10 * s, 22 * s)
        .fillRect(-6 * s, -18 * s, 10 * s, 22 * s);
      g.fillStyle(0xc8102e, 1).fillRect(14 * s, -18 * s, 10 * s, 22 * s);
    }
    return g;
  }

  // ---------------------------------------------------------------- footer
  buildFooter(y) {
    const { W } = this;
    this.claimAll = button(this, W / 2, y, 380, 84, "CLAIM ALL", {
      color: 0xffffff,
      size: 32,
      fill: 0x2a8a0a,
      onClick: () => this.claimAllReady(),
    }).setDepth(320);
    this.updateClaimAll();
  }

  readyTiers() {
    const out = [];
    for (let i = 0; i < DriftPass.unlockedCount(); i++) if (!DriftPass.isClaimed(i)) out.push(i);
    return out;
  }

  updateClaimAll() {
    const n = this.readyTiers().length;
    this.claimAll.setVisible(n >= 2);
    this.claimAll.setLabel?.(`CLAIM ALL (${n})`);
  }

  // ---------------------------------------------------------------- claiming
  /** Claim one tier: burst on the card, the reward flies into the balance. */
  async claim(i, quiet = false) {
    const row = this.rows[i];
    if (!row || row.state !== "ready") return null;
    const res = DriftPass.claim(i);
    if (!res) return null;
    const card = row.free;
    const wx = card.x;
    const wy = this.content.y + row.y;
    Sfx.reward();
    Haptics.light();
    this.fx.burst("star", wx, wy, quiet ? 10 : 24, 0xffd23f, { speed: { min: 150, max: 450 } });
    this.fx.burst("confetti", wx, wy, quiet ? 8 : 20, rewardColor(this.track[i]), {
      speed: { min: 200, max: 520 },
    });
    if (!reduceFlashing()) this.fx.ring(wx, wy, 0xffffff, { scale: 1.4, duration: 380 });
    // fly the reward into the balance it belongs to
    const toShard = res.shards;
    const tx = toShard ? this.shardIcon.x : res.coins ? this.coinIcon.x : this.W / 2;
    const ty = toShard ? this.shardIcon.y : this.coinIcon.y;
    const n = res.coins ? Math.min(10, 4 + Math.floor(res.coins / 150)) : 3;
    for (let k = 0; k < n; k++) {
      const im = res.coins
        ? this.add.image(wx, wy, "pxc", "coin_0").setScale(1)
        : toShard
          ? this.add.image(wx, wy, "shardIcon").setScale(0.5 / HI)
          : this.add.image(wx, wy, "pxglow").setScale(6).setTint(0xffd23f);
      im.setDepth(450);
      this.tweens.add({
        targets: im,
        x: tx + (Math.random() - 0.5) * 20,
        y: ty,
        duration: 420 + k * 45,
        ease: "Cubic.easeIn",
        onComplete: () => {
          im.destroy();
          if (res.coins) Sfx.coin(k);
        },
      });
    }
    this.time.delayedCall(500, () => {
      this.coins.to(Save.data.coins, 500);
      const sh = Object.values(Save.data.shards || {}).reduce((a, v) => a + (v || 0), 0);
      this.shardText.setText(`${sh}`);
      this.tweens.add({
        targets: [this.coinIcon, this.shardIcon],
        scale: "*=1.25",
        duration: 110,
        yoyo: true,
      });
    });
    const label = res.hero
      ? `${res.hero.name}!`
      : res.item
        ? res.item.name
        : res.pod
          ? res.pod.item
            ? res.pod.item.name
            : `+${res.pod.refund} coins`
          : res.xpBoost
            ? `${res.xpBoost.mul}× XP for ${res.xpBoost.runs} runs`
            : res.shards
              ? `+${res.shards} shard${res.shards > 1 ? "s" : ""}`
              : `+${res.coins}`;
    this.fx.floatText(wx, wy - 70, label, "#ffffff", quiet ? 26 : 34);
    this.tweens.killTweensOf(card);
    this.fillRow(row);
    this.drawLine();
    this.updateClaimAll();
    if (res.hero && !res.shardHero) {
      this.busy = true;
      await revealHero(this, res.hero, { title: "UNLOCKED!" });
      this.busy = false;
    }
    return res;
  }

  async claimAllReady() {
    if (this.busy) return;
    const list = this.readyTiers();
    this.busy = true;
    for (const i of list) {
      this.scrollTo(i, 260);
      await new Promise((r) => this.time.delayedCall(280, r));
      this.busy = false;
      await this.claim(i, true);
      this.busy = true;
    }
    this.busy = false;
    this.updateClaimAll();
  }

  // ---------------------------------------------------------------- scrolling
  setScroll(v, soft = false) {
    const max = this.maxScroll;
    if (soft) {
      // rubber band past the ends
      if (v < 0) v *= 0.4;
      if (v > max) v = max + (v - max) * 0.4;
    } else v = Phaser.Math.Clamp(v, 0, max);
    this.scrollY = v;
    this.content.y = this.viewTop - v;
  }

  /** Smoothly bring tier i into the middle of the viewport. */
  scrollTo(i, duration = 600, delay = 0) {
    const viewH = this.viewBot - this.viewTop;
    const row = this.rows[i];
    if (!row) return;
    const target = Phaser.Math.Clamp(row.y - viewH / 2, 0, this.maxScroll);
    const o = { v: this.scrollY };
    this.scrollTween?.stop();
    this.vel = 0;
    this.scrollTween = this.tweens.add({
      targets: o,
      v: target,
      duration,
      delay,
      ease: "Cubic.easeInOut",
      onUpdate: () => this.setScroll(o.v),
    });
  }

  leave() {
    if (this.busy) return;
    fadeTo(this, this.from === "Shop" ? "Shop" : "Menu");
  }

  // ---------------------------------------------------------------- per frame
  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    // the season ended (or a new one began) while the pass was open: go home, where the
    // finished season's tiers are auto-claimed and its recap shows
    if (!this.leftForSeason && !this.busy && Seasons.active()?.id !== this.season?.id) {
      this.leftForSeason = true;
      fadeTo(this, "Menu");
    }
    this.pattern.tilePositionX += dt * 10;
    this.pattern.tilePositionY += dt * 6;
    // momentum + spring back from the ends
    if (!this.drag) {
      if (Math.abs(this.vel) > 0.05) {
        this.setScroll(this.scrollY - this.vel, true);
        this.vel *= Math.pow(0.92, dt * 60);
      } else this.vel = 0;
      if (this.scrollY < 0 || this.scrollY > this.maxScroll) {
        const tgt = this.scrollY < 0 ? 0 : this.maxScroll;
        this.setScroll(this.scrollY + (tgt - this.scrollY) * Math.min(1, dt * 12), true);
        if (Math.abs(this.scrollY - tgt) < 0.5) this.setScroll(tgt);
        this.vel *= 0.5;
      }
    }
    // only rows on screen are drawn (cheap at 60fps); visible cards get a shine sweep now and then
    const top = this.scrollY - 140;
    const bot = this.scrollY + (this.viewBot - this.viewTop) + 140;
    for (const row of this.rows) {
      const vis = row.y + row.h / 2 > top && row.y - row.h / 2 < bot;
      row.setVisible(vis);
      if (!vis || this.lowGfx) continue;
      for (const c of row.list) {
        if (!c.shine) continue;
        c.shineT -= dt;
        c.shine.clear();
        if (c.shineT < 0.6) {
          const p = 1 - Math.max(0, c.shineT) / 0.6;
          const x = -c.w / 2 - 40 + p * (c.w + 80);
          const pts = [
            { x: Math.max(-c.w / 2, x), y: c.h / 2 - 6 },
            { x: Math.max(-c.w / 2, Math.min(c.w / 2, x + 26)), y: c.h / 2 - 6 },
            { x: Math.min(c.w / 2, x + 56), y: -c.h / 2 + 6 },
            { x: Math.min(c.w / 2, Math.max(-c.w / 2, x + 30)), y: -c.h / 2 + 6 },
          ];
          c.shine.fillStyle(0xffffff, 0.28).fillPoints(pts, true);
          if (c.shineT <= 0) c.shineT = 2.5 + Math.random() * 3;
        }
      }
    }
    // the season hero: rays turn, it idles, and every few seconds it roars (chains rattle)
    if (this.rig) {
      this.rays.rotation += dt * 0.25;
      this.rig.setPosition(this.heroCx, this.heroCy - 10 + Math.sin(this.t * 1.6) * 8);
      this.rig.angle = Math.sin(this.t * 0.9) * 6;
      this.roarT -= dt;
      if (this.roarT <= 0) {
        this.roarT = 3 + Math.random() * 2;
        this.rig.flap();
        this.rig.sx = 1.25;
        this.rig.sy = 0.8;
        this.fx.burst("chain", this.heroCx, this.heroCy, 6, 0xffffff, {
          speed: { min: 120, max: 320 },
        });
        this.fx.ring(this.heroCx, this.heroCy, this.sc.accent, { scale: 1.6, duration: 500 });
      }
      this.rig.update(dt, 160);
    }
    this.fx.update(dt);
    if (Math.floor(this.t) !== Math.floor(this.t - dt) && this.season)
      this.countText.setText(`⏱ ${Seasons.countdown(this.season)}`);
  }
}
