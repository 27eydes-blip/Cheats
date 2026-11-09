// LOCKER ROOM: everything you own in one place. Ten tabs (heroes, skins, hats, trails, death
// effects, victory poses, flap effects, coin skins, titles, banners & badges), each a scrolling
// grid with "24/58"-style counts. Tap anything to see it on your hero at the top; tap something
// you own to wear it (the same calls the old menus made, see data/locker.js). Things you don't
// own are grey silhouettes that say how to get them.
//
// Built to stay at 60 fps with 50+ tiles a tab: ONE hero rig for the preview (never one per
// tile), tile frames are a handful of shared textures (made once, not a Graphics per tile),
// taps are found by maths instead of an input zone per tile, and tiles scrolled out of view
// are hidden so they cost nothing to draw.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, NUM_FONT, RARITY, VIEW } from "../config.js";
import { Save } from "../data/save.js";
import { getCosmetic, Shop, SKINS } from "../data/cosmetics.js";
import { Titles } from "../data/titles.js";
import { Progression } from "../data/progression.js";
import { LOCKER_TABS, lockerCount, lockerEntries, lockerEquip, lockerTab, shopTabFor } from "../data/locker.js";
import { getCharacter } from "../player/characterDefs.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { titleText } from "../ui/titleText.js";
import { nameText } from "../ui/nameplate.js";
import { button, drawNeonRect, fadeTo, hex, neonText, plainText } from "../ui/ui.js";

const SILHOUETTE = 0x2e2848; // not owned: a flat dark shape (still reads as the thing)
const ON = 0x39ff88; // worn
const FOCUS = 0xffd23f; // the one in the preview
const GAP = 8;

const ROUTE_LABEL = {
  Characters: "OPEN HEROES",
  Shop: "GET IN SHOP",
  Pass: "DRIFT PASS+",
  Spin: "LUCKY SPIN",
};

export class LockerScene extends Phaser.Scene {
  constructor() {
    super("Locker");
  }

