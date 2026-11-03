// The coin shop: a live preview of your hero wearing whatever you tap, tabs for the Daily Shop
// (+ Mystery Pod and Collections), every cosmetic category, heroes and one-run Boosts.
// Coins only, never real money — and nothing here can buy leaderboard rank.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter, onSale, visibleCharacters } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Analytics } from "../systems/analytics.js";
import { Progression } from "../data/progression.js";
import { Save } from "../data/save.js";
import {
  BOOSTS,
  CATEGORIES,
  COLLECTIONS,
  COSMETICS,
  getBoost,
  getCosmetic,
  POD_ODDS,
  POD_PRICE,
  POD_REFUND,
  Shop,
  SKINS,
} from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { greyPortrait } from "../pixel/grayHero.js";
import {
  button,
  drawNeonRect,
  fadeTo,
  hex,
  neonText,
  plainText,
  popIn,
  rarityColor,
  RollingCounter,
} from "../ui/ui.js";

const TABS = [
  { id: "featured", label: "FEATURED" },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: "heroes", label: "HEROES" },
];
const CARD_W = 206;
const CARD_H = 196;
const BOOST_ICON = { revive: "♥", headstart: "»", magnet: "U", double: "×2" };

export class ShopScene extends Phaser.Scene {
  constructor() {
    super("Shop");
  }

