// One level being played inside GameScene: the fixed layout (via ObstacleManager.level), the
// finish line, three hidden star coins, the progress bar, hints, checkpoints and respawns.
//   normal mode   a crash respawns you at the last checkpoint ("|" in the level) and counts a
//                 death; stars: finish · all 3 star coins · finish with no deaths
//   practice mode a checkpoint at every pattern; nothing counts (no stars, times or rewards)
import Phaser from "phaser";
import { WORLD, speedForMeters } from "../config.js";
import { Course } from "../biomes/course.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { neonText, plainText } from "../ui/ui.js";
import { BOSS_RED, BOSS_RED_HEX, fitWidth, levelNameLine } from "../ui/levelName.js";
import { REALMS, levelRecord } from "./levels.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";

const PX = WORLD.pxPerMeter;
const LEAD = 1000; // px between the respawn point and the first pattern after it (~2.5 s)
const STAR_R = 30; // pickup radius around a star coin

export class LevelRun {
  constructor(scene, def, { practice = false } = {}) {
    this.scene = scene;
    this.def = def;
    this.practice = practice;
    this.realm = REALMS[def.realmIdx];
    this.got = [false, false, false]; // star coins collected this attempt (kept through respawns)
    this.deaths = 0;
    this.timeMs = 0;
  }

  /** The level's course: one realm, nothing else. */
  course() {
    return new Course(() => 0.5, null, this.def.realm);
  }

  /** Speed: the level's own pace, ramping gently along it (heroes' speed perks still apply). */
  speedAt(m) {
    return speedForMeters(this.def.speedM + m * 0.35);
  }

  /** A fresh start of the level (resetRun). */
  reset() {
    const sc = this.scene;
    this.destroyObjects();
    this.beatM = []; // metre where each beat starts + the spawner snapshot there
    this.stars = []; // { i, m, y, obj }
    this.hints = []; // { m, text, shown }
    this.finishM = 0;
    this.finished = false;
    this.lastCp = -1;
    this.cpPending = false;
    this.starIdx = 0;
    this.deaths = 0;
    this.timeMs = 0;
    this.got = [false, false, false];
    const om = sc.obstacles;
    om.level = {
      beats: this.def.beats,
      i: 0,
      finished: false,
      onBeat: (i, x, snap) => this.onBeat(i, x, snap),
      onStar: (x, y) => this.onStar(x, y),
      onHint: (x, text) => this.hints.push({ m: this.toM(x), text, shown: false }),
      onFinish: (x) => this.onFinish(x),
    };
    this.buildHud();
  }

  toM(x) {
    return this.scene.meters + (x - this.scene.player.x) / PX;
  }
  toX(m) {
    return this.scene.player.x + (m - this.scene.meters) * PX;
  }

  onBeat(i, x, snap) {
    if (!this.beatM[i]) this.beatM[i] = { m: this.toM(x), snap };
  }

  onStar(x, y) {
    // star coins are numbered by their order in the level, so a respawn re-creates the same one
    const i =
      this.def.beats.slice(0, this.scene.obstacles.level.i + 1).filter((b) => b.star).length - 1;
    if (i < 0 || i > 2 || this.stars.some((s) => s.i === i)) return;
    const obj = this.makeStar();
    // a star coin collected on an earlier finished run shows as a ghost (it still counts again)
    const saved = !!levelRecord(this.def.n)?.coins?.[i];
    this.stars.push({ i, m: this.toM(x), y, obj, saved });
  }

