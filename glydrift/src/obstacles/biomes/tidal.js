// Tidal Sky: Jellyfish (tentacles glow → sting), SeaMine (spiked mine on a chain, its light
// blinks faster as you near it), Current (harmless field: flowing streaks push you up or
// down) and BubbleColumn (harmless field: thick bubbles slow your climb and fall).
import { S } from "../../pixel/px.js";
import { Field, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";
import { circleClear, rectClear } from "../geometry.js";

export class Jellyfish extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "jelly";
    this.tents = [];
    for (let i = 0; i < 4; i++)
      this.tents.push(
        this.add(
          this.scene.add
            .tileSprite(0, 0, 6 * S, 100, "dh_tent")
            .setOrigin(0.5, 0)
            .setDepth(HAZ_TOP),
        ),
      );
    this.bell = this.add(this.scene.add.image(0, 0, "dh", "jelly_0").setDepth(HAZ_TOP + 0.1));
  }
  spawn(x, { y, bob = 40, tl, idle = 1.1, glow = 0.6, sting = 0.9, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y0: y, bob, tl, idle, glow, sting, phase });
    this.period = idle + glow + sting;
    this.halfW = 10 * S;
  }
  update(dt, clock) {
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    this.glowing = u >= this.idle && u < this.idle + this.glow;
    this.stinging = u >= this.idle + this.glow;
    this.y = this.y0 + Math.sin(clock * 1.4 + this.phase * 6.28) * this.bob;
    const by = snap(this.y);
    this.bell
      .setPosition(snap(this.x), by)
      .setFrame(Math.floor(clock * 3) % 2 ? "jelly_1" : "jelly_0");
    this.len = this.stinging ? this.tl * 1.25 : this.tl;
    const lit = this.glowing ? Math.floor(clock * 14) % 2 === 0 : this.stinging;
    this.tents.forEach((t, i) => {
      t.setTexture(lit ? "dh_tent_lit" : "dh_tent")
        .setPosition(snap(this.x - 6 * S + i * 4 * S), by + 5 * S)
        .setSize(6 * S, this.len - (i % 2) * 6 * S);
      if (this.stinging) t.tilePositionY -= dt * 90;
    });
  }
  clearance(px, py, r) {
    let c = circleClear(px, py, r, this.x, this.y, 7 * S);
    if (this.stinging)
      c = Math.min(
        c,
        rectClear(
          px,
          py,
          r,
          this.x - 7 * S,
          this.y + 5 * S,
          this.x + 7 * S,
          this.y + 5 * S + this.len,
        ),
      );
    return c;
  }
}

export class SeaMine extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "mine";
    this.chain = this.add(
      this.scene.add
        .tileSprite(0, 0, 6 * S, 100, "dh_chain")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.2),
    );
    this.mine = this.add(this.scene.add.image(0, 0, "dh", "mine_0").setDepth(HAZ_TOP));
  }
  spawn(x, { top = false, y, bob = 26, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, y0: y, bob, phase });
    this.halfW = 10 * S;
  }
  update(dt, clock) {
    const H = this.mgr.H;
    this.y = this.y0 + Math.sin(clock * 1.1 + this.phase * 6.28) * this.bob;
    const near = Math.max(0, 1 - Math.abs(this.x - this.mgr.px) / 500);
    const blink = Math.floor(clock * (3 + near * 9)) % 2;
    this.mine.setPosition(snap(this.x), snap(this.y)).setFrame(blink ? "mine_1" : "mine_0");
    if (this.top)
      this.chain
        .setOrigin(0.5, 0)
        .setPosition(this.x, -S * 2)
        .setSize(6 * S, this.y + S * 2);
    else
      this.chain
        .setOrigin(0.5, 0)
        .setPosition(this.x, this.y)
        .setSize(6 * S, H - this.y + OFF);
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, 8 * S);
  }
}

export class Current extends Field {
  constructor(mgr) {
    super(mgr, "current", "dh_cur_up", 0.38);
  }
  spawn(x, { w = 380, dir = -1 }) {
    this.arm(x);
    this.dir = dir; // -1 pushes up, +1 pushes down
    this.halfW = w / 2;
    this.strip.setTexture(dir < 0 ? "dh_cur_up" : "dh_cur_down").setTileScale(S);
  }
  update(dt) {
    const H = this.mgr.H;
    this.strip.setPosition(this.x, -OFF).setSize(this.halfW * 2, H + OFF * 2);
    this.strip.tilePositionY -= (this.dir < 0 ? 1 : -1) * dt * 60;
  }
  apply(ev) {
    ev.push += this.dir * 1500;
  }
}

export class BubbleColumn extends Field {
  constructor(mgr) {
    super(mgr, "bubblecol", "dh_bubbles", 0.55);
  }
  spawn(x, { w = 150 }) {
    this.arm(x);
    this.halfW = w / 2;
  }
  update(dt) {
    const H = this.mgr.H;
    this.strip.setPosition(this.x, -OFF).setSize(this.halfW * 2, H + OFF * 2);
    this.strip.tilePositionY += dt * 22;
  }
  apply(ev) {
    ev.drag = Math.max(ev.drag, 5);
  }
}
