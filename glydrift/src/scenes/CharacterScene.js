// Character select: orbiting 3D-feel showcase with a live trail + flap preview, and a
// perspective card carousel with rarity-glow borders, unlock by coins / shards / challenge.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { CHARACTERS } from "../player/characterDefs.js";
import { revealHero } from "../ui/reveal.js";
import { Sfx } from "../audio/sfx.js";
import { Progression } from "../data/progression.js";
import { Save } from "../data/save.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  ProgressBar,
  plainText,
  popIn,
  RollingCounter,
  rarityColor,
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
    this.index = Math.max(
      0,
      CHARACTERS.findIndex((c) => c.id === s.selected),
    );
    this.pos = this.index;
    this.cardsY = H * 0.66;
    this.cards = CHARACTERS.map((def, i) => this.makeCard(def, i));

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
        CHARACTERS.length - 0.6,
      );
      this.posTween?.stop();
    });
    this.input.on("pointerup", (p) => {
      if (!this.dragging) return;
      this.dragging = false;
      const dx = p.worldX - this.dragX;
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
    const img = this.add.image(0, -50, def.texture).setScale(1.25 / HI);
    const name = neonText(this, 0, 70, def.name, 32, def.color, { blur: 12 });
    const rar = plainText(
      this,
      0,
      108,
      RARITY[def.rarity].label,
      15,
      hex(RARITY[def.rarity].color),
    );
    const desc = plainText(this, 0, 148, def.desc, 13, "#d8d0ff", { wrap: CARD_W - 40 });
    const lock = this.add
      .image(0, -50, "lock")
      .setScale(1.4 / HI)
      .setAlpha(0.9);
    c.add([g, glow, img, name, rar, desc, lock]);
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
      width: def.rarity === "legendary" ? 5 : 3,
    });
    // inner rarity sheen
    g.fillStyle(col, 0.08);
    g.fillRoundedRect(-CARD_W / 2 + 10, -CARD_H / 2 + 10, CARD_W - 20, CARD_H * 0.5, 20);
    if (def.id === Save.data.selected) {
      g.fillStyle(0x39ff88, 1);
      g.fillRoundedRect(-62, -CARD_H / 2 - 16, 124, 30, 15);
    }
    c.img.setTint(owned ? 0xffffff : 0x222233);
    c.lock.setVisible(!owned);
  }

  buildRig() {
    this.rig?.destroy();
    const def = CHARACTERS[this.index];
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
  }

  select(i) {
    i = Phaser.Math.Clamp(i, 0, CHARACTERS.length - 1);
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
    const def = CHARACTERS[this.index];
    const s = Save.data;
    const owned = Progression.isUnlocked(def.id);
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
    } else if (def.lottery) {
      this.actionBtn.setLabel("LUCKY SPIN");
      this.actionBtn.setColor(0xff7ad9);
      this.actionBtn.setEnabled(true);
      alt = `Only from the Lucky Spin\nEarn a spin every 1000 points · you have ${s.spins || 0}`;
    } else {
      this.actionBtn.setLabel(`UNLOCK  ${def.cost}`);
      this.actionBtn.setColor(0xffc83d);
      this.actionBtn.setEnabled(s.coins >= def.cost);
      const bits = [];
      if (def.shards)
        bits.push(`${s.shards[def.id] || 0}/${def.shards} shards (daily streak & levels)`);
      if (def.challenge) {
        const cur = Math.min(s.stats[def.challenge.stat] || 0, def.challenge.value);
        const shown = def.challenge.stat === "maxBiome" ? "" : ` (${cur}/${def.challenge.value})`;
        bits.push(`or challenge: ${def.challenge.text}${shown}`);
      }
      alt = bits.join("\n");
    }
    this.altText.setText(alt);
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
    const def = CHARACTERS[this.index];
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
      this.cameras.main.fadeOut(200, 5, 1, 13);
      this.time.delayedCall(200, () => this.scene.start("Spin"));
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

  leave() {
    this.cameras.main.fadeOut(200, 5, 1, 13);
    this.time.delayedCall(200, () => this.scene.start("Menu"));
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    const def = CHARACTERS[this.index];
    const bi =
      {
        volt: 0,
        ember: 1,
        frost: 2,
        glitch: 3,
        shade: 4,
        nova: Math.floor(this.t / 4) % 5, // the five classic biomes
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
      if (c.def.rarity === "legendary") this.drawCard(c);
    }
  }
}