  makeStar() {
    const sc = this.scene;
    const c = sc.add.container(0, 0).setDepth(7);
    const g = sc.add.graphics();
    const P = 4;
    // a chunky pixel star: dark outline, gold body, white glint
    const rows = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"];
    const draw = (col, inset) =>
      rows.forEach((row, ry) =>
        [...row].forEach((ch, rx) => {
          if (ch === "#")
            g.fillStyle(col, 1).fillRect(
              (rx - 3.5) * P * 2 + inset,
              (ry - 3.5) * P * 2 + inset,
              P * 2 - inset * 2,
              P * 2 - inset * 2,
            );
        }),
      );
    draw(0x3a2200, -2);
    draw(0xffd23f, 1);
    g.fillStyle(0xffffff, 1).fillRect(-2 * P, -6 * P, P * 2, P * 2);
    const glow = sc.add
      .image(0, 0, "glow")
      .setTint(0xffd23f)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.1)
      .setAlpha(0.5);
    c.add([glow, g]);
    c.glow = glow;
    return c;
  }

  onFinish(x) {
    this.finishM = this.toM(x);
    const sc = this.scene;
    const H = sc.H;
    const c = sc.add.container(0, 0).setDepth(8);
    const g = sc.add.graphics();
    // a neon checkered finish gate across the whole screen
    const S = 24;
    for (let y = 0; y < H; y += S)
      for (let k = 0; k < 2; k++) {
        g.fillStyle((Math.floor(y / S) + k) % 2 ? 0xffffff : 0x111018, 0.9);
        g.fillRect(-S + k * S, y, S, S);
      }
    g.lineStyle(6, this.realm.col, 1)
      .lineBetween(-S - 3, 0, -S - 3, H)
      .lineBetween(S + 3, 0, S + 3, H);
    const t = neonText(
      sc,
      0,
      H * 0.12,
      this.def.boss ? "BOSS DOWN" : "FINISH",
      34,
      this.realm.col,
      { blur: 14 },
    ).setAngle(-90);
    c.add([g, t]);
    this.finishObj = c;
  }

  /** Progress through the level, 0..1 (pattern by pattern, then to the finish line). */
  progress() {
    const m = this.scene.meters;
    const N = this.def.beats.length;
    if (this.finishM > 0 && m >= (this.beatM[N - 1]?.m ?? 0)) {
      const a = this.beatM[N - 1]?.m ?? 0;
      return Phaser.Math.Clamp((N - 1 + (m - a) / Math.max(1, this.finishM - a)) / N, 0, 1);
    }
    let k = -1;
    for (let i = 0; i < N && this.beatM[i] && this.beatM[i].m <= m; i++) k = i;
    if (k < 0) {
      const a = this.beatM[0]?.m;
      return a ? Phaser.Math.Clamp(m / a, 0, 1) / N : 0;
    }
    const a = this.beatM[k].m;
    const b = this.beatM[k + 1]?.m ?? this.finishM;
    const f = b > a ? Phaser.Math.Clamp((m - a) / (b - a), 0, 1) : 0;
    return Phaser.Math.Clamp((k + f) / N, 0, 1);
  }

  // ---------------------------------------------------------------- per frame (GameScene.update)
  update(rawDt) {
    const sc = this.scene;
    // the Hud scene starts a frame after the Game scene: build the level HUD once it's up
    if (!this.hud?.c && sc.hudReady) this.buildHud();
    const p = sc.player;
    const playing = sc.state === "playing";
    if (playing) this.timeMs += rawDt * 1000;
    // star coins: drift with the world, bob, spin their glint; collect on touch
    for (const s of this.stars) {
      if (!s.obj.active) continue;
      const x = this.toX(s.m);
      const bob = Math.sin(sc.clock * 3 + s.i) * 8;
      s.obj.setPosition(x, s.y + bob).setVisible(x > -80 && x < sc.W + 200);
      s.obj.setAlpha(s.saved ? 0.4 : 1); // collected on an earlier run: a ghost
      s.obj.glow.setScale(1.1 + Math.sin(sc.clock * 5) * 0.12);
      if (playing && !s.taken && Math.hypot(x - p.x, s.y + bob - p.y) < STAR_R + p.radius) {
        s.taken = true;
        const fresh = !this.got[s.i];
        this.got[s.i] = true;
        sc.fx.burst("star", x, s.y, 18, 0xffd23f, {
          speed: { min: 120, max: 380 },
        });
        if (!reduceFlashing()) sc.fx.ring(x, s.y, 0xffd23f, { scale: 1.4, duration: 420 });
        Sfx.coin?.(8);
        Haptics.starCoin?.();
        s.obj.setVisible(false).setActive(false);
        if (fresh) this.hud?.starGot(s.i);
      }
    }
    // hints show as they reach the player
    for (const h of this.hints) {
      if (!h.shown && sc.meters >= h.m - 6) {
        h.shown = true;
        this.hud?.hint(h.text.toUpperCase());
      }
    }
    // checkpoints
    if (playing) {
      for (let i = this.lastCp + 1; i < this.def.beats.length; i++) {
        const b = this.beatM[i];
        if (!b || b.m > sc.meters) break;
        // a checkpoint inside a gravity flip moves to the first pattern after gravity is back
        // (a respawn always starts upright)
        const isCp = this.practice || this.def.beats[i].cp || this.cpPending;
        if (isCp && b.snap.flipped) this.cpPending = true;
        if (isCp && !b.snap.flipped && i > this.lastCp) {
          this.lastCp = i;
          this.cpPending = false;
          if (!this.practice && i > 0) this.hud?.flashCheckpoint();
        }
      }
    }
    if (this.finishObj) this.finishObj.setPosition(this.toX(this.finishM), 0);
    // crossing the finish line
    if (playing && this.finishM > 0 && sc.meters >= this.finishM) this.complete();
    this.hud?.update(this.progress(), this.deaths);
  }

  // ---------------------------------------------------------------- crash → checkpoint
  /** Called when the death animation has played (instead of the endless game over). */
  respawn() {
    const sc = this.scene;
    if (!this.practice) this.deaths++;
    // the checkpoint to return to: the last one passed (never inside a gravity flip)
    let i = this.lastCp;
    while (i > 0 && (!this.beatM[i] || this.beatM[i].snap.flipped)) i--;
    if (i < 0 || !this.beatM[i]) i = 0;
    const cp = this.beatM[i];
    const p = sc.player;
    // world back to just before that pattern
    const startM = cp ? cp.m - LEAD / PX : 0;
    sc.distance = Math.max(0, startM) * PX;
    sc.meters = sc.distance / PX;
    // everything spawned after the checkpoint is forgotten and re-spawned identically
    this.beatM.length = i;
    this.hints = this.hints.filter((h) => h.m < startM);
    for (const s of this.stars)
      if (s.m >= startM) {
        s.obj.destroy();
        s.dead = true;
      }
    this.stars = this.stars.filter((s) => !s.dead);
    this.finishObj?.destroy();
    this.finishObj = null;
    this.finishM = 0;
    const snap = cp?.snap ?? {
      rng: this.def.seed,
      flipped: false,
      sinceFlip: 0,
      count: 0,
      lastKind: null,
    };
    sc.obstacles.resumeLevel(i, snap, p.x + LEAD);
    sc.respawnAt();
  }

  // ---------------------------------------------------------------- the finish
  complete() {
    if (this.finished) return;
    this.finished = true;
    const sc = this.scene;
    sc.levelComplete({
      n: this.def.n,
      practice: this.practice,
      finished: true,
      deaths: this.deaths,
      coins: [...this.got],
      timeMs: Math.round(this.timeMs),
    });
  }

  // ---------------------------------------------------------------- HUD: progress bar, stars
  buildHud() {
    this.hud?.destroy();
    this.hud = new LevelHud(this);
  }

  destroyObjects() {
    for (const s of this.stars || []) s.obj.destroy();
    this.stars = [];
    this.finishObj?.destroy();
    this.finishObj = null;
  }

  destroy() {
    this.destroyObjects();
    this.hud?.destroy();
    this.hud = null;
    if (this.scene.obstacles) this.scene.obstacles.level = null;
  }
}

