// STATS: your lifetime numbers in one scrollable page. Favourite hero up top, then a grid of
// big-number tiles (runs, time, distance, score, coins…), then crashes per realm as a small
// bar list in each realm's colour. Read-only: nothing here changes the save.
import Phaser from "phaser";
import { BIOMES, blendPalette, CLASSIC } from "../biomes/biomes.js";
import { fitCamera, NUM_FONT, VIEW } from "../config.js";
import { DIMENSION_COUNT, dimensionsFound } from "../data/progression.js";
import { Save } from "../data/save.js";
import { HI } from "../gfx/textures.js";
import { allLevels, LEVEL_COUNT, levelRecord, totalStars } from "../levels/levels.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { CHARACTERS } from "../player/characterDefs.js";
import { TEST } from "../systems/testFlags.js";
import { button, drawNeonRect, fadeTo, hex, neonText, plainText, slideIn } from "../ui/ui.js";

const PAD = 30; // side margin
const GAP = 16; // between tiles
const TILE_H = 132;

/** A finite, non-negative number (an old or damaged save can hold anything). */
const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
/** 12,345 */
export const fmtNum = (v) => Math.round(n(v)).toLocaleString("en-US");
/** A long span: "3h 12m"; under an hour "12:05" (minutes:seconds). */
export function fmtSpan(ms) {
  const s = Math.floor(n(ms) / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600).toLocaleString("en-US")}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Everything the page shows, worked out from the save (pure: the tests read it too). */
export function statsSummary(s = Save.data) {
  const st = s.stats || {};
  const runs = n(st.runs);
  const timed = n(st.timedRuns);
  const heroRuns = st.heroRuns && typeof st.heroRuns === "object" ? st.heroRuns : {};
  let fav = null;
  for (const c of CHARACTERS) {
    const r = n(heroRuns[c.id]);
    if (r > 0 && (!fav || r > fav.runs)) fav = { id: c.id, name: c.name, color: c.color, texture: c.texture, runs: r };
  }
  const deaths = st.realmDeaths && typeof st.realmDeaths === "object" ? st.realmDeaths : {};
  // classic realms in order up to the furthest reached, plus the dimensions found
  const far = Math.min(CLASSIC - 1, n(st.maxBiome));
  const realms = BIOMES.map((b, i) => ({
    id: b.id,
    name: b.name,
    color: b.neon,
    deaths: Math.round(n(deaths[b.id])),
    found: b.dimension ? !!s.dimensions?.[b.id] : i <= far,
  }));
  const levels = allLevels().filter((l) => levelRecord(l.n)?.done).length;
  return {
    runs,
    playMs: n(st.playMs),
    untimed: runs > 0 && timed === 0, // every run so far was flown before play time was counted
    avgRunMs: timed ? n(st.playMs) / timed : 0,
    avgDistance: runs ? n(st.totalDistance) / runs : 0,
    bestDistance: n(st.maxDistance),
    bestScore: n(s.best),
    coins: n(st.coins),
    nearMisses: n(st.nearMisses),
    maxCombo: n(st.maxCombo),
    fav,
    realms,
    realmsFound: far + 1 + dimensionsFound(s),
    realmCount: BIOMES.length,
    dimensionCount: DIMENSION_COUNT,
    levels,
    levelCount: LEVEL_COUNT,
    stars: totalStars(),
    starCount: LEVEL_COUNT * 3,
  };
}

export class StatsScene extends Phaser.Scene {
  constructor() {
    super("Stats");
  }

