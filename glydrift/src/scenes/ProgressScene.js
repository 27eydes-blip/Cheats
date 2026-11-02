// Player level & rewards, rotating missions, login streak and achievement badges.
import Phaser from "phaser";
import { Background } from "../biomes/Background.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { Effects } from "../effects/Effects.js";
import { ACHIEVEMENTS, LEVEL_REWARDS, LOGIN_REWARDS, Progression } from "../systems/progression.js";
import { Save } from "../systems/save.js";
import {
  button,
  drawNeonRect,
  neonText,
  ProgressBar,
  plainText,
  popIn,
  slideIn,
} from "../ui/ui.js";

export class ProgressScene extends Phaser.Scene {
  constructor() {
    super("Progress");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const s = Save.data;
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.setBackgroundColor(0x05010d).fadeIn(250, 5, 1, 13);
    this.bg = new Background(this, { lowGfx, W, H, cover: 1.05 });
    this.events.once("shutdown", () => this.bg.destroy());
    this.fx = new Effects(this, { lowGfx, depth: 200 });
    this.pal = {};
    blendPalette({ a: BIOMES[0], b: BIOMES[2], t: 0.35 }, this.pal);
    this.t = 0;
    // soft scrim keeps the living background from fighting the UI
    this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.45).setDepth(-10);

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(100);
    neonText(this, W / 2, top + 46, "PROGRESS", 40, 0xff4fd8).setDepth(100);

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

    // ---- streak
    const st = this.add.container(0, 0);
    st.add(neonText(this, 40, y, "LOGIN STREAK", 26, 0xffd23f, { ox: 0 }));
    st.add(
      plainText(
        this,
        W - 40,
        y,
        `${s.login.streak} day${s.login.streak === 1 ? "" : "s"}`,
        20,
        "#fff2c2",
        { ox: 1 },
      ),
    );
    const day = ((Math.max(1, s.login.streak) - 1) % 7) + 1;
    LOGIN_REWARDS.forEach((rw, i) => {
      const x = 40 + 36 + i * ((W - 80) / 7);
      const cy = y + 62;
      const done = i < day && s.login.streak > 0;
      const g = this.add.graphics();
      g.fillStyle(done ? 0xffd23f : 0x2a2140, done ? 0.9 : 0.8).fillCircle(x, cy, 26);
      g.lineStyle(2, rw.shard ? 0x3fa9ff : 0xffd23f, 1).strokeCircle(x, cy, 26);
      st.add(g);
      st.add(plainText(this, x, cy, rw.shard ? "◆" : `${i + 1}`, 18, done ? "#1a0c00" : "#ffffff"));
    });
    slideIn(this, st, 420);
    y += 120;

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
      const badge = this.add
        .image(x, yy - 10, "badge")
        .setScale(Math.min(0.7, cellH / 160))
        .setTint(col);
      const glyph = neonText(this, x, yy - 10, a.glyph, 30, col, {
        blur: unlocked ? 12 : 0,
        glow: unlocked,
      });
      if (!unlocked) glyph.setAlpha(0.4);
      const label = plainText(
        this,
        x,
        yy + cellH * 0.36,
        a.name,
        12,
        unlocked ? "#ffffff" : "#7a7090",
      );
      badge
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.showTip(a, unlocked, x, yy));
      popIn(this, [badge, glyph], 500 + i * 30);
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
    const W = this.scale.width;
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
    this.cameras.main.fadeOut(200, 5, 1, 13);
    this.time.delayedCall(200, () => this.scene.start("Menu"));
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.bg.update(dt, 70, this.pal, { speedNorm: 0, zoom: 1 });
    this.fx.update(dt);
  }
}