  init(data) {
    this.returnTo = data?.from || "Menu";
    this.startTab = lockerTab(data?.tab)?.id || this.registry.get("lockerTab") || "heroes";
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    this.lowGfx = !!s.settings?.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    const sb = this.registry.get("safeBottom") || 0;
    this.cameras.main.fadeIn(220, 2, 1, 7);
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[4], t: 0.35 }, {});
    this.t = 0;
    this.loopT = 0;
    Titles.sync(); // titles earned since the last look count straight away

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(50);
    neonText(this, W / 2 + 50, top + 46, "LOCKER ROOM", 36, 0x39ff88, { blur: 12 }).setDepth(50);

    // ---- the stage: your hero on the left, what you tapped on the right
    const y0 = top + 96;
    const stageH = Phaser.Math.Clamp(Math.round(H * 0.25), 260, 360);
    this.stage = { x: 20, y: y0, w: W - 40, h: stageH };
    const sg = this.add.graphics().setDepth(5);
    drawNeonRect(sg, 20, y0, W - 40, stageH, 24, 0x39ff88, { fillAlpha: 0.55, width: 2 });
    this.rigX = 190;
    this.rigY = y0 + stageH * 0.5;
    this.fx = new Effects(this, { lowGfx: this.lowGfx, depth: 32 });
    this.rig = null;
    this.rigHero = null;
    this.plate = this.add.container(this.rigX, y0 + stageH - 34).setDepth(36);
    this.extra = this.add.container(0, 0).setDepth(36); // coin skin / banner shown by the hero
    const ix = 372;
    const iw = W - 40 - ix + 4;
    this.infoW = iw;
    this.infoName = neonText(this, ix, y0 + 44, "", 26, 0xffffff, { ox: 0, blur: 8 }).setDepth(40);
    this.infoKind = plainText(this, ix, y0 + 82, "", 14, "#bfb6e8", { ox: 0 }).setDepth(40);
    this.infoText = plainText(this, ix, y0 + 104, "", 16, "#ffffff", {
      ox: 0,
      oy: 0,
      wrap: iw - 10,
      align: "left",
    }).setDepth(40);
    this.action = button(this, ix + iw / 2 - 4, y0 + stageH - 46, iw - 20, 64, "EQUIP", {
      color: 0xffd23f,
      size: 18,
      onClick: () => this.goGet(),
    }).setDepth(40);

    // ---- tabs: two rows of five, each with its owned / total
    const tabsY = y0 + stageH + 14;
    const cw = (W - 40 - GAP * 4) / 5;
    const ch = 64;
    this.tabBtns = LOCKER_TABS.map((tab, i) => {
      const c = lockerCount(tab.id);
      const b = button(
        this,
        20 + (cw + GAP) * (i % 5) + cw / 2,
        tabsY + (ch + GAP) * Math.floor(i / 5) + ch / 2,
        cw,
        ch,
        tab.label,
        { color: 0x6a5aa8, size: 14, sub: `${c.owned}/${c.total}`, onClick: () => this.showTab(tab.id) },
      ).setDepth(50);
      b.tabId = tab.id;
      return b;
    });

    // ---- the grid (scrolls under a mask)
    this.gridTop = tabsY + ch * 2 + GAP + 14;
    this.gridBottom = H - 16 - sb;
    this.grid = this.add.container(0, this.gridTop).setDepth(10);
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff).fillRect(0, this.gridTop, W, this.gridBottom - this.gridTop);
    this.grid.setMask(maskG.createGeometryMask());
    this.scrollY = 0;
    this.vel = 0;

    this.input.on("pointerdown", (p) => {
      if (p.worldY < this.gridTop || p.worldY > this.gridBottom) return;
      this.drag = { y: p.worldY, start: this.scrollY, last: p.worldY, t: this.time.now, moved: 0 };
      this.vel = 0;
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag || !p.isDown) return;
      const dt = Math.max(1, this.time.now - this.drag.t);
      this.vel = ((p.worldY - this.drag.last) / dt) * 16;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(p.worldY - this.drag.y));
      this.drag.last = p.worldY;
      this.drag.t = this.time.now;
      this.setScroll(this.drag.start - (p.worldY - this.drag.y));
    });
    this.input.on("pointerup", (p) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved > 12) return; // a scroll, not a tap
      const tile = this.tileAt(p.worldX, p.worldY);
      if (tile) this.choose(tile.entry);
    });
    this.input.on("wheel", (p, o, dx, dy) => this.setScroll(this.scrollY + dy));
    this.events.once("shutdown", () => {
      this.rig?.destroy();
      this.rig = null;
      this.fx.destroy();
    });

    this.showTab(this.startTab);
  }

  // ------------------------------------------------------------------ tabs + tiles
  showTab(id) {
    if (!lockerTab(id)) return;
    this.tab = id;
    this.registry.set("lockerTab", id);
    for (const b of this.tabBtns) b.setColor(b.tabId === id ? 0xffd23f : 0x6a5aa8);
    this.grid.removeAll(true);
    this.entries = lockerEntries(id);
    const W = this.W;
    const titles = id === "titles";
    const cols = titles ? 2 : 4;
    const tw = (W - 40 - GAP * (cols - 1)) / cols;
    const th = titles ? 104 : 168;
    this.cell = { cols, tw, th };
    this.tiles = this.entries.map((e, i) => {
      const x = 20 + (tw + GAP) * (i % cols) + tw / 2;
      const y = 6 + (th + GAP) * Math.floor(i / cols) + th / 2;
      return this.makeTile(e, x, y, tw, th);
    });
    // a focus ring (one image, moved to the tile in the preview)
    this.focusRing = this.add.image(0, 0, this.frameTex(tw, th, "focus", FOCUS)).setScale(1 / VIEW.Z);
    this.grid.add(this.focusRing);
    this.contentH = 6 + Math.ceil(this.entries.length / cols) * (th + GAP) + 10;
    this.setScroll(0);
    this.vel = 0;
    // preview what you're wearing in this slot (or your hero)
    const worn = this.entries.find((e) => e.equipped && e.kind !== "none") || this.entries[0];
    this.preview(worn);
  }

  makeTile(e, x, y, tw, th) {
    const c = this.add.container(x, y);
    c.entry = e;
    c.frame = this.add.image(0, 0, this.tileTexFor(e, tw, th)).setScale(1 / VIEW.Z);
    c.add(c.frame);
    if (e.kind === "title") {
      const t = e.owned
        ? titleText(this, 0, -14, e.title, { size: 17 })
        : plainText(this, 0, -14, e.title.name.toUpperCase(), 16, "#5a5080");
      c.add(t);
      const w = t.getBounds?.().width || t.width || 1;
      if (w > tw - 30) t.setScale((tw - 30) / w);
      const how = plainText(this, 0, 24, e.owned ? e.title.how : e.title.how, 13, e.owned ? "#bfb6e8" : "#6a608a");
      how.setScale(Math.min(1, (tw - 30) / Math.max(1, how.width)));
      c.add(how);
    } else if (e.kind === "none") {
      c.add(plainText(this, 0, e.cat === "title" ? -14 : -20, "NONE", 22, "#cfc6ff"));
      if (e.cat === "title") c.add(plainText(this, 0, 24, "Show only your name", 13, "#bfb6e8"));
    } else {
      const icon = this.iconFor(e, 0, -22, Math.min(tw, th));
      if (icon) c.add(icon);
      const nm = plainText(this, 0, th / 2 - 46, e.name, 14, e.owned ? "#ffffff" : "#8a80b0");
      nm.setScale(Math.min(1, (tw - 16) / Math.max(1, nm.width)));
      c.add(nm);
    }
    // the corner tag: ✓ when worn · the price / where it's from when it isn't yours
    c.tag = plainText(this, 0, th / 2 - 20, "", 13, "#ffd23f");
    c.add(c.tag);
    this.fillTag(c);
    this.grid.add(c);
    return c;
  }

  fillTag(c) {
    const e = c.entry;
    const { tw, th } = this.cell;
    const titles = this.tab === "titles";
    if (e.equipped) {
      c.tag.setText(e.cat === "badge" ? "✓ ALWAYS ON" : "✓ WEARING").setColor(hex(ON));
    } else if (!e.owned) {
      const u = e.unlock || {};
      c.tag.setText(u.coins ? `${u.tag} coins` : u.tag || "LOCKED").setColor(u.coins ? "#ffc83d" : "#9c90c8");
    } else c.tag.setText("");
    // titles: the tag sits in the top-right corner (their row has no room underneath)
    if (titles) c.tag.setOrigin(1, 0.5).setPosition(tw / 2 - 14, -th / 2 + 16);
    c.tag.setScale(Math.min(1, (tw - 16) / Math.max(1, c.tag.width)));
    c.frame.setTexture(this.tileTexFor(e, tw, th));
  }

  /** A tile's frame: worn (green), yours (its rarity colour) or locked (dim). Shared textures. */
  tileTexFor(e, tw, th) {
    if (e.equipped) return this.frameTex(tw, th, "on", ON);
    if (!e.owned) return this.frameTex(tw, th, "lock", 0x3a3060);
    const col = e.rarity ? RARITY[e.rarity]?.color ?? 0x8a80b0 : e.kind === "title" ? 0x3ef4ff : 0x8a80b0;
    return this.frameTex(tw, th, "own", col);
  }

  /** Make (once) and return a tile-frame texture, drawn at the screen's pixel density. */
  frameTex(tw, th, kind, col) {
    const Z = VIEW.Z;
    const key = `lk_${Math.round(tw)}x${th}_${kind}_${col.toString(16)}_${Z.toFixed(2)}`;
    if (this.textures.exists(key)) return key;
    const w = Math.round(tw * Z);
    const h = Math.round(th * Z);
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const r = 16 * Z;
    const lw = (kind === "on" || kind === "focus" ? 4 : 2) * Z;
    if (kind !== "focus") {
      g.fillStyle(kind === "on" ? 0x0f3a24 : kind === "lock" ? 0x0c0820 : 0x140a30, 0.92);
      g.fillRoundedRect(lw, lw, w - lw * 2, h - lw * 2, r);
    }
    g.lineStyle(lw, col, kind === "lock" ? 0.8 : 1);
    g.strokeRoundedRect(lw, lw, w - lw * 2, h - lw * 2, r);
    if (kind === "own" || kind === "on") {
      // a soft rarity sheen in the top half
      g.fillStyle(col, 0.1);
      g.fillRoundedRect(lw * 3, lw * 3, w - lw * 6, h * 0.45, r * 0.7);
    }
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  /** The picture on a tile (a shared texture; dark silhouette when it isn't yours). */
  iconFor(e, x, y, size) {
    let im = null;
    const box = size * 0.56; // every picture fits the same box, whatever its art size
    if (e.kind === "hero") {
      im = this.add.image(x, y, getCharacter(e.id).texture);
    } else if (e.kind === "banner") {
      return this.bannerIcon(x, y, size / 140, e.owned);
    } else if (e.kind === "cos") {
      const c = getCosmetic(e.id);
      const has = (f) => this.textures.get("cosm").has(f);
      if (c.cat === "hat") im = this.add.image(x, y, "cosm", HAT_FIT[c.id].frame);
      else if (c.cat === "coin") im = this.add.image(x, y, "cosm", `${c.id}_0`);
      else if ((c.cat === "dskin" || c.cat === "tskin") && this.textures.exists(`hero_${c.forHero}_${c.id}`))
        im = this.add.image(x, y, `hero_${c.forHero}_${c.id}`);
      else if (c.cat === "skin") {
        const def = getCharacter(Progression.selectedHero());
        im = this.add.image(x, y, greyPortrait(this, def));
        if (e.owned) im.setTint(SKINS[c.id]?.tint ?? 0xffffff);
      } else if (has(`icon_${c.id}`)) im = this.add.image(x, y, "cosm", `icon_${c.id}`);
    }
    if (!im) return plainText(this, x, y, "?", 40, "#8a80b0");
    im.setScale(Math.min(box / Math.max(1, im.width), box / Math.max(1, im.height)));
    if (!e.owned) im.setTintFill(SILHOUETTE);
    return im;
  }

  /** The Drift Pass+ season banner (a flag on a pole, as on the pass track). */
  bannerIcon(x, y, s, owned) {
    const g = this.add.graphics({ x, y });
    const OUT = 0x14020a;
    const prim = owned ? 0xc8102e : SILHOUETTE;
    const acc = owned ? 0xff3a4a : SILHOUETTE;
    g.fillStyle(OUT, 1).fillRect(-34 * s, -40 * s, 8 * s, 80 * s);
    g.fillStyle(owned ? 0xc8c8d8 : SILHOUETTE, 1).fillRect(-32 * s, -38 * s, 4 * s, 76 * s);
    g.fillStyle(OUT, 1).fillRect(-28 * s, -38 * s, 66 * s, 50 * s);
    g.fillStyle(prim, 1).fillRect(-26 * s, -36 * s, 62 * s, 46 * s);
    g.fillStyle(acc, 1).fillRect(-26 * s, -20 * s, 62 * s, 8 * s);
    if (owned) g.fillStyle(0xffd23f, 1).fillCircle(5 * s, -26 * s, 6 * s);
    return g;
  }

  tileAt(wx, wy) {
    if (wy < this.gridTop || wy > this.gridBottom) return null;
    const { cols, tw, th } = this.cell;
    const lx = wx - 20;
    const ly = wy - this.gridTop + this.scrollY - 6;
    if (lx < 0 || ly < 0) return null;
    const col = Math.floor(lx / (tw + GAP));
    const row = Math.floor(ly / (th + GAP));
    if (col >= cols || lx - col * (tw + GAP) > tw || ly - row * (th + GAP) > th) return null; // the gap
    return this.tiles[row * cols + col] || null;
  }

  setScroll(v) {
    const view = this.gridBottom - this.gridTop;
    const max = Math.max(0, (this.contentH || 0) - view);
    this.scrollY = Phaser.Math.Clamp(v, 0, max);
    this.grid.y = this.gridTop - this.scrollY;
    // tiles outside the window aren't drawn at all
    const h = this.cell.th / 2 + 4;
    for (const t of this.tiles) t.setVisible(t.y + h > this.scrollY && t.y - h < this.scrollY + view);
  }

  // ------------------------------------------------------------------ tap → preview / equip
  choose(e) {
    if (!e) return;
    const res = lockerEquip(e);
    if (res === "equipped" || res === "unequipped") {
      Sfx.chime?.();
      Haptics.light();
      this.refreshTiles();
      e = this.entries.find((x) => x.key === e.key) || e;
      if (res === "equipped") {
        this.fx.ring(this.rigX, this.rigY, ON, { scale: 1.6, duration: 450 });
        this.fx.burst("star", this.rigX, this.rigY, this.lowGfx ? 6 : 14, ON);
      }
    } else Sfx.ui();
    this.preview(e);
  }

  /** After an equip: re-read who wears what and repaint just the frames and tags. */
  refreshTiles() {
    this.entries = lockerEntries(this.tab);
    const byKey = new Map(this.entries.map((e) => [e.key, e]));
    for (const t of this.tiles) {
      t.entry = byKey.get(t.entry.key) || t.entry;
      this.fillTag(t);
    }
  }

  /** Show an entry on your hero (owned or not) and fill the info panel. */
  preview(e) {
    if (!e) return;
    this.focus = e;
    const tile = this.tiles.find((t) => t.entry.key === e.key);
    this.focusRing.setVisible(!!tile && !e.equipped);
    if (tile) this.focusRing.setPosition(tile.x, tile.y);
    // which hero: the one tapped, a hero's own skin on that hero, else the one you fly
    const heroId = e.kind === "hero" ? e.id : e.forHero || Progression.selectedHero();
    const lo = { ...Shop.loadout() };
    const flair = ["name", "badge", "theme"].includes(e.cat);
    if (e.kind === "cos" && !flair) lo[e.cat] = e.id;
    if (e.kind === "none" && e.cat !== "title") delete lo[e.cat];
    this.mode = e.kind === "cos" ? e.cat : "fly";
    if (!this.rig || this.rigHero !== heroId) this.buildRig(heroId, lo);
    else {
      if (this.rig.dead) this.rig.reset(this.rigX, this.rigY);
      this.rig.setCosmetics(lo);
    }
    this.loopT = 0;
    if (this.mode === "pose") this.rig.cosmeticPose(e.id);
    else this.rig.flap();
    // (a trail as long as the panel: no further, or it runs off the screen's left edge)
    this.rig.trailTime = this.mode === "trail" ? 0.42 : this.lowGfx ? 0.24 : 0.36;
    this.fillPlate(e);
    this.fillExtra(e);
    this.fillInfo(e);
  }

  buildRig(heroId, lo) {
    this.rig?.destroy();
    this.fx.clear?.();
    this.rigHero = heroId;
    this.rig = new CharacterRig(this, getCharacter(heroId), this.fx, {
      x: this.rigX,
      y: this.rigY,
      lowGfx: this.lowGfx,
      depth: 34,
      scale: 1.7,
      cosmetics: lo,
    });
  }

  /** Your name card under the hero: the title / gold name / badge, live. */
  fillPlate(e) {
    this.plate.removeAll(true);
    const uname = Save.data.profile?.username || "YOU";
    const gold = e.id === "name_pp_gold" || Shop.equipped("name") === "name_pp_gold";
    const badge = e.id === "badge_pp_s1" || Shop.owns("badge_pp_s1");
    const np = nameText(this, 0, -14, uname, { size: 20, ox: 0.5, gold, badge, font: NUM_FONT });
    const title = e.kind === "title" ? e.title : e.kind === "none" && e.cat === "title" ? null : Titles.shown(); // (ALL MIGHTY while you're the world's #1)
    const tt = titleText(this, 0, 14, title, { size: 15 });
    this.plate.add([np, tt]);
    const w = Math.max(1, this.plate.getBounds().width);
    this.plate.setScale(Math.min(1, 320 / w));
  }

  /** Things that aren't on the hero: a coin skin, the banner, the home theme. */
  fillExtra(e) {
    this.extra.removeAll(true);
    const x = this.rigX + 120;
    const y = this.rigY - 10;
    let o = null;
    if (!e.id) return; // the NONE tile
    if (e.cat === "coin") o = this.add.image(x, y, "cosm", `${e.id}_0`);
    else if (e.kind === "banner") o = this.bannerIcon(x, y, 1.1, true);
    else if (e.cat === "theme" && this.textures.get("cosm").has(`icon_${e.id}`))
      o = this.add.image(x, y, "cosm", `icon_${e.id}`);
    if (!o) return;
    if (o.type === "Image") o.setScale(Math.min(90 / o.width, 90 / o.height));
    this.extra.add(o);
    this.tweens.add({ targets: o, y: y - 10, yoyo: true, repeat: -1, duration: 900, ease: "Sine.easeInOut" });
  }

  fillInfo(e) {
    const iw = this.infoW;
    const col = e.kind === "hero" ? e.color : e.rarity ? RARITY[e.rarity]?.color : e.title ? parseInt(e.title.color.slice(1), 16) : 0xcfc6ff;
    this.infoName.setText(e.kind === "none" ? "NONE" : e.name.toUpperCase());
    this.infoName.setStroke(hex(col || 0xffffff), 2).setShadow(0, 0, hex(col || 0xffffff), 8 * VIEW.Z, true, true);
    this.infoName.setScale(Math.min(1, iw / Math.max(1, this.infoName.width)));
    const rar = e.rarity ? ` · ${RARITY[e.rarity]?.label || ""}` : "";
    this.infoKind.setText(`${e.kindLabel}${e.kind === "cos" || e.kind === "hero" ? rar : ""}`);
    this.infoKind.setScale(Math.min(1, iw / Math.max(1, this.infoKind.width)));
    let text;
    let color = "#ffffff";
    if (!e.owned) {
      text = `NOT YOURS YET\n${e.unlock?.text || ""}`;
      color = "#cfc6ff";
    } else if (e.cat === "badge") text = "Yours: it always shows by your name.";
    else if (e.equipped) {
      text = e.kind === "hero" ? "✓ FLYING · your hero" : e.kind === "none" ? "✓ Nothing worn here" : "✓ WEARING";
      if (["dskin", "tskin", "name", "theme"].includes(e.cat) || e.kind === "banner")
        text += "\nTap it again to take it off.";
      color = hex(ON);
    } else text = e.kind === "hero" ? "Tap again to fly this hero." : "Tap to wear it.";
    this.infoText.setText(text).setColor(color);
    // where to get it, when there's somewhere to go
    const route = !e.owned && e.unlock?.route;
    this.action.setVisible(!!route);
    if (route) {
      this.action.setLabel(ROUTE_LABEL[route] || "GET IT");
      this.action.setColor(route === "Pass" ? 0xc8102e : 0xffd23f);
    }
    // the action button sits at the bottom of the panel: keep long text clear of it
    const room = this.stage.y + this.stage.h - (route ? 86 : 16) - this.infoText.y;
    this.infoText.setScale(Math.min(1, room / Math.max(1, this.infoText.height)));
  }

  /** The "get it" button: off to where the thing comes from. */
  goGet() {
    const e = this.focus;
    const u = e?.unlock;
    if (!u?.route) return;
    if (u.route === "Characters") {
      if (u.hero) this.registry.set("heroFocus", u.hero);
      fadeTo(this, "Characters");
    } else if (u.route === "Shop") fadeTo(this, "Shop", { tab: shopTabFor(e.cat) });
    else if (u.route === "Pass") fadeTo(this, "Pass", { from: "Locker" });
    else fadeTo(this, u.route);
  }

  leave() {
    if (this.returnTo === "Characters") this.registry.set("heroFocus", Save.data.selected);
    fadeTo(this, this.returnTo);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    this.loopT += dt;
    this.backdrop?.drive?.(this.pal, { scroll: 60, dim: 0.65, scenery: false });
    if (!this.drag && Math.abs(this.vel) > 0.1) {
      this.setScroll(this.scrollY - this.vel);
      this.vel *= Math.exp(-dt * 5);
    }
    const rig = this.rig;
    if (!rig) return;
    if (this.mode === "death") {
      // fly a moment, end the run with the effect, come back
      if (!rig.dead && this.loopT > 1.2) rig.die();
      if (rig.dead && this.loopT > 3.2) {
        rig.reset(this.rigX, this.rigY);
        rig.setCosmetics(rig.cos);
        this.loopT = 0;
      }
    } else if (this.mode === "pose") {
      if (this.loopT > 2.4) {
        rig.cosmeticPose(this.focus?.id);
        this.loopT = 0;
      }
    } else if (this.loopT > 0.6) {
      rig.flap();
      this.loopT = 0;
    }
    if (!rig.dead) {
      const wide = this.mode === "trail" || this.mode === "flap";
      rig.x = this.rigX + Math.sin(this.t * 1.4) * (wide ? 36 : 12);
      rig.y = this.rigY + Math.sin(this.t * 2.2) * 18;
      rig.angle = Math.cos(this.t * 2.2) * 8;
    }
    // trails need the world to move under the hero
    rig.update(dt, this.mode === "trail" || this.mode === "flap" ? 400 : 160);
    this.fx.update(dt);
  }
}
