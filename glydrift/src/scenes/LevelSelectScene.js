// LEVEL SELECT: a scrolling neon map through the five realms (level 1 at the top). Level nodes
// show the stars earned, locks and boss icons; tap one for its card (stars, best time, PLAY /
// PRACTICE). Total stars at the top.
import Phaser from "phaser";
import { fitCamera, VIEW } from "../config.js";
import { Sfx } from "../audio/sfx.js";
import { button, drawNeonRect, neonText, plainText } from "../ui/ui.js";
import {
  LEVEL_COUNT,
  REALMS,
  builtCount,
  currentLevel,
  fmtTime,
  getLevel,
  isUnlocked,
  levelRecord,
  starsOf,
  totalStars,
} from "../levels/levels.js";
import { drawStar } from "./LevelCompleteScene.js";
import { TEST } from "../systems/testFlags.js";

const STEP = 136; // vertical space per level node
const BAND_HEAD = 150; // realm header height
const TOP_PAD = 230;

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super("LevelSelect");
  }

  init(data) {
    this.focus = data?.focus || null;
    this.leaving = false;
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.modal = null;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.add.rectangle(W / 2, H / 2, W, H, 0x05020e, 0.55);

    // ---- the map (one tall container, scrolled by dragging)
    this.map = this.add.container(0, 0);
    this.nodes = [];
    let y = TOP_PAD;
    const pathPts = [];
    for (let r = 0; r < REALMS.length; r++) {
      const realm = REALMS[r];
      const bandTop = y;
      const bandH = BAND_HEAD + 10 * STEP;
      this.drawBand(realm, bandTop, bandH, r);
      y += BAND_HEAD;
      for (let j = 0; j < 10; j++) {
        const n = r * 10 + j + 1;
        const x = W / 2 + Math.sin((n - 1) * 0.9) * 190;
        const ny = y + STEP / 2;
        pathPts.push({ x, y: ny, col: realm.col });
        this.nodes.push({ n, x, y: ny });
        y += STEP;
      }
    }
    this.mapH = y + 120;
    // the path between nodes, under them
    const path = this.add.graphics();
    for (let i = 1; i < pathPts.length; i++) {
      const a = pathPts[i - 1];
      const b = pathPts[i];
      const done = levelRecord(i)?.done;
      path.lineStyle(done ? 8 : 5, done ? b.col : 0x3a3060, done ? 0.9 : 0.6);
      path.lineBetween(a.x, a.y, b.x, b.y);
    }
    this.map.add(path);
    for (const nd of this.nodes) this.drawNode(nd);

    // ---- header: back, title, total stars (fixed, over the map)
    const hdr = this.add.graphics();
    hdr.fillStyle(0x05020e, 0.92).fillRect(0, 0, W, top + 130);
    hdr.lineStyle(3, 0xb45cff, 0.8).lineBetween(0, top + 130, W, top + 130);
    neonText(this, W / 2, top + 46, "LEVELS", 48, 0xb45cff, { blur: 16 });
    this.starsText = neonText(
      this,
      W / 2,
      top + 100,
      `${totalStars()}/${LEVEL_COUNT * 3} ★`,
      26,
      0xffd23f,
      {
        blur: 10,
      },
    );
    const back = button(this, 80, top + 46, 110, 64, "◀", {
      color: 0x3ef4ff,
      size: 28,
      onClick: () => this.go("Menu"),
    });
    back.setDepth(10);

    // ---- scrolling: drag with a little inertia; start on the current level (or the focus)
    const focusN = this.focus || currentLevel();
    const fNode = this.nodes[focusN - 1];
    this.minY = Math.min(0, H - this.mapH);
    this.scrollY = Phaser.Math.Clamp(H * 0.55 - fNode.y, this.minY, 0);
    this.vel = 0;
    this.map.y = this.scrollY;
    this.input.on("pointerdown", (p) => {
      if (this.modal) return;
      this.drag = {
        y0: p.worldY,
        s0: this.scrollY,
        moved: 0,
        t: this.time.now,
        last: p.worldY,
      };
      this.vel = 0;
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag || !p.isDown) return;
      const dy = p.worldY - this.drag.y0;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dy));
      this.vel = (p.worldY - this.drag.last) * 60;
      this.drag.last = p.worldY;
      this.scrollY = Phaser.Math.Clamp(this.drag.s0 + dy, this.minY - 60, 60);
    });
    this.input.on("pointerup", (p) => {
      const d = this.drag;
      this.drag = null;
      if (!d || this.modal) return;
      if (d.moved < 12) {
        // a tap: which node? (world coordinates: the camera is zoomed to fit the screen)
        const my = p.worldY - this.scrollY;
        const hit = this.nodes.find((nd) => Math.hypot(nd.x - p.worldX, nd.y - my) < 64);
        if (hit) this.openLevel(hit.n);
      }
    });
    this.input.on("wheel", (_p, _o, _dx, dy) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, this.minY, 0);
    });
    if (TEST.on && typeof window !== "undefined") window.__glyLevelSelect = this;
  }

  update(_t, delta) {
    const dt = Math.min(0.05, delta / 1000);
    if (!this.drag) {
      this.scrollY += this.vel * dt;
      this.vel *= Math.exp(-dt * 4);
      // spring back inside the map
      if (this.scrollY > 0) this.scrollY += (0 - this.scrollY) * Math.min(1, dt * 10);
      if (this.scrollY < this.minY)
        this.scrollY += (this.minY - this.scrollY) * Math.min(1, dt * 10);
    }
    this.map.y = Math.round(this.scrollY);
    // the current level's node pulses
    if (this.pulse) this.pulse.setScale(1 + Math.sin(this.time.now / 260) * 0.08);
  }

  /** A realm's band: a tinted panel with pixel stars in its colour and its name. */
  drawBand(realm, y, h, r) {
    const W = this.W;
    const g = this.add.graphics();
    g.fillStyle(realm.col, 0.07).fillRect(0, y, W, h);
    g.lineStyle(2, realm.col, 0.35).lineBetween(0, y, W, y);
    // pixel stars / specks, fixed per realm
    for (let i = 0; i < 46; i++) {
      const sx = (i * 137 + r * 61) % W;
      const sy = y + ((i * 211 + r * 89) % h);
      const s = i % 5 === 0 ? 6 : 3;
      g.fillStyle(realm.col, i % 3 ? 0.25 : 0.5).fillRect(sx, sy, s, s);
    }
    const t = neonText(this, W / 2, y + 62, realm.name, 40, realm.col, {
      blur: 16,
    });
    const from = r * 10 + 1;
    const unlocked = isUnlocked(from);
    const sub = plainText(
      this,
      W / 2,
      y + 108,
      from > builtCount()
        ? "coming soon"
        : unlocked
          ? `LEVELS ${from}–${from + 9}`
          : `Beat level ${from - 1} to unlock`,
      18,
      unlocked ? "#ffffff" : "#8a80b0",
    );
    this.map.add([g, t, sub]);
  }

  drawNode(nd) {
    const { n, x, y } = nd;
    const def = getLevel(n);
    const realm = REALMS[Math.floor((n - 1) / 10)];
    const boss = n % 10 === 0;
    const built = !!def;
    const open = built && isUnlocked(n);
    const stars = starsOf(n);
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const R = boss ? 54 : 42;
    const col = open ? realm.col : 0x3a3060;
    g.fillStyle(0x000000, 0.5).fillCircle(4, 6, R);
    g.fillStyle(open ? 0x120a26 : 0x0a0614, 1).fillCircle(0, 0, R);
    g.lineStyle(boss ? 6 : 5, col, 1).strokeCircle(0, 0, R);
    if (boss) g.lineStyle(2, col, 0.5).strokeCircle(0, 0, R + 9);
    c.add(g);
    if (!built) {
      c.add(plainText(this, 0, 0, "SOON", 16, "#6a6090"));
    } else if (!open) {
      // a padlock
      const lk = this.add.graphics();
      lk.lineStyle(5, 0x8a80b0, 1).strokeRoundedRect(-11, -20, 22, 22, 10);
      lk.fillStyle(0x8a80b0, 1).fillRoundedRect(-16, -6, 32, 24, 5);
      c.add(lk);
    } else {
      c.add(
        neonText(this, 0, boss ? -6 : 0, String(n), boss ? 34 : 30, 0xffffff, {
          blur: 6,
        }),
      );
      if (boss) c.add(plainText(this, 0, 24, "BOSS", 14, "#ff8a9a"));
    }
    if (boss && open) {
      // a crown on boss nodes
      const cr = this.add.graphics({ x: 0, y: -R - 16 });
      cr.fillStyle(0xffd23f, 1)
        .fillTriangle(-20, 8, -14, -10, -6, 8)
        .fillTriangle(-6, 8, 0, -14, 6, 8)
        .fillTriangle(6, 8, 14, -10, 20, 8);
      cr.fillRect(-20, 6, 40, 8);
      c.add(cr);
    }
    if (open) {
      // three stars under the node
      [0, 1, 2].forEach((i) => {
        const sg = this.add.graphics({ x: (i - 1) * 28, y: R + 18 });
        drawStar(sg, 12, stars[i] ? 0xffd23f : 0x2a2440, stars[i] ? 0xfff6c0 : 0x4a4070);
        c.add(sg);
      });
    }
    this.map.add(c);
    if (open && n === currentLevel() && !levelRecord(n)?.done) this.pulse = c;
  }

  // ---------------------------------------------------------------- the level card
  openLevel(n) {
    const def = getLevel(n);
    Sfx.ui?.();
    if (!def) return this.toastMsg("Coming soon: more levels are on the way");
    if (!isUnlocked(n)) {
      return this.toastMsg(
        n % 10 === 1
          ? `Beat the boss at level ${n - 1} to open this realm`
          : `Beat level ${n - 1} first`,
      );
    }
    const W = this.W;
    const H = this.H;
    const realm = REALMS[def.realmIdx];
    const c = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x020107, 0.82).setInteractive();
    const ph = 640;
    const py = H / 2 - ph / 2;
    const g = this.add.graphics();
    drawNeonRect(g, 40, py, W - 80, ph, 28, realm.col, {
      fill: 0x0b0520,
      fillAlpha: 0.98,
      width: 4,
    });
    c.add([dim, g]);
    c.add(
      plainText(
        this,
        W / 2,
        py + 50,
        `${def.boss ? "BOSS · " : ""}LEVEL ${n} · ${realm.name}`,
        18,
        "#cfc6ff",
      ),
    );
    c.add(
      neonText(this, W / 2, py + 100, def.name.toUpperCase(), 40, realm.col, {
        blur: 14,
      }),
    );
    c.add(
      plainText(this, W / 2, py + 152, def.blurb || "", 18, "#ffffff", {
        wrap: W - 160,
      }),
    );
    const st = starsOf(n);
    const labels = ["Finish", "All 3 star coins", "No crashes"];
    st.forEach((on, i) => {
      const yy = py + 220 + i * 50;
      const sg = this.add.graphics({ x: W / 2 - 150, y: yy });
      drawStar(sg, 16, on ? 0xffd23f : 0x2a2440, on ? 0xfff6c0 : 0x4a4070);
      c.add(sg);
      c.add(
        plainText(this, W / 2 - 120, yy, labels[i], 20, on ? "#ffd23f" : "#bfb6e8").setOrigin(
          0,
          0.5,
        ),
      );
    });
    const rec = levelRecord(n);
    const coinsGot = rec?.coins?.filter(Boolean).length || 0;
    c.add(
      plainText(
        this,
        W / 2,
        py + 390,
        `Star coins ${coinsGot}/3 · Best ${fmtTime(rec?.best)}${rec?.attempts ? ` · ${rec.attempts} attempts` : ""}`,
        17,
        "#cfc6ff",
      ),
    );
    const play = button(this, W / 2, py + 470, 400, 90, "PLAY", {
      color: 0x39ff88,
      size: 40,
      onClick: () => this.play(n, false),
    });
    const prac = button(this, W / 2 - 110, py + 572, 200, 64, "PRACTICE", {
      color: 0x3ef4ff,
      size: 20,
      onClick: () => this.play(n, true),
    });
    const close = button(this, W / 2 + 110, py + 572, 200, 64, "CLOSE", {
      color: 0xb45cff,
      size: 20,
      onClick: () => this.closeModal(),
    });
    c.add([play, prac, close]);
    dim.on("pointerup", (p) => {
      if (p.worldY < py || p.worldY > py + ph) this.closeModal();
    });
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.modal = c;
  }

  closeModal() {
    const c = this.modal;
    if (!c) return;
    this.modal = null;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 140,
      onComplete: () => c.destroy(),
    });
  }

  toastMsg(msg) {
    const t = plainText(this, this.W / 2, this.H - 140, msg, 20, "#ffd23f", {
      wrap: this.W - 100,
    }).setDepth(60);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1600,
      duration: 400,
      onComplete: () => t.destroy(),
    });
  }

  play(n, practice) {
    if (this.leaving) return;
    this.leaving = true;
    Sfx.unlock?.();
    this.scene.start("Game", { mode: "level", level: n, practice });
  }

  go(key) {
    if (this.leaving) return;
    this.leaving = true;
    Sfx.ui?.();
    this.scene.start(key);
  }
}
