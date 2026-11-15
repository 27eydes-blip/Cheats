import { TEST } from "../systems/testFlags.js";
import Phaser from "phaser";
import { buildTextures } from "../gfx/textures.js";
import { buildPixelArt } from "../pixel/themes.js";
import { Account } from "../online/account.js";
import { Grants } from "../online/grants.js";
import { Leaderboard } from "../online/leaderboard.js";
import { refreshAllMighty } from "../online/allMighty.js";
import { Store } from "../online/store.js";
import { applyPlusTestFlags } from "../data/passPlus.js";
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
    applyPlusTestFlags(); // test builds only (?pplus / ?ppequip)
    Progression.ensureMissions();
    Progression.checkChallengeUnlocks();
    Save.write();
    // sign in (anonymous) + upload queued scores in the background, after first frames
    if (!TEST.offline) setTimeout(() => Leaderboard.init(), 1200);
    // who the server says is ALL MIGHTY (the world's #1): after the sign-in has started
    // (?lbmock: the mock answer straight away; ?offline: the cached answer, no network)
    if (TEST.lbmock) refreshAllMighty();
    else setTimeout(() => refreshAllMighty(), 1600);
    // accounts + cloud save: restore the signed-in account and sync (in the background)
    // …then let the server confirm Drift Pass+ ownership (store.js recheck)
    // (the cloud check never swaps the save in the middle of a run)
    const inRun = () => this.game.scene.isActive("Game") && this.game.scene.getScene("Game").state === "playing";
    Account.isBusy = inRun;
    Grants.isBusy = inRun;
    setTimeout(() => Account.init().then(() => Store.recheck()), 1500);
    // coins granted by the owner: claimed now, when the game is shown again and now and then
    setTimeout(() => Grants.init(), 2500);
    this.scene.launch("Backdrop");
    // hidden music test page: ?music (test builds only)
    const q = new URLSearchParams(window.location.search);
    this.scene.start(TEST.on && q.has("music") ? "MusicTest" : "Menu");
  }
}
