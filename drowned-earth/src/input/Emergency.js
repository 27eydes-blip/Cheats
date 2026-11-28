// Emergency exit: hold Esc (keyboard) or Options (controller) for one second and you're put
// somewhere safe — the nearest dock or raft edge, else the last solid ground you stood on —
// with the boat parked and every menu, hold and stuck input cleared.
// It runs on its own timer and reads the keyboard and gamepad itself, so it still works when
// the game's own input handling is stuck.
const HOLD_MS = 1000;

export class EmergencyExit {
  constructor(ctx) {
    this.ctx = ctx;
    this.escAt = 0; this.padAt = 0; this.fired = false;
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !e.repeat) this.escAt = performance.now(); }, true);
    addEventListener('keyup', (e) => { if (e.code === 'Escape') this.escAt = 0; }, true);
    addEventListener('blur', () => { this.escAt = 0; });
    this.timer = setInterval(() => { try { this.tick(); } catch (err) { console.warn('[emergency]', err); } }, 100);
  }
  tick() {
    const now = performance.now();
    let opt = false;
    try { opt = [...(navigator.getGamepads?.() || [])].some((p) => p && p.connected && p.buttons[9]?.pressed); } catch { /* no pads */ }
    if (opt) { if (!this.padAt) this.padAt = now; } else this.padAt = 0;
    const held = Math.max(this.escAt ? now - this.escAt : 0, this.padAt ? now - this.padAt : 0);
    if (!held) { this.fired = false; this.hinted = false; return; }
    if (this.ctx.mode !== 'play' || this.ctx.scenarioActive || this.ctx.injury?.dead || this.fired) return;   // not in life-sim scenes or on the death card
    if (held > 350 && !this.hinted) { this.hinted = true; this.ctx.ui?.subtitle('Keep holding to get unstuck…', 1); }
    if (held >= HOLD_MS) { this.fired = true; this.rescue(); }
  }
  rescue() {
    const c = this.ctx, p = c.player, b = c.boat, inp = c.input;
    // clear everything that can hold the player in place
    try { c.ui.close(true); } catch { /* none open */ }
    try { if (c.photo?.active) c.photo.exit(); } catch { /* ignore */ }
    try { c.creatures?.endStruggle(true, 'struggle'); } catch { /* ignore */ }
    c.paused = false; inp.enabled = true;
    for (const a of Object.keys(inp.held)) inp.held[a] = false;
    inp.keys?.clear(); inp.touchMove.x = inp.touchMove.y = 0; inp.justPressed.clear();
    try { c.pad?.releaseGameplay(); } catch { /* ignore */ }
    if (c.arms) { c.arms.held.lmb = c.arms.held.rmb = false; }
    // somewhere safe: a dock or raft edge near the boat, then further out, then the last ground you stood on
    if (b) b.park();
    let spot = b?.findLanding(6) || b?.findLanding(25);
    if (!spot && p.lastSafeSet) spot = { pos: p.lastSafe.clone(), body: null };
    if (spot) {
      p.mode = 'foot'; p.teleport(spot.pos); p.velocity.set(0, 0, 0);
      if (spot.body) p.setGround?.(spot.body);
    } else if (p.mode === 'boat') {
      b.leave();   // no ground anywhere near: into the water beside the parked boat
    }
    c.events.emit('emergency:exit');
    c.ui.toast('Emergency exit: you\'re somewhere safe. The boat is parked.');
  }
}
