// Hunt Racers tutorial overlay (mode=tutorial, before the very first race, or Settings > HOW TO
// DRIVE). The server runs the tutorial track and reports each step as it is done
// ({k:'tut', step: 'steer' | 'drift' | 'item' | 'fire' | 'done'} in the snapshot events); this shows
// the big prompt for the current step (worded for touch or keys), the progress dots, SKIP (always
// on screen) and the YOU'RE READY! card. DOM only changes when the step or the input kind does.
export const TUT_STEPS = ['steer', 'drift', 'item', 'fire'];
export const TUT_TEXT = {
  steer: { p: 'STEER AROUND THE CONES', touch: 'Slide the stick where you want to go', keys: 'Steer with ← → or A D' },
  drift: { p: 'HOLD DRIFT THROUGH THE CURVE', touch: 'Hold DRIFT while you steer. Let go for a boost!', keys: 'Hold SHIFT while you steer. Let go for a boost!' },
  item: { p: 'DRIVE THROUGH AN ITEM BOX, THEN TAP ITEM', pk: 'DRIVE THROUGH AN ITEM BOX, THEN PRESS K', touch: 'Grab a glowing box, then tap ITEM to use it', keys: 'Grab a glowing box, then press K to use it' },
  fire: { p: 'TAP FIRE AT THE TARGET', pk: 'PRESS J AT THE TARGET', touch: "FIRE is your car's own weapon", keys: 'J or a left click fires your weapon' },
};
// local flags: the tutorial was done (or skipped); the player has steered in a race (no more hint)
export const TUT_FLAG = 'hunt-race-tut', STEER_FLAG = 'hunt-race-steered';
export const flag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
export const setFlag = (k) => { try { localStorage.setItem(k, '1'); } catch {} };
// snapshot events are rows ['kind', ...]; the newer ones are objects ({k:'reset', id, auto},
// {k:'nudge', id}, {k:'tut', id, step}): one shape for both
export const evRow = (e) => (Array.isArray(e) ? e : e && e.k ? [e.k, e.id ?? e.step, e.step] : null);
// the step named by a 'tut' row: ['tut', step] or ['tut', id, step]
export const tutStep = (e) => (typeof e[1] === 'string' ? e[1] : e[2]);

export class Tutorial {
  // root: the race layer; o: { next (a race follows), onSkip(), onGo(), onStep(step, last) }
  constructor(root, o = {}) {
    this.o = o; this.step = 0; this.key = ''; this.readyAt = 0; this.shown = false; this.racing = false;
    const el = (this.el = document.createElement('div'));
    el.className = 'rc-tut';
    el.innerHTML = `<button class="btn btn-sm alt rc-skip">SKIP</button>
      <div class="rc-tc" hidden><ol class="rc-dots">${TUT_STEPS.map(() => '<li></li>').join('')}</ol><div class="rc-tp"></div><div class="rc-ts"></div></div>
      <div class="rc-ready" hidden><div class="title">YOU'RE READY!</div><p>Steer with the stick, DRIFT in the bends, FIRE at rivals.</p><button class="btn btn-lg rc-go" data-sfx="play">${o.next ? "LET'S RACE" : 'BACK TO LOBBY'}</button></div>`;
    root.appendChild(el);
    this.$ = (s) => el.querySelector(s);
    this.$('.rc-skip').onclick = () => o.onSkip?.();
    this.$('.rc-go').onclick = () => o.onGo?.();
  }
  // every frame while racing: the prompt for this step (keys: the player uses a keyboard)
  prompt(keys) {
    this.racing = true;
    const key = this.step + (keys ? 'k' : 't');
    if (this.key === key || this.step >= TUT_STEPS.length || this.shown) return;
    this.key = key;
    const id = TUT_STEPS[this.step], x = TUT_TEXT[id], c = this.$('.rc-tc');
    c.hidden = false; c.dataset.step = id;
    this.$('.rc-tp').textContent = (keys && x.pk) || x.p;
    this.$('.rc-ts').textContent = keys ? x.keys : x.touch;
    this.el.querySelectorAll('.rc-dots li').forEach((li, i) => { li.className = i < this.step ? 'ok' : i === this.step ? 'now' : ''; });
  }
  // a 'tut' event from the server
  event(step) {
    if (step === 'done') { this.step = TUT_STEPS.length; this.ready(); return; }
    const i = TUT_STEPS.indexOf(step);
    if (i < this.step || i < 0 || this.shown) return;
    this.step = i + 1; this.key = '';
    const last = this.step >= TUT_STEPS.length;
    this.o.onStep?.(step, last);
    if (last) this.readyAt = 1.2; // the server's 'done' normally comes with it
  }
  // the server's current step (md.tut): catches up if an event was missed (e.g. after a reconnect)
  sync(name) {
    if (name === 'done') { this.ready(); return; }
    const i = TUT_STEPS.indexOf(name);
    if (i > this.step && !this.shown) { this.step = i; this.key = ''; }
  }
  tick(dt) { if (this.readyAt > 0 && (this.readyAt -= dt) <= 0) this.ready(); }
  get id() { return TUT_STEPS[this.step] || null; }
  // the button this step needs (the HUD rings it)
  focus(me) { const id = this.id; return id === 'drift' ? 'drift' : id === 'fire' ? 'fire' : id === 'item' && me && me.it >= 0 ? 'item' : null; }
  ready() {
    if (this.shown) return;
    this.shown = true;
    setFlag(TUT_FLAG);
    this.$('.rc-tc').hidden = true; this.$('.rc-skip').hidden = true; this.$('.rc-ready').hidden = false;
    this.o.onReady?.();
  }
  state() { return { step: this.step, id: this.id, shown: this.shown, prompt: this.$('.rc-tp').textContent, sub: this.$('.rc-ts').textContent, hidden: this.$('.rc-tc').hidden, dots: [...this.el.querySelectorAll('.rc-dots li')].map((l) => l.className) }; }
}