  init(data) {
    this.returnTo = data?.from || "Menu";
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.fadeIn(220, 5, 1, 13);
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[3], t: 0.3 }, {});
    this.summary = statsSummary();

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => fadeTo(this, this.returnTo),
    }).setDepth(50);
    neonText(this, W / 2 + 40, top + 46, "STATS", 40, 0x3ef4ff, { blur: 12 }).setDepth(50);

    // ---- the scrolling page (masked below the header)
    this.listTop = top + 100;
    const sb = this.registry.get("safeBottom") || 0;
    this.listBottom = H - 12 - sb;
    this.list = this.add.container(0, this.listTop).setDepth(10);
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff).fillRect(0, this.listTop, W, this.listBottom - this.listTop);
    this.list.setMask(maskG.createGeometryMask());
    this.scrollY = 0;
    this.vel = 0;
    this.contentH = this.build(this.summary);

    this.input.on("pointerdown", (p) => {
      if (p.worldY < this.listTop) return;
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
    this.input.on("wheel", (p, o, dx, dy) => this.setScroll(this.scrollY + dy));
  }

  /** Lay the page out inside this.list; returns its height. */
  build(m) {
    const W = VIEW.W;
    const L = this.list;
    let y = 8;

    // ---- favourite hero
    const hc = this.add.container(0, 0);
    const hg = this.add.graphics();
    const favCol = m.fav ? m.fav.color : 0x8a80b0;
    drawNeonRect(hg, PAD, y, W - PAD * 2, 150, 22, favCol, { fillAlpha: 0.85 });
    hc.add(hg);
    hc.add(plainText(this, 200, y + 34, "FAVORITE HERO", 16, "#bfb6e8", { ox: 0 }));
    if (m.fav) {
      const img = this.add.image(112, y + 75, m.fav.texture).setScale((0.72 / HI) * PORTRAIT_K);
      hc.add(img);
      hc.add(neonText(this, 200, y + 76, m.fav.name, 34, m.fav.color, { ox: 0, blur: 8 }));
      hc.add(
        plainText(this, 200, y + 118, `${fmtNum(m.fav.runs)} run${m.fav.runs === 1 ? "" : "s"}`, 20, "#ffffff", {
          ox: 0,
        }),
      );
    } else {
      hc.add(plainText(this, 200, y + 86, "Fly a few runs to find out", 20, "#8a80a8", { ox: 0 }));
    }
    L.add(hc);
    slideIn(this, hc, 40);
    y += 150 + 30;

    // ---- the tiles
    const tiles = [
      ["TOTAL RUNS", fmtNum(m.runs), 0x3ef4ff],
      // (runs flown before this page existed were never timed: say so instead of "0:00")
      ["TIME PLAYED", m.untimed ? "—" : fmtSpan(m.playMs), 0x3ef4ff, m.untimed && "COUNTING FROM NOW"],
      ["AVERAGE RUN", m.untimed ? "—" : fmtSpan(m.avgRunMs), 0x3ef4ff, m.untimed && "COUNTING FROM NOW"],
      ["BEST SCORE", fmtNum(m.bestScore), 0xffd23f],
      ["BEST DISTANCE", `${fmtNum(m.bestDistance)} m`, 0xffd23f],
      ["AVERAGE DISTANCE", `${fmtNum(m.avgDistance)} m`, 0xffd23f],
      ["COINS COLLECTED", fmtNum(m.coins), 0xffc83d],
      ["NEAR-MISSES", fmtNum(m.nearMisses), 0xff4fd8],
      ["HIGHEST COMBO", `x${fmtNum(m.maxCombo)}`, 0xff4fd8],
      ["REALMS FOUND", `${m.realmsFound}/${m.realmCount}`, 0x39ff88],
      ["LEVELS DONE", `${m.levels}/${m.levelCount}`, 0xb45cff],
      ["STARS EARNED", `${m.stars}/${m.starCount}`, 0xb45cff],
    ];
    const cols = 2;
    const tw = (W - PAD * 2 - GAP * (cols - 1)) / cols;
    tiles.forEach(([label, value, col, note], i) => {
      const x = PAD + (i % cols) * (tw + GAP);
      const ty = y + Math.floor(i / cols) * (TILE_H + GAP);
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      drawNeonRect(g, x, ty, tw, TILE_H, 18, col, { fillAlpha: 0.78, width: 2, glow: false });
      // the number, shrunk to fit the tile if it's long ("1,234h 5m")
      const v = this.add
        .text(x + tw / 2, ty + 56, value, {
          fontFamily: NUM_FONT,
          fontSize: "52px",
          fontStyle: "700",
          color: "#ffffff",
          resolution: VIEW.Z,
        })
        .setOrigin(0.5);
      if (v.width > tw - 24) v.setScale((tw - 24) / v.width);
      c.add([g, v, plainText(this, x + tw / 2, ty + 106, label, 15, hex(col))]);
      if (note) c.add(plainText(this, x + tw / 2, ty + 18, note, 11, "#8a80a8"));
      c.name = `tile:${label}`;
      c.statValue = value;
      L.add(c);
      slideIn(this, c, 80 + i * 30, 30);
    });
    y += Math.ceil(tiles.length / cols) * (TILE_H + GAP) + 22;

    // ---- deaths by realm (the realms you haven't reached show as ???)
    const dh = neonText(this, PAD + 6, y, "DEATHS BY REALM", 24, 0xff2a3d, { ox: 0, blur: 8 });
    L.add(dh);
    y += 36;
    const most = Math.max(1, ...m.realms.map((r) => r.deaths));
    const nameW = 230;
    const barX = PAD + 12 + nameW;
    const barW = W - barX - PAD - 90;
    const bg = this.add.graphics();
    drawNeonRect(bg, PAD, y, W - PAD * 2, m.realms.length * 44 + 20, 18, 0xff2a3d, {
      fillAlpha: 0.7,
      width: 2,
      glow: false,
    });
    L.add(bg);
    y += 10;
    const bars = this.add.graphics();
    L.add(bars);
    m.realms.forEach((r) => {
      const cy = y + 22;
      const known = r.found || r.deaths > 0;
      L.add(
        plainText(this, PAD + 18, cy, known ? r.name : "???", 15, known ? hex(r.color) : "#5a5078", {
          ox: 0,
        }),
      );
      bars.fillStyle(0xffffff, 0.06).fillRoundedRect(barX, cy - 8, barW, 16, 8);
      if (r.deaths > 0) {
        const w = Math.max(16, (barW * r.deaths) / most);
        bars.fillStyle(r.color, 0.9).fillRoundedRect(barX, cy - 8, w, 16, 8);
      }
      const t = plainText(this, W - PAD - 16, cy, fmtNum(r.deaths), 18, r.deaths ? "#ffffff" : "#5a5078", {
        ox: 1,
      });
      t.name = `deaths:${r.id}`;
      L.add(t);
      y += 44;
    });
    y += 30;
    return y;
  }

  setScroll(v) {
    const max = Math.max(0, (this.contentH || 0) - (this.listBottom - this.listTop));
    this.scrollY = Phaser.Math.Clamp(v, 0, max);
    this.list.y = this.listTop - this.scrollY;
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.drive(this.pal, { scroll: 60, dim: 0.65, scenery: false });
    if (!this.drag && Math.abs(this.vel) > 0.1) {
      this.setScroll(this.scrollY - this.vel);
      this.vel *= Math.exp(-dt * 5);
    }
  }
}

/** Open the Stats page from any menu screen (the home screen's MORE menu wires this in). */
export function openStats(scene) {
  fadeTo(scene, "Stats", { from: scene.sys.settings.key });
}

// test builds only
if (TEST.on && typeof window !== "undefined") window.__glyStats = { statsSummary, fmtSpan, fmtNum, openStats };
