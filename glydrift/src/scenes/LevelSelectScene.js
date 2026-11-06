// LEVEL MAP: a journey down through the five realms (level 1 at the top, the Abyss at the
// bottom). A glowing neon path links the levels: bright where you have been, dim and dashed
// ahead. Your hero hovers on the current level and flies along the path to any level you tap.
// Locked levels tease their hazard, bosses loom, portals wait in the fog at each realm's end,
// chests sit on the path every 5 levels, star milestones run down the side, and at the very
// bottom a huge eye opens as you get closer. Each realm's scenery scrolls past in parallax and
// the colours change as you cross into the next realm.
//
// Reduce Flashing: no twinkles, flickers or glow pulses (gentle scale pulses only).
// Low Graphics: no weather, sparkles, flowing lights or extra glow layers.
import Phaser from "phaser";
import { fitCamera, VIEW } from "../config.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Save } from "../data/save.js";
import { Progression } from "../data/progression.js";
import { Effects } from "../effects/Effects.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter } from "../player/characterDefs.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { button, drawNeonRect, neonText, plainText } from "../ui/ui.js";
import { BOSS_RED, BOSS_RED_HEX, fitWidth, levelNameLine } from "../ui/levelName.js";
import { REALM_PROPS, ensureMapArt, mapMix } from "../pixel/mapArt.js";
import {
  CHEST_COUNT,
  LEVEL_COUNT,
  REALMS,
  STAR_MILESTONES,
  builtCount,
  chestCoins,
  chestState,
  claimChests,
  claimMilestones,
  currentLevel,
  fmtTime,
  getLevel,
  isUnlocked,
  levelRecord,
  mainHazard,
  milestoneClaimed,
  nextLevel,
  realmStars,
  starCount,
  starsOf,
  totalStars,
} from "../levels/levels.js";
import { drawStar } from "./LevelCompleteScene.js";
import { TEST } from "../systems/testFlags.js";

