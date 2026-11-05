// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
import { TEST } from "../systems/testFlags.js";
import Phaser from "phaser";
import { buildTextures } from "../gfx/textures.js";
import { buildPixelArt } from "../pixel/themes.js";
import { Account } from "../online/account.js";
import { Leaderboard } from "../online/leaderboard.js";
import { Progression } from "../data/progression.js";
import { Save } from "../data/save.js";

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
    if (!TEST.offline) setTimeout(() => Leaderboard.init(), 1200);
    // accounts + cloud save: restore the signed-in account and sync (in the background)
    setTimeout(() => Account.init(), 1500);
    this.scene.launch("Backdrop");
    // hidden music test page: ?music (test builds only)
    const q = new URLSearchParams(window.location.search);
    this.scene.start(TEST.on && q.has("music") ? "MusicTest" : "Menu");
  }
}
