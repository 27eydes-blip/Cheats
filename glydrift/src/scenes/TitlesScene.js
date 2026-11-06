// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// TITLES: your name card with the equipped title on top, then every title grouped by where
// it comes from. Tap one you own to wear it; locked ones say how to earn them. Drift Pass+
// titles are animated and only come from the paid track.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { Save } from "../data/save.js";
import { Titles, TITLE_SOURCES } from "../data/titles.js";
import { Sfx } from "../audio/sfx.js";
import { titleText } from "../ui/titleText.js";
import { button, drawNeonRect, fadeTo, neonText, plainText } from "../ui/ui.js";

const ROW_H = 78;
const HEAD_H = 56;

export class TitlesScene extends Phaser.Scene {
  constructor() {
    super("Titles");
  }

  init(data) {
    this.returnTo = data?.from || "Menu";
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.cameras.main.fadeIn(220, 2, 1, 7);
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[3], t: 0.4 }, {});
    Titles.sync();

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => fadeTo(this, this.returnTo),
    }).setDepth(50);
    neonText(this, W / 2 + 40, top + 46, "TITLES", 40, 0xffd23f, { blur: 12 }).setDepth(50);

    // ---- your name card (live preview of the equipped title)
    this.cardY = top + 160;
    const cg = this.add.graphics().setDepth(40);
    drawNeonRect(cg, 30, this.cardY - 62, W - 60, 124, 22, 0xffd23f, { fillAlpha: 0.9 });
    plainText(
      this,
      W / 2,
      this.cardY - 30,
      Save.data.profile?.username || "YOU",
      30,
      "#ffffff",
    ).setDepth(41);
    this.card = this.add.container(W / 2, this.cardY + 14).setDepth(41);
    this.renderCard();
    plainText(
      this,
      W / 2,
      this.cardY + 82,
      "Tap a title you own to wear it",
      16,
      "#bfb6e8",
    ).setDepth(41);

    // ---- the list
    this.listTop = this.cardY + 112;
    const sb = this.registry.get("safeBottom") || 0;
    this.listBottom = H - 24 - sb;
    this.list = this.add.container(0, this.listTop).setDepth(10);
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff).fillRect(0, this.listTop, W, this.listBottom - this.listTop);
    this.list.setMask(maskG.createGeometryMask());
    this.scrollY = 0;
    this.vel = 0;
    this.renderList();

    this.input.on("pointerdown", (p) => {
      if (p.worldY < this.listTop) return;
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
      const y = p.worldY - this.listTop + this.scrollY;
      const row = this.rows.find((r) => y >= r.y0 && y < r.y1);
      if (row) this.choose(row);
    });
    this.input.on("wheel", (p, o, dx, dy) => this.setScroll(this.scrollY + dy));
  }

  renderCard() {
    this.card.removeAll(true);
    const t = Titles.equipped();
    if (t) this.card.add(titleText(this, 0, 0, t, { size: 22 }));
    else this.card.add(plainText(this, 0, 0, "NO TITLE", 18, "#7a70a8"));
  }

  renderList() {
    const W = this.W;
    this.list.removeAll(true);
    this.rows = [];
    let y = 8;
    const all = Titles.catalog();
    // "no title" first
    this.rows.push(
      this.row(y, {
        id: null,
        name: "No title",
        owned: true,
        equipped: !Titles.equippedId(),
        how: "Show only your name",
      }),
    );
    y += ROW_H;
    for (const [src, label] of Object.entries(TITLE_SOURCES)) {
      const group = all.filter((t) => t.source === src);
      if (!group.length) continue;
      const owned = group.filter((t) => t.owned).length;
      this.list.add(
        neonText(this, 40, y + HEAD_H / 2 + 4, label, 20, src === "plus" ? 0xffd23f : 0x3ef4ff, {
          ox: 0,
          blur: 6,
        }),
      );
      this.list.add(
        plainText(this, W - 40, y + HEAD_H / 2 + 4, `${owned} / ${group.length}`, 16, "#9c90c8", {
          ox: 1,
        }),
      );
      y += HEAD_H;
      for (const t of group) {
        this.rows.push(this.row(y, t));
        y += ROW_H;
      }
    }
    this.contentH = y + 16;
  }

  row(y, t) {
    const W = this.W;
    const g = this.add.graphics();
    const col = t.equipped ? 0x39ff88 : t.owned ? 0x3ef4ff : 0x4a4070;
    drawNeonRect(g, 30, y + 4, W - 60, ROW_H - 10, 16, col, {
      fillAlpha: t.equipped ? 0.92 : 0.7,
      width: t.equipped ? 3 : 2,
    });
    this.list.add(g);
    const cy = y + ROW_H / 2 - 1;
    if (t.id)
      this.list.add(
        titleText(this, 56, cy - 12, t, { size: 18, ox: 0, alpha: t.owned ? 1 : 0.35 }),
      );
    else this.list.add(plainText(this, 56, cy - 12, "NO TITLE", 18, "#cfc6ff", { ox: 0 }));
    this.list.add(
      plainText(this, 56, cy + 14, t.how, 14, t.owned ? "#bfb6e8" : "#6a608a", { ox: 0 }),
    );
    const state = t.equipped ? "WEARING" : t.owned ? "WEAR" : "LOCKED";
    this.list.add(
      plainText(
        this,
        W - 52,
        cy,
        state,
        15,
        t.equipped ? "#39ff88" : t.owned ? "#3ef4ff" : "#6a608a",
        { ox: 1 },
      ),
    );
    return { ...t, y0: y, y1: y + ROW_H };
  }

  choose(row) {
    if (!row.owned) {
      Sfx.ui();
      return;
    }
    Titles.equip(row.id);
    Sfx.reward();
    this.renderCard();
    const keep = this.scrollY;
    this.renderList();
    this.setScroll(keep);
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
