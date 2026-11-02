// Renders the animated sky shader into a small shared texture ("sky") every frame.
// It lives in its own scene (without camera post-FX) because a render-to-texture Shader
// restores the default framebuffer afterwards, which would bypass a camera's post pipeline.
import Phaser from "phaser";
import { colorToVec } from "../biomes/biomes.js";
import { SKY_FRAG } from "../gfx/shaders.js";
import { Save } from "../systems/save.js";

export const SKY_KEY = "sky";

export class SkyScene extends Phaser.Scene {
  constructor() {
    super("Sky");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const sw = 200;
    const sh = Math.round((sw * H) / W);
    const v3 = () => ({ type: "3f", value: { x: 0, y: 0, z: 0 } });
    const uniforms = {
      resolution: { type: "2f", value: { x: sw, y: sh } },
      uTime: { type: "1f", value: 0 },
      uScroll: { type: "1f", value: 0 },
      uSky0: v3(),
      uSky1: v3(),
      uSky2: v3(),
      uNeb0: v3(),
      uNeb1: v3(),
      uPulse: { type: "1f", value: 0 },
      uGlitch: { type: "1f", value: 0 },
      uDetail: { type: "1f", value: 1 },
    };
    const base = new Phaser.Display.BaseShader("skyShader", SKY_FRAG, undefined, uniforms);
    this.shader = this.add.shader(base, 0, 0, sw, sh).setOrigin(0);
    this.shader.setRenderToTexture(SKY_KEY, true);
    this.cameras.main.transparent = true;
  }

  /** Called by whichever Background is currently active. */
  apply(pal, time, scroll, pulse) {
    const sh = this.shader;
    if (!sh) return;
    sh.setUniform("uTime.value", time);
    sh.setUniform("uScroll.value", scroll);
    sh.setUniform("uSky0.value", colorToVec(pal.sky0));
    sh.setUniform("uSky1.value", colorToVec(pal.sky1));
    sh.setUniform("uSky2.value", colorToVec(pal.sky2));
    sh.setUniform("uNeb0.value", colorToVec(pal.neb0));
    sh.setUniform("uNeb1.value", colorToVec(pal.neb1));
    sh.setUniform("uPulse.value", pulse);
    sh.setUniform("uGlitch.value", pal.glitch);
    sh.setUniform("uDetail.value", Save.data.settings.lowGfx ? 0 : 1);
  }
}
