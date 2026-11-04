// Player level & rewards, rotating missions, login streak and achievement badges.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import {
  ACHIEVEMENTS,
  DIMENSION_COUNT,
  dimensionsFound,
  LEVEL_REWARDS,
  LOGIN_REWARDS,
  Progression,
} from "../data/progression.js";
import { Save } from "../data/save.js";
import { Titles } from "../data/titles.js";
import { titleText } from "../ui/titleText.js";
import { drawIcon } from "../ui/icons.js";
import {
  button,
  drawNeonRect,
  fadeTo,
  neonText,
  plainText,
  popIn,
  ProgressBar,
  slideIn,
} from "../ui/ui.js";

export class ProgressScene extends Phaser.Scene {
  constructor() {
    super("Progress");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    const s = Save.data;
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.fadeIn(250, 5, 1, 13);
    this.backdrop = this.scene.get("Backdrop");
    this.fx = new Effects(this, { lowGfx, depth: 200 });
    this.pal = {};
    blendPalette({ a: BIOMES[0], b: BIOMES[2], t: 0.35 }, this.pal);
    this.t = 0;

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(100);
    neonText(this, W / 2, top + 46, "PROGRESS", 40, 0xff4fd8).setDepth(100);
    button(this, W - 80, top + 46, 120, 64, "TITLES", {
      color: 0xffd23f,
      size: 18,
      onClick: () => fadeTo(this, "Titles", { from: "Progress" }),
    }).setDepth(100);
    // your profile line: name + the title you wear
    plainText(this, W / 2, top + 86, s.profile?.username || "", 18, "#ffffff").setDepth(100);
    titleText(this, W / 2, top + 106, Titles.equippedId(), { size: 12 }).setDepth(100);

    // ---- level panel
    let y = top + 120;
    const need = Progression.xpToNext(s.level);
    const lp = this.add.container(0, 0);
    const lg = this.add.graphics();
    drawNeonRect(lg, 30, y, W - 60, 150, 24, 0x3ef4ff, { fillAlpha: 0.75 });
    lp.add(lg);
    lp.add(neonText(this, 64, y + 44, `LEVEL ${s.level}`, 34, 0x3ef4ff, { ox: 0 }));
    lp.add(plainText(this, W - 64, y + 44, `${s.xp} / ${need} XP`, 18, "#bdf9ff", { ox: 1 }));
    const bar = new ProgressBar(this, 64, y + 76, W - 128, 18, 0x3ef4ff);
    lp.add(bar.g);
    bar.to(s.xp / need, 900, 300);
    const nextLv = Object.keys(LEVEL_REWARDS)
      .map(Number)
      .find((l) => l > s.level);
    if (nextLv) {
      const r = LEVEL_REWARDS[nextLv];
      const txt = [r.coins ? `${r.coins} coins` : "", r.shard ? "character shard" : ""]
        .filter(Boolean)
        .join(" + ");
      lp.add(
        plainText(this, W / 2, y + 122, `Next milestone: LV ${nextLv} → ${txt}`, 16, "#d8d0ff"),
      );
    }
    slideIn(this, lp, 50);

    // ---- missions
    y += 180;
    const mt = neonText(this, 40, y, "MISSIONS", 26, 0x39ff88, { ox: 0 });
    slideIn(this, mt, 120);
    y += 30;
    s.missions.forEach((m, i) => {
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      const yy = y + i * 98;
      drawNeonRect(g, 30, yy, W - 60, 84, 18, 0x39ff88, { fillAlpha: 0.65, width: 2, glow: false });
      const val = Math.min(m.target, Progression.missionValue(m, null));
      c.add([
        g,
        plainText(this, 54, yy + 26, m.text, 19, "#ffffff", { ox: 0 }),
        plainText(this, W - 54, yy + 26, `+${m.reward.coins}  +${m.reward.xp}XP`, 15, "#ffd23f", {
          ox: 1,
        }),
      ]);
      const pb = new ProgressBar(this, 54, yy + 52, W - 220, 12, 0x39ff88);
      c.add(pb.g);
      pb.to(val / m.target, 700, 300 + i * 100);
      c.add(
        plainText(
          this,
          W - 54,
          yy + 58,
          `${m.stat === "biome" ? (val >= m.target ? 1 : 0) : val}/${m.stat === "biome" ? 1 : m.target}`,
          16,
          "#bfffd8",
          { ox: 1 },
        ),
      );
      slideIn(this, c, 160 + i * 80);
    });
    y += 3 * 98 + 6;

    // ---- streak (same source of truth as the daily reward popup)
    const ls = Progression.loginStatus();
    const st = this.add.container(0, 0);
    st.add(neonText(this, 40, y, "LOGIN STREAK", 26, 0xffd23f, { ox: 0 }));
    st.add(
      plainText(
        this,
        W - 40,
        y,
        `${ls.streak} day${ls.streak === 1 ? "" : "s"}${ls.canClaim ? " · claim today!" : ""}`,
        20,
        "#fff2c2",
        { ox: 1 },
      ),
    );
    const shardFor = Progression.shardTarget();
    LOGIN_REWARDS.forEach((rw, i) => {
      const x = 40 + 36 + i * ((W - 80) / 7);
      const cy = y + 62;
      const done = i < ls.day - (ls.canClaim ? 1 : 0);
      const g = this.add.graphics();
      g.fillStyle(done ? 0xffd23f : 0x2a2140, done ? 0.9 : 0.8).fillCircle(x, cy, 26);
      g.lineStyle(i === ls.day - 1 ? 4 : 2, rw.shard ? 0x3fa9ff : 0xffd23f, 1).strokeCircle(
        x,
        cy,
        26,
      );
      st.add(g);
      st.add(plainText(this, x, cy, `${i + 1}`, 20, done ? "#1a0c00" : "#ffffff"));
      if (rw.shard)
        st.add(
          plainText(this, x, cy + 40, `${shardFor ? shardFor.name : "BONUS"} SHARD`, 12, "#9fd4ff"),
        );
    });
    slideIn(this, st, 420);
    y += 120;

    // ---- dimensions discovered beyond the Hurricane rift
    const found = dimensionsFound(s);
    const dl = plainText(
      this,
      W / 2,
      y - 6,
      `DIMENSIONS DISCOVERED  ${found}/${DIMENSION_COUNT}`,
      20,
      found ? "#e8d0ff" : "#8a80a8",
    );
    slideIn(this, dl, 450);
    y += 34;

    // ---- achievements
    const at = neonText(this, 40, y, "ACHIEVEMENTS", 26, 0xb45cff, { ox: 0 });
    const got = Object.keys(s.achievements).length;
    const cnt = plainText(this, W - 40, y, `${got}/${ACHIEVEMENTS.length}`, 20, "#e0c8ff", {
      ox: 1,
    });
    slideIn(this, [at, cnt], 480);
    y += 40;
    const cols = 4;
    const cellW = (W - 60) / cols;
    const avail = H - y - 30;
    const rows = Math.ceil(ACHIEVEMENTS.length / cols);
    const cellH = Math.min(118, avail / rows);
    this.tip = null;
    ACHIEVEMENTS.forEach((a, i) => {
      const x = 30 + cellW * (i % cols) + cellW / 2;
      const yy = y + cellH * Math.floor(i / cols) + cellH / 2;
      const unlocked = !!s.achievements[a.id];
      const col = unlocked ? [0xffd23f, 0x3ef4ff, 0xff4fd8, 0x39ff88, 0xb45cff][i % 5] : 0x4a4060;
      // custom vector badge: hexagon + an icon that matches the achievement
      const badge = this.add.graphics().setPosition(x, yy - 10);
      const R = Math.min(42, cellH * 0.34);
      const hexPts = [];
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 - Math.PI / 2;
        hexPts.push({ x: Math.cos(ang) * R, y: Math.sin(ang) * R });
      }
      badge.fillStyle(0x0a0418, 0.95).fillPoints(hexPts, true);
      badge.fillStyle(col, unlocked ? 0.18 : 0.06).fillPoints(hexPts, true);
      if (unlocked) badge.lineStyle(9, col, 0.18).strokePoints(hexPts, true, true);
      badge.lineStyle(3, col, unlocked ? 1 : 0.5).strokePoints(hexPts, true, true);
      drawIcon(badge, a.id, R * 0.55, unlocked ? 0xffffff : 0x4a4060);
      badge.setInteractive(new Phaser.Geom.Circle(0, 0, R), Phaser.Geom.Circle.Contains);
      const label = plainText(
        this,
        x,
        yy + cellH * 0.36,
        a.name,
        12,
        unlocked ? "#ffffff" : "#7a7090",
      );
      badge.on("pointerup", () => this.showTip(a, unlocked, x, yy));
      popIn(this, badge, 300 + i * 25);
      label.setAlpha(0);
      this.tweens.add({ targets: label, alpha: 1, delay: 600 + i * 30, duration: 300 });
      if (unlocked)
        this.tweens.add({
          targets: badge,
          alpha: 0.7,
          yoyo: true,
          repeat: -1,
          delay: 1400 + i * 40,
          duration: 900 + i * 40,
        });
    });
  }

  showTip(a, unlocked, x, y) {
    this.tip?.destroy();
    const W = VIEW.W;
    const c = this.add.container(Phaser.Math.Clamp(x, 170, W - 170), y - 90).setDepth(300);
    const g = this.add.graphics();
    drawNeonRect(g, -160, -44, 320, 88, 16, unlocked ? 0xffd23f : 0x8a80b0, { fillAlpha: 0.96 });
    c.add([
      g,
      neonText(this, 0, -16, a.name, 20, unlocked ? 0xffd23f : 0x8a80b0, { blur: 6 }),
      plainText(this, 0, 18, unlocked ? a.desc : `LOCKED · ${a.desc}`, 14, "#ffffff"),
    ]);
    popIn(this, c, 0, { duration: 300 });
    this.tip = c;
    this.time.delayedCall(2200, () => {
      if (this.tip === c) {
        this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
        this.tip = null;
      }
    });
  }

  leave() {
    fadeTo(this, "Menu");
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.drive(this.pal, { scroll: 70, speedNorm: 0, dim: 0.6, scenery: false });
    this.fx.update(dt);
  }
}
