// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// One centre pop-up at a time during a run. Realm titles, NEW BEST, SPEED UP and distance
// markers used to fire independently and pile up whenever a realm change landed on a
// milestone (realms start every 500 m, right where the big markers are). They now share the
// centre of the screen through this queue:
//   - a higher-priority pop-up cuts a lower one short (a realm title always shows at once);
//   - otherwise it waits its turn, highest priority first;
//   - a pop-up that has waited too long to still be news is dropped instead of shown late.
// Pure logic (no Phaser): the HUD supplies show / hide and calls update() every frame.

/** Lower number = more important. */
export const POP_PRIORITY = { realm: 0, best: 1, speed: 2, distance: 3 };
/**
 * How long (ms) each kind keeps the centre once shown. The HUD frees it as soon as the
 * pop-up's animation really ends (release()); this is the upper bound if that never comes.
 */
export const POP_HOLD = { realm: 2400, best: 1200, speed: 1100, distance: 900 };
/** How long (ms) each kind may wait before it is stale and skipped. */
export const POP_STALE = { realm: Infinity, best: 4000, speed: 4000, distance: 1000 };

export class PopQueue {
  /**
   * @param {(item) => number|void} show draws a pop-up; may return its own hold time (ms)
   * @param {(item) => void} hide removes a pop-up that is being cut short
   */
  constructor(show, hide) {
    this.show = show;
    this.hide = hide;
    this.current = null;
    this.waiting = [];
  }

  push(kind, data, now) {
    const item = { kind, data, prio: POP_PRIORITY[kind] ?? 9, at: now };
    const cur = this.live(now);
    if (!cur) return this.start(item, now);
    if (item.prio < cur.prio) {
      // more important: cut the current one short
      this.hide(cur);
      return this.start(item, now);
    }
    // one waiting pop-up per kind: a newer distance marker replaces an older one
    this.waiting = this.waiting.filter((w) => w.kind !== kind);
    this.waiting.push(item);
    return item;
  }

  update(now) {
    if (this.live(now)) return;
    this.waiting = this.waiting.filter((w) => now - w.at <= POP_STALE[w.kind]);
    if (!this.waiting.length) return;
    this.waiting.sort((a, b) => a.prio - b.prio || a.at - b.at);
    this.start(this.waiting.shift(), now);
  }

  /** The pop-up holding the centre right now (or null). */
  live(now) {
    if (this.current && now >= this.current.until) this.current = null;
    return this.current;
  }

  start(item, now) {
    const hold = this.show(item);
    item.until = now + (typeof hold === "number" ? hold : POP_HOLD[item.kind]);
    this.current = item;
    return item;
  }

  /** The shown pop-up finished its animation: free the centre for the next one. */
  release(item) {
    if (this.current === item) this.current = null;
  }

  clear() {
    if (this.current) this.hide(this.current);
    this.current = null;
    this.waiting = [];
  }
}
