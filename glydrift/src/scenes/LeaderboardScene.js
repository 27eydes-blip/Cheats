// Worldwide leaderboard: Endless (All Time / This Week / Today) and today's Daily Challenge.
// Top 100 with medals for the top 3, the player's own row pinned at the bottom with their
// real rank (even outside the top 100), plus loading / empty / offline states.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import { Leaderboard, Levels } from "../online/leaderboard.js";
import { dailyNumber } from "../data/rng.js";
import { button, drawNeonRect, neonText, plainText } from "../ui/ui.js";

const MEDALS = [0xffd23f, 0xdfe8f5, 0xd8894a];
const ROW_H = 68;

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
    this.reqId = 0;
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

  async fetchBoard() {
    const id = ++this.reqId;
    this.clearRows();
    this.showState("loading");
    this.renderYou(undefined);
    try {
      await Leaderboard.flush(); // make sure your latest best is up there first
      const res = await Leaderboard.board(this.level, this.tab === "daily" ? "all" : this.period);
      if (id !== this.reqId || !this.sys.isActive()) return;
      this.showState(res.rows.length ? null : "empty");
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

  renderRows(rows, userId) {
    const W = this.W;
    rows.forEach((r, i) => {
      const y = i * ROW_H + ROW_H / 2 + 6;
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
      const icon = this.add.image(128, y, def.texture).setScale(0.36 / HI);
      const name = plainText(this, 168, y, r.username, 24, mine ? "#3ef4ff" : "#ffffff", { ox: 0 });
      const score = medal
        ? neonText(this, W - 48, y, `${r.score}`, 26, medal, { ox: 1, blur: 8 })
        : plainText(this, W - 48, y, `${r.score}`, 24, mine ? "#3ef4ff" : "#ffffff", { ox: 1 });
      this.list.add([g, rankTxt, icon, name, score]);
    });
    this.contentH = rows.length * ROW_H + 12;
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
    this.you.add(this.add.image(150, 0, def.texture).setScale(0.4 / HI));
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
    this.cameras.main.fadeOut(160, 2, 1, 7);
    this.time.delayedCall(160, () =>
      this.scene.start(this.returnTo === "Menu" ? "Menu" : this.returnTo),
    );
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.drive(this.pal, { scroll: 60, dim: 0.65, scenery: false });
    if (!this.drag && Math.abs(this.vel) > 0.1) {
      this.setScroll(this.scrollY - this.vel);
      this.vel *= Math.exp(-dt * 5);
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
