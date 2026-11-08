// LEVEL COMPLETE: the three stars land one by one (finish · all 3 star coins · no crashes),
// then the time, the first-time rewards (coins, a realm's title, the Level Master trail) and
// the level's best-time board. NEXT LEVEL / RETRY / LEVELS.
import Phaser from "phaser";
import { fitCamera, VIEW } from "../config.js";
import { Save } from "../data/save.js";
import { tungLevelUpCelebration } from "../player/tungFx.js";
import { getTitle } from "../data/titles.js";
import { Sfx } from "../audio/sfx.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Music } from "../audio/music.js";
import { Haptics } from "../systems/haptics.js";
import { Leaderboard, Levels, scoreToTime } from "../online/leaderboard.js";
import { button, drawNeonRect, neonText, plainText, popIn } from "../ui/ui.js";
import { REALMS, builtCount, fmtTime, getLevel, isUnlocked, starsOf } from "../levels/levels.js";
import { TEST } from "../systems/testFlags.js";
import { fitWidth, levelNameLine } from "../ui/levelName.js";
import { closeShareModal, openShareModal } from "../online/shareCard.js";

export class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super("LevelComplete");
  }

  init(data) {
    this.res = data.res;
    this.result = data.result;
    this.out = data.out || null;
    this.game0 = data.game;
    this.leaving = false;
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    // TUNG levelled up on this level: her celebration (drawn on top, takes no input)
    const tungUp = this.game0?.run?.tungLevelUp;
    if (tungUp) tungLevelUpCelebration(this, tungUp, W / 2, H * 0.5);
    const res = this.res;
    const def = getLevel(res.n);
    const realm = REALMS[def.realmIdx];
    const col = realm.col;
    this.scene.get("Hud")?.scene.setVisible(false);
    const top = (this.registry.get("safeTop") || 0) + 30;

    this.add.rectangle(W / 2, H / 2, W, H, 0x03010a, 0.9).setInteractive();
    // normal runs count (stars, rewards, best time); practice never does
    const out = this.out; // saved by GameScene.levelComplete (stars, rewards, best time)
    if (out) {
      if (!res.deaths)
        Leaderboard.submitLevelTime({
          n: res.n,
          timeMs: res.timeMs,
          distance: this.game0?.meters,
          char: Save.data.selected,
        }).catch?.(() => {});
    }
    Save.write();
    Music.restore?.();

    let y = top + 40;
    const head = neonText(
      this,
      W / 2,
      y,
      res.practice ? "PRACTICE DONE" : def.boss ? "BOSS DEFEATED!" : "LEVEL COMPLETE",
      def.boss ? 52 : 48,
      col,
      { blur: 20 },
    );
    y += 64;
    const sub = levelNameLine(this, W / 2, y, def, 24, { maxW: W - 80 });
    popIn(this, [head, sub], 0);
    y += 150;

    // ---- the three stars
    const stars = starsOf(def.n);
    const labels = ["FINISH", "3 STAR COINS", "NO CRASHES"];
    const thisRun = [true, res.coins.every(Boolean), res.deaths === 0];
    this.starObjs = [0, 1, 2].map((i) => {
      const x = W / 2 + (i - 1) * 200;
      const g = this.add.graphics({ x, y });
      const lit = !res.practice && stars[i];
      drawStar(g, 46, lit ? 0xffd23f : 0x2a2440, lit ? 0xfff6c0 : 0x4a4070);
      g.setScale(0.1);
      this.tweens.add({
        targets: g,
        scale: 1,
        delay: 300 + i * 380,
        duration: 420,
        ease: "Back.easeOut",
        onStart: () => {
          if (lit) {
            Sfx.combo?.(i + 2);
            Haptics.light?.();
          }
        },
        onComplete: () => lit && this.starSparkle(g.x, g.y),
      });
      const t = plainText(this, x, y + 72, labels[i], 16, lit ? "#ffd23f" : "#8a80b0");
      const newMark = out?.newStars.includes(i)
        ? neonText(this, x, y - 66, "NEW!", 20, 0x39ff88, { blur: 8 })
        : null;
      if (newMark) popIn(this, newMark, 700 + i * 380);
      // this run's star coins
      if (i === 1) {
        const got = res.coins.filter(Boolean).length;
        plainText(this, x, y + 96, `${got}/3 this run`, 14, thisRun[1] ? "#ffd23f" : "#bfb6e8");
      }
      return { g, t };
    });
    y += 150;

    // ---- time and crashes
    const timeLine = res.practice
      ? "Practice runs don't count: play it for real to earn stars"
      : `TIME ${fmtTime(res.timeMs)} · ${res.deaths ? `${res.deaths} crash${res.deaths > 1 ? "es" : ""}` : "no crashes"}`;
    plainText(this, W / 2, y, timeLine, 20, "#ffffff", { wrap: W - 120 });
    y += 34;
    if (out) {
      const rec = Save.data.lv?.p?.[def.n];
      const bestLine = rec?.best
        ? `BEST (no crashes) ${fmtTime(rec.best)}${out.bestTime ? " · NEW BEST!" : ""}`
        : "Finish with no crashes to set a best time";
      plainText(this, W / 2, y, bestLine, 17, out.bestTime ? "#39ff88" : "#cfc6ff");
      y += 40;
      // ---- first-time rewards
      if (out.rewards.length || out.milestones?.length) {
        const g = this.add.graphics();
        const lines = [];
        for (const r of out.rewards) {
          if (r.kind === "finish") lines.push(`First finish  +${r.coins} coins`);
          if (r.kind === "star") lines.push(`New star  +${r.coins} coins`);
          if (r.kind === "realm") {
            lines.push(`${realm.name} CLEARED  +${r.coins} coins`);
            const t = getTitle(r.title);
            if (t) lines.push(`New title: ${t.name}`);
            if (r.trail) lines.push("New trail: LEVEL MASTER (equipped)");
          }
        }
        for (const m of out.milestones || []) lines.push(`${m.stars} STARS!  ${m.label}`);
        const bh = 30 + lines.length * 28;
        drawNeonRect(g, 60, y, W - 120, bh, 18, 0xffd23f, {
          fill: 0x1a1204,
          fillAlpha: 0.9,
        });
        lines.forEach((l, i) => plainText(this, W / 2, y + 28 + i * 28, l, 18, "#ffd23f"));
        y += bh + 20;
      }
      if (out.rewards.some((r) => r.kind === "realm")) this.celebrate(col);
    }

    // ---- this level's best-time board (online; quietly absent offline)
    this.boardY = y;
    if (!res.practice) this.loadBoard(def.n, y);

    // ---- buttons
    const by = H - 200;
    const next = def.n + 1;
    const canNext = !res.practice && next <= builtCount() && isUnlocked(next);
    const b1 = button(
      this,
      W / 2,
      by,
      420,
      92,
      res.practice ? "PLAY FOR REAL" : canNext ? "NEXT LEVEL" : "LEVELS",
      {
        color: 0x39ff88,
        size: 34,
        onClick: () =>
          res.practice
            ? this.play(def.n, false)
            : canNext
              ? this.play(next, false)
              : this.go("LevelSelect"),
      },
    );
    const b2 = button(this, W / 2 - 220, by + 104, 200, 72, "RETRY", {
      color: 0x3ef4ff,
      size: 24,
      onClick: () => this.play(def.n, res.practice),
    });
    const b4 = button(this, W / 2, by + 104, 200, 72, "SHARE", {
      color: 0xffd23f,
      size: 24,
      onClick: () =>
        openShareModal(this.game, {
          mode: "level",
          level: def.n,
          name: def.name,
          boss: def.boss,
          realm: def.realmIdx,
          biome: def.realmIdx,
          timeMs: res.timeMs,
          deaths: res.deaths,
          stars: starsOf(def.n),
          char: Save.data.selected,
          score: res.timeMs,
        }),
    });
    const b3 = button(this, W / 2 + 220, by + 104, 200, 72, "LEVELS", {
      color: 0xb45cff,
      size: 24,
      onClick: () => this.go("LevelSelect"), // opens on your current level
    });
    popIn(this, [b1, b2, b4, b3], 900);
    if (TEST.on && typeof window !== "undefined") window.__glyLevelResult = { res, out };
  }

  async loadBoard(n, y) {
    try {
      const b = await Leaderboard.board(Levels.level(n));
      if (!this.scene.isActive()) return;
      const rows = (b.rows || []).slice(0, 5);
      if (!rows.length) return;
      const head = levelNameLine(this, this.W / 2, y + 6, getLevel(n), 16, {
        maxW: this.W - 120,
        color: "#cfc6ff",
      });
      head.text.setText(`${head.text.text} · FASTEST`);
      fitWidth(head, this.W - 120);
      rows.forEach((r, i) => {
        const me = b.userId && r.player_id === b.userId;
        plainText(
          this,
          this.W / 2,
          y + 34 + i * 26,
          `${i + 1}. ${r.username || "?"}  ${fmtTime(scoreToTime(r.score))}`,
          17,
          me ? "#39ff88" : "#ffffff",
        );
      });
      if (b.me && b.me.rank > 5)
        plainText(
          this,
          this.W / 2,
          y + 34 + 5 * 26,
          `you: #${b.me.rank}  ${fmtTime(scoreToTime(b.me.score))}`,
          17,
          "#39ff88",
        );
    } catch {
      // offline: the time is queued and the board shows next time
    }
  }

  celebrate(col) {
    for (let k = 0; k < 6; k++)
      this.time.delayedCall(250 * k, () => {
        const x = this.W * (0.2 + Math.random() * 0.6);
        const yy = this.H * (0.15 + Math.random() * 0.3);
        const g = this.add.graphics({ x, y: yy });
        g.fillStyle([col, 0xffd23f, 0xffffff][k % 3], 1);
        for (let a = 0; a < 12; a++) {
          const r = 6 + Math.random() * 4;
          g.fillRect(Math.cos(a) * 20 - r / 2, Math.sin(a) * 20 - r / 2, r, r);
        }
        this.tweens.add({
          targets: g,
          scale: 4,
          alpha: 0,
          duration: 900,
          onComplete: () => g.destroy(),
        });
      });
  }

  play(n, practice) {
    closeShareModal();
    if (this.leaving) return;
    this.leaving = true;
    Sfx.ui?.();
    this.scene.stop("Hud");
    this.scene.stop("Game");
    this.scene.start("Game", { mode: "level", level: n, practice });
    this.scene.stop();
  }

  go(key, data) {
    closeShareModal();
    if (this.leaving) return;
    this.leaving = true;
    Sfx.ui?.();
    this.scene.stop("Hud");
    this.scene.stop("Game");
    this.scene.start(key, data);
  }

  /** An earned star lands: a soft gold ring and a few sparkles (calmer with Reduce Flashing / Low Graphics). */
  starSparkle(x, y) {
    const calm = reduceFlashing() || Save.data.settings?.lowGfx;
    const ring = this.add.graphics({ x, y });
    ring.lineStyle(4, 0xffe27a, calm ? 0.4 : 0.85).strokeCircle(0, 0, 40);
    this.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    if (calm) return;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const d = this.add.graphics({ x, y });
      d.fillStyle(0xfff6c0, 1).fillCircle(0, 0, 4);
      this.tweens.add({
        targets: d,
        x: x + Math.cos(a) * 78,
        y: y + Math.sin(a) * 78,
        alpha: 0,
        scale: 0.4,
        duration: 420,
        ease: "Cubic.easeOut",
        onComplete: () => d.destroy(),
      });
    }
  }
}

/** A chunky five-point star (filled, with a light rim). */
export function drawStar(g, R, fill, rim) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.45 : R;
    pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r));
  }
  g.fillStyle(0x000000, 0.5).fillPoints(
    pts.map((p) => new Phaser.Geom.Point(p.x + 4, p.y + 5)),
    true,
  );
  g.fillStyle(fill, 1).fillPoints(pts, true);
  g.lineStyle(4, rim, 1).strokePoints(pts, true);
}
