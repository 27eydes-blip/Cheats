// Worldwide leaderboards: SCORE (the main one: highest score) and DISTANCE (farthest metres in
// one run), each All Time / This Week / Today, plus today's Daily Challenge.
// Top 100 with medals for the top 3, the player's own row pinned at the bottom with their
// real rank (even outside the top 100), plus loading / empty / offline states.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { heroImage } from "../ui/heroImage.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { FONT, fitCamera, NUM_FONT, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import {
  flairOf,
  Leaderboard,
  Levels,
  myFlair,
} from "../online/leaderboard.js";
import { nameText } from "../ui/nameplate.js";
import { Sfx } from "../audio/sfx.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { button, fadeTo, neonText, plainText } from "../ui/ui.js";
import { titleText } from "../ui/titleText.js";

/** Heroes whose perks touch coins or survival (RONIN, SXE, WALLRUNNER's ×15 coins), shown with the gold perk badge. */
const hasCoinPerks = (def) =>
  !!(
    (def.coinMul ?? 1) > 1 ||
    def.perks?.coinBonus ||
    def.perks?.fireWard ||
    def.perks?.glitchProof ||
    def.perks?.comboMax
  );
import { Titles } from "../data/titles.js";
import { openReport } from "../ui/reportModal.js";

const MEDALS = [0xffd23f, 0xdfe8f5, 0xd8894a];
const ROW_H = 68;
const CYAN = 0x3ef4ff;
const STEEL = 0x2a6a88; // idle HUD lines
const TAB_W = 212; // three tabs: SCORE · DISTANCE · DAILY
const GOLD = 0xffd23f; // the SCORE board's colour: it's the one that counts

/** A HUD panel: a rectangle with cut (chamfered) corners, a neon rim and an optional glow. */
function hudPanel(g, x, y, w, h, opts = {}) {
  const {
    color = CYAN,
    fill = 0x050d18,
    fillAlpha = 0.9,
    width = 2,
    alpha = 1,
    cut = 14,
    glow = false,
  } = opts;
  const c = Math.min(cut, h / 2, w / 2);
  const pts = [
    { x: x + c, y },
    { x: x + w - c, y },
    { x: x + w, y: y + c },
    { x: x + w, y: y + h - c },
    { x: x + w - c, y: y + h },
    { x: x + c, y: y + h },
    { x, y: y + h - c },
    { x, y: y + c },
  ];
  g.fillStyle(fill, fillAlpha).fillPoints(pts, true);
  if (glow)
    for (let i = 3; i >= 1; i--)
      g.lineStyle(width + i * 5, color, 0.05 * (4 - i)).strokePoints(pts, true);
  g.lineStyle(width, color, alpha).strokePoints(pts, true);
  return g;
}

/** HUD corner brackets around a box. */
function brackets(g, x, y, w, h, len, color = CYAN, alpha = 0.8, width = 3) {
  g.lineStyle(width, color, alpha);
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    g.beginPath();
    g.moveTo(cx, cy + sy * len);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * len, cy);
    g.strokePath();
  }
  return g;
}