/** The level HUD (drawn in the Hud scene): progress bar with %, level name, star slots. */
class LevelHud {
  constructor(run) {
    this.run = run;
    const hud = run.scene.hud;
    this.hud = hud;
    if (!hud?.sys?.isActive()) return;
    const W = hud.W || 720;
    const top = (hud.top || 24) + 30;
    const c = hud.add.container(0, 0).setDepth(50);
    this.c = c;
    // "LEVEL 7: UPSIDE DOWN" (bosses red with a skull); practice says so in its own colour
    this.title = levelNameLine(hud, W / 2, top, run.def, 18, {
      maxW: W - 220,
      color: run.practice ? "#7ae8ff" : "#ffffff",
    });
    if (run.practice) this.title.text.setText(`${this.title.text.text} · PRACTICE`);
    fitWidth(this.title, W - 220);
    this.intro(hud, W, run);
    this.barG = hud.add.graphics();
    this.pct = neonText(hud, W / 2, top + 74, "0%", 22, run.realm.col, {
      blur: 8,
    });
    this.deathText = plainText(hud, W / 2, top + 104, "", 15, "#ff8a9a");
    this.cpText = neonText(hud, W / 2, top + 150, "CHECKPOINT", 24, 0x39ff88, {
      blur: 10,
    }).setAlpha(0);
    c.add([this.barG, this.title, this.pct, this.deathText, this.cpText]);
    // three star-coin slots under the bar
    this.slots = [0, 1, 2].map((i) => {
      const s = hud.add.graphics({ x: W / 2 + 190 + i * 30, y: top + 74 });
      c.add(s);
      return s;
    });
    this.top = top;
    this.W = W;
    this.drawSlots();
    // the endless score sits where the bar goes: hide it during a level
    hud.scoreText?.setVisible(false);
    hud.bestText?.setVisible(false);
  }

