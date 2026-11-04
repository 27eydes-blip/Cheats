// Worldwide leaderboard: Endless (All Time / This Week / Today) and today's Daily Challenge.
// Top 100 with medals for the top 3, the player's own row pinned at the bottom with their
// real rank (even outside the top 100), plus loading / empty / offline states.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { heroImage } from "../ui/heroImage.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import { Leaderboard, Levels } from "../online/leaderboard.js";
import { dailyNumber } from "../data/rng.js";
import { Sfx } from "../audio/sfx.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { button, drawNeonRect, fadeTo, neonText, plainText } from "../ui/ui.js";

const MEDALS = [0xffd23f, 0xdfe8f5, 0xd8894a];
const ROW_H = 68;

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
    this.tab = data?.tab === "daily" ? "daily" : "endless";
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
    neonText(this, W / 2 + 50, top + 46, "LEADERBOARD", 32, 0x3ef4ff, { blur: 10 }).setDepth(50);

    // tabs
    this.tabY = top + 124;
    this.tabs = [
      { key: "endless", label: "ENDLESS" },
      { key: "daily", label: `DAILY #${dailyNumber()}` },
    ].map((t, i) => {
      const x = W / 2 + (i - 0.5) * 300;
      const g = this.add.graphics().setDepth(50);
      const txt = neonText(this, x, this.tabY, t.label, 20, 0x3ef4ff, { blur: 6 }).setDepth(51);
      const zone = this.add
        .zone(x, this.tabY, 290, 64)
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
      const txt = plainText(this, x, this.filterY, f.label, 17, "#ffffff").setDepth(51);
      const zone = this.add
        .zone(x, this.filterY, 196, 48)
        .setInteractive({ useHandCursor: true })
        .setDepth(52);
      zone.on("pointerup", () => {
        if (this.tab === "endless" && this.period !== f.key) {
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
    maskG.fillStyle(0xffffff).fillRect(0, this.listTop, W, this.listBottom - this.listTop);
    this.list.setMask(maskG.createGeometryMask());

    // pinned "you" bar
    this.youG = this.add.graphics().setDepth(40);
    drawNeonRect(this.youG, 24, H - 132 - sb, W - 48, 104, 22, 0x3ef4ff, { fillAlpha: 0.95 });
    this.you = this.add.container(0, H - 80 - sb).setDepth(41);

    // state overlay (loading / empty / error)
    this.stateBox = this.add.container(W / 2, (this.listTop + this.listBottom) / 2).setDepth(30);
    this.spinner = this.add.graphics().setDepth(31);

    // drag scrolling with inertia
    this.input.on("pointerdown", (p) => {
      if (p.worldY < this.listTop || p.worldY > this.listBottom) return;
      this.drag = { y: p.worldY, start: this.scrollY, last: p.worldY, t: this.time.now };
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
    this.input.on("wheel", (p, objs, dx, dy) => this.setScroll(this.scrollY + dy));

    this.refreshChrome();
    this.fetchBoard();
  }

  refreshChrome() {
    for (const t of this.tabs) {
      const on = t.key === this.tab;
      t.g.clear();
      drawNeonRect(t.g, t.x - 145, this.tabY - 32, 290, 64, 18, on ? 0x3ef4ff : 0x4a4070, {
        fill: on ? 0x0d2a36 : 0x0a0418,
        fillAlpha: 0.95,
        glow: on,
        width: on ? 3 : 2,
      });
      t.txt.setAlpha(on ? 1 : 0.55);
    }
    const showFilters = this.tab === "endless";
    for (const f of this.filters) {
      const on = f.key === this.period;
      f.g.clear();
      if (showFilters) {
        f.g
          .fillStyle(on ? 0xb45cff : 0x0a0418, on ? 0.35 : 0.8)
          .fillRoundedRect(f.x - 98, this.filterY - 22, 196, 44, 22);
        f.g
          .lineStyle(2, on ? 0xd8a8ff : 0x4a4070, 1)
          .strokeRoundedRect(f.x - 98, this.filterY - 22, 196, 44, 22);
      }
      f.txt.setVisible(showFilters).setAlpha(on ? 1 : 0.6);
      f.zone.setVisible(showFilters);
      if (showFilters) f.zone.setInteractive();
      else f.zone.disableInteractive();
    }
  }

  get level() {
    return this.tab === "daily" ? Levels.daily() : Levels.endless();
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
      const t = neonText(this, icon.x, icon.y - r - 18, def.name, 22, def.color, {
        blur: 8,
      });
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
    this.renderYou(undefined);
    try {
      await Leaderboard.flush(); // make sure your latest best is up there first
      const res = await Leaderboard.board(this.level, this.tab === "daily" ? "all" : this.period);
      if (id !== this.reqId || !this.sys.isActive()) return;
      this.showState(res.rows.length ? null : "empty");
      // the (empty) podium fills the top, so the invitation sits under it
      this.stateBox.y = res.rows.length
        ? (this.listTop + this.listBottom) / 2
        : Math.min(this.listBottom - 80, this.listTop + PODIUM_H + 70);
      this.renderRows(res.rows, res.userId);
      this.renderYou(res.me);
    } catch (err) {
      if (id !== this.reqId || !this.sys.isActive()) return;
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
      this.stateBox.add(plainText(this, 0, 70, "Loading…", 22, "#bfb6e8"));
    } else if (kind === "empty") {
      this.stateBox.add(neonText(this, 0, -20, "BE THE FIRST!", 40, 0xffd23f, { blur: 14 }));
      this.stateBox.add(
        plainText(this, 0, 36, "No scores on this board yet — set the record.", 19, "#cfc6ff"),
      );
    } else if (kind === "error") {
      this.stateBox.add(neonText(this, 0, -60, "OFFLINE", 34, 0xff4f7a, { blur: 10 }));
      this.stateBox.add(
        plainText(this, 0, -10, msg || "Couldn't reach the leaderboard.", 19, "#e8e0ff", {
          wrap: W - 140,
        }),
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

    add(neonText(this, W / 2, 26, "WORLD TOP 5", 30, 0xffd23f, { blur: 12 }));
    // spotlight rays behind #1 (rotated in update)
    const cx1 = 20 + colW * 2.5;
    const rays = add(this.add.graphics({ x: cx1, y: base - 210 - 110 }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.fillStyle(0xffd23f, i % 2 ? 0.07 : 0.13);
      rays.slice(0, 0, 330, a, a + 0.18, false).fillPath();
    }
    this.podium.rays = rays;
    // floor glow line
    const floor = add(this.add.graphics());
    floor.fillStyle(0x3ef4ff, 0.18).fillRect(20, base, W - 40, 4);

    for (const spec of PODIUM) {
      const r = rows[spec.rank - 1];
      const mine = !!r && r.player_id === userId;
      const cx = 20 + colW * (spec.col + 0.5);
      const top = base - spec.h;
      const col = this.add.container(0, 0);
      add(col);
      // the step: dark block with a neon rim and a bright top edge
      const g = this.add.graphics();
      g.fillStyle(0x0a0418, 0.95).fillRoundedRect(cx - colW / 2 + 5, top, colW - 10, spec.h, {
        tl: 12,
        tr: 12,
        bl: 0,
        br: 0,
      });
      g.fillStyle(spec.color, 0.16).fillRoundedRect(cx - colW / 2 + 5, top, colW - 10, spec.h, {
        tl: 12,
        tr: 12,
        bl: 0,
        br: 0,
      });
      g.lineStyle(3, spec.color, r ? 1 : 0.35).strokeRoundedRect(
        cx - colW / 2 + 5,
        top,
        colW - 10,
        spec.h,
        { tl: 12, tr: 12, bl: 0, br: 0 },
      );
      g.fillStyle(spec.color, r ? 0.9 : 0.3).fillRect(cx - colW / 2 + 12, top + 3, colW - 24, 4);
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
      const fit = (t, maxW) => t.setScale(Math.min(1, maxW / Math.max(1, t.width)));
      const score = neonText(
        this,
        cx,
        top - 24,
        `${r.score}`,
        spec.rank === 1 ? 30 : 24,
        spec.color,
        {
          blur: 8,
        },
      );
      fit(score, colW - 6);
      const name = plainText(
        this,
        cx,
        top - 58,
        r.username,
        spec.rank === 1 ? 21 : 18,
        mine ? "#3ef4ff" : "#ffffff",
      );
      fit(name, colW - 6);
      const def = getCharacter(r.character);
      const heroY = top - 58 - 26 - 70 * spec.scale;
      // your own place wears your shop cosmetics (other players' aren't stored online)
      const hero = mine
        ? heroImage(this, cx, heroY, def.id, spec.scale / HI)
        : this.add.image(cx, heroY, def.texture).setScale((spec.scale / HI) * PORTRAIT_K);
      col.add([score, name, hero]);
      if (def.perks) col.add(this.perkBadge(cx + 34 * spec.scale + 14, heroY + 24 * spec.scale));
      this.heroTip(col, hero, def);
      if (mine) {
        const tag = neonText(this, cx, heroY - 70 * spec.scale - 16, "YOU", 16, 0x3ef4ff, {
          blur: 6,
        });
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
        col.add(neonText(this, cx, top + spec.h - 26, "WORLD #1", 15, 0xffd23f, { blur: 6 }));
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
    const offset = this.renderPodium(rows, userId);
    rows.slice(5).forEach((r, k) => {
      const i = k + 5;
      const y = offset + k * ROW_H + ROW_H / 2 + 6;
      const rank = i + 1;
      const mine = r.player_id === userId;
      const medal = rank <= 3 ? MEDALS[rank - 1] : null;
      const g = this.add.graphics();
      if (medal) {
        drawNeonRect(g, 24, y - ROW_H / 2 + 4, W - 48, ROW_H - 8, 16, medal, {
          fillAlpha: 0.5,
          width: 2,
        });
      } else {
        g.fillStyle(mine ? 0x0d2a36 : 0x0a0418, mine ? 0.9 : 0.6).fillRoundedRect(
          24,
          y - ROW_H / 2 + 4,
          W - 48,
          ROW_H - 8,
          14,
        );
        if (mine)
          g.lineStyle(2, 0x3ef4ff, 1).strokeRoundedRect(
            24,
            y - ROW_H / 2 + 4,
            W - 48,
            ROW_H - 8,
            14,
          );
      }
      if (medal) {
        // glowing medal disc
        g.fillStyle(medal, 0.25).fillCircle(72, y, 26);
        g.fillStyle(medal, 1).fillCircle(72, y, 19);
      }
      const rankTxt = medal
        ? plainText(this, 72, y, `${rank}`, 22, "#140a00")
        : plainText(this, 72, y, `${rank}`, 22, mine ? "#3ef4ff" : "#a99fd6");
      const def = getCharacter(r.character);
      const icon = mine
        ? heroImage(this, 128, y, def.id, 0.36 / HI)
        : this.add.image(128, y, def.texture).setScale((0.36 / HI) * PORTRAIT_K);
      const name = plainText(this, 168, y, r.username, 24, mine ? "#3ef4ff" : "#ffffff", { ox: 0 });
      const score = medal
        ? neonText(this, W - 48, y, `${r.score}`, 26, medal, { ox: 1, blur: 8 })
        : plainText(this, W - 48, y, `${r.score}`, 24, mine ? "#3ef4ff" : "#ffffff", { ox: 1 });
      this.list.add([g, rankTxt, icon, name, score]);
      if (def.perks) this.list.add(this.perkBadge(150, y + 16));
      this.heroTip(this.list, icon, def);
    });
    this.contentH = offset + Math.max(0, rows.length - 5) * ROW_H + 12;
  }

  renderYou(me, offline = false) {
    this.you.removeAll(true);
    const W = this.W;
    const name = Leaderboard.username || "YOU";
    if (me === undefined) {
      this.you.add(plainText(this, W / 2, 0, "Finding your rank…", 20, "#bfb6e8"));
      return;
    }
    if (!me) {
      const msg = offline
        ? "Your rank shows up when you're back online"
        : this.tab === "endless" && this.period !== "all"
          ? `No best run ${this.period === "week" ? "this week" : "today"} yet — go fly!`
          : "Not ranked yet — finish a run to get on the board";
      this.you.add(plainText(this, 56, -16, name, 22, "#3ef4ff", { ox: 0 }));
      this.you.add(plainText(this, 56, 16, msg, 17, "#cfc6ff", { ox: 0 }));
      return;
    }
    const def = getCharacter(me.character);
    this.you.add(neonText(this, 80, 0, `#${me.rank}`, 30, 0x3ef4ff, { blur: 8 }));
    this.you.add(heroImage(this, 150, 0, def.id, 0.4 / HI));
    this.you.add(plainText(this, 192, -12, name, 24, "#ffffff", { ox: 0 }));
    this.you.add(plainText(this, 192, 16, "YOUR BEST", 14, "#9c90c8", { ox: 0 }));
    this.you.add(neonText(this, W - 56, 0, `${me.score}`, 28, 0x3ef4ff, { ox: 1, blur: 8 }));
  }

  setScroll(v) {
    const maxScroll = Math.max(0, (this.contentH || 0) - (this.listBottom - this.listTop));
    this.scrollY = Phaser.Math.Clamp(v, 0, maxScroll);
    this.list.y = this.listTop - this.scrollY;
  }

  leave() {
    fadeTo(this, this.returnTo || "Menu", undefined, { ms: 160, rgb: [2, 1, 7] });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.drive(this.pal, { scroll: 60, dim: 0.65, scenery: false });
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
      const cx = this.W / 2;
      const cy = (this.listTop + this.listBottom) / 2;
      const a = time / 300;
      this.spinner.clear();
      this.spinner.lineStyle(6, 0x3ef4ff, 0.25).strokeCircle(cx, cy, 34);
      this.spinner
        .lineStyle(6, 0x3ef4ff, 1)
        .beginPath()
        .arc(cx, cy, 34, a, a + 1.6)
        .strokePath();
    }
  }
}