// ---- the world podium: top 5 on stepped blocks (#1 centre and tallest) ----
const PODIUM_H = 600; // height of the podium block at the top of the list
const PODIUM_BASE = 560; // y of the floor line inside it
const PODIUM = [
  // rank, column (0 = far left … 4 = far right), step height, colour, hero scale, label
  { rank: 1, col: 2, h: 210, color: 0xffd23f, scale: 0.78, label: "WORLD #1" },
  { rank: 2, col: 1, h: 160, color: 0xdfe8f5, scale: 0.6, label: "2ND" },
  { rank: 3, col: 3, h: 125, color: 0xd8894a, scale: 0.6, label: "3RD" },
  { rank: 4, col: 0, h: 88, color: 0xb45cff, scale: 0.46, label: "4TH" },
  { rank: 5, col: 4, h: 62, color: 0x3ef4ff, scale: 0.46, label: "5TH" },
];

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super("Leaderboard");
  }

  init(data) {
    // Score is the main board: it's where the leaderboard opens
    // (the Daily Challenge tab went with the Daily Challenge: level mode has per-level boards)
    this.tab = ["score", "distance"].includes(data?.tab) ? data.tab : "score";
    this.period = "all";
    this.returnTo = data?.from || "Menu";
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.fadeIn(200, 2, 1, 7);
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[0], t: 0 }, {});
    // keep counting up across visits: a late reply from the last visit must never match
    this.reqId = (this.reqId || 0) + 1000;
    this.rowObjs = [];
    this.scrollY = 0;
    this.vel = 0;

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 18,
      onClick: () => this.leave(),
    }).setDepth(50);
    neonText(this, W / 2 + 40, top + 40, "LEADERBOARD", 32, CYAN, {
      blur: 10,
    }).setDepth(50);
    this.add
      .text(W / 2 + 40, top + 76, "GLOBAL RANKING NETWORK", {
        fontFamily: FONT,
        fontSize: "12px",
        fontStyle: "700",
        color: "#6fd8ef",
        resolution: VIEW.Z,
      })
      .setOrigin(0.5)
      .setLetterSpacing(4)
      .setAlpha(0.8)
      .setDepth(50);
    // connection status chip (top right): LIVE / SYNC / OFFLINE
    this.status = this.add.container(W - 62, top + 46).setDepth(50);
    this.statusG = this.add.graphics();
    this.statusDot = this.add.circle(-30, 0, 5, 0x39ff88);
    this.statusTxt = this.add
      .text(-20, 0, "SYNC", {
        fontFamily: FONT,
        fontSize: "13px",
        fontStyle: "700",
        color: "#ffffff",
        resolution: VIEW.Z,
      })
      .setOrigin(0, 0.5)
      .setLetterSpacing(2);
    this.status.add([this.statusG, this.statusDot, this.statusTxt]);
    this.buildHud(top);

    // tabs
    this.tabY = top + 124;
    this.tabs = [
      { key: "score", label: "SCORE", main: true },
      { key: "distance", label: "DISTANCE" },
    ].map((t, i) => {
      const x = W / 2 + (i - 0.5) * TAB_W;
      const g = this.add.graphics().setDepth(50);
      const txt = neonText(
        this,
        x,
        this.tabY,
        t.label,
        t.main ? 24 : 18,
        t.main ? GOLD : 0x3ef4ff,
        {
          blur: t.main ? 9 : 6,
        },
      ).setDepth(51);
      const zone = this.add
        .zone(x, this.tabY, TAB_W - 10, 64)
        .setInteractive({ useHandCursor: true })
        .setDepth(52);
      zone.on("pointerup", () => {
        if (this.tab !== t.key) {
          this.tab = t.key;
          this.refreshChrome();
          this.fetchBoard();
        }
      });
      return { ...t, x, g, txt };
    });

    // endless period filters
    this.filterY = top + 200;
    this.filters = [
      { key: "all", label: "ALL TIME" },
      { key: "week", label: "THIS WEEK" },
      { key: "today", label: "TODAY" },
    ].map((f, i) => {
      const x = W / 2 + (i - 1) * 210;
      const g = this.add.graphics().setDepth(50);
      const txt = plainText(
        this,
        x,
        this.filterY,
        f.label,
        17,
        "#ffffff",
      ).setDepth(51);
      const zone = this.add
        .zone(x, this.filterY, 196, 48)
        .setInteractive({ useHandCursor: true })
        .setDepth(52);
      zone.on("pointerup", () => {
        if (this.tab !== "daily" && this.period !== f.key) {
          this.period = f.key;
          this.refreshChrome();
          this.fetchBoard();
        }
      });
      return { ...f, x, g, txt, zone };
    });

    // list viewport
    this.listTop = top + 244;
    const sb = this.registry.get("safeBottom") || 0; // keep the pinned bar above the home indicator
    this.listBottom = H - 150 - sb;
    this.list = this.add.container(0, this.listTop).setDepth(10);
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG
      .fillStyle(0xffffff)
      .fillRect(0, this.listTop, W, this.listBottom - this.listTop);
    this.list.setMask(maskG.createGeometryMask());

    // pinned "you" bar
    this.youG = this.add.graphics().setDepth(40);
    hudPanel(this.youG, 24, H - 132 - sb, W - 48, 104, {
      glow: true,
      width: 3,
      cut: 20,
      fillAlpha: 0.95,
    });
    brackets(this.youG, 14, H - 142 - sb, W - 28, 124, 22, CYAN, 0.7, 3);
    // a little "YOU" tab on the panel's top edge
    hudPanel(this.youG, 44, H - 146 - sb, 84, 26, {
      fill: 0x0b2a3a,
      cut: 8,
      width: 2,
    });
    this.add
      .text(86, H - 133 - sb, "YOU", {
        fontFamily: FONT,
        fontSize: "13px",
        fontStyle: "700",
        color: "#3ef4ff",
        resolution: VIEW.Z,
      })
      .setOrigin(0.5)
      .setLetterSpacing(3)
      .setDepth(41);
    this.you = this.add.container(0, H - 80 - sb).setDepth(41);
    // REPORT A NAME (offensive usernames): hidden for you at once, reported to be removed
    this.reportBtn = button(this, W / 2 + 30, H - 133 - sb, 180, 40, "REPORT A NAME", {
      color: 0xbfb6e8,
      size: 13,
      onClick: () => this.openReport(),
    }).setDepth(42);

    // state overlay (loading / empty / error)
    this.stateBox = this.add
      .container(W / 2, (this.listTop + this.listBottom) / 2)
      .setDepth(30);
    this.spinner = this.add.graphics().setDepth(31);

    // drag scrolling with inertia
    this.input.on("pointerdown", (p) => {
      if (p.worldY < this.listTop || p.worldY > this.listBottom) return;
      this.drag = {
        y: p.worldY,
        start: this.scrollY,
        last: p.worldY,
        t: this.time.now,
      };
      this.vel = 0;
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag || !p.isDown) return;
      const dt = Math.max(1, this.time.now - this.drag.t);
      this.vel = ((p.worldY - this.drag.last) / dt) * 16;
      this.drag.last = p.worldY;
      this.drag.t = this.time.now;
      this.setScroll(this.drag.start - (p.worldY - this.drag.y));
    });
    this.input.on("pointerup", () => {
      this.drag = null;
    });
    this.input.on("wheel", (p, objs, dx, dy) =>
      this.setScroll(this.scrollY + dy),
    );

    this.refreshChrome();
    this.fetchBoard();
  }

  /** The high-tech layer: a faint HUD grid, scanlines, a slow scan sweep and corner brackets. */
  buildHud(top) {
    const W = this.W;
    const H = this.H;
    const grid = this.add.graphics().setDepth(1);
    grid.lineStyle(1, CYAN, 0.05);
    for (let x = 24; x < W; x += 48) grid.lineBetween(x, 0, x, H);
    for (let y = 24; y < H; y += 48) grid.lineBetween(0, y, W, y);
    grid.fillStyle(CYAN, 0.16);
    for (let x = 24; x < W; x += 96)
      for (let y = 24; y < H; y += 96) grid.fillRect(x - 1, y - 1, 3, 3);
    const scan = this.add.graphics().setDepth(60);
    scan.fillStyle(0x000000, 0.1);
    for (let y = 0; y < H; y += 4) scan.fillRect(0, y, W, 1);
    // the sweep: a soft cyan band that slides down the screen every few seconds
    this.sweep = this.add
      .graphics()
      .setDepth(59)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sweep
      .fillGradientStyle(CYAN, CYAN, CYAN, CYAN, 0, 0, 0.07, 0.07)
      .fillRect(0, 0, W, 120);
    this.sweep.fillStyle(CYAN, 0.12).fillRect(0, 119, W, 2);
    this.sweepT = 0;
    const frame = this.add.graphics().setDepth(50);
    brackets(
      frame,
      12,
      top - 8,
      W - 24,
      this.H - top - 4 - (this.registry.get("safeBottom") || 0),
      34,
      CYAN,
      0.55,
      3,
    );
    // header rule with ticks
    frame.lineStyle(1, CYAN, 0.35).lineBetween(24, top + 90, W - 24, top + 90);
    for (let x = 24; x <= W - 24; x += 48)
      frame.fillStyle(CYAN, 0.5).fillRect(x, top + 87, 2, 6);
  }

  /** Connection status chip: LIVE (green), SYNC (amber, blinking) or OFFLINE (red). */
  setStatus(kind) {
    const look = {
      live: ["LIVE", 0x39ff88],
      sync: ["SYNC", 0xffb020],
      offline: ["OFFLINE", 0xff4f7a],
    }[kind];
    this.statusKind = kind;
    this.statusTxt
      .setText(look[0])
      .setColor(Phaser.Display.Color.IntegerToColor(look[1]).rgba);
    this.statusDot.setFillStyle(look[1]);
    const w = this.statusTxt.width + 40;
    this.statusG.clear();
    hudPanel(this.statusG, -w + 26, -16, w + 12, 32, {
      color: look[1],
      fill: 0x050d18,
      cut: 8,
      width: 2,
    });
    this.statusDot.setX(-w + 40);
    this.statusTxt.setX(-w + 50);
  }

  refreshChrome() {
    for (const t of this.tabs) {
      const on = t.key === this.tab;
      const c = t.main ? GOLD : CYAN;
      t.g.clear();
      hudPanel(t.g, t.x - TAB_W / 2 + 5, this.tabY - 32, TAB_W - 10, 64, {
        color: on ? c : t.main ? 0x8a6a1a : STEEL,
        fill: on ? (t.main ? 0x2a1f04 : 0x0b2a3a) : 0x050d18,
        fillAlpha: 0.95,
        glow: on,
        width: on ? 3 : 2,
        cut: 16,
      });
      if (on) {
        // active tab: a lit underline with tick marks
        t.g.fillStyle(c, 0.9).fillRect(t.x - 44, this.tabY + 22, 88, 3);
        for (const dx of [-62, 54])
          t.g.fillStyle(c, 0.6).fillRect(t.x + dx, this.tabY + 22, 8, 3);
      }
      // the SCORE tab never fades as much: it's the main board
      t.txt.setAlpha(on ? 1 : t.main ? 0.8 : 0.55);
    }
    const showFilters = this.tab !== "daily";
    for (const f of this.filters) {
      const on = f.key === this.period;
      f.g.clear();
      if (showFilters)
        hudPanel(f.g, f.x - 98, this.filterY - 22, 196, 44, {
          color: on ? 0xd8a8ff : STEEL,
          fill: on ? 0x2a1050 : 0x050d18,
          fillAlpha: on ? 0.9 : 0.8,
          cut: 10,
          glow: on,
        });
      f.txt.setVisible(showFilters).setAlpha(on ? 1 : 0.6);
      f.zone.setVisible(showFilters);
      if (showFilters) f.zone.setInteractive();
      else f.zone.disableInteractive();
    }
  }

  get level() {
    if (this.tab === "daily") return Levels.daily();
    return this.tab === "distance" ? Levels.distance() : Levels.endless();
  }

  /** A board value as shown: metres on the distance board, points elsewhere (12,345). */
  fmt(v) {
    const n = Math.round(Number(v) || 0).toLocaleString("en-US");
    return this.tab === "distance" ? `${n} m` : n;
  }

  /** A small gold perk badge (a coin with a flame) next to heroes that have perks. */
  perkBadge(x, y) {
    const g = this.add.graphics({ x, y });
    g.fillStyle(0x1a0630, 1).fillCircle(0, 0, 11);
    g.fillStyle(0xffd23f, 1).fillCircle(0, 0, 8);
    g.fillStyle(0xff2a3d, 1).fillTriangle(-4, 4, 4, 4, 0, -6);
    g.fillStyle(0xffa21a, 1).fillTriangle(-2, 4, 2, 4, 0, -2);
    return g;
  }

  /**
   * A small cyan speed badge (two chevrons) on runs flown with a faster hero (SXE +25%,
   * WALLRUNNER +20%, RONIN +10%): their whole run moves quicker, so the board says so.
   */
  speedBadge(x, y) {
    const g = this.add.graphics({ x, y }).setName("speedBadge");
    g.fillStyle(0x1a0630, 1).fillCircle(0, 0, 11);
    g.fillStyle(0x3ef4ff, 1).fillCircle(0, 0, 8);
    g.fillStyle(0x0a2a4a, 1);
    for (const dx of [-4, 1]) g.fillTriangle(dx - 1, -5, dx - 1, 5, dx + 4, 0);
    return g;
  }

  /** Tap a hero icon: a little tooltip with the hero's name (Korean names use Galmuri). */
  heroTip(cont, icon, def) {
    // your own row's icon is a container (hero + cosmetics) with no size of its own: give it
    // an explicit hit box, or Phaser's input throws on every touch and the screen locks up
    const r = Math.max(30, (icon.displayHeight || 0) / 2 || 40);
    if (icon.type === "Container")
      icon.setInteractive(
        new Phaser.Geom.Rectangle(-r, -r, r * 2, r * 2),
        Phaser.Geom.Rectangle.Contains,
      );
    else icon.setInteractive();
    icon.on("pointerup", () => {
      cont.tip?.destroy();
      const fast =
        (def.speed ?? 1) > 1
          ? ` · +${Math.round((def.speed - 1) * 100)}% SPEED`
          : "";
      const t = neonText(
        this,
        icon.x,
        icon.y - r - 18,
        def.name + fast,
        22,
        def.color,
        {
          blur: 8,
        },
      );
      cont.add(t);
      cont.tip = t;
      this.tweens.add({
        targets: t,
        alpha: 0,
        delay: 1300,
        duration: 300,
        onComplete: () => t.destroy(),
      });
    });
  }

  async fetchBoard() {
    const id = ++this.reqId;
    this.stateBox.y = (this.listTop + this.listBottom) / 2;
    this.clearRows();
    this.showState("loading");
    this.setStatus("sync");
    this.renderYou(undefined);
    try {
      await Leaderboard.flush(); // make sure your latest best is up there first
      const res = await Leaderboard.board(
        this.level,
        this.tab === "daily" ? "all" : this.period,
      );
      if (id !== this.reqId || !this.sys.isActive()) return;
      this.setStatus("live");
      this.showState(res.rows.length ? null : "empty");
      // the (empty) podium fills the top, so the invitation sits under it
      this.stateBox.y = res.rows.length
        ? (this.listTop + this.listBottom) / 2
        : Math.min(this.listBottom - 80, this.listTop + PODIUM_H + 70);
      this.rows = res.rows;
      this.userId = res.userId;
      this.renderRows(res.rows, res.userId);
      this.renderYou(res.me);
    } catch (err) {
      if (id !== this.reqId || !this.sys.isActive()) return;
      this.setStatus("offline");
      this.showState("error", err.message);
      this.renderYou(null, true);
    }
  }

  clearRows() {
    for (const o of this.rowObjs) o.destroy();
    this.rowObjs.length = 0;
    this.list.removeAll(true);
    this.podium = null;
    this.scrollY = 0;
    this.list.y = this.listTop;
  }

  showState(kind, msg) {
    this.state = kind;
    this.stateBox.removeAll(true);
    this.spinner.clear();
    const W = this.W;
    if (kind === "loading") {
      this.stateBox.add(
        plainText(this, 0, 86, "SYNCING WITH THE NETWORK…", 18, "#9fe8f7", {
          font: FONT,
        }),
      );
    } else if (kind === "empty") {
      this.stateBox.add(
        neonText(this, 0, -20, "BE THE FIRST!", 40, 0xffd23f, { blur: 14 }),
      );
      this.stateBox.add(
        plainText(
          this,
          0,
          36,
          "No scores on this board yet — set the record.",
          19,
          "#cfc6ff",
        ),
      );
    } else if (kind === "error") {
      this.stateBox.add(
        neonText(this, 0, -60, "SIGNAL LOST", 34, 0xff4f7a, { blur: 10 }),
      );
      this.stateBox.add(
        plainText(
          this,
          0,
          -10,
          msg || "Couldn't reach the leaderboard.",
          19,
          "#e8e0ff",
          {
            wrap: W - 140,
          },
        ),
      );
      this.stateBox.add(
        plainText(
          this,
          0,
          24,
          "Your scores are saved and will upload automatically.",
          17,
          "#9c90c8",
          { wrap: W - 140 },
        ),
      );
      const retry = button(this, 0, 100, 240, 72, "RETRY", {
        color: 0x39ff88,
        size: 22,
        onClick: () => this.fetchBoard(),
      });
      this.stateBox.add(retry);
    }
  }

  /** The top 5 on a lit podium; empty places invite you to take them. */
  renderPodium(rows, userId) {
    const W = this.W;
    const colW = (W - 40) / 5;
    const base = PODIUM_BASE;
    const objs = [];
    this.podium = { cols: [], rays: null, crown: null, t: 0 };
    const add = (o) => {
      objs.push(o);
      return o;
    };

    const head =
      this.tab === "distance"
        ? "FARTHEST · TOP 5"
        : this.tab === "daily"
          ? "TODAY'S TOP 5"
          : "TOP SCORES · WORLD TOP 5";
    add(neonText(this, W / 2, 26, head, 30, 0xffd23f, { blur: 12 }));
    add(
      brackets(
        this.add.graphics(),
        W / 2 - 230,
        4,
        460,
        46,
        14,
        0xffd23f,
        0.7,
        2,
      ),
    );
    // spotlight rays behind #1 (rotated in update)
    const cx1 = 20 + colW * 2.5;
    const rays = add(this.add.graphics({ x: cx1, y: base - 210 - 110 }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.fillStyle(0xffd23f, i % 2 ? 0.07 : 0.13);
      rays.slice(0, 0, 330, a, a + 0.18, false).fillPath();
    }
    this.podium.rays = rays;
    // holographic floor: a lit edge and a perspective grid running out towards the viewer
    const floor = add(this.add.graphics());
    floor.fillStyle(CYAN, 0.35).fillRect(20, base, W - 40, 3);
    for (let i = 0; i <= 10; i++) {
      const x = 20 + ((W - 40) * i) / 10;
      floor
        .lineStyle(1, CYAN, 0.16)
        .lineBetween(x, base, W / 2 + (x - W / 2) * 1.6, base + 40);
    }
    for (const [dy, a] of [
      [12, 0.14],
      [26, 0.1],
      [40, 0.06],
    ])
      floor
        .lineStyle(1, CYAN, a)
        .lineBetween(20 - dy * 0.6, base + dy, W - 20 + dy * 0.6, base + dy);

    for (const spec of PODIUM) {
      const r = rows[spec.rank - 1];
      const mine = !!r && r.player_id === userId;
      const cx = 20 + colW * (spec.col + 0.5);
      const top = base - spec.h;
      const col = this.add.container(0, 0);
      add(col);
      // the step: a hologram block (scanlines inside, cut top corners, lit top edge)
      const g = this.add.graphics();
      const sx = cx - colW / 2 + 5;
      const sw = colW - 10;
      const step = [
        { x: sx + 12, y: top },
        { x: sx + sw - 12, y: top },
        { x: sx + sw, y: top + 12 },
        { x: sx + sw, y: top + spec.h },
        { x: sx, y: top + spec.h },
        { x: sx, y: top + 12 },
      ];
      g.fillStyle(0x050d18, 0.95).fillPoints(step, true);
      g.fillStyle(spec.color, 0.12).fillPoints(step, true);
      for (let yy = top + 14; yy < top + spec.h; yy += 7)
        g.fillStyle(spec.color, 0.07).fillRect(sx + 3, yy, sw - 6, 2);
      g.lineStyle(2, spec.color, r ? 1 : 0.35).strokePoints(step, true);
      g.fillStyle(spec.color, r ? 0.9 : 0.3).fillRect(
        sx + 14,
        top + 3,
        sw - 28,
        3,
      );
      col.add(g);
      // big rank number on the step face
      col.add(
        neonText(
          this,
          cx,
          top + Math.min(spec.h / 2, 58),
          `${spec.rank}`,
          spec.rank === 1 ? 60 : 40,
          spec.color,
          {
            blur: 12,
          },
        ),
      );
      if (!r) {
        col.add(plainText(this, cx, top - 70, "?", 52, "#4a4070"));
        col.add(plainText(this, cx, top - 22, "YOUR SPOT?", 15, "#7a70a8"));
        this.podium.cols.push({ col, hero: null, spec, cx, top });
        continue;
      }
      const fit = (t, maxW) =>
        t.setScale(Math.min(1, maxW / Math.max(1, t.width)));
      const score = neonText(
        this,
        cx,
        top - 24,
        this.fmt(r.score),
        spec.rank === 1 ? 30 : 24,
        spec.color,
        {
          blur: 8,
        },
      );
      fit(score, colW - 6);
      // Drift Pass+: the animated gold name and the forever Season 1 badge
      const fl = flairOf(r);
      const name = nameText(this, cx, top - 72, r.username, {
        size: spec.rank === 1 ? 21 : 18,
        ox: 0.5,
        color: mine ? "#3ef4ff" : "#ffffff",
        gold: fl.gold,
        badge: fl.s1,
        font: NUM_FONT,
      });
      name.setScale(
        Math.min(1, (colW - 6) / Math.max(1, name.getBounds().width)),
      );
      const ttl = titleText(this, cx, top - 52, r.title, { size: 11 });
      if (ttl.list.length)
        ttl.setScale(
          Math.min(1, (colW - 6) / Math.max(1, ttl.getBounds().width)),
        );
      col.add(ttl);
      const def = getCharacter(r.character);
      const heroY = top - 72 - 26 - 70 * spec.scale;
      // your own place wears your shop cosmetics (other players' aren't stored online)
      const hero = mine
        ? heroImage(this, cx, heroY, def.id, spec.scale / HI)
        : this.add
            .image(cx, heroY, def.texture)
            .setScale((spec.scale / HI) * PORTRAIT_K);
      const disc = this.add.graphics();
      disc
        .fillStyle(spec.color, 0.16)
        .fillEllipse(cx, heroY + 58 * spec.scale, 96 * spec.scale + 20, 16);
      disc
        .lineStyle(2, spec.color, 0.55)
        .strokeEllipse(cx, heroY + 58 * spec.scale, 96 * spec.scale + 20, 16);
      col.add([disc, score, name, hero]);
      if (hasCoinPerks(def))
        col.add(
          this.perkBadge(cx + 34 * spec.scale + 14, heroY + 24 * spec.scale),
        );
      if ((def.speed ?? 1) > 1)
        col.add(
          this.speedBadge(cx + 34 * spec.scale + 14, heroY - 24 * spec.scale),
        );
      this.heroTip(col, hero, def);
      if (mine) {
        const tag = neonText(
          this,
          cx,
          heroY - 70 * spec.scale - 16,
          "YOU",
          16,
          0x3ef4ff,
          {
            blur: 6,
          },
        );
        col.add(tag);
      }
      if (spec.rank === 1) {
        // crown + title over the champion
        const cy = heroY - 70 * spec.scale - (mine ? 44 : 22);
        const crown = this.add.graphics({ x: cx, y: cy });
        crown.fillStyle(0xffd23f, 1);
        crown.fillPoints(
          [
            { x: -30, y: 14 },
            { x: -30, y: -8 },
            { x: -16, y: 4 },
            { x: 0, y: -18 },
            { x: 16, y: 4 },
            { x: 30, y: -8 },
            { x: 30, y: 14 },
          ],
          true,
        );
        crown.fillStyle(0xff4f7a, 1).fillCircle(0, 4, 5);
        crown.fillStyle(0x3ef4ff, 1).fillCircle(-18, 8, 3).fillCircle(18, 8, 3);
        crown.lineStyle(2, 0x7a4a00, 1).strokePoints(
          [
            { x: -30, y: 14 },
            { x: -30, y: -8 },
            { x: -16, y: 4 },
            { x: 0, y: -18 },
            { x: 16, y: 4 },
            { x: 30, y: -8 },
            { x: 30, y: 14 },
          ],
          true,
        );
        col.add(crown);
        this.podium.crown = crown;
        col.add(
          neonText(this, cx, top + spec.h - 26, "WORLD #1", 15, 0xffd23f, {
            blur: 6,
          }),
        );
      }
      this.podium.cols.push({ col, hero, spec, cx, top, heroY });
    }
    for (const o of objs) this.list.add(o);

    // entrance: 5 → 4 → 3 → 2 rise up, then the champion lands with a flash
    const order = [5, 4, 3, 2, 1];
    this.podium.cols.forEach((c) => {
      const i = order.indexOf(c.spec.rank);
      c.col.y = 260;
      c.col.alpha = 0;
      this.tweens.add({
        targets: c.col,
        y: 0,
        alpha: 1,
        delay: 120 + i * 150,
        duration: c.spec.rank === 1 ? 520 : 380,
        ease: c.spec.rank === 1 ? "Back.easeOut" : "Cubic.easeOut",
        onStart: () => (c.spec.rank === 1 ? null : Sfx.tick()),
        onComplete: () => {
          if (c.spec.rank !== 1 || !rows[0]) return;
          Sfx.reveal();
          // a soft golden glow over the screen (dimmer with Reduce Flashing), and a bump
          const glow = this.add
            .rectangle(
              this.W / 2,
              this.H / 2,
              this.W,
              this.H,
              0xffd23f,
              reduceFlashing() ? 0.1 : 0.28,
            )
            .setDepth(34)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: glow,
            alpha: 0,
            duration: 450,
            ease: "Cubic.easeOut",
            onComplete: () => glow.destroy(),
          });
          this.cameras.main.shake(180, 0.004);
          this.burstAt(c.cx, (c.heroY ?? c.top) + this.list.y);
        },
      });
    });
    return PODIUM_H;
  }

  /** Little gold confetti burst (screen space) for the champion's arrival. */
  burstAt(x, y) {
    for (let i = 0; i < 26; i++) {
      const p = this.add
        .rectangle(x, y, 8, 8, [0xffd23f, 0xffffff, 0xff4fd8, 0x3ef4ff][i % 4])
        .setDepth(35);
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 170;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d + 120,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 900 + Math.random() * 500,
        ease: "Cubic.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }

  renderRows(rows, userId) {
    const W = this.W;
    const topScore = rows[0]?.score || 1;
    const offset = this.renderPodium(rows, userId);
    rows.slice(5).forEach((r, k) => {
      const i = k + 5;
      const y = offset + k * ROW_H + ROW_H / 2 + 6;
      const rank = i + 1;
      const mine = r.player_id === userId;
      const medal = rank <= 3 ? MEDALS[rank - 1] : null;
      const g = this.add.graphics();
      // a HUD readout row: cut corners, a lit accent bar and a score bar against #1
      const accent = medal || (mine ? CYAN : 0x6a5aa8);
      hudPanel(g, 24, y - ROW_H / 2 + 4, W - 48, ROW_H - 8, {
        color: mine ? CYAN : STEEL,
        fill: mine ? 0x0b2a3a : 0x050d18,
        fillAlpha: mine ? 0.92 : 0.72,
        alpha: mine ? 1 : 0.55,
        width: mine ? 2 : 1,
        cut: 12,
      });
      g.fillStyle(accent, 0.9).fillRect(30, y - ROW_H / 2 + 14, 4, ROW_H - 28);
      const share = Math.max(
        0.04,
        Math.min(1, r.score / Math.max(1, topScore)),
      );
      g.fillStyle(CYAN, 0.1).fillRect(182, y + 23, W - 374, 3);
      g.fillStyle(mine ? CYAN : 0x7fbfdf, mine ? 0.8 : 0.45).fillRect(
        182,
        y + 23,
        (W - 374) * share,
        3,
      );
      const rankTxt = plainText(
        this,
        74,
        y,
        `#${String(rank).padStart(3, "0")}`,
        17,
        mine ? "#3ef4ff" : "#7fbfdf",
        {
          font: FONT,
        },
      );
      const def = getCharacter(r.character);
      const icon = mine
        ? heroImage(this, 142, y, def.id, 0.36 / HI)
        : this.add
            .image(142, y, def.texture)
            .setScale((0.36 / HI) * PORTRAIT_K);
      const fl = flairOf(r);
      const name = nameText(this, 182, y - 12, r.username, {
        size: 24,
        color: mine ? "#3ef4ff" : "#ffffff",
        gold: fl.gold,
        badge: fl.s1,
        font: NUM_FONT,
      });
      this.list.add(titleText(this, 183, y + 10, r.title, { size: 12, ox: 0 }));
      const score = plainText(
        this,
        W - 48,
        y,
        this.fmt(r.score),
        22,
        mine ? "#3ef4ff" : "#e8f8ff",
        {
          ox: 1,
          font: FONT,
        },
      );
      this.list.add([g, rankTxt, icon, name, score]);
      if (hasCoinPerks(def)) this.list.add(this.perkBadge(164, y + 16));
      if ((def.speed ?? 1) > 1) this.list.add(this.speedBadge(164, y - 16));
      this.heroTip(this.list, icon, def);
    });
    this.contentH = offset + Math.max(0, rows.length - 5) * ROW_H + 12;
  }

  async openReport() {
    if (this.reporting) return;
    this.reporting = true;
    try {
      const { changed } = await openReport(this.rows || [], this.userId);
      if (changed && this.sys.isActive()) this.fetchBoard();
    } finally {
      this.reporting = false;
    }
  }

  renderYou(me, offline = false) {
    this.you.removeAll(true);
    const W = this.W;
    const name = Leaderboard.username || "YOU";
    if (me === undefined) {
      this.you.add(
        plainText(this, W / 2, 0, "Finding your rank…", 20, "#bfb6e8"),
      );
      return;
    }
    if (!me) {
      const msg = offline
        ? "Your rank shows up when you're back online"
        : this.tab !== "daily" && this.period !== "all"
          ? `No best run ${this.period === "week" ? "this week" : "today"} yet — go fly!`
          : "Not ranked yet — finish a run to get on the board";
      this.you.add(plainText(this, 56, -16, name, 22, "#3ef4ff", { ox: 0 }));
      this.you.add(plainText(this, 56, 16, msg, 17, "#cfc6ff", { ox: 0 }));
      return;
    }
    const def = getCharacter(me.character);
    this.you.add(
      neonText(this, 80, 0, `#${me.rank}`, 30, 0x3ef4ff, { blur: 8 }),
    );
    this.you.add(heroImage(this, 150, 0, def.id, 0.4 / HI));
    if ((def.speed ?? 1) > 1) this.you.add(this.speedBadge(172, -18));
    if (hasCoinPerks(def)) this.you.add(this.perkBadge(172, 18)); // (your own row too)
    const fl = flairOf({ flair: myFlair() });
    this.you.add(
      nameText(this, 192, -14, name, {
        size: 24,
        gold: fl.gold,
        badge: fl.s1,
        font: NUM_FONT,
      }),
    );
    this.you.add(
      titleText(this, 193, 8, Titles.equippedId(), { size: 12, ox: 0 }),
    );
    this.you.add(
      // the label sits above the number, so the title can go under your name
      plainText(
        this,
        W - 56,
        -28,
        this.tab === "distance" ? "YOUR FARTHEST" : "YOUR BEST",
        12,
        "#9c90c8",
        { ox: 1 },
      ),
    );
    this.you.add(
      neonText(this, W - 56, 6, this.fmt(me.score), 28, 0x3ef4ff, {
        ox: 1,
        blur: 8,
      }),
    );
    // the chase: how far to the next place up (or "defend it" at #1)
    const chase = this.chaseLine(me);
    if (chase)
      this.you.add(
        plainText(this, W - 56, 36, chase, 14, "#ffd23f", { ox: 1 }),
      );
  }

  /** "+1,240 to pass ALEX (#11)" / "+300 to reach the top 100" / "You're #1 · defend it!" */
  chaseLine(me) {
    if (me.rank === 1) return "You're #1 · defend it!";
    const rows = this.rows || [];
    const above = rows[me.rank - 2];
    if (above && above.score > me.score)
      return `+${this.fmt(above.score - me.score + 1)} to pass ${above.username} (#${me.rank - 1})`;
    const last = rows[rows.length - 1];
    if (
      me.rank > rows.length &&
      last &&
      rows.length >= 100 &&
      last.score >= me.score
    )
      return `+${this.fmt(last.score - me.score + 1)} to reach the top 100`;
    return null;
  }

  setScroll(v) {
    const maxScroll = Math.max(
      0,
      (this.contentH || 0) - (this.listBottom - this.listTop),
    );
    this.scrollY = Phaser.Math.Clamp(v, 0, maxScroll);
    this.list.y = this.listTop - this.scrollY;
  }

  leave() {
    fadeTo(this, this.returnTo || "Menu", undefined, {
      ms: 160,
      rgb: [2, 1, 7],
    });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.drive(this.pal, { scroll: 60, dim: 0.65, scenery: false });
    // the scan sweep (a slow band down the screen) and the status light
    this.sweepT = (this.sweepT + dt * 160) % (this.H + 400);
    this.sweep.y = this.sweepT - 200;
    const blink = this.statusKind === "sync" ? Math.floor(time / 400) % 2 : 1;
    this.statusDot.setAlpha(blink ? 1 : 0.25);
    if (!this.drag && Math.abs(this.vel) > 0.1) {
      this.setScroll(this.scrollY - this.vel);
      this.vel *= Math.exp(-dt * 5);
    }
    if (this.podium) {
      const P = this.podium;
      P.t += dt;
      P.rays?.setRotation(P.t * 0.25);
      for (const c of P.cols) {
        if (!c.hero) continue;
        const k = c.spec.rank === 1 ? 7 : 4;
        c.hero.y = c.heroY + Math.sin(P.t * 2.2 + c.spec.col) * k;
      }
      if (P.crown) P.crown.setAngle(Math.sin(P.t * 1.6) * 6);
    }
    if (this.state === "loading") {
      // radar: rings, crosshair and a rotating sweep
      const cx = this.W / 2;
      const cy = (this.listTop + this.listBottom) / 2;
      const a = time / 450;
      const sp = this.spinner.clear();
      sp.lineStyle(2, CYAN, 0.35).strokeCircle(cx, cy, 52);
      sp.lineStyle(1, CYAN, 0.25)
        .strokeCircle(cx, cy, 34)
        .strokeCircle(cx, cy, 16);
      sp.lineStyle(1, CYAN, 0.25)
        .lineBetween(cx - 60, cy, cx + 60, cy)
        .lineBetween(cx, cy - 60, cx, cy + 60);
      sp.fillStyle(CYAN, 0.22)
        .slice(cx, cy, 52, a - 0.9, a, false)
        .fillPath();
      sp.lineStyle(2, CYAN, 0.9).lineBetween(
        cx,
        cy,
        cx + Math.cos(a) * 52,
        cy + Math.sin(a) * 52,
      );
    }
  }
}
