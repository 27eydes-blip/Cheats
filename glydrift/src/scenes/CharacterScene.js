// Character select: orbiting 3D-feel showcase with a live trail + flap preview, and a
// perspective card carousel with rarity-glow borders, unlock by coins / shards / challenge.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { BIOMES, biomeIndex, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { visibleCharacters } from "../player/characterDefs.js";
import { revealHero } from "../ui/reveal.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Progression } from "../data/progression.js";
import { heroUnlock } from "../data/locker.js";
import { Save } from "../data/save.js";
import { tungLookLevel, tungProgress } from "../player/tungFx.js";
import { TUNG_LEVEL_NAMES } from "../pixel/tungArt.js";
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
    // JAMAL's hero page: his noises can be turned down (On / Quieter / Off)
    const noiseLabel = () =>
      `JAMAL NOISES: ${{ on: "ON", quiet: "QUIETER", off: "OFF" }[s.settings.jamalNoise || "on"]}`;
    this.noiseBtn = button(this, W / 2, this.cy - 112, 300, 46, noiseLabel(), {
      color: 0x3f86ec,
      size: 16,
      onClick: () => {
        const order = ["on", "quiet", "off"];
        const cur = order.indexOf(s.settings.jamalNoise || "on");
        s.settings.jamalNoise = order[(cur + 1) % order.length];
        Save.write();
        this.noiseBtn.setLabel(noiseLabel());
        Sfx.flap("jamal"); // a sample at the new level
      },
    })
      .setDepth(150)
      .setVisible(false);
    // TUNG's hero page: her upgrade level and progress, and any unlocked level's look
    const tungLine = () => {
      const p = tungProgress();
      return `LEVEL ${p.level} · ${p.name}${p.next ? ` · ${p.runs}/${p.next} RUNS` : " · MAX"}`;
    };
    const lookLabel = () => `LOOK: ${TUNG_LEVEL_NAMES[tungLookLevel() - 1]} ▸`;
    this.tungText = plainText(this, W / 2, this.cy - 122, tungLine(), 16, "#ffd0ec").setDepth(150).setVisible(false);
    this.tungBtn = button(this, W / 2, this.cy - 88, 260, 40, lookLabel(), {
      color: 0xffa8d8,
      size: 15,
      onClick: () => {
        const top = tungProgress().level;
        s.settings.tungLook = (tungLookLevel() % top) + 1; // cycle through the unlocked looks
        Save.write();
        this.tungBtn.setLabel(lookLabel());
        this.buildRig();
      },
    })
      .setDepth(150)
      .setVisible(false);
    this.tungLine = tungLine;

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
      this.dragX = p.worldX;
      this.dragY = p.worldY;
      this.dragPos = this.pos;
      this.dragging =
        p.worldY > this.cardsY - CARD_H / 2 - 20 && p.worldY < this.cardsY + CARD_H / 2 + 20;
    });
    this.input.on("pointermove", (p) => {
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
        this.openLocker();
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
    } else {
      // (TUNG's card also shows her upgrade level)
      const p = def.id === "tung" ? tungProgress() : null;
      const text = p ? `${def.desc}\nLV ${p.level} ${p.name}${p.next ? ` · ${p.runs}/${p.next}` : ""}` : def.desc;
      desc = plainText(this, 0, p ? 136 : 148, text, 13, "#d8d0ff", { wrap: CARD_W - 40 });
    }
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
      bg.fillStyle(0x14020a, 1).fillRoundedRect(-124, -16, 248, 32, 16);
      bg.fillStyle(0xc8102e, 1).fillRoundedRect(-120, -12, 240, 24, 12);
      bg.lineStyle(2, 0xffd23f, 1).strokeRoundedRect(-120, -12, 240, 24, 12);
      b.add([bg, plainText(this, 0, 0, "DRIFT PASS+ EXCLUSIVE", 15, "#ffe9a8")]);
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
    this.nameText
      .setText(def.name)
      .setStroke(hex(def.color), 5)
      .setShadow(0, 0, hex(def.color), 24, true, true);
    this.titleText.setText(`${def.title} · ${RARITY[def.rarity].label}`);
    this.noiseBtn?.setVisible(def.id === "jamal");
    const isTung = def.id === "tung" && owned;
    this.tungText?.setVisible(isTung).setText(this.tungLine?.() || "");
    this.tungBtn?.setVisible(isTung && tungProgress().level > 1);
    this.pedRings.forEach((r) => r.setTint(RARITY[def.rarity].color));
    this.pedGlow.setTint(def.color);
    this.beam.setTint(def.color);
    let alt = "";
    if (owned) {
      const sel = s.selected === def.id;
      this.actionBtn.setLabel(sel ? "EQUIPPED" : "SELECT");
      this.actionBtn.setColor(sel ? 0x8a80b0 : 0x39ff88);
      this.actionBtn.setEnabled(!sel);
    } else {
      // how to get it: the same words the Locker Room shows (locker.js)
      const u = heroUnlock(def);
      this.actionBtn.setLabel(u.label);
      this.actionBtn.setColor(u.color);
      this.actionBtn.setEnabled(u.enabled);
      alt = u.alt;
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
      Sfx.chime?.(); // equipped: a little chime and a light tap
      Haptics.light();
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

  /**
   * Edit your look: the Locker Room opens on SKINS for this hero (it took over the old pop-up
   * editor; BACK there comes back here, on the same hero).
   */
  openLocker() {
    const def = this.roster[this.index];
    if (Save.data.selected !== def.id) {
      Save.data.selected = def.id;
      Save.write();
    }
    Sfx.ui();
    fadeTo(this, "Locker", { tab: "skin", from: "Characters" });
  }

  leave() {
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

    // orbiting showcase — depth & scale fake a 3D turntable. SXE breaks off to land on his
    // perch in the middle (spliceFx.js), so the orbit eases out while he's down.
    const perching = !!this.rig.falcon?.holding;
    this.perchK = Phaser.Math.Clamp((this.perchK || 0) + (perching ? dt : -dt) * 2.2, 0, 1);
    const pk = this.perchK * this.perchK * (3 - 2 * this.perchK);
    if (!perching) this.orbit += dt * 1.25;
    const a = this.orbit;
    const x = this.cx + Math.cos(a) * 150;
    const y = this.cy + Math.sin(a) * 34 - 10;
    const depthK = (Math.sin(a) + 1) / 2;
    this.rig.displayScale = Phaser.Math.Linear(1.08 + depthK * 0.46, 1.5, pk);
    this.rig.setPosition(Phaser.Math.Linear(x, this.cx, pk), Phaser.Math.Linear(y, this.cy - 30, pk));
    this.rig.angle = (Math.cos(a) < 0 ? -12 : 12) * (1 - pk);
    this.rig.sprite.setFlipX(
      Math.cos(a) > 0 && ["ember", "volt", "draco", "mecha"].includes(def.id),
    );
    this.flapT -= dt;
    if (this.flapT <= 0 && !perching) {
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
