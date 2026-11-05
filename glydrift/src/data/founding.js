// The move to glydrift.com: "Founding Drifter" (an exclusive trail + title) for every player who
// saves their progress to an account while the move is on. Offered only on the old address
// (or with the ?movenotice test flag); once owned it is kept forever and travels with the
// account's cloud save.
import { Save } from "./save.js";
import { Shop } from "./cosmetics.js";
import { Titles } from "./titles.js";
import { TEST } from "../systems/testFlags.js";

export const FOUNDER_TRAIL = "trail_founder";
export const FOUNDER_TITLE = "t_founder";

export const Founding = {
  /** The move is on here: the old GitHub Pages address (or a test build asking to be). */
  live() {
    const oldHost = typeof location !== "undefined" && /\.github\.io$/.test(location.hostname);
    return oldHost || TEST.movenotice;
  },
  owned() {
    return Shop.owns(FOUNDER_TRAIL) && Titles.owns(FOUNDER_TITLE);
  },
  /** Grant both pieces (and wear them if nothing is worn in that slot). Returns true if new. */
  grant() {
    if (!this.live()) return false;
    const s = Save.data;
    const fresh = !this.owned();
    s.cos.owned[FOUNDER_TRAIL] = true;
    if (!s.cos.equipped.trail) s.cos.equipped.trail = FOUNDER_TRAIL;
    Titles.grant(FOUNDER_TITLE);
    if (!Titles.equippedId()) Titles.equip(FOUNDER_TITLE);
    Save.write();
    return fresh;
  },
  /**
   * The pop-up comes up at most twice: on one launch, and (after LATER) once more on a later
   * launch. Saving to an account (or LET'S GO when already signed in) ends it.
   */
  state() {
    const m = (Save.data.moveNotice ||= { shown: 0, done: false });
    return m;
  },
};
