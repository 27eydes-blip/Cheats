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
    this.scene.start("Menu");
  }
}
