// Teach through play. Each hint appears once, when it becomes relevant, and
// fades. Wording adapts to touch or keyboard. The Help page holds the rest.
export class Onboarding {
  constructor(ctx) {
    this.ctx = ctx;
    this.done = ctx.state.hints = ctx.state.hints || {};
    this.cool = 0;
  }
  begin() { this.cool = 3; }
  k(desk, touch) {
    if (this.ctx.pad?.device === 'pad') return padText(desk);
    return this.ctx.input.usingTouch ? touch : desk;
  }
  hint(id, text) {
    if (this.done[id] || this.cool > 0) return false;
    this.done[id] = true; this.cool = 9;
    this.ctx.ui.hint(text);
    return true;
  }
  update(dt) {
    const c = this.ctx;
    if (c.mode !== 'play' || c.scenarioActive || c.ui.open) return;
    this.cool -= dt;
    if (this.cool > 0) return;
    const p = c.player, f = c.state.flags;
    if (p.mode === 'boat' && c.boat.tied && !c.state.logs.has('linden_01')) this.hint('look', this.k('Move the mouse to look around. Click the window first if it doesn\'t respond.', 'Drag on the right side of the screen to look around.')) || this.hint('climbin', this.k('The tower\'s doorway is right there. Press E to tie up and climb in.', 'Tap Use to tie up and climb into the tower.'));
    else if (p.mode === 'foot' && !c.state.logs.has('linden_01')) this.hint('stairs', this.k('WASD to walk. Teo\'s recorder is upstairs — the stairs are in the far corner.', 'Left stick to walk. The stairs are in the far corner.'));
    else if (c.state.logs.has('linden_01') && !f.first_salvage) this.hint('dive', this.k('There\'s a hole in the lobby floor. Step in, then hold Space to dive. Watch your wrist gauge.', 'Step into the hole in the lobby floor, then hold Dive. Watch your wrist gauge.'));
    else if (p.headUnder && !this.done.light && c.time.out.night < 0.5) this.hint('light', this.k('F for your flashlight. Swim slowly — sprinting is loud down here.', 'Light for the flashlight. Swim slowly — sprinting is loud.'));
    else if (f.first_salvage && p.mode !== 'boat') this.hint('board', this.k('Back to the boat: E beside it to board. Tab opens your pack.', 'Tap Use beside the boat to board. Pack opens your inventory.'));
    else if (p.mode === 'boat' && !c.boat.tied && !this.done.steer) this.hint('steer', this.k('W/S throttle, A/D steer, V for the outside view, R for the radio. Portage is the smoke to the south-east.', 'Stick to steer. View for the outside camera, Radio to listen. Portage is the smoke to the south-east.'));
    else if (f.dock_refused) this.hint('standing', 'Your red wristband marks you Deep-Born. The red-lamp dock round the back will take you. Sal and Madam Vance sell ways up, at a price.');
    else if (c.patrol.state === 'suspicious' || c.patrol.state === 'search') this.hint('patrol', this.k('A patrol is listening for you. C cuts your engine; F kills your lamp. Get a building between you and the beam.', 'A patrol is listening. Crouch cuts your engine; Light kills your lamp. Hide behind a building.'));
    else if (c.time.out.night > 0.7) this.hint('photo', this.k('K for photo mode, J for your journal and hand-drawn chart.', 'Pack → Journal holds your chart, photos and notes.'));
  }
}

// keyboard wording → controller wording (button names, not icons: hints are plain text)
const PADWORDS = [[/Move the mouse to look around\. Click the window first if it doesn't respond\./, 'Right stick to look around.'], [/W\/S throttle, A\/D steer/, 'Left stick to steer and throttle'], [/\bWASD\b/, 'Left stick'],
  [/\bhold Space\b/, 'hold Cross'], [/\bSpace\b/, 'Cross'], [/\bE\b/, 'Square'], [/\bF\b/, 'L1'], [/\bTab\b/, 'Options → Pack'], [/\bV\b/, 'R3'], [/\bR\b/, 'D-pad left/right'], [/\bC\b/, 'Circle'], [/\bK\b/, 'Create'], [/\bJ\b/, 'the touchpad']];
function padText(t) { for (const [a, b] of PADWORDS) t = t.replace(a, b); return t; }
