// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Character select: orbiting 3D-feel showcase with a live trail + flap preview, and a
// perspective card carousel with rarity-glow borders, unlock by coins / shards / challenge.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { BIOMES, biomeIndex, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { onSale, saleLeft, visibleCharacters } from "../player/characterDefs.js";
import { revealHero } from "../ui/reveal.js";
import { Sfx } from "../audio/sfx.js";
import { Progression, SPIN_EVERY } from "../data/progression.js";
import { Save } from "../data/save.js";
import { Seasons } from "../data/seasons.js";
import { CATEGORIES, COSMETICS, getCosmetic, Shop, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import {
  button,
  drawNeonRect,
  fadeTo,
  hex,
  neonText,
  plainText,
  popIn,
  ProgressBar,
  rarityColor,
  RollingCounter,
} from "../ui/ui.js";

const CARD_W = 300;
const CARD_H = 380;

export class CharacterScene extends Phaser.Scene {
  constructor() {
    super("Characters");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    // limited-time heroes only appear while on sale (or once owned)
    this.roster = visibleCharacters(s.unlocked);
    this.rig = null;
    this.challengeBar = null;
    this.posTween = null;
    this.lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
    this.cameras.main.fadeIn(250, 5, 1, 13);
    this.backdrop = this.scene.get("Backdrop");
    this.fx = new Effects(this, { lowGfx: this.lowGfx, depth: 70 });
    this.pal = {};
    this.t = 0;

    // header
    const back = button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(200);
    neonText(this, W / 2, top + 46, "HEROES", 40, 0xb45cff).setDepth(200);
    this.add
      .image(W - 170, top + 46, "coin")
      .setScale(0.75 / HI)
      .setDepth(200);
    this.coinText = neonText(this, W - 146, top + 46, `${s.coins}`, 26, 0xffc83d, {
      ox: 0,
      blur: 10,
    }).setDepth(200);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });
    popIn(this, back, 0);

    // showcase pedestal
    this.cx = W / 2;
    this.cy = H * 0.34;
    this.pedGlow = this.add
      .image(this.cx, this.cy + 120, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(4, 1.1)
      .setDepth(40);
    this.pedRings = [0, 1, 2].map((i) =>
      this.add
        .image(this.cx, this.cy + 120 + i * 14, "ring")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.3 - i * 0.22, 0.26 - i * 0.04)
        .setAlpha(0.8 - i * 0.2)
        .setDepth(41),
    );
    this.beam = this.add
      .image(this.cx, this.cy + 20, "beam")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(5, 13)
      .setAlpha(0.12)
      .setDepth(39);
    this.nameText = neonText(this, W / 2, this.cy - 190, "", 48, 0xffffff, { blur: 24 }).setDepth(
      150,
    );
    this.titleText = plainText(this, W / 2, this.cy - 146, "", 18, "#d8d0ff").setDepth(150);

    // cards
    const focus = this.registry.get("heroFocus");
    this.registry.remove("heroFocus");
    this.index = Math.max(
      0,
      this.roster.findIndex((c) => c.id === (focus || s.selected)),
    );
    this.pos = this.index;
    this.cardsY = H * 0.66;
    this.cards = this.roster.map((def, i) => this.makeCard(def, i));

    // action area
    this.actionBtn = button(this, W / 2, H * 0.88, 420, 100, "SELECT", {
      color: 0x39ff88,
      size: 34,
      onClick: () => this.act(),
    }).setDepth(200);
    this.altText = plainText(this, W / 2, H * 0.88 + 72, "", 17, "#cfc6ff").setDepth(200);
    this.leftArrow = button(this, 50, this.cardsY, 64, 120, "‹", {
      color: 0x3ef4ff,
      size: 48,
      onClick: () => this.select(this.index - 1),
    }).setDepth(200);
    this.rightArrow = button(this, W - 50, this.cardsY, 64, 120, "›", {
      color: 0x3ef4ff,
      size: 48,
      onClick: () => this.select(this.index + 1),
    }).setDepth(200);
    popIn(this, [this.actionBtn, this.leftArrow, this.rightArrow], 200);

    // swipe
    this.input.on("pointerdown", (p) => {
      if (this.editor) return;
      this.dragX = p.worldX;
      this.dragY = p.worldY;
      this.dragPos = this.pos;
      this.dragging =
        p.worldY > this.cardsY - CARD_H / 2 - 20 && p.worldY < this.cardsY + CARD_H / 2 + 20;
    });
    this.input.on("pointermove", (p) => {
      if (this.editor) return;
      if (!this.dragging || !p.isDown) return;
      this.pos = Phaser.Math.Clamp(
        this.dragPos - (p.worldX - this.dragX) / 300,
        -0.4,
        this.roster.length - 0.6,
      );
      this.posTween?.stop();
    });
    this.input.on("pointerup", (p) => {
      if (!this.dragging) return;
      this.dragging = false;
      const dx = p.worldX - this.dragX;
      const tapCentre =
        Math.abs(dx) < 10 &&
        Math.abs(p.worldX - this.W / 2) < CARD_W / 2 &&
        Math.abs(this.pos - this.index) < 0.1;
      if (tapCentre && Progression.isUnlocked(this.roster[this.index].id)) {
        this.openEditor();
        return;
      }
      if (Math.abs(dx) > 40) this.select(Math.round(this.pos + (dx < 0 ? 0.3 : -0.3)));
      else if (Math.abs(dx) < 10 && Math.abs(p.worldX - this.W / 2) > CARD_W / 2)
        this.select(this.index + (p.worldX > this.W / 2 ? 1 : -1));
      else this.select(this.index);
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.select(this.index - 1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.select(this.index + 1));

    this.buildRig();
    this.refresh();
  }

  makeCard(def, i) {
    const c = this.add.container(this.W / 2, this.cardsY).setDepth(100);
    const g = this.add.graphics();
    const glow = this.add
      .image(0, -40, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(def.color)
      .setScale(2.2)
      .setAlpha(0.35);
    // heroes with perks show a PERKS section instead of the flavour line (layout moves up)
    const pk = def.perks?.list;
    const extra = pk ? Math.max(0, pk.length - 2) * 16 : 0; // each perk past two lifts the card
    const up = pk ? 18 + extra * 0.7 : 0;
    const img = this.add.image(0, -50 - up, def.texture).setScale((1.25 / HI) * PORTRAIT_K);
    const name = neonText(this, 0, 70 - up * 1.2, def.name, 32, def.color, { blur: 12 });
    const rar = plainText(
      this,
      0,
      108 - up * 1.4,
      RARITY[def.rarity].label,
      15,
      hex(RARITY[def.rarity].color),
    );
    let desc;
    if (pk) {
      // stack the perk lines by their real height (a long one wraps onto two lines)
      desc = this.add.container(0, -extra).add(plainText(this, 0, 110, "PERKS", 14, "#ffd23f"));
      let y = 121;
      for (const t of pk) {
        const line = plainText(this, 0, 0, `◆ ${t}`, 12, "#ffe8c0", { wrap: CARD_W - 30 });
        line.setY(y + line.height / 2);
        y += line.height + 2;
        desc.add(line);
      }
    } else desc = plainText(this, 0, 148, def.desc, 13, "#d8d0ff", { wrap: CARD_W - 40 });
    const lock = this.add
      .image(0, -50, "lock")
      .setScale(1.4 / HI)
      .setAlpha(0.9);
    // owned heroes: tap the card to edit your look
    const edit = this.add.container(0, CARD_H / 2 - 4);
    const eg = this.add.graphics();
    eg.fillStyle(0x0b0520, 1).fillRoundedRect(-92, -22, 184, 44, 22);
    eg.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(-92, -22, 184, 44, 22);
    edit.add([eg, plainText(this, 0, 0, "✎ TAP TO EDIT", 17, "#ffd23f")]);
    c.add([g, glow, img, name, rar, desc, lock, edit]);
    if (def.passPlus) {
      // DRIFT PASS+ heroes: a gold-on-crimson badge on the card's top edge
      const b = this.add.container(0, -CARD_H / 2 + 26);
      const bg = this.add.graphics();
      bg.fillStyle(0x14020a, 1).fillRoundedRect(-88, -16, 176, 32, 16);
      bg.fillStyle(0xc8102e, 1).fillRoundedRect(-84, -12, 168, 24, 12);
      bg.lineStyle(2, 0xffd23f, 1).strokeRoundedRect(-84, -12, 168, 24, 12);
      b.add([bg, plainText(this, 0, 0, "DRIFT PASS+", 15, "#ffe9a8")]);
      c.add(b);
    }
    c.edit = edit;
    c.def = def;
    c.g = g;
    c.img = img;
    c.lock = lock;
    c.i = i;
    this.tweens.add({
      targets: img,
      y: -60,
      yoyo: true,
      repeat: -1,
      duration: 1200 + i * 90,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  drawCard(c) {
    const def = c.def;
    const owned = Progression.isUnlocked(def.id);
    const col = rarityColor(def.rarity, this.t);
    const g = c.g;
    g.clear();
    drawNeonRect(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 26, col, {
      fill: 0x0b0520,
      fillAlpha: 0.88,
      width: { ultra: 9, mega: 7, legendary: 5 }[def.rarity] ?? 3,
    });
    if (def.passPlus) {
      // animated rarity border: a bright band of light that runs round the card
      // (a smooth glide, nothing flashes, so it's the same with Reduce Flashing)
      const w = CARD_W + 6;
      const h = CARD_H + 6;
      const per = 2 * (w + h);
      const at = (d) => {
        d = ((d % per) + per) % per;
        if (d < w) return [-w / 2 + d, -h / 2];
        if (d < w + h) return [w / 2, -h / 2 + d - w];
        if (d < 2 * w + h) return [w / 2 - (d - w - h), h / 2];
        return [-w / 2, h / 2 - (d - 2 * w - h)];
      };
      const head = this.t * 260 + c.i * 97;
      for (let k = 0; k < 2; k++)
        for (let s = 0; s < 18; s++) {
          const d = head + k * (per / 2) - s * 8;
          const [x0, y0] = at(d);
          const [x1, y1] = at(d - 8);
          if (Math.abs(x0 - x1) > 9 || Math.abs(y0 - y1) > 9) continue; // round a corner
          g.lineStyle(6 - s * 0.25, s < 3 ? 0xffffff : col, 1 - s / 18);
          g.lineBetween(x0, y0, x1, y1);
        }
    }
    // inner rarity sheen
    g.fillStyle(col, 0.08);
    g.fillRoundedRect(-CARD_W / 2 + 10, -CARD_H / 2 + 10, CARD_W - 20, CARD_H * 0.5, 20);
    if (def.id === Save.data.selected) {
      g.fillStyle(0x39ff88, 1);
      g.fillRoundedRect(-62, -CARD_H / 2 - 16, 124, 30, 15);
    }
    c.img.setTint(owned ? 0xffffff : 0x222233);
    c.lock.setVisible(!owned);
    c.edit.setVisible(owned && c.i === this.index);
  }

  buildRig() {
    this.rig?.destroy();
    const def = this.roster[this.index];
    this.rig = new CharacterRig(this, def, this.fx, {
      x: this.cx,
      y: this.cy,
      lowGfx: this.lowGfx,
      depth: 60,
      scale: 2,
    });
    this.orbit = 0;
    this.flapT = 0.4;
    this.fx.ring(this.cx, this.cy, def.color, { scale: 1.4, duration: 500 });
    this.fx.burst("star", this.cx, this.cy, 14, def.color);
    if (def.id === "yarms") {
      // showcase: rotates in, then a full flex pose with a gold Legendary burst
      this.time.delayedCall(700, () => {
        if (this.rig?.def.id !== "yarms") return;
        this.rig.flex({ big: true, shine: true });
        this.fx.ring(this.rig.x, this.rig.y, 0xffd23f, { scale: 2.4, duration: 700 });
        this.fx.burst("star", this.rig.x, this.rig.y, 40, 0xffd23f, {
          speed: { min: 200, max: 650 },
        });
      });
    }
  }

  select(i) {
    i = Phaser.Math.Clamp(i, 0, this.roster.length - 1);
    const changed = i !== this.index;
    this.index = i;
    this.posTween?.stop();
    const o = { p: this.pos };
    this.posTween = this.tweens.add({
      targets: o,
      p: i,
      duration: 420,
      ease: "Back.easeOut",
      onUpdate: () => (this.pos = o.p),
    });
    if (changed) {
      Sfx.ui();
      this.buildRig();
      this.refresh();
    }
  }

  refresh() {
    const def = this.roster[this.index];
    const s = Save.data;
    const owned = Progression.isUnlocked(def.id);
    // season heroes: a pass tier now, coins once their season has ended
    const season = Seasons.active();
    const passTier = season ? season.pass.tiers.findIndex((t) => t.hero === def.id) + 1 : 0;
    const cost = def.cost || Seasons.afterPrice(def.id);
    this.nameText
      .setText(def.name)
      .setStroke(hex(def.color), 5)
      .setShadow(0, 0, hex(def.color), 24, true, true);
    this.titleText.setText(`${def.title} · ${RARITY[def.rarity].label}`);
    this.pedRings.forEach((r) => r.setTint(RARITY[def.rarity].color));
    this.pedGlow.setTint(def.color);
    this.beam.setTint(def.color);
    let alt = "";
    if (owned) {
      const sel = s.selected === def.id;
      this.actionBtn.setLabel(sel ? "EQUIPPED" : "SELECT");
      this.actionBtn.setColor(sel ? 0x8a80b0 : 0x39ff88);
      this.actionBtn.setEnabled(!sel);
    } else if (def.passPlus) {
      // DRIFT PASS+ heroes: only from their tier of the paid track, never for coins
      const live = season?.id === def.passPlus;
      this.actionBtn.setLabel(live ? `DRIFT PASS+ · TIER ${def.passTier}` : "DRIFT PASS+");
      this.actionBtn.setColor(0xc8102e);
      this.actionBtn.setEnabled(live);
      alt = live
        ? `Exclusive to the Season ${season.number} Drift Pass+ (tier ${def.passTier}).\nNever sold for coins.`
        : "A Season 1 Drift Pass+ exclusive. It never comes back to the shop.";
    } else if (def.limited) {
      const live = onSale(def);
      this.actionBtn.setLabel(live ? `UNLOCK  ${def.cost}` : "GONE");
      this.actionBtn.setColor(live ? 0xff3a8a : 0x8a80b0);
      this.actionBtn.setEnabled(live && s.coins >= def.cost);
      const ms = saleLeft(def);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      alt = live
        ? `LIMITED · leaves in ${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s\nOwn it forever once unlocked`
        : "This limited hero has left the shop";
    } else if (!cost && def.challenge) {
      // challenge-only heroes (Abyss / Prism / streak animals): progress shown clearly
      const cur = Math.min(Progression.statOf(def.challenge.stat), def.challenge.value);
      this.actionBtn.setLabel(`CHALLENGE  ${cur}/${def.challenge.value}`);
      this.actionBtn.setColor(0x8a80b0);
      this.actionBtn.setEnabled(false);
      alt = `Unlock: ${def.challenge.text}`;
      if (passTier) alt += `\nor reach tier ${passTier} of the Season ${season.number} Drift Pass`;
    } else if (def.lottery) {
      this.actionBtn.setLabel("LUCKY SPIN");
      this.actionBtn.setColor(0xff7ad9);
      this.actionBtn.setEnabled(true);
      alt = `Only from the Lucky Spin\nEarn a spin every ${SPIN_EVERY} points · you have ${s.spins || 0}`;
    } else {
      const reqOk = Progression.requirementsMet(def);
      this.actionBtn.setLabel(reqOk ? `UNLOCK  ${cost}` : `LOCKED · ${cost}`);
      this.actionBtn.setColor(def.requires ? (reqOk ? 0x39ff6a : 0x8a80b0) : 0xffc83d);
      this.actionBtn.setEnabled(reqOk && s.coins >= cost);
      const bits = [];
      // must-do goals (all of them) before the coins can be spent
      for (const r of def.requires || []) {
        const cur = Math.min(Progression.statOf(r.stat), r.value);
        bits.push(`${cur >= r.value ? "✓" : "✗"} ${r.text} (${cur}/${r.value})`);
      }
      if (def.requires) bits.push(`${s.coins >= cost ? "✓" : "✗"} ${cost} coins`);
      if (def.spinPool) bits.push("or win him on the Lucky Spin");
      if (def.shards)
        bits.push(`${s.shards[def.id] || 0}/${def.shards} shards (daily streak & levels)`);
      if (def.challenge) {
        const cur = Math.min(Progression.statOf(def.challenge.stat), def.challenge.value);
        const shown = def.challenge.stat === "maxBiome" ? "" : ` (${cur}/${def.challenge.value})`;
        bits.push(`or challenge: ${def.challenge.text}${shown}`);
      }
      alt = bits.join("\n");
    }
    // a long requirement list hangs below the button instead of centring on its baseline
    const list = !owned && !!def.requires;
    this.altText
      .setText(alt)
      .setOrigin(0.5, list ? 0 : 0.5)
      .setY(this.H * 0.88 + (list ? 58 : 72));
    this.challengeBar?.g.destroy();
    this.challengeBar = null;
    if (!owned && def.challenge) {
      this.challengeBar = new ProgressBar(
        this,
        this.W / 2 - 150,
        this.H * 0.88 + (def.shards ? 112 : 96),
        300,
        8,
        def.color,
      ).setDepth(200);
      this.challengeBar.to(Progression.challengeProgress(def), 600);
    }
    for (const c of this.cards) this.drawCard(c);
  }

  act() {
    const def = this.roster[this.index];
    const s = Save.data;
    if (Progression.isUnlocked(def.id)) {
      s.selected = def.id;
      Save.write();
      this.rig.flap();
      this.fx.ring(this.cx, this.cy, 0x39ff88, { scale: 1.8, duration: 500 });
      this.refresh();
      return;
    }
    if (def.lottery) {
      fadeTo(this, "Spin");
      return;
    }
    if (def.passPlus) {
      fadeTo(this, "Pass", { from: "Characters" });
      return;
    }
    if (Progression.buy(def.id)) {
      s.selected = def.id;
      Save.write();
      this.coins.to(s.coins, 700);
      this.celebrate(def);
      this.refresh();
    }
  }

  celebrate(def) {
    revealHero(this, def, { title: "UNLOCKED!" });
    const { cx, cy } = this;
    this.fx.ring(cx, cy, 0xffffff, { scale: 3, duration: 800 });
    this.fx.ring(cx, cy, def.color, { scale: 2, duration: 650 });
    this.fx.burst("star", cx, cy, 40, def.color, { speed: { min: 200, max: 700 } });
    this.cameras.main.shake(200, 0.006);
  }

  /** Icon for a cosmetic, fitted to a ~110 px tile. */
  cosIcon(id, x, y) {
    const cc = getCosmetic(id);
    if (cc.cat === "hat") return this.add.image(x, y, "cosm", HAT_FIT[id].frame).setScale(2);
    if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${id}_0`).setScale(2.4);
    if (cc.cat === "skin")
      return this.add
        .image(x, y, this.roster[this.index].texture)
        .setScale((0.42 / HI) * PORTRAIT_K)
        .setTint(SKINS[id].tint);
    return this.add.image(x, y, "cosm", `icon_${id}`).setScale(1.8);
  }

  /** Edit your look: pick a trail, hat, skin and effects; the hero above updates live. */
  openEditor() {
    const W = this.W;
    const H = this.H;
    const def = this.roster[this.index];
    if (Save.data.selected !== def.id) {
      Save.data.selected = def.id;
      Save.write();
      this.refresh();
    }
    Sfx.ui();
    const c = this.add.container(0, 0).setDepth(400);
    this.editor = c;
    this.editCat = this.editCat || "trail";
    const py = H * 0.5;
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.35).setInteractive();
    shade.on("pointerup", (p) => {
      if (p.worldY < py - 20) this.closeEditor();
    });
    const g = this.add.graphics();
    drawNeonRect(g, 16, py, W - 32, H - py - 16, 28, def.color, {
      fill: 0x0b0520,
      fillAlpha: 0.96,
      width: 4,
    });
    const title = neonText(this, W / 2, py + 44, `EDIT ${def.name}`, 34, def.color, { blur: 14 });
    c.add([shade, g, title]);
    // category chips: 2 rows of 3
    const cw = (W - 80) / 3;
    this.catBtns = CATEGORIES.map((cat, i) => {
      const b = button(
        this,
        40 + cw * (i % 3) + cw / 2,
        py + 108 + Math.floor(i / 3) * 70,
        cw - 12,
        58,
        cat.label,
        { color: 0x3ef4ff, size: 18, onClick: () => this.editTab(cat.id) },
      );
      b.cat = cat.id;
      c.add(b);
      return b;
    });
    this.editGrid = this.add.container(0, 0);
    c.add(this.editGrid);
    this.editGridTop = py + 196;
    c.add(
      button(this, W / 2 - 130, H - 90 - (this.registry.get("safeBottom") || 0), 220, 84, "SHOP", {
        color: 0xffd23f,
        size: 28,
        onClick: () => {
          const cat = this.editCat;
          fadeTo(this, "Shop", { tab: ["death", "flap", "coin"].includes(cat) ? "effects" : cat });
        },
      }),
    );
    c.add(
      button(this, W / 2 + 130, H - 90 - (this.registry.get("safeBottom") || 0), 220, 84, "DONE", {
        color: 0x39ff88,
        size: 28,
        onClick: () => this.closeEditor(),
      }),
    );
    c.setAlpha(0).setY(60);
    this.tweens.add({ targets: c, alpha: 1, y: 0, duration: 240, ease: "Back.easeOut" });
    this.editTab(this.editCat);
  }

  editTab(cat) {
    this.editCat = cat;
    for (const b of this.catBtns) b.setColor(b.cat === cat ? 0xffd23f : 0x6a5aa8);
    const grid = this.editGrid;
    grid.removeAll(true);
    const W = this.W;
    const owned = COSMETICS.filter((x) => x.cat === cat && Shop.owns(x.id));
    const opts = [null, ...owned.map((x) => x.id)];
    const on = Shop.equipped(cat) || null;
    const cols = 4;
    const tw = (W - 80) / cols;
    const th = 128;
    const bottom = this.H - 150 - (this.registry.get("safeBottom") || 0);
    const rows = Math.max(1, Math.floor((bottom - this.editGridTop) / th));
    opts.slice(0, rows * cols).forEach((id, i) => {
      const x = 40 + tw * (i % cols) + tw / 2;
      const y = this.editGridTop + th * Math.floor(i / cols) + th / 2;
      const t = this.add.container(x, y);
      const sel = id === on;
      const col = id ? RARITY[getCosmetic(id).rarity].color : 0x8a80b0;
      const g = this.add.graphics();
      drawNeonRect(g, -tw / 2 + 6, -th / 2 + 6, tw - 12, th - 12, 16, sel ? 0x39ff88 : col, {
        fill: sel ? 0x0f3a24 : 0x140a30,
        width: sel ? 5 : 2,
      });
      t.add(g);
      if (id) t.add(this.cosIcon(id, 0, -12));
      else t.add(plainText(this, 0, -12, "NONE", 20, "#cfc6ff"));
      const name = id ? getCosmetic(id).name : "";
      t.add(
        plainText(
          this,
          0,
          th / 2 - 26,
          name.length > 11 ? name.slice(0, 10) + "…" : name,
          13,
          "#ffffff",
        ),
      );
      if (sel) t.add(plainText(this, tw / 2 - 26, -th / 2 + 24, "✓", 22, "#39ff88"));
      t.setSize(tw - 12, th - 12).setInteractive();
      t.on("pointerup", () => {
        if (id) Shop.equip(id);
        else Shop.unequip(cat);
        Sfx.ui();
        this.buildRig();
        this.rig.flap();
        this.editTab(cat);
      });
      grid.add(t);
    });
    if (owned.length === 0)
      grid.add(
        plainText(
          this,
          W / 2,
          this.editGridTop + th + 40,
          "You don't own any yet. Get some in the SHOP!",
          18,
          "#cfc6ff",
          { wrap: W - 120 },
        ),
      );
  }

  closeEditor() {
    const c = this.editor;
    if (!c) return;
    this.editor = null;
    this.catBtns = null;
    this.tweens.add({
      targets: c,
      alpha: 0,
      y: 60,
      duration: 180,
      onComplete: () => c.destroy(),
    });
    this.refresh();
  }

  leave() {
    if (this.editor) return this.closeEditor();
    fadeTo(this, "Menu");
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    const def = this.roster[this.index];
    const bi =
      {
        volt: 0,
        ember: 1,
        frost: 2,
        glitch: 3,
        shade: 4,
        nova: Math.floor(this.t / 4) % 5, // the five classic biomes
        yarms: 1,
        bloom: 0,
        mecha: 1,
        tide: 2,
        draco: 4,
        pip: 0,
        coral: 1,
        sprout: 0,
        ruby: 1,
        pengu: 2,
        jelly: 3,
        comet: 1,
        ronin: 3,
        seraph: 2,
        leviathan: 4,
        smash: biomeIndex("tidal"),
        milzzz: biomeIndex("valley"),
        manny: biomeIndex("frozen"),
        wallrunner: biomeIndex("valley"),
        springer: biomeIndex("frozen"),
        dzr: biomeIndex("valley"),
      }[def.id] ?? 0;
    blendPalette(
      {
        a: BIOMES[bi],
        b: BIOMES[(bi + 1) % BIOMES.length],
        t: def.id === "nova" ? (this.t % 4) / 4 : 0,
      },
      this.pal,
    );
    this.backdrop.drive(this.pal, {
      scroll: 60,
      speedNorm: 0,
      dim: 0.55,
      scenery: false,
      theme: BIOMES[bi].id,
    });
    this.fx.drift = 0;

    // orbiting showcase — depth & scale fake a 3D turntable
    this.orbit += dt * 1.25;
    const a = this.orbit;
    const x = this.cx + Math.cos(a) * 150;
    const y = this.cy + Math.sin(a) * 34 - 10;
    const depthK = (Math.sin(a) + 1) / 2;
    this.rig.displayScale = 1.08 + depthK * 0.46;
    this.rig.setPosition(x, y);
    this.rig.angle = Math.cos(a) < 0 ? -12 : 12;
    this.rig.sprite.setFlipX(
      Math.cos(a) > 0 && ["ember", "volt", "draco", "mecha"].includes(def.id),
    );
    this.flapT -= dt;
    if (this.flapT <= 0) {
      this.flapT = 0.85;
      this.rig.flap();
    }
    this.rig.update(dt, 40);
    this.fx.update(dt);
    this.pedRings.forEach((r, i) =>
      r.setAlpha((0.7 - i * 0.2) * (0.8 + Math.sin(this.t * 3 + i) * 0.2)),
    );

    // card carousel layout
    for (const c of this.cards) {
      const o = c.i - this.pos;
      const ao = Math.abs(o);
      c.setVisible(ao < 2.6);
      c.x = this.W / 2 + Math.sign(o) * Math.min(ao, 2.4) * 250;
      c.y = this.cardsY + ao * 18;
      const sc = 1 - Math.min(ao, 2) * 0.2;
      c.scaleX = sc * Math.cos(Phaser.Math.Clamp(o, -1.4, 1.4) * 0.75);
      c.scaleY = sc;
      c.alpha = Phaser.Math.Clamp(1 - ao * 0.38, 0, 1);
      c.setDepth(100 - ao * 10);
      if (c.def.passPlus || ["legendary", "mega", "ultra"].includes(c.def.rarity)) this.drawCard(c);
    }
    // limited-time countdown ticks once a second
    if (def.limited && Math.floor(this.t) !== this.lastTick) {
      this.lastTick = Math.floor(this.t);
      if (!Progression.isUnlocked(def.id)) this.refresh();
    }
  }
}