  /** The level start screen: the level's number and name, big, until the first tap. */
  intro(hud, W, run) {
    const H = hud.H || 1280;
    const y = H * 0.27;
    const def = run.def;
    const col = def.boss ? BOSS_RED_HEX : run.realm.col;
    const g = hud.add.container(0, 0).setDepth(49);
    const shade = hud.add.rectangle(W / 2, y + 10, W, 230, 0x05020e, 0.55);
    const top = plainText(
      hud,
      W / 2,
      y - 56,
      `${def.boss ? "BOSS · " : ""}LEVEL ${def.n} · ${run.realm.name}${run.practice ? " · PRACTICE" : ""}`,
      20,
      def.boss ? BOSS_RED : "#cfc6ff",
    );
    fitWidth(top, W - 80);
    const name = neonText(hud, W / 2, y + 10, def.name.toUpperCase(), 54, col, { blur: 16 });
    fitWidth(name, W - (def.boss ? 180 : 80));
    const parts = [shade, top, name];
    if (def.boss) {
      const sk = hud.add.image(0, y + 10, "lvmap", "skull").setTint(BOSS_RED_HEX);
      sk.setScale(58 / sk.height);
      sk.x = W / 2 - name.displayWidth / 2 - sk.displayWidth / 2 - 14;
      const sk2 = hud.add.image(W / 2 + name.displayWidth / 2 + sk.displayWidth / 2 + 14, y + 10, "lvmap", "skull");
      sk2.setTint(BOSS_RED_HEX).setScale(sk.scale);
      parts.push(sk, sk2);
    }
    g.add(parts);
    g.setAlpha(0);
    hud.tweens.add({ targets: g, alpha: 1, duration: 260 });
    this.introC = g;
  }

  /** Fade the start screen out once the run is under way. */
  hideIntro() {
    const g = this.introC;
    if (!g) return;
    this.introC = null;
    this.hud.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  drawSlots() {
    if (!this.slots) return;
    this.slots.forEach((g, i) => {
      g.clear();
      const got = this.run.got[i];
      g.fillStyle(got ? 0xffd23f : 0x2a2440, 1).fillCircle(0, 0, 11);
      g.lineStyle(2, got ? 0xfff0a0 : 0x5a5080, 1).strokeCircle(0, 0, 11);
    });
  }

  starGot() {
    this.drawSlots();
  }

  /** A level hint, shown under the progress bar (it never shares the centre with pop-ups). */
  hint(text) {
    if (!this.c) return;
    this.hintText?.destroy();
    const t = neonText(this.hud, this.W / 2, this.top + 200, text, 26, this.run.realm.col, {
      blur: 12,
    });
    t.setAlpha(0);
    this.c.add(t);
    this.hintText = t;
    this.hud.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this.hud.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 400, onComplete: () => t.destroy() });
  }

  flashCheckpoint() {
    if (!this.cpText) return;
    this.cpText.setAlpha(1);
    this.hud.tweens.add({
      targets: this.cpText,
      alpha: 0,
      delay: 600,
      duration: 500,
    });
  }

  update(p, deaths) {
    if (!this.barG?.active) return;
    if (this.introC && this.run.scene.state !== "ready") this.hideIntro();
    const W = this.W;
    const bw = 460;
    const x0 = W / 2 - bw / 2;
    const y = this.top + 30;
    const g = this.barG;
    g.clear();
    g.fillStyle(0x0a0618, 0.85).fillRoundedRect(x0 - 4, y - 4, bw + 8, 22, 8);
    g.fillStyle(this.run.realm.col, 1).fillRoundedRect(x0, y, Math.max(6, bw * p), 14, 6);
    g.lineStyle(2, 0xffffff, 0.5).strokeRoundedRect(x0 - 4, y - 4, bw + 8, 22, 8);
    const pc = Math.floor(p * 100);
    if (pc !== this.lastPc) {
      this.lastPc = pc;
      this.pct.setText(`${pc}%`);
    }
    if (deaths !== this.lastDeaths) {
      this.lastDeaths = deaths;
      this.deathText.setText(
        this.run.practice
          ? "practice · nothing counts"
          : deaths
            ? `${deaths} ${deaths === 1 ? "crash" : "crashes"}`
            : "",
      );
    }
  }

  destroy() {
    this.introC?.destroy();
    this.introC = null;
    this.c?.destroy();
    this.c = null;
    this.barG = null;
    if (this.hud?.sys?.isActive()) {
      this.hud.scoreText?.setVisible(true);
      this.hud.bestText?.setVisible(true);
    }
  }
}
