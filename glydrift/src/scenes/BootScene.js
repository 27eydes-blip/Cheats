import Phaser from "phaser";
import { buildTextures } from "../gfx/textures.js";
import { Progression } from "../systems/progression.js";
import { Save } from "../systems/save.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    buildTextures(this);
    Save.data; // load
    Progression.ensureMissions();
    Progression.checkChallengeUnlocks();
    Save.write();
    this.scene.launch("Sky");
    this.scene.launch("Backdrop");
    // hidden music test page: ?music
    const q = new URLSearchParams(window.location.search);
    this.scene.start(q.has("music") ? "MusicTest" : "Menu");
  }
}