const STEP = 150; // vertical space per level node
const BAND_HEAD = 200; // realm title area at the top of each band
const CHEST_GAP = 130; // a chest stop on the path
const PORTAL_H = 360; // the portal at the end of a realm
const EYE_H = 760; // the Abyss finale
const SWAY = 165; // how far the path winds left and right
const R_NODE = 44;
const R_CUR = 54;
const R_BOSS = 66;
const PROP_PARALLAX = 0.82; // the scenery layer moves slower than the path
// each realm's hazard colour (boss glow)
const HZ = { void: 0xff2bd6, solar: 0xff4a1a, frozen: 0x7ad8ff, glitch: 0x39ff88, abyss: 0xff1a2e };

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
    ensureMapArt(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.modal = null;
    this.t = 0;
    // the scene object is reused on every visit: start every list and handle afresh
    this.titlePlates = [];
    this.bosses = [];
    this.starred = [];
    this.blinkers = [];
    this.pools = [];
    this.pulse = null;
    this.selLabel = null;
    this.toastT = null;
    this.flight = null;
    this.flying = false;
    this.scrollTween = null;
    this.drag = null;
    this.lowGfx = !!Save.data.settings?.lowGfx;
    this.rf = reduceFlashing();
    const top = (this.registry.get("safeTop") || 0) + 20;
    const sb = this.registry.get("safeBottom") || 0;
    this.headerH = top + 150;
    this.playY = H - sb - 86;
    this.viewBottom = this.playY - 64;
    // where a level may sit when the map moves on its own: under the realm bar (header + 50)
    // and above the PLAY button, with room for the hero above it and its stars and name below
    this.safeTop = this.headerH + 50 + 12;
    this.safeBottom = this.playY - 50 - 16;

    // rewards earned since the last visit (chests, star milestones) open on arrival
    this.newChests = claimChests();
    this.newMilestones = claimMilestones();

    this.add.rectangle(W / 2, H / 2, W, H, 0x05020e, 0.38).setDepth(0);
    this.bandG = this.add.graphics().setDepth(1);
    this.props = this.add.container(0, 0).setDepth(2);
    this.map = this.add.container(0, 0).setDepth(4);

    this.layout(this.headerH + 24);
    this.drawBands();
    this.drawProps();
    this.drawPath();
    this.drawPortals();
    this.drawEye();
    this.drawChests();
    this.nodes.forEach((nd) => this.drawNode(nd));
    // realm titles over the path
    for (const objs of this.titlePlates) this.map.add(objs);
    this.makeWeather();
    this.makeHero();
    this.makeHeader(top);
    this.makeRail();
    this.makePlay();

    // ---- scrolling: drag with a little inertia; opens on the current level (or the focus)
    const focusN = this.focus || nextLevel();
    const fNode = this.nodes[focusN - 1] || this.nodes[0];
    // bottom padding: even the last stop can scroll clear above the PLAY button
    this.minY = Math.min(0, this.safeBottom - this.mapH - 40);
    this.scrollY = this.scrollFor(fNode.y, fNode.R || R_CUR);
    this.lastScroll = this.scrollY;
    this.vel = 0;
    this.applyScroll();
    this.input.on("pointerdown", (p) => {
      if (this.modal) return;
      this.drag = { y0: p.worldY, s0: this.scrollY, moved: 0, last: p.worldY };
      this.vel = 0;
      this.scrollTween?.stop();
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
      // taps on the fixed UI (header, PLAY, milestone rail) are theirs, not the map's
      if (d.moved < 12 && p.worldY > this.headerH && p.worldY < this.viewBottom + 40 && p.worldX < W - 60)
        this.tapMap(p.worldX, p.worldY - this.scrollY);
    });
    this.input.on("wheel", (_p, _o, _dx, dy) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, this.minY, 0);
    });
    // new chests and milestones: open them once the map has settled
    this.time.delayedCall(450, () => this.celebrateArrivals());
    if (TEST.on && typeof window !== "undefined") window.__glyLevelSelect = this;
  }

  // ================================================================ layout
  /** Waypoints down the map: level nodes, chests, portals and the eye, in path order. */
  layout(y0) {
    const W = this.W;
    this.nodes = [];
    this.wps = [];
    this.bands = [];
    this.chests = [];
    this.portals = [];
    let y = y0;
    const xAt = (n) => (n % 10 === 0 ? W / 2 - 30 : W / 2 - 30 + Math.sin((n - 1) * 0.9) * SWAY);
    for (let r = 0; r < REALMS.length; r++) {
      const band = { r, y0: y, titleY: y + 70 };
      this.bands.push(band);
      y += BAND_HEAD;
      for (let j = 0; j < 10; j++) {
        const n = r * 10 + j + 1;
        const boss = n % 10 === 0;
        if (boss) y += 40;
        const nd = { type: "node", n, x: xAt(n), y: y + STEP / 2, r, boss };
        this.nodes.push(nd);
        this.wps.push(nd);
        y += STEP + (boss ? 50 : 0);
        if ((j + 1) % 5 === 0) {
          const k = n / 5;
          const ch = { type: "chest", k, x: W / 2 - 30 + Math.sin((n - 0.5) * 0.9) * SWAY * 0.8, y: y + CHEST_GAP / 2, r };
          this.chests.push(ch);
          this.wps.push(ch);
          y += CHEST_GAP;
        }
      }
      if (r < REALMS.length - 1) {
        const po = { type: "portal", r, x: W / 2 - 30, y: y + PORTAL_H / 2 - 20 };
        this.portals.push(po);
        this.wps.push(po);
        y += PORTAL_H;
      } else {
        this.eye = { type: "eye", x: W / 2 - 30, y: y + EYE_H * 0.5 };
        this.wps.push({ ...this.eye, y: this.eye.y - 210 });
        y += EYE_H;
      }
      band.y1 = y;
    }
    this.mapH = y + 40;
    this.wps.forEach((w, i) => (w.i = i));
    this.spline = new Phaser.Curves.Spline(this.wps.map((w) => new Phaser.Math.Vector2(w.x, w.y)));
  }

  /** Is the path lit up to this waypoint (you can reach it)? */
  reached(w) {
    if (!w) return false;
    if (w.type === "node") return !!getLevel(w.n) && isUnlocked(w.n);
    if (w.type === "chest") return !!levelRecord(w.k * 5)?.done;
    if (w.type === "portal") return !!levelRecord((w.r + 1) * 10)?.done;
    return !!levelRecord(LEVEL_COUNT)?.done;
  }

  realmCol(r) {
    return REALMS[Math.min(REALMS.length - 1, r)].col;
  }

  // ================================================================ drawing
  drawBands() {
    const W = this.W;
    for (const b of this.bands) {
      const realm = REALMS[b.r];
      const g = this.add.graphics();
      // a faint wash of the realm's colour, fading in at the top
      for (let i = 0; i < 6; i++)
        g.fillStyle(realm.col, 0.012 * (i + 1)).fillRect(0, b.y0 + i * 30, W, b.y1 - b.y0 - i * 30);
      g.lineStyle(2, realm.col, 0.35).lineBetween(0, b.y0, W, b.y0);
      const open = isUnlocked(b.r * 10 + 1);
      // realm title with its stars right next to it ("NEON VOID 2/30 ★")
      const name = neonText(this, 0, b.titleY, realm.name, 40, realm.col, { blur: 14 });
      const st = neonText(this, 0, b.titleY + 2, `${realmStars(b.r)}/30 ★`, 26, 0xffd23f, { blur: 8 });
      const gap = 22;
      const total = name.width + gap + st.width;
      const scale = Math.min(1, (W - 120) / total);
      name.setScale(scale);
      st.setScale(scale);
      const left = W / 2 - 30 - (total * scale) / 2;
      name.x = left + (name.width * scale) / 2;
      st.x = left + (name.width + gap) * scale + (st.width * scale) / 2;
      const sub = plainText(
        this,
        W / 2 - 30,
        b.titleY + 46,
        open
          ? `LEVELS ${b.r * 10 + 1}–${b.r * 10 + 10}`
          : `Beat level ${b.r * 10} to unlock`,
        17,
        open ? "#ffffff" : "#8a80b0",
      );
      // a dark plate behind the title so the path never runs through the words
      const plate = this.add.graphics();
      const pw = total * scale + 60;
      plate.fillStyle(0x05020e, 0.72).fillRoundedRect(W / 2 - 30 - pw / 2, b.titleY - 34, pw, 106, 18);
      plate.lineStyle(2, realm.col, 0.35).strokeRoundedRect(W / 2 - 30 - pw / 2, b.titleY - 34, pw, 106, 18);
      this.titlePlates ||= [];
      this.titlePlates.push([plate, name, st, sub]);
      this.map.add(g);
      b.titleObjs = [name, st, sub];
    }
  }

  /** Scenery along the path on a parallax layer (props sit opposite the path's bends). */
  drawProps() {
    const W = this.W;
    const C = (this.headerH + this.viewBottom) / 2;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const b of this.bands) {
      const realm = REALMS[b.r];
      const kinds = REALM_PROPS[realm.id];
      let i = 0;
      for (let y = b.y0 + 230; y < b.y1 - 120; y += 210 + rnd() * 60) {
        // the path's x at this height decides the side
        const near = this.nodes.reduce((m, nd) => (Math.abs(nd.y - y) < Math.abs(m.y - y) ? nd : m));
        const left = near.x > W / 2 - 30;
        const x = left ? 64 + rnd() * 70 : W - 210 + rnd() * 50;
        const fr = kinds[i++ % kinds.length];
        const img = this.add.image(x, PROP_PARALLAX * y + (1 - PROP_PARALLAX) * C, "lvmap", fr);
        img.setOrigin(0.5, 1).setScale(0.75 + rnd() * 0.45).setAlpha(0.85);
        if (rnd() < 0.5) img.setFlipX(true);
        this.props.add(img);
        if (fr === "abyss_eye") {
          img.setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
          (this.blinkers ||= []).push({ img, t: rnd() * 6, base: img.scaleY });
        }
        if (fr === "void_pool" && !this.lowGfx) (this.pools ||= []).push(img);
      }
      // the Frozen Nebula's aurora: soft ribbons high in its band
      if (realm.id === "frozen") {
        const g = this.add.graphics();
        const y0 = PROP_PARALLAX * (b.y0 + 260) + (1 - PROP_PARALLAX) * C;
        [0x6affc8, 0x3ef4ff, 0x8a6aff].forEach((col, k) => {
          g.lineStyle(this.lowGfx ? 10 : 18, col, 0.12);
          g.beginPath();
          for (let x = 0; x <= W; x += 24) {
            const yy = y0 + k * 34 + Math.sin(x / 90 + k) * 26;
            if (x === 0) g.moveTo(x, yy);
            else g.lineTo(x, yy);
          }
          g.strokePath();
        });
        this.props.addAt(g, 0);
      }
    }
  }

  /** The neon path: glowing where you have been, dim and dashed ahead. */
  drawPath() {
    const g = this.add.graphics();
    const N = this.wps.length - 1;
    const pts = (i) => {
      const out = [];
      for (let k = 0; k <= 14; k++) out.push(this.spline.getPoint((i + k / 14) / N));
      return out;
    };
    this.litPts = [];
    for (let i = 0; i < N; i++) {
      const to = this.wps[i + 1];
      const lit = this.reached(to);
      const col = this.realmCol(to.r ?? 4);
      const p = pts(i);
      if (lit) {
        const passes = this.lowGfx
          ? [[12, col, 0.22], [5, mapMix(col, 0xffffff, 0.55), 1]]
          : [[26, col, 0.08], [14, col, 0.22], [5, mapMix(col, 0xffffff, 0.55), 1]];
        for (const [w, c, a] of passes) {
          g.lineStyle(w, c, a);
          g.strokePoints(p);
        }
        this.litPts.push(...p);
      } else {
        g.lineStyle(12, 0x2a2048, 0.25).strokePoints(p);
        // dashes: one path per segment (14 px on, 14 px off)
        g.lineStyle(5, 0x6a5a9a, 0.55);
        g.beginPath();
        let acc = 0;
        for (let k = 1; k < p.length; k++) {
          const a = p[k - 1];
          const b = p[k];
          const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
          let d = 0;
          while (d < len) {
            const phase = (acc + d) % 28;
            const run = Math.min(len - d, phase < 14 ? 14 - phase : 28 - phase);
            if (phase < 14) {
              const u0 = d / len;
              const u1 = (d + run) / len;
              g.moveTo(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0);
              g.lineTo(a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1);
            }
            d += Math.max(run, 0.5);
          }
          acc += len;
        }
        g.strokePath();
      }
    }
    this.map.add(g);
    // little lights running along the lit path
    this.flow = [];
    if (!this.lowGfx && this.litPts.length > 2) {
      for (let k = 0; k < 7; k++) {
        const d = this.add.circle(0, 0, 4, 0xffffff, 0.9);
        this.map.add(d);
        this.flow.push({ d, u: k / 7 });
      }
    }
  }

  drawNode(nd) {
    const { n, x, y, boss } = nd;
    const def = getLevel(n);
    const realm = REALMS[nd.r];
    const open = !!def && isUnlocked(n);
    const done = !!levelRecord(n)?.done;
    const cur = open && !done && n === currentLevel();
    const stars = starsOf(n);
    const c = this.add.container(x, y);
    const R = boss ? R_BOSS : cur ? R_CUR : R_NODE;
    const hz = HZ[realm.id];
    const rim = boss ? (open ? hz : mapMix(hz, 0x2a2040, 0.6)) : open ? realm.col : 0x3a3060;
    // glow behind current and boss nodes
    if ((cur || boss) && !this.lowGfx) {
      const gl = this.add
        .image(0, 0, "glow")
        .setTint(boss ? hz : realm.col)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(boss ? 2.2 : 1.8)
        .setAlpha(boss ? (open ? 0.5 : 0.28) : 0.45);
      c.add(gl);
      if (boss) nd.glow = gl;
    }
    const g = this.add.graphics();
    if (boss) {
      // menacing spikes around the boss
      g.fillStyle(rim, open ? 0.9 : 0.5);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const a1 = a - 0.13;
        const a2 = a + 0.13;
        g.fillTriangle(
          Math.cos(a1) * (R - 2), Math.sin(a1) * (R - 2),
          Math.cos(a2) * (R - 2), Math.sin(a2) * (R - 2),
          Math.cos(a) * (R + 16), Math.sin(a) * (R + 16),
        );
      }
    }
    g.fillStyle(0x000000, 0.5).fillCircle(4, 6, R);
    g.fillStyle(open ? 0x120a26 : 0x0a0614, 1).fillCircle(0, 0, R);
    g.lineStyle(boss ? 7 : cur ? 6 : 5, rim, 1).strokeCircle(0, 0, R);
    if (boss) g.lineStyle(2, rim, 0.6).strokeCircle(0, 0, R - 10);
    // 3 stars: a gold ring
    if (done && starCount(n) === 3) g.lineStyle(5, 0xffd23f, 1).strokeCircle(0, 0, R + 8);
    c.add(g);
    if (!def) {
      c.add(plainText(this, 0, 0, "SOON", 16, "#6a6090"));
    } else if (boss) {
      const sk = this.add.image(0, -8, "lvmap", "skull").setTint(open ? 0xffffff : 0x8a7090);
      sk.setScale(48 / sk.height);
      c.add(sk);
      c.add(plainText(this, 0, 30, String(n), 16, open ? "#ffffff" : "#8a80b0"));
      c.add(neonText(this, 0, R + (open ? 50 : 30), "BOSS", 22, BOSS_RED_HEX, { blur: 8 }));
      if (!open) c.add(this.add.image(R * 0.62, R * 0.62, "lvmap", "lock").setScale(0.55).setTint(0x8a80b0));
    } else if (!open) {
      // locked: its number over a faint silhouette of the level's main hazard
      const ic = this.add.image(0, 0, "lvmap", `icon_${mainHazard(n)}`);
      ic.setScale(1.05).setTint(realm.col).setAlpha(0.2);
      c.add(ic);
      c.add(plainText(this, 0, 0, String(n), 26, "#9a90c0"));
      c.add(this.add.image(R * 0.66, R * 0.62, "lvmap", "lock").setScale(0.5).setTint(0x8a80b0));
    } else {
      c.add(neonText(this, 0, 0, String(n), cur ? 36 : 30, 0xffffff, { blur: 6 }));
    }
    if (open) {
      // three stars under the node, gold when earned
      [0, 1, 2].forEach((i) => {
        const sg = this.add.graphics({ x: (i - 1) * 28, y: R + 20 });
        drawStar(sg, 12, stars[i] ? 0xffd23f : 0x2a2440, stars[i] ? 0xfff6c0 : 0x4a4070);
        c.add(sg);
      });
    }
    this.map.add(c);
    nd.c = c;
    nd.R = R;
    nd.open = open;
    if (cur) this.pulse = c;
    if (boss) (this.bosses ||= []).push(nd);
    if (done && stars.some(Boolean)) (this.starred ||= []).push(nd);
  }

  drawChests() {
    for (const ch of this.chests) {
      const st = chestState(ch.k);
      // chests opened just now start closed and open on screen
      const animating = this.newChests.some((c) => c.k === ch.k);
      const img = this.add.image(ch.x, ch.y, "lvmap", st === "open" && !animating ? "chest_open" : "chest");
      img.setScale(1.1);
      if (st === "locked") img.setTint(0x7a70a0).setAlpha(0.85);
      this.map.add(img);
      ch.img = img;
      if (st === "locked") {
        const lk = this.add.image(ch.x + 30, ch.y + 22, "lvmap", "lock").setScale(0.45).setTint(0x8a80b0);
        this.map.add(lk);
        ch.lock = lk;
      }
    }
  }

  /** A swirling portal at each realm's end, half hidden in fog. */
  drawPortals() {
    if (!this.textures.exists("lvswirl")) {
      const g = this.make.graphics({ add: false });
      for (let arm = 0; arm < 3; arm++)
        for (let r = 8; r < 96; r += 3) {
          const a = (arm * Math.PI * 2) / 3 + r * 0.055;
          g.fillStyle(0xffffff, 0.15 + (r / 96) * 0.6).fillCircle(100 + Math.cos(a) * r, 100 + Math.sin(a) * r, 3 + r / 30);
        }
      g.generateTexture("lvswirl", 200, 200);
      g.destroy();
    }
    for (const po of this.portals) {
      const next = REALMS[po.r + 1];
      const open = this.reached(po);
      const c = this.add.container(po.x, po.y);
      if (!this.lowGfx)
        c.add(this.add.image(0, 0, "glow").setTint(next.col).setBlendMode(Phaser.BlendModes.ADD).setScale(3.2, 3.8).setAlpha(open ? 0.55 : 0.25));
      const g = this.add.graphics();
      g.fillStyle(0x05020e, 1).fillEllipse(0, 0, 170, 230);
      g.lineStyle(10, next.col, open ? 1 : 0.5).strokeEllipse(0, 0, 176, 236);
      g.lineStyle(3, 0xffffff, open ? 0.7 : 0.25).strokeEllipse(0, 0, 150, 208);
      const sw = this.add.image(0, 0, "lvswirl").setTint(next.col).setScale(0.78, 1.04).setAlpha(open ? 0.95 : 0.45);
      c.add([g, sw]);
      // fog drifting across the portal (thicker while it's locked)
      po.fog = [];
      const fogN = this.lowGfx ? 2 : 6;
      for (let k = 0; k < fogN; k++) {
        const f = this.add
          .image((k - fogN / 2) * 50, 60 + (k % 3) * 34, "glow")
          .setTint(0x9a90c0)
          .setScale(2.6 + (k % 2), 1.5)
          .setAlpha(open ? 0.22 : 0.5);
        c.add(f);
        po.fog.push({ f, x0: f.x, ph: k * 1.7 });
      }
      c.add(neonText(this, 0, 168, `TO ${next.name}`, 22, next.col, { blur: 8 }).setAlpha(open ? 1 : 0.7));
      this.map.add(c);
      po.c = c;
      po.swirl = sw;
      po.open = open;
    }
  }

  /** The Abyss finale: a huge eye in the dark that opens as you get closer to it. */
  drawEye() {
    const e = this.eye;
    const W = this.W;
    const b = this.bands[this.bands.length - 1];
    const dark = this.add.graphics();
    // the bottom of the map sinks into darkness
    for (let i = 0; i < 12; i++) dark.fillStyle(0x000000, 0.07).fillRect(0, e.y - 380 + i * 34, W, b.y1 - (e.y - 380) - i * 34 + 60);
    // veins reaching out of the dark
    dark.lineStyle(3, 0x7a0418, 0.45);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      dark.beginPath();
      dark.moveTo(e.x + Math.cos(a) * 300, e.y + Math.sin(a) * 170);
      dark.lineTo(e.x + Math.cos(a + 0.2) * 360, e.y + Math.sin(a + 0.3) * 230);
      dark.lineTo(e.x + Math.cos(a - 0.1) * 420, e.y + Math.sin(a) * 300);
      dark.strokePath();
    }
    this.map.add(dark);
    if (!this.lowGfx) {
      this.eyeGlow = this.add.image(e.x, e.y, "glow").setTint(0xc8102e).setBlendMode(Phaser.BlendModes.ADD).setScale(6, 3.6).setAlpha(0);
      this.map.add(this.eyeGlow);
    }
    this.eyeG = this.add.graphics();
    this.irisG = this.add.graphics();
    this.maskG = this.make.graphics({ add: false });
    this.irisG.setMask(this.maskG.createGeometryMask());
    this.map.add([this.eyeG, this.irisG]);
    const done = !!levelRecord(LEVEL_COUNT)?.done;
    this.map.add(
      plainText(this, e.x, e.y + 230, done ? "THE ABYSS IS CONQUERED" : "something waits at the very bottom…", 18, done ? "#ffd23f" : "#8a2a3a"),
    );
    // how far it opens: your progress through all 50 levels
    let doneN = 0;
    for (let n = 1; n <= LEVEL_COUNT; n++) if (levelRecord(n)?.done) doneN++;
    this.eyeTarget = 0.06 + 0.94 * Math.min(1, doneN / LEVEL_COUNT);
    const lv = Save.data.lv || {};
    this.eyeOpen = Math.min(this.eyeTarget, lv.eyeOpen ?? 0.06);
    this.eyeShown = this.eyeOpen;
  }

  renderEye(open, lookX) {
    const e = this.eye;
    const ew = 520;
    const hh = 150;
    const g = this.eyeG;
    const m = this.maskG;
    g.clear();
    m.clear();
    const pts = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push({ x: e.x - ew / 2 + u * ew, y: e.y - hh * open * Math.sin(Math.PI * u) ** 0.8 });
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N;
      pts.push({ x: e.x - ew / 2 + u * ew, y: e.y + hh * 0.85 * open * Math.sin(Math.PI * u) ** 0.8 });
    }
    g.fillStyle(0x1a0204, 1).fillPoints(pts, true);
    g.lineStyle(7, 0x4a0a14, 1).strokePoints(pts, true);
    // the iris and slit pupil, clipped to the opening (the mask follows the map's scroll)
    const sy = this.map.y;
    m.fillStyle(0xffffff).fillPoints(pts.map((p) => ({ x: p.x, y: p.y + sy })), true);
    const ix = e.x + lookX;
    const ig = this.irisG;
    ig.clear();
    ig.fillStyle(0x6a0610, 1).fillCircle(ix, e.y, 104);
    ig.fillStyle(0xc8102e, 1).fillCircle(ix, e.y, 86);
    ig.lineStyle(4, 0xff3a4a, 0.8).strokeCircle(ix, e.y, 86);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ig.lineStyle(2, 0x8a0a1a, 0.7).lineBetween(ix + Math.cos(a) * 30, e.y + Math.sin(a) * 30, ix + Math.cos(a) * 82, e.y + Math.sin(a) * 82);
    }
    ig.fillStyle(0x000000, 1).fillEllipse(ix, e.y, 26, 40 + 130 * open);
    ig.fillStyle(0xffd0d0, 0.8).fillCircle(ix + 26, e.y - 30, 9);
  }

  // ================================================================ hero, header, rail, PLAY
  makeHero() {
    this.fx = new Effects(this, { lowGfx: this.lowGfx });
    this.fx.drift = 84;
    this.heroDef = getCharacter(TEST.character || Progression.selectedHero());
    const home = this.nodes[currentLevel() - 1] || this.nodes[0];
    this.heroAt = home;
    this.heroU = home.i / (this.wps.length - 1);
    this.rig = new CharacterRig(this, this.heroDef, this.fx, {
      x: home.x,
      y: home.y,
      lowGfx: this.lowGfx,
      depth: 9,
      scale: 0.95,
    });
    this.flapT = 0;
  }

  makeHeader(top) {
    const W = this.W;
    const hdr = this.add.graphics().setDepth(20);
    hdr.fillStyle(0x05020e, 1).fillRect(0, 0, W, this.headerH);
    hdr.lineStyle(3, 0xb45cff, 0.8).lineBetween(0, this.headerH, W, this.headerH);
    neonText(this, W / 2, top + 46, "LEVELS", 48, 0xb45cff, { blur: 16 }).setDepth(21);
    this.starsText = neonText(this, W / 2, top + 98, `${totalStars()}/${LEVEL_COUNT * 3} ★`, 26, 0xffd23f, {
      blur: 10,
    }).setDepth(21);
    const next = STAR_MILESTONES.find((m) => !milestoneClaimed(m));
    const line = plainText(
      this,
      W / 2,
      top + 130,
      next ? `Next: ${next.stars}★ unlocks the ${next.label}` : "Every star milestone unlocked!",
      15,
      "#ffe9a0",
    ).setDepth(21);
    fitWidth(line, W - 60);
    const back = button(this, 80, top + 46, 110, 64, "◀", {
      color: 0x3ef4ff,
      size: 28,
      onClick: () => this.go("Menu"),
    });
    back.setDepth(22);
    // the realm you're in, on its own line under the header (shown while its title is out of view)
    this.strip = this.add.container(0, this.headerH).setDepth(19).setAlpha(0);
    const sg = this.add.graphics();
    sg.fillStyle(0x05020e, 0.94).fillRect(0, 0, W, 50);
    this.stripLine = sg;
    this.stripText = plainText(this, W / 2 - 30, 25, "", 22, "#ffffff");
    this.strip.add([sg, this.stripText]);
    this.stripR = -1;
  }

  /** Star milestones on a rail down the right edge, filled as you earn stars. */
  makeRail() {
    const W = this.W;
    const x = W - 30;
    const y0 = this.headerH + 70;
    const y1 = this.viewBottom - 20;
    const have = totalStars();
    const g = this.add.graphics().setDepth(18);
    g.fillStyle(0x05020e, 0.7).fillRoundedRect(x - 9, y0 - 9, 18, y1 - y0 + 18, 9);
    g.fillStyle(0x2a2048, 1).fillRoundedRect(x - 5, y0, 10, y1 - y0, 5);
    const fill = (y1 - y0) * Math.min(1, have / 150);
    if (fill > 0) g.fillStyle(0xffd23f, 1).fillRoundedRect(x - 5, y0, 10, Math.max(10, fill), 5);
    this.rail = { x, y0, y1, marks: [] };
    const nextM = STAR_MILESTONES.find((m) => !milestoneClaimed(m));
    for (const m of STAR_MILESTONES) {
      const y = y0 + (y1 - y0) * (m.stars / 150);
      const got = milestoneClaimed(m);
      const mk = this.add.graphics({ x, y }).setDepth(18.5);
      mk.fillStyle(got ? 0xffd23f : 0x120a26, 1).fillCircle(0, 0, 15);
      mk.lineStyle(3, got ? 0xfff6c0 : m === nextM ? 0xffffff : 0x5a5080, 1).strokeCircle(0, 0, 15);
      drawStar(mk, 8, got ? 0xfff6c0 : 0x5a5080, got ? 0xffffff : 0x3a3060);
      const lb = plainText(this, x - 22, y, `${m.stars}★`, 14, got ? "#ffd23f" : "#bfb6e8", { ox: 1 }).setDepth(18.5);
      const zone = this.add.zone(x - 10, y, 70, 44).setInteractive().setDepth(30);
      zone.on("pointerup", () => {
        if (this.modal) return;
        Sfx.chime?.();
        Haptics.light();
        this.toastMsg(
          got
            ? `${m.stars}★ reached: ${m.label} unlocked!`
            : `${m.stars}★ unlocks the ${m.label} · ${m.stars - have} stars to go`,
        );
      });
      this.rail.marks.push({ m, mk, lb, next: m === nextM });
    }
  }

  makePlay() {
    const W = this.W;
    const n = nextLevel();
    const def = getLevel(n);
    const b = button(this, W / 2 - 30, this.playY, 440, 100, "PLAY", {
      color: 0x39ff88,
      size: 40,
      sub: def ? `Level ${def.n}: ${def.name}` : "",
      onClick: () => this.playNext(),
    });
    b.setDepth(25);
    const sub = b.list.filter((o) => o.type === "Text")[1];
    if (sub) {
      fitWidth(sub, 400);
      if (def?.boss) sub.setColor(BOSS_RED);
    }
    this.playBtn = b;
  }

  // ================================================================ interaction
  tapMap(x, y) {
    const hit = (list, r) => list.find((w) => Math.hypot(w.x - x, w.y - y) < r);
    const nd = hit(this.nodes, 66);
    if (nd) return this.select(nd.n);
    const ch = hit(this.chests, 54);
    if (ch) return this.tapChest(ch);
    const po = hit(this.portals, 110);
    if (po) return this.tapPortal(po);
  }

  /** Tap a level: the hero flies along the path to it, then its card opens. */
  select(n, then) {
    const nd = this.nodes[n - 1];
    const def = getLevel(n);
    if (!def || !isUnlocked(n)) {
      Haptics.tap?.();
      Sfx.ui?.();
      if (nd?.c && !this.rf)
        this.tweens.add({ targets: nd.c, x: nd.x + 8, duration: 50, yoyo: true, repeat: 2, onComplete: () => nd.c.setX(nd.x) });
      return this.openLevel(n);
    }
    Haptics.light();
    Sfx.chime?.();
    this.showName(nd, def);
    const done = () => (then ? then() : this.openLevel(n));
    if (this.heroAt === nd) return done();
    this.flyTo(nd, done);
  }

  flyTo(nd, onArrive) {
    const N = this.wps.length - 1;
    const u0 = this.heroU;
    const u1 = nd.i / N;
    const dist = Math.abs(u1 - u0) * this.mapH;
    this.flight?.stop();
    Sfx.whoosh?.();
    this.flying = true;
    this.flight = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Phaser.Math.Clamp(dist * 0.55, 380, 1100),
      ease: "Sine.easeInOut",
      onUpdate: (tw) => {
        this.heroU = u0 + (u1 - u0) * tw.getValue();
      },
      onComplete: () => {
        this.flying = false;
        this.heroAt = nd;
        this.heroU = u1;
        onArrive?.();
      },
    });
    // keep the target on screen while flying
    this.scrollTo(nd.y, nd.R);
  }

  /** The scroll that puts map point y (a node of radius R) inside the safe window: centred,
   * with the hero (above) and the stars and name (below) clear of the realm bar and PLAY. */
  scrollFor(y, R = R_NODE, bottom = this.safeBottom) {
    const above = R + 100; // hero hovering over the node
    const below = R + (R >= R_BOSS ? 112 : 78); // stars, BOSS and the selected level's name
    const top = this.safeTop;
    let s = (top + above + bottom - below) / 2 - y; // centre of the room the node needs
    s = Math.min(s, top + above - y); // never under the realm bar...
    s = Math.max(s, bottom - below - y); // ...nor behind PLAY (wins if the window is short)
    return Phaser.Math.Clamp(s, this.minY, 0);
  }

  scrollTo(y, R = R_NODE, bottom = this.safeBottom) {
    const target = this.scrollFor(y, R, bottom);
    this.scrollTween?.stop();
    this.vel = 0;
    const o = { v: this.scrollY };
    this.scrollTween = this.tweens.add({
      targets: o,
      v: target,
      duration: 420,
      ease: "Sine.easeOut",
      onUpdate: () => (this.scrollY = o.v),
    });
  }

  /** The selected level's name, under its node (bosses red with a skull). */
  showName(nd, def) {
    this.selLabel?.destroy();
    const lab = levelNameLine(this, nd.x, nd.y + nd.R + (nd.boss ? 86 : 52), def, 20, { prefix: false, maxW: 320 });
    this.map.add(lab);
    this.selLabel = lab;
  }

  tapChest(ch) {
    const st = chestState(ch.k);
    Haptics.light();
    Sfx.chime?.();
    if (st === "locked") return this.toastMsg(`Beat level ${ch.k * 5} to open this chest (+${chestCoins(ch.k)} coins)`);
    if (st === "ready") {
      const got = claimChests();
      got.forEach((c) => this.openChest(this.chests[c.k - 1], c.coins));
      return;
    }
    this.toastMsg(`Opened: +${chestCoins(ch.k)} coins`);
  }

  openChest(ch, coins) {
    if (!ch?.img) return;
    Sfx.chestShake?.();
    this.tweens.add({
      targets: ch.img,
      angle: { from: -8, to: 8 },
      duration: 70,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        ch.img.setAngle(0).setFrame("chest_open").clearTint().setAlpha(1);
        ch.lock?.destroy();
        Sfx.chestOpen?.();
        Haptics.strong();
        for (let k = 0; k < (this.lowGfx ? 4 : 10); k++) {
          const cn = this.add.image(ch.x, ch.y - 10, "lvmap", "coin").setScale(1.4);
          this.map.add(cn);
          const a = -Math.PI / 2 + (k - 4.5) * 0.22;
          this.tweens.add({
            targets: cn,
            x: ch.x + Math.cos(a) * (70 + (k % 3) * 20),
            y: ch.y - 20 + Math.sin(a) * (90 + (k % 2) * 30),
            alpha: 0,
            duration: 900,
            ease: "Cubic.easeOut",
            onComplete: () => cn.destroy(),
          });
        }
        const t = neonText(this, ch.x, ch.y - 70, `+${coins} COINS`, 26, 0xffd23f, { blur: 10 });
        this.map.add(t);
        this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, delay: 700, duration: 700, onComplete: () => t.destroy() });
      },
    });
  }

  tapPortal(po) {
    const next = REALMS[po.r + 1];
    Haptics.light();
    if (!this.reached(po)) {
      Sfx.ui?.();
      return this.toastMsg(`Beat level ${(po.r + 1) * 10} to unlock ${toTitle(next.name)}`);
    }
    Sfx.portal?.();
    this.scrollTo(this.bands[po.r + 1].y0 + 380);
  }

  /** Chests opened and milestones reached since the last visit. */
  celebrateArrivals() {
    let delay = 0;
    for (const c of this.newChests) {
      const ch = this.chests[c.k - 1];
      this.time.delayedCall(delay, () => {
        this.scrollTo(ch.y);
        this.time.delayedCall(450, () => this.openChest(ch, c.coins));
      });
      delay += 1500;
    }
    // then back to where you are on the journey
    if (this.newChests.length) {
      const home = this.nodes[nextLevel() - 1];
      this.time.delayedCall(delay + 200, () => home && this.scrollTo(home.y, home.R));
      delay += 600;
    }
    for (const m of this.newMilestones) {
      this.time.delayedCall(delay, () => {
        Sfx.reward?.();
        Haptics.strong();
        this.toastMsg(`${m.stars} STARS! ${m.label} unlocked`, "#ffd23f");
      });
      delay += 1800;
    }
  }

  playNext() {
    const n = nextLevel();
    if (!getLevel(n)) return;
    // jump straight in: a quick flight to the level, then go
    this.select(n, () => this.play(n, false));
  }

  // ---------------------------------------------------------------- the level card
  /** The card for level n (a sheet at the bottom; the map stays visible above it). */
  openLevel(n) {
    const def = getLevel(n);
    if (!def) return this.toastMsg("Coming soon: more levels are on the way");
    if (!isUnlocked(n)) {
      return this.toastMsg(
        n % 10 === 1 ? `Beat the boss at level ${n - 1} to open this realm` : `Beat level ${n - 1} first`,
      );
    }
    this.closeModal(true);
    const W = this.W;
    const H = this.H;
    const realm = REALMS[def.realmIdx];
    const col = def.boss ? BOSS_RED_HEX : realm.col;
    const sb = this.registry.get("safeBottom") || 0;
    const ph = 470;
    const py = H - sb - ph - 10;
    this.sheetTop = py;
    const c = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(W / 2, py / 2, W, py, 0x020107, 0.35).setInteractive();
    dim.on("pointerup", () => this.closeModal());
    const g = this.add.graphics();
    drawNeonRect(g, 20, py, W - 40, ph, 26, col, { fill: 0x0b0520, fillAlpha: 0.97, width: 4 });
    const block = this.add.rectangle(W / 2, py + ph / 2, W - 40, ph, 0, 0).setInteractive();
    c.add([dim, block, g]);
    const head = plainText(
      this,
      W / 2,
      py + 38,
      `${def.boss ? "BOSS · " : ""}LEVEL ${n} · ${realm.name}`,
      18,
      def.boss ? BOSS_RED : "#cfc6ff",
    );
    const name = neonText(this, W / 2, py + 84, def.name.toUpperCase(), 40, col, { blur: 14 });
    fitWidth(name, W - (def.boss ? 220 : 120));
    c.add([head, name]);
    if (def.boss) {
      for (const s of [-1, 1]) {
        const sk = this.add.image(W / 2 + s * (name.displayWidth / 2 + 34), py + 84, "lvmap", "skull").setTint(BOSS_RED_HEX);
        sk.setScale(40 / sk.height);
        c.add(sk);
      }
    }
    c.add(plainText(this, W / 2, py + 132, def.blurb || "", 17, "#ffffff", { wrap: W - 120 }));
    const st = starsOf(n);
    const labels = ["Finish", "3 star coins", "No crashes"];
    st.forEach((on, i) => {
      const x = W / 2 + (i - 1) * 190;
      const sg = this.add.graphics({ x, y: py + 196 });
      drawStar(sg, 18, on ? 0xffd23f : 0x2a2440, on ? 0xfff6c0 : 0x4a4070);
      c.add(sg);
      c.add(plainText(this, x, py + 232, labels[i], 15, on ? "#ffd23f" : "#bfb6e8"));
    });
    const rec = levelRecord(n);
    c.add(
      plainText(
        this,
        W / 2,
        py + 270,
        `Best ${fmtTime(rec?.best)}${rec?.attempts ? ` · ${rec.attempts} attempt${rec.attempts === 1 ? "" : "s"}` : ""}`,
        16,
        "#cfc6ff",
      ),
    );
    const play = button(this, W / 2, py + 340, 380, 88, "PLAY", {
      color: 0x39ff88,
      size: 40,
      onClick: () => this.play(n, false),
    });
    const prac = button(this, W / 2 - 110, py + 428, 200, 58, "PRACTICE", {
      color: 0x3ef4ff,
      size: 18,
      onClick: () => this.play(n, true),
    });
    const close = button(this, W / 2 + 110, py + 428, 200, 58, "CLOSE", {
      color: 0xb45cff,
      size: 18,
      onClick: () => this.closeModal(),
    });
    c.add([play, prac, close]);
    c.y = ph + 40;
    this.tweens.add({ targets: c, y: 0, duration: 220, ease: "Cubic.easeOut" });
    this.modal = c;
    this.playBtn?.setVisible(false);
    // keep the level in view above the sheet
    const nd = this.nodes[n - 1];
    this.showName(nd, def);
    const o = { v: this.scrollY };
    this.scrollTween?.stop();
    this.scrollTween = this.tweens.add({
      targets: o,
      v: Phaser.Math.Clamp(this.scrollFor(nd.y, nd.R, py - 12), this.minY - 400, 0),
      duration: 300,
      onUpdate: () => (this.scrollY = o.v),
    });
  }

  closeModal(instant) {
    const c = this.modal;
    if (!c) return;
    this.modal = null;
    this.playBtn?.setVisible(true);
    if (instant) return c.destroy();
    this.tweens.add({ targets: c, y: 520, duration: 180, onComplete: () => c.destroy() });
  }

  toastMsg(msg, color = "#ffd23f") {
    this.toastT?.destroy();
    const W = this.W;
    const t = this.add.container(W / 2, this.viewBottom - 30).setDepth(60);
    const txt = plainText(this, 0, 0, msg, 19, color, { wrap: W - 140 });
    const bg = this.add.graphics();
    bg.fillStyle(0x05020e, 0.9).fillRoundedRect(-txt.width / 2 - 18, -txt.height / 2 - 10, txt.width + 36, txt.height + 20, 14);
    t.add([bg, txt]);
    this.toastT = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 1900, duration: 400, onComplete: () => t.destroy() });
  }

  play(n, practice) {
    if (this.leaving) return;
    this.leaving = true;
    Sfx.unlock?.();
    this.saveEye();
    this.scene.start("Game", { mode: "level", level: n, practice });
  }

  go(key) {
    if (this.leaving) return;
    this.leaving = true;
    Sfx.ui?.();
    this.saveEye();
    this.scene.start(key);
  }

  saveEye() {
    if (!Save.data.lv) return;
    Save.data.lv.eyeOpen = Math.max(Save.data.lv.eyeOpen || 0, this.eyeShown || 0);
  }

  // ================================================================ weather
  makeWeather() {
    this.drops = [];
    if (this.lowGfx) return;
    for (let i = 0; i < 40; i++) {
      const d = this.add.rectangle(0, 0, 4, 4, 0xffffff, 0.5).setDepth(3);
      d.vx = 0;
      d.vy = 0;
      this.drops.push(d);
    }
    this.weatherR = -1;
  }

  setWeather(r) {
    if (r === this.weatherR || !this.drops.length) return;
    this.weatherR = r;
    for (const d of this.drops) this.resetDrop(d, true);
  }

  resetDrop(d, anywhere) {
    const W = this.W;
    const id = REALMS[this.weatherR].id;
    const y = anywhere ? this.headerH + Math.random() * (this.viewBottom - this.headerH) : null;
    d.setAngle(0).setAlpha(0.5);
    if (id === "void") {
      d.setSize(2, 22).setFillStyle(0x7ae8ff, 0.35).setAngle(12);
      d.vx = -150;
      d.vy = 900;
      d.y = y ?? this.headerH - 20;
    } else if (id === "solar") {
      d.setSize(4, 4).setFillStyle(Math.random() < 0.5 ? 0xff8a2a : 0xffd23f, 0.8);
      d.vx = 0;
      d.vy = -60 - Math.random() * 70;
      d.y = y ?? this.viewBottom + 10;
    } else if (id === "frozen") {
      d.setSize(4, 4).setFillStyle(0xffffff, 0.7);
      d.vx = 0;
      d.vy = 50 + Math.random() * 60;
      d.y = y ?? this.headerH - 10;
    } else if (id === "glitch") {
      const big = Math.random() < 0.4;
      d.setSize(big ? 12 : 6, big ? 4 : 6).setFillStyle(Math.random() < 0.7 ? 0x39ff88 : 0xff2bd6, 0.45);
      d.vx = 0;
      d.vy = 30;
      d.y = y ?? this.headerH + Math.random() * (this.viewBottom - this.headerH);
      d.life = 0.3 + Math.random() * 0.8;
    } else {
      d.setSize(4, 4).setFillStyle(0x9a1020, 0.55);
      d.vx = 0;
      d.vy = -25 - Math.random() * 25;
      d.y = y ?? this.viewBottom + 10;
    }
    d.x = Math.random() * W;
    d.ph = Math.random() * 6;
  }

  updateWeather(dt, dScroll) {
    if (!this.drops.length) return;
    const id = REALMS[this.weatherR]?.id;
    for (const d of this.drops) {
      d.x += (d.vx + (id === "frozen" || id === "solar" ? Math.sin(this.t * 1.3 + d.ph) * 30 : 0)) * dt;
      d.y += d.vy * dt + dScroll * 0.5;
      if (id === "solar" && !this.rf) d.setAlpha(0.5 + 0.4 * Math.sin(this.t * 9 + d.ph));
      if (id === "glitch") {
        d.life -= dt;
        if (d.life <= 0) {
          // pixels pop elsewhere (Reduce Flashing: they drift instead)
          if (this.rf) d.life = 1;
          else this.resetDrop(d, true);
        }
      }
      if (d.y > this.viewBottom + 40 || d.y < this.headerH - 40 || d.x < -20 || d.x > this.W + 20) this.resetDrop(d, false);
    }
  }

  // ================================================================ per frame
  applyScroll() {
    this.map.y = Math.round(this.scrollY);
    this.props.y = Math.round(this.scrollY * PROP_PARALLAX);
  }

  update(_t, delta) {
    const dt = Math.min(0.05, delta / 1000);
    this.t += dt;
    if (!this.drag && !this.scrollTween?.isPlaying()) {
      this.scrollY += this.vel * dt;
      this.vel *= Math.exp(-dt * 4);
      if (this.scrollY > 0) this.scrollY += (0 - this.scrollY) * Math.min(1, dt * 10);
      if (this.scrollY < this.minY) this.scrollY += (this.minY - this.scrollY) * Math.min(1, dt * 10);
    }
    const dScroll = this.scrollY - this.lastScroll;
    this.lastScroll = this.scrollY;
    this.applyScroll();
    const sy = this.map.y;
    const visible = (y, m = 200) => y + sy > this.headerH - m && y + sy < this.viewBottom + m;

    // the hero: hovering on its level, or flying along the path
    const N = this.wps.length - 1;
    const p = this.spline.getPoint(Phaser.Math.Clamp(this.heroU, 0, 1));
    const bob = this.flying ? 0 : Math.sin(this.t * 2.2) * 8;
    const hy = p.y - (this.flying ? 40 : (this.heroAt?.R || R_NODE) + 34) + bob;
    this.rig.setPosition(p.x, hy + sy);
    if (this.flying) {
      const q = this.spline.getPoint(Phaser.Math.Clamp(this.heroU + 0.002, 0, 1));
      this.rig.angle = Phaser.Math.Clamp(Phaser.Math.RadToDeg(Math.atan2(q.y - p.y, Math.abs(q.x - p.x) + 1)) * 0.4, -30, 30);
    } else this.rig.angle = Math.cos(this.t * 2.2) * 6;
    this.flapT -= dt;
    if (this.flapT <= 0) {
      this.flapT = this.flying ? 0.22 : 0.8;
      this.rig.flap();
    }
    this.rig.update(dt, this.flying ? 520 : 200);
    this.fx.update(dt);

    // the current level pulses (scale only)
    if (this.pulse) this.pulse.setScale(1 + Math.sin(this.t * 3.2) * (this.rf ? 0.03 : 0.07));
    // bosses tremble and smoulder
    for (const b of this.bosses || []) {
      if (!visible(b.y)) continue;
      b.c.x = b.x + (this.rf ? 0 : Math.sin(this.t * 37 + b.n) * 1.6);
      b.c.y = b.y + (this.rf ? 0 : Math.cos(this.t * 29 + b.n) * 1.2);
      if (b.glow && !this.rf) b.glow.setAlpha((b.open ? 0.45 : 0.24) + Math.sin(this.t * 2 + b.n) * 0.08);
    }
    // portals swirl; fog drifts
    for (const po of this.portals) {
      if (!visible(po.y, 300)) continue;
      po.swirl.rotation += dt * (po.open ? 1.4 : 0.5);
      for (const f of po.fog) f.f.x = f.x0 + Math.sin(this.t * 0.4 + f.ph) * 40;
    }
    // lights flowing along the lit path
    if (this.flow.length) {
      const L = this.litPts.length;
      for (const f of this.flow) {
        f.u = (f.u + dt * 0.035) % 1;
        const q = this.litPts[Math.floor(f.u * (L - 1))];
        f.d.setPosition(q.x, q.y);
      }
    }
    // sparkles on starred levels
    if (!this.lowGfx && !this.rf && this.starred?.length) {
      this.sparkT = (this.sparkT || 0) - dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.35;
        const nd = Phaser.Utils.Array.GetRandom(this.starred);
        if (visible(nd.y, 0)) {
          const s = this.add.image(nd.x + (Math.random() - 0.5) * 80, nd.y + nd.R + 20 + (Math.random() - 0.5) * 20, "lvmap", "sparkle");
          s.setScale(0.2);
          this.map.add(s);
          this.tweens.add({ targets: s, scale: 1, alpha: 0, angle: 90, duration: 700, onComplete: () => s.destroy() });
        }
      }
    }
    // eyes in the Abyss dark blink now and then; toxic pools shimmer
    for (const b of this.blinkers || []) {
      b.t -= dt;
      if (b.t < 0) b.t = 4 + Math.random() * 5;
      b.img.scaleY = b.base * (b.t < 0.18 ? 0.15 : 1);
    }
    for (const pl of this.pools || []) if (!this.rf) pl.setAlpha(0.75 + Math.sin(this.t * 2 + pl.x) * 0.12);

    // the giant eye: opens with your progress, and a little more as you come near
    if (visible(this.eye.y, 420)) {
      if (this.eyeOpen < this.eyeTarget) this.eyeOpen = Math.min(this.eyeTarget, this.eyeOpen + dt * 0.12);
      const prox = 1 - Math.min(1, Math.abs(this.eye.y + sy - (this.headerH + this.viewBottom) / 2) / 700);
      const open = this.eyeOpen * (0.65 + 0.35 * prox);
      this.eyeShown = this.eyeOpen;
      const look = Phaser.Math.Clamp((this.rig.x - this.eye.x) * 0.12, -60, 60);
      this.renderEye(Math.max(0.03, open), look);
      if (this.eyeGlow) this.eyeGlow.setAlpha(open * (this.rf ? 0.3 : 0.25 + 0.08 * Math.sin(this.t * 1.5)));
    }

    // which realm fills the screen: colours, scenery, weather and the realm strip
    const mid = (this.headerH + this.viewBottom) / 2 - sy;
    const r = Math.max(0, this.bands.findIndex((b) => mid >= b.y0 && mid < b.y1));
    const band = this.bands[r];
    const tt = Phaser.Math.Clamp((mid - (band.y1 - 420)) / 420, 0, 1);
    const pal = blendPalette({ a: BIOMES[r], b: BIOMES[Math.min(4, r + 1)], t: tt }, {});
    this.scene.get("Backdrop")?.drive?.(pal, {
      theme: BIOMES[r].id,
      scroll: 20 + Math.min(400, Math.abs(this.vel) * 0.25),
      dim: 0.2,
      scenery: true,
    });
    this.setWeather(r);
    this.updateWeather(dt, dScroll);
    // realm name under the header while its own title is scrolled out of view
    const lineY = this.headerH + 25 - sy;
    const rs = Math.max(0, this.bands.findIndex((b) => lineY >= b.y0 && lineY < b.y1));
    const bs = this.bands[rs];
    const titleOff = bs.titleY + sy < this.headerH + 10;
    if (rs !== this.stripR) {
      this.stripR = rs;
      const realm = REALMS[rs];
      this.stripText.setText(`${realm.name}  ${realmStars(rs)}/30 ★`).setColor(hexCss(realm.col));
      fitWidth(this.stripText.setScale(1), this.W - 120);
      this.stripLine.clear().fillStyle(0x05020e, 0.94).fillRect(0, 0, this.W, 50).lineStyle(2, realm.col, 0.6).lineBetween(0, 50, this.W, 50);
    }
    const want = titleOff ? 1 : 0;
    this.strip.alpha += (want - this.strip.alpha) * Math.min(1, dt * 10);
    // the next star milestone on the rail breathes gently
    for (const mk of this.rail.marks) if (mk.next) mk.mk.setScale(1 + Math.sin(this.t * 3) * (this.rf ? 0.03 : 0.1));
  }
}

const hexCss = (c) => `#${c.toString(16).padStart(6, "0")}`;
const toTitle = (s) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
