// Phaser 3.90 TileSprite memory fix (WebGL only).
//
// Every TileSprite owns a "display" canvas the full size of the sprite. The WebGL renderer
// never draws into it — it only uses the small power-of-two fill texture plus width/height —
// but Phaser still allocates it at full size AND uploads it to the GPU when the sprite is
// created, and re-allocates it whenever the size changes. With wide terrain strips and tall
// pillars that cost ~100 MB of canvas memory (iOS Safari caps total canvas memory, after
// which canvases render blank) and multi-second texture uploads when hazards spawned.
//
// Fix: create tile sprites with a 1×1 display canvas, then size them; in WebGL never grow
// that canvas again. Rendering is unchanged (verified pixel-identical screenshots).
import Phaser from "phaser";

const TileSprite = Phaser.GameObjects.TileSprite;
const proto = TileSprite.prototype;
const origUpdateCanvas = proto.updateCanvas;

proto.updateCanvas = function () {
  if (!this.renderer || !this.renderer.gl) return origUpdateCanvas.call(this);
  if (this._glW !== this.width || this._glH !== this.height) {
    this._glW = this.width;
    this._glH = this.height;
    this.updateDisplayOrigin();
  }
  this.dirty = false;
};

// (assigned directly: GameObjectFactory.register never replaces an existing factory)
Phaser.GameObjects.GameObjectFactory.prototype.tileSprite = function (
  x,
  y,
  width,
  height,
  texture,
  frame,
) {
  const gl = !!this.scene.sys.renderer.gl;
  const ts = new TileSprite(this.scene, x, y, gl ? 1 : width, gl ? 1 : height, texture, frame);
  if (gl) {
    // 0 means "use the frame size" (Phaser's own default)
    const f = ts.displayFrame;
    ts.setSize(width || f.width, height || f.height);
  }
  return this.displayList.add(ts);
};