  init(data) {
    this.tab = data?.tab || "featured";
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.fadeIn(220, 5, 1, 13);
    this.backdrop = this.scene.get("Backdrop");
    this.pal = {};
    blendPalette({ a: BIOMES[1], b: BIOMES[3], t: 0.4 }, this.pal);
    this.fx = new Effects(this, { lowGfx: s.settings.lowGfx, depth: 70 });
    this.t = 0;
    this.modal = null;
    this.charId = s.selected;
    this.sel = null; // { kind: "cos"|"hero"|"boost"|"pod", id }
    Analytics.log("shop_opened", { coins: s.coins });

    // ---- header: back, title, coin balance
    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(200);
    neonText(this, W / 2 - 20, top + 46, "SHOP", 44, 0xffd23f, { blur: 14 }).setDepth(200);
    this.add
      .image(W - 168, top + 46, "coin")
      .setScale(0.8 / HI)
      .setDepth(200);
    this.coinText = neonText(this, W - 142, top + 46, `${s.coins}`, 28, 0xffc83d, {
      ox: 0,
      blur: 10,
    }).setDepth(200);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });

    // ---- live preview
    this.px = W / 2;
    this.py = top + 250;
    const ped = this.add.graphics().setDepth(30);
    ped.fillStyle(0x3ef4ff, 0.12).fillEllipse(this.px, this.py + 110, 300, 50);
    ped.lineStyle(3, 0x3ef4ff, 0.6).strokeEllipse(this.px, this.py + 110, 300, 50);
    this.previewCoins = [0, 1, 2].map((i) =>
      this.add
        .image(this.px - 90 + i * 90, this.py + 150, "pxc", "coin_0")
        .setScale(1.6)
        .setDepth(40)
        .setVisible(false),
    );
    this.nameText = neonText(this, W / 2, top + 432, "", 30, 0xffffff, { blur: 10 }).setDepth(150);
    this.subText = plainText(this, W / 2, top + 468, "", 17, "#cfc6ff").setDepth(150);
    this.action = button(this, W / 2 - 90, top + 528, 300, 76, "", {
      color: 0x39ff88,
      size: 26,
      onClick: () => this.onAction(),
    }).setDepth(150);
    this.action2 = button(this, W / 2 + 175, top + 528, 200, 76, "", {
      color: 0x3ef4ff,
      size: 18,
      onClick: () => this.onAction2(),
    }).setDepth(150);
    this.buildRig();

    // ---- tabs (two rows of chips)
    this.tabY = top + 610;
    this.tabObjs = TABS.map((t, i) => {
      const row = i < 5 ? 0 : 1;
      const n = row ? TABS.length - 5 : 5;
      const k = row ? i - 5 : i;
      const w = row ? 160 : 132;
      const x = W / 2 + (k - (n - 1) / 2) * (w + 8);
      const y = this.tabY + row * 54;
      const g = this.add.graphics().setDepth(150);
      const txt = plainText(this, x, y, t.label, 15, "#ffffff").setDepth(151);
      const z = this.add.zone(x, y, w, 46).setInteractive({ useHandCursor: true }).setDepth(152);
      z.on("pointerup", () => this.setTab(t.id));
      return { ...t, x, y, w, g, txt };
    });

    // ---- scrolling content
    this.listTop = this.tabY + 88;
    this.listBottom = H - 16 - (this.registry.get("safeBottom") || 0);
    this.list = this.add.container(0, this.listTop).setDepth(100);
    const mg = this.make.graphics({ x: 0, y: 0 }, false);
    mg.fillStyle(0xffffff).fillRect(0, this.listTop - 6, W, this.listBottom - this.listTop + 6);
    this.list.setMask(mg.createGeometryMask());
    this.scrollY = 0;
    this.vel = 0;
    this.input.on("pointerdown", (p) => {
      if (this.modal || p.worldY < this.listTop || p.worldY > this.listBottom) return;
      this.drag = { y: p.worldY, start: this.scrollY, last: p.worldY, moved: 0 };
      this.vel = 0;
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag || !p.isDown) return;
      this.vel = p.worldY - this.drag.last;
      this.drag.last = p.worldY;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(p.worldY - this.drag.y));
      this.setScroll(this.drag.start - (p.worldY - this.drag.y));
    });
    this.input.on("pointerup", () => {
      this.lastDragMoved = this.drag?.moved || 0;
      this.drag = null;
    });
    this.input.on("wheel", (p, o, dx, dy) => this.setScroll(this.scrollY + dy));

    popIn(this, [this.action, this.action2], 150);
    this.setTab(this.tab);
  }

  // ---------------------------------------------------------------- preview
  previewLoadout() {
    const lo = Shop.loadout();
    if (this.sel?.kind === "cos") lo[getCosmetic(this.sel.id).cat] = this.sel.id;
    return lo;
  }

  buildRig() {
    this.rig?.destroy();
    this.rig = new CharacterRig(this, getCharacter(this.charId), this.fx, {
      x: this.px,
      y: this.py,
      depth: 60,
      scale: 2,
      cosmetics: this.previewLoadout(),
    });
    this.flapT = 0.3;
    this.deathT = 0;
  }

  refreshPreview() {
    const c = this.sel?.kind === "cos" ? getCosmetic(this.sel.id) : null;
    if (this.rig.dead) this.rig.reset(this.px, this.py); // back from a death-effect preview
    this.rig.setCosmetics(this.previewLoadout());
    // death effects: show them off every few seconds
    this.deathT = c?.cat === "death" ? 0.6 : 0;
    const coin = c?.cat === "coin" ? c.id : Shop.equipped("coin");
    this.previewCoins.forEach((im) =>
      im
        .setVisible(c?.cat === "coin")
        .setTexture(coin ? "cosm" : "pxc", coin ? `${coin}_0` : "coin_0"),
    );
  }

  // ---------------------------------------------------------------- tabs / list
  setTab(id) {
    this.tab = id;
    for (const t of this.tabObjs) {
      const on = t.id === id;
      t.g.clear();
      t.g.fillStyle(on ? 0x3ef4ff : 0x0a0418, on ? 0.3 : 0.85);
      t.g.fillRoundedRect(t.x - t.w / 2, t.y - 21, t.w, 42, 21);
      t.g.lineStyle(2, on ? 0x9ffcff : 0x4a4070, 1);
      t.g.strokeRoundedRect(t.x - t.w / 2, t.y - 21, t.w, 42, 21);
      t.txt.setAlpha(on ? 1 : 0.65);
    }
    this.renderList();
    // pick something to show straight away
    if (id === "boosts") this.select({ kind: "boost", id: BOOSTS[0].id });
    else if (id === "heroes") this.select({ kind: "hero", id: this.charId });
    else if (id === "featured") this.select({ kind: "cos", id: Shop.daily().deal });
    else {
      const eq = Shop.equipped(id);
      this.select({ kind: "cos", id: eq || COSMETICS.find((c) => c.cat === id).id });
    }
  }

  renderList() {
    this.list.removeAll(true);
    this.cards = [];
    this.scrollY = 0;
    this.list.y = this.listTop;
    let y = 0;
    if (this.tab === "featured") y = this.renderFeatured();
    else if (this.tab === "heroes") y = this.renderGrid(this.heroItems(), 0);
    else if (this.tab === "boosts") y = this.renderBoosts();
    else
      y = this.renderGrid(
        COSMETICS.filter((c) => c.cat === this.tab).map((c) => ({ kind: "cos", id: c.id })),
        0,
      );
    this.contentH = y + 20;
  }

  heroItems() {
    return visibleCharacters(Save.data.unlocked)
      .filter((c) => !c.lottery)
      .map((c) => ({ kind: "hero", id: c.id }));
  }

  renderGrid(items, y0) {
    const W = this.W;
    items.forEach((it, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = W / 2 + (col - 1) * (CARD_W + 12);
      const y = y0 + row * (CARD_H + 12) + CARD_H / 2;
      this.makeCard(it, x, y);
    });
    return y0 + Math.ceil(items.length / 3) * (CARD_H + 12);
  }

  /** One shop card: icon, name, price / OWNED / EQUIPPED, rarity border, deal ribbon. */
  makeCard(it, x, y) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    c.add(g);
    const info = this.itemInfo(it);
    const draw = () => {
      const sel = this.sel && this.sel.kind === it.kind && this.sel.id === it.id;
      g.clear();
      drawNeonRect(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16, info.color, {
        fill: sel ? 0x1a1040 : 0x0b0520,
        fillAlpha: 0.92,
        width: sel ? 4 : 2,
        glow: sel,
      });
    };
    draw();
    const icon = this.iconFor(it, 0, -34);
    c.add(icon);
    const name = plainText(this, 0, 36, info.name, 17, "#ffffff");
    name.setScale(Math.min(1, (CARD_W - 16) / name.width));
    c.add(name);
    const status = this.statusFor(it);
    c.add(status);
    if (info.deal) {
      const rib = this.add.graphics();
      rib.fillStyle(0xff3a5a, 1).fillRoundedRect(CARD_W / 2 - 70, -CARD_H / 2 + 6, 64, 26, 8);
      c.add([rib, plainText(this, CARD_W / 2 - 38, -CARD_H / 2 + 19, "-30%", 15, "#ffffff")]);
    }
    c.setSize(CARD_W, CARD_H).setInteractive();
    c.on("pointerup", () => {
      if (this.modal || (this.lastDragMoved || 0) > 12) return;
      Sfx.ui();
      this.select(it);
    });
    c.redraw = draw;
    c.it = it;
    this.list.add(c);
    this.cards.push(c);
    return c;
  }

  itemInfo(it) {
    if (it.kind === "cos") {
      const c = getCosmetic(it.id);
      return {
        name: c.name,
        color: rarityColor(c.rarity, this.t),
        rarity: RARITY[c.rarity].label,
        deal: Shop.daily().deal === it.id,
      };
    }
    if (it.kind === "hero") {
      const d = getCharacter(it.id);
      return { name: d.name, color: RARITY[d.rarity].color, rarity: RARITY[d.rarity].label };
    }
    if (it.kind === "boost") {
      const b = getBoost(it.id);
      return { name: b.name, color: 0x39ff88, rarity: "BOOST · ONE RUN" };
    }
    return { name: "MYSTERY POD", color: 0xb45cff, rarity: "RANDOM COSMETIC" };
  }

  iconFor(it, x, y) {
    if (it.kind === "hero") {
      return this.add.image(x, y, getCharacter(it.id).texture).setScale((0.42 / HI) * PORTRAIT_K);
    }
    if (it.kind === "boost") {
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x0c2a1a, 1).fillCircle(0, 0, 40);
      g.lineStyle(4, 0x39ff88, 1).strokeCircle(0, 0, 40);
      c.add([g, neonText(this, 0, 0, BOOST_ICON[it.id] || "+", 34, 0x39ff88, { blur: 8 })]);
      return c;
    }
    if (it.kind === "pod") return this.add.image(x, y, "cosm", "pod_0").setScale(0.8);
    const c = getCosmetic(it.id);
    if (c.cat === "hat") return this.add.image(x, y, "cosm", HAT_FIT[c.id].frame).setScale(1.3);
    if (c.cat === "coin") return this.add.image(x, y, "cosm", `${c.id}_0`).setScale(1.6);
    if (c.cat === "skin")
      return this.add
        .image(x, y, greyPortrait(this, getCharacter(this.charId)))
        .setScale((0.4 / HI) * PORTRAIT_K)
        .setTint(SKINS[c.id].tint);
    return this.add.image(x, y, "cosm", `icon_${c.id}`).setScale(1.1);
  }

  statusFor(it) {
    const y = 72;
    if (it.kind === "cos") {
      const c = getCosmetic(it.id);
      if (Shop.equipped(c.cat) === it.id) return plainText(this, 0, y, "EQUIPPED", 16, "#39ff88");
      if (Shop.owns(it.id)) return plainText(this, 0, y, "OWNED", 16, "#9fe8ff");
      return this.priceTag(Shop.priceOf(it.id), y, Shop.priceOf(it.id) < c.price ? c.price : 0);
    }
    if (it.kind === "hero") {
      const d = getCharacter(it.id);
      if (Save.data.selected === it.id) return plainText(this, 0, y, "EQUIPPED", 16, "#39ff88");
      if (Progression.isUnlocked(it.id)) return plainText(this, 0, y, "OWNED", 16, "#9fe8ff");
      if (d.requires && !Progression.requirementsMet(d))
        return plainText(this, 0, y, "LOCKED", 16, "#8a80b0");
      return this.priceTag(d.cost, y);
    }
    if (it.kind === "boost") {
      const n = Shop.boostCount(it.id);
      const c = this.add.container(0, 0);
      c.add(this.priceTag(getBoost(it.id).price, y));
      const top = -CARD_H / 2 + 20;
      if (n) c.add(plainText(this, -CARD_W / 2 + 14, top, `x${n}`, 16, "#b8ffd8", { ox: 0 }));
      if (Shop.isArmed(it.id))
        c.add(plainText(this, CARD_W / 2 - 14, top, "ON ✓", 15, "#39ff88", { ox: 1 }));
      return c;
    }
    return this.priceTag(POD_PRICE, y);
  }

  priceTag(price, y, was = 0) {
    const c = this.add.container(0, y);
    const afford = Save.data.coins >= price;
    const t = plainText(this, 12, 0, `${price}`, 20, afford ? "#ffd23f" : "#8a7a50");
    c.add([this.add.image(-t.width / 2 - 6, 0, "coin").setScale(0.45 / HI), t]);
    if (was) {
      const w = plainText(this, 0, -22, `${was}`, 14, "#a99fd6");
      const line = this.add.rectangle(0, -22, w.width + 6, 2, 0xff3a5a);
      c.add([w, line]);
    }
    return c;
  }

  renderFeatured() {
    const W = this.W;
    let y = 0;
    // daily shop
    const ms = Shop.msToRefresh();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    this.list.add(neonText(this, 30, y + 18, "DAILY SHOP", 24, 0xffd23f, { ox: 0, blur: 8 }));
    this.refreshText = plainText(this, W - 30, y + 18, `new items in ${h}h ${m}m`, 16, "#cfc6ff", {
      ox: 1,
    });
    this.list.add(this.refreshText);
    y += 44;
    const daily = Shop.daily().items.map((id) => ({ kind: "cos", id }));
    // 4 cards: a row of 3 + one more beside the pod
    y = this.renderGrid(daily.slice(0, 3), y);
    const podY = y + CARD_H / 2;
    this.makeCard(daily[3], W / 2 - (CARD_W + 12), podY);
    // mystery pod: a double-width card
    const pc = this.add.container(W / 2 + (CARD_W + 12) / 2, podY);
    const pw = CARD_W * 2 + 12;
    const g = this.add.graphics();
    drawNeonRect(g, -pw / 2, -CARD_H / 2, pw, CARD_H, 16, 0xb45cff, {
      fill: 0x140a30,
      fillAlpha: 0.95,
    });
    const pod = this.add.image(-pw / 2 + 74, -6, "cosm", "pod_0").setScale(1.2);
    this.tweens.add({
      targets: pod,
      angle: { from: -5, to: 5 },
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    const odds = Object.entries(POD_ODDS)
      .map(([k, v]) => `${RARITY[k].label[0]}${RARITY[k].label.slice(1).toLowerCase()} ${v}%`)
      .join("\n");
    pc.add([
      g,
      pod,
      neonText(this, 30, -64, "MYSTERY POD", 22, 0xd8a8ff, { blur: 8 }),
      plainText(this, 30, -10, odds, 14, "#cfc6ff", { lineSpacing: 1 }),
      plainText(this, 30, 52, "No duplicates", 13, "#9c90c8"),
      this.priceTag(POD_PRICE, 78),
    ]);
    pc.setSize(pw, CARD_H).setInteractive();
    pc.on("pointerup", () => {
      if (this.modal || (this.lastDragMoved || 0) > 12) return;
      Sfx.ui();
      this.select({ kind: "pod", id: "pod" });
    });
    pc.redraw = () => {};
    pc.it = { kind: "pod", id: "pod" };
    this.list.add(pc);
    this.cards.push(pc);
    y += CARD_H + 24;

    // collections
    this.list.add(neonText(this, 30, y + 16, "COLLECTIONS", 24, 0x3ef4ff, { ox: 0, blur: 8 }));
    this.list.add(
      plainText(this, W - 30, y + 16, "own a full set → title + glow", 15, "#cfc6ff", { ox: 1 }),
    );
    y += 44;
    for (const set of COLLECTIONS) {
      const owned = set.items.filter((id) => Shop.owns(id)).length;
      const done = owned === set.items.length;
      const row = this.add.container(W / 2, y + 56);
      const rg = this.add.graphics();
      drawNeonRect(rg, -W / 2 + 24, -52, W - 48, 104, 16, set.glow, {
        fill: 0x0b0520,
        fillAlpha: 0.9,
        width: done ? 3 : 2,
        glow: done,
      });
      row.add(rg);
      row.add(
        plainText(this, -W / 2 + 44, -28, set.name.toUpperCase(), 18, hex(set.glow), { ox: 0 }),
      );
      row.add(plainText(this, -W / 2 + 44, 0, `Title: "${set.title}"`, 15, "#cfc6ff", { ox: 0 }));
      row.add(
        plainText(
          this,
          -W / 2 + 44,
          26,
          `${owned} / ${set.items.length}`,
          16,
          done ? "#39ff88" : "#ffffff",
          { ox: 0 },
        ),
      );
      set.items.forEach((id, i) => {
        const ic = this.iconFor({ kind: "cos", id }, 30 + i * 74, 0);
        ic.setScale(ic.scaleX * 0.62);
        if (!Shop.owns(id)) ic.setAlpha(0.3);
        row.add(ic);
      });
      if (done) {
        const on = Shop.equipped("title") === set.id;
        const b = button(this, W / 2 - 92, 0, 120, 52, on ? "WORN" : "WEAR", {
          color: set.glow,
          size: 16,
          onClick: () => {
            if (on) Shop.unequip("title");
            else Shop.equipTitle(set.id);
            this.rig.setCosmetics(this.previewLoadout());
            this.renderList();
          },
        });
        row.add(b);
      }
      this.list.add(row);
      y += 116;
    }
    return y;
  }

  renderBoosts() {
    const W = this.W;
    this.list.add(
      plainText(
        this,
        W / 2,
        16,
        "One run each · boosted runs earn coins & missions but are NOT ranked",
        15,
        "#b8ffd8",
      ),
    );
    return this.renderGrid(
      BOOSTS.map((b) => ({ kind: "boost", id: b.id })),
      40,
    );
  }

  setScroll(v) {
    const max = Math.max(0, this.contentH - (this.listBottom - this.listTop));
    this.scrollY = Phaser.Math.Clamp(v, 0, max);
    this.list.y = this.listTop - this.scrollY;
  }

  // ---------------------------------------------------------------- selection + actions
  select(it) {
    this.sel = it;
    if (it.kind === "hero" && it.id !== this.charId) {
      this.charId = it.id;
      this.buildRig();
    } else if (it.kind !== "hero" && this.charId !== Save.data.selected && this.tab !== "heroes") {
      this.charId = Save.data.selected;
      this.buildRig();
    }
    this.refreshPreview();
    for (const c of this.cards || []) c.redraw();
    const info = this.itemInfo(it);
    this.nameText
      .setText(info.name)
      .setStroke(hex(info.color), 3)
      .setShadow(0, 0, hex(info.color), 10, true, true);
    let sub = info.rarity;
    if (it.kind === "cos")
      sub = `${CATEGORIES.find((c) => c.id === getCosmetic(it.id).cat).one} · ${info.rarity}`;
    if (it.kind === "boost") sub = getBoost(it.id).desc;
    if (it.kind === "pod")
      sub = `A random cosmetic you don't own · ${POD_REFUND} back if a tier is complete`;
    if (it.kind === "hero") sub = `${getCharacter(it.id).title} · ${info.rarity}`;
    this.subText.setText(sub);
    if (it.kind !== "pod") Analytics.log("item_viewed", { item: it.id, kind: it.kind });
    this.refreshActions();
  }

  refreshActions() {
    const it = this.sel;
    const s = Save.data;
    const a = this.action;
    const b = this.action2;
    b.setVisible(false);
    a.x = this.W / 2;
    const buy = (price) => {
      a.setLabel(`BUY  ${price}`);
      a.setColor(0xffd23f);
      a.setEnabled(s.coins >= price);
    };
    if (it.kind === "cos") {
      const c = getCosmetic(it.id);
      if (!Shop.owns(it.id)) buy(Shop.priceOf(it.id));
      else if (Shop.equipped(c.cat) === it.id) {
        a.setLabel("UNEQUIP");
        a.setColor(0x8a80b0);
        a.setEnabled(true);
      } else {
        a.setLabel("EQUIP");
        a.setColor(0x39ff88);
        a.setEnabled(true);
      }
    } else if (it.kind === "hero") {
      const d = getCharacter(it.id);
      if (Progression.isUnlocked(it.id)) {
        const on = s.selected === it.id;
        a.setLabel(on ? "EQUIPPED" : "EQUIP");
        a.setColor(on ? 0x8a80b0 : 0x39ff88);
        a.setEnabled(!on);
      } else if (d.requires && !Progression.requirementsMet(d)) {
        a.setLabel("LOCKED");
        a.setColor(0x8a80b0);
        a.setEnabled(false);
        this.subText.setText(d.requires.map((r) => r.text).join(" · "));
      } else if (d.limited && !onSale(d)) {
        a.setLabel("GONE");
        a.setEnabled(false);
      } else buy(d.cost);
    } else if (it.kind === "boost") {
      buy(getBoost(it.id).price);
      a.x = this.W / 2 - 90;
      if (Shop.boostCount(it.id)) {
        const on = Shop.isArmed(it.id);
        b.setVisible(true);
        b.setLabel(on ? "NEXT RUN ✓" : "USE NEXT RUN");
        b.setColor(on ? 0x39ff88 : 0x4a4070);
      }
    } else {
      a.setLabel(`OPEN  ${POD_PRICE}`);
      a.setColor(0xb45cff);
      a.setEnabled(s.coins >= POD_PRICE);
    }
  }

  onAction() {
    if (this.modal) return;
    const it = this.sel;
    if (it.kind === "cos") {
      const c = getCosmetic(it.id);
      if (!Shop.owns(it.id))
        return this.confirm(`Buy ${c.name}?`, Shop.priceOf(it.id), () => {
          if (Shop.buy(it.id)) this.celebrate(rarityColor(c.rarity, 0), c.rarity);
        });
      if (Shop.equipped(c.cat) === it.id) Shop.unequip(c.cat);
      else Shop.equip(it.id);
      Sfx.ui();
      this.rig.flap();
      this.afterChange();
      return;
    }
    if (it.kind === "hero") {
      const d = getCharacter(it.id);
      if (Progression.isUnlocked(it.id)) {
        Save.data.selected = it.id;
        Save.write();
        this.afterChange();
        return;
      }
      return this.confirm(`Unlock ${d.name}?`, d.cost, () => {
        if (Progression.buy(it.id)) {
          Save.data.selected = it.id;
          Save.write();
          Analytics.log("item_purchased", { item: it.id, price: d.cost, category: "hero" });
          this.celebrate(RARITY[d.rarity].color, d.rarity);
        }
      });
    }
    if (it.kind === "boost") {
      const bst = getBoost(it.id);
      return this.confirm(`Buy ${bst.name}?`, bst.price, () => {
        if (Shop.buyBoost(it.id)) this.celebrate(0x39ff88, "rare");
      });
    }
    if (it.kind === "pod")
      return this.confirm("Open a Mystery Pod?", POD_PRICE, () => this.openPod());
  }

  onAction2() {
    if (this.modal || this.sel?.kind !== "boost") return;
    Shop.toggleBoost(this.sel.id);
    Sfx.ui();
    this.afterChange();
  }

  afterChange() {
    this.coins.to(Save.data.coins, 600);
    const sel = this.sel;
    const keep = this.scrollY;
    this.renderList();
    this.setScroll(keep);
    this.select(sel);
  }

  // ---------------------------------------------------------------- modals
  confirm(title, price, onYes) {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(500);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.78).setInteractive();
    const g = this.add.graphics();
    drawNeonRect(g, 70, H / 2 - 170, W - 140, 300, 26, 0xffd23f, {
      fill: 0x0b0520,
      fillAlpha: 0.97,
    });
    const t = neonText(this, W / 2, H / 2 - 110, title, 28, 0xffd23f, { blur: 10 });
    t.setScale(Math.min(1, (W - 180) / t.width));
    const pr = this.priceTag(price, 0);
    pr.setPosition(W / 2, H / 2 - 50).setScale(1.5);
    const left = plainText(
      this,
      W / 2,
      H / 2 - 8,
      `You'll have ${Save.data.coins - price} left`,
      17,
      "#cfc6ff",
    );
    const yes = button(this, W / 2 - 120, H / 2 + 62, 200, 80, "BUY", {
      color: 0x39ff88,
      size: 28,
      onClick: () => {
        this.closeModal();
        onYes();
      },
    });
    const no = button(this, W / 2 + 120, H / 2 + 62, 200, 80, "CANCEL", {
      color: 0xff4fd8,
      size: 22,
      onClick: () => this.closeModal(),
    });
    c.add([dim, g, t, pr, left, yes, no]);
    popIn(this, [yes, no], 60);
    this.modal = c;
  }

  closeModal() {
    this.modal?.destroy();
    this.modal = null;
  }

  /** The purchase moment: burst + rings at the preview, chime, haptic, coins roll down. */
  celebrate(color, rarity) {
    const { px, py } = this;
    Sfx.reward();
    if (rarity === "legendary" || rarity === "epic")
      this.time.delayedCall(180, () => Sfx.levelUp());
    Haptics.strong();
    this.cameras.main.shake(160, 0.004);
    this.fx.ring(px, py, 0xffffff, { scale: 2.6, duration: 700 });
    this.fx.ring(px, py, color, { scale: 1.8, duration: 560, width: 3 });
    this.fx.burst("star", px, py, rarity === "legendary" ? 60 : 36, color, {
      speed: { min: 200, max: 700 },
    });
    this.fx.burst("spark", px, py, 24, 0xffd23f);
    this.fx.floatText(px, py - 120, "UNLOCKED!", "#ffd23f", 48);
    this.rig.flap();
    this.afterChange();
  }

  openPod() {
    const res = Shop.openPod();
    if (!res) return;
    this.coins.to(Save.data.coins, 500);
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(500);
    this.modal = c;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.9).setInteractive();
    const pod = this.add.image(W / 2, H * 0.42, "cosm", "pod_0").setScale(4);
    c.add([dim, pod]);
    const col = rarityColor(res.rarity, 0);
    // shake harder and harder, crack, then burst
    this.tweens.add({
      targets: pod,
      angle: { from: -6, to: 6 },
      duration: 70,
      yoyo: true,
      repeat: 9,
      onRepeat: () => Sfx.chestShake?.(),
      onComplete: () => {
        pod.setFrame("pod_1");
        this.cameras.main.shake(200, 0.006);
        this.tweens.add({
          targets: pod,
          angle: { from: -12, to: 12 },
          scale: 4.4,
          duration: 50,
          yoyo: true,
          repeat: 7,
          onComplete: () => this.podReveal(c, pod, res, col),
        });
      },
    });
  }

  podReveal(c, pod, res, col) {
    const W = this.W;
    const H = this.H;
    pod.setVisible(false);
    Sfx.chestOpen?.();
    Sfx.reward();
    Haptics.strong();
    this.cameras.main.flash(220, (col >> 16) & 255, (col >> 8) & 255, col & 255);
    this.fx.ring(W / 2, H * 0.42, col, { scale: 4, duration: 800, width: 4 });
    this.fx.ring(W / 2, H * 0.42, 0xffffff, { scale: 2.6, duration: 600 });
    this.fx.burst("star", W / 2, H * 0.42, 70, col, { speed: { min: 250, max: 900 } });
    this.fx.burst("shard", W / 2, H * 0.42, 30, 0xb45cff);
    const rays = this.add.graphics({ x: W / 2, y: H * 0.42 });
    rays.fillStyle(col, 0.16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.slice(0, 0, 600, a, a + 0.18, false).fillPath();
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    c.addAt(rays, 1);
    const label = RARITY[res.rarity].label;
    if (res.item) {
      const it = { kind: "cos", id: res.item.id };
      const icon = this.iconFor(it, W / 2, H * 0.42);
      const s0 = icon.scaleX;
      icon.setScale(0.1);
      this.tweens.add({ targets: icon, scale: s0 * 2.4, duration: 600, ease: "Back.easeOut" });
      c.add([
        icon,
        neonText(this, W / 2, H * 0.26, label, 30, col, { blur: 14 }),
        neonText(this, W / 2, H * 0.56, res.item.name.toUpperCase(), 44, 0xffffff, {
          blur: 16,
          stroke: hex(col),
        }),
        plainText(
          this,
          W / 2,
          H * 0.6,
          CATEGORIES.find((k) => k.id === res.item.cat).one,
          20,
          "#cfc6ff",
        ),
      ]);
      const eq = button(this, W / 2 - 130, H * 0.7, 220, 86, "EQUIP", {
        color: 0x39ff88,
        size: 28,
        onClick: () => {
          Shop.equip(res.item.id);
          this.closeModal();
          this.select(it);
          this.afterChange();
        },
      });
      const ok = button(this, W / 2 + 130, H * 0.7, 220, 86, "COOL", {
        color: 0x3ef4ff,
        size: 28,
        onClick: () => {
          this.closeModal();
          this.afterChange();
        },
      });
      c.add([eq, ok]);
      popIn(this, [eq, ok], 400);
    } else {
      c.add([
        neonText(this, W / 2, H * 0.4, `ALL ${label} OWNED`, 34, col, { blur: 12 }),
        neonText(this, W / 2, H * 0.48, `+${res.refund} COINS BACK`, 40, 0xffd23f, { blur: 14 }),
      ]);
      const ok = button(this, W / 2, H * 0.62, 240, 86, "OK", {
        color: 0x3ef4ff,
        size: 28,
        onClick: () => {
          this.closeModal();
          this.afterChange();
        },
      });
      c.add(ok);
      this.coins.to(Save.data.coins, 700);
    }
  }

  leave() {
    if (this.modal) return this.closeModal();
    fadeTo(this, "Menu");
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    this.backdrop.drive(this.pal, { scroll: 60, speedNorm: 0, dim: 0.6, scenery: false });
    if (!this.drag && Math.abs(this.vel) > 0.2) {
      this.setScroll(this.scrollY - this.vel);
      this.vel *= Math.exp(-dt * 5);
    }
    // the preview flies on the spot so trails stream out behind it
    this.rig.setPosition(this.px, this.py + Math.sin(this.t * 2) * 10);
    this.rig.angle = Math.sin(this.t * 2 + 1) * 8;
    this.flapT -= dt;
    if (this.flapT <= 0 && !this.rig.dead) {
      this.flapT = 0.75;
      this.rig.flap();
    }
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        if (!this.rig.dead) {
          this.rig.die();
          this.deathT = 1.6;
        } else {
          this.rig.reset(this.px, this.py);
          this.rig.applyCosmeticVisibility();
          this.deathT = 1.4;
        }
      }
    }
    this.rig.update(dt, 720); // fast enough that the trail clears the 2x preview hero
    this.fx.update(dt);
    const f = Math.floor(this.t * 9) % 4;
    for (const im of this.previewCoins)
      if (im.visible)
        im.setFrame(im.texture.key === "cosm" ? im.frame.name.replace(/\d$/, f) : `coin_${f}`);
    if (this.refreshText) {
      const ms = Shop.msToRefresh();
      this.refreshText.setText(
        `new items in ${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`,
      );
    }
  }
}
