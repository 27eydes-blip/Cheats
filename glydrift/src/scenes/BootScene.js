import Phaser from "phaser";
import { buildTextures } from "../gfx/textures.js";
import { buildPixelArt } from "../pixel/themes.js";
import { Leaderboard } from "../systems/leaderboard.js";
import { Progression } from "../systems/progression.js";
import { Save } from "../systems/save.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    // pixel art first: it claims the shared particle/coin names before the old set is built
    buildPixelArt(this);
    buildTextures(this);
    Save.data; // load
    Progression.ensureMissions();
    Progression.checkChallengeUnlocks();
    Save.write();
    // sign in (anonymous) + upload queued scores in the background, after first frames
    setTimeout(() => Leaderboard.init(), 1200);
    this.scene.launch("Backdrop");
    // hidden music test page: ?music
    const q = new URLSearchParams(window.location.search);
    this.scene.start(q.has("music") ? "MusicTest" : "Menu");
  }
}
