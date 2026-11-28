// Portage, a little livelier: market vendors calling out in the daytime, and three hidden things to
// find — a note tucked under the chapel raft's bell, a stash tin on the sleeping pontoon, and a figure
// that only stands on the water-barrel raft in the small hours. One small mesh each; nothing runs
// unless you're in Portage. Found things are remembered in story flags.
import * as THREE from 'three';

const _m = new THREE.Vector3();
const CALLS = [
  'Kelp! Fresh kelp, cut this morning!', 'Rope, good rope, twice-tarred!', 'Lamp oil — half a scrap a cup!',
  'Who wants eels? Still kicking!', 'Mended nets, mended hulls, mended anything!', 'Salt! Dry salt, keeps the threads off you!',
  'Boiled water, clean as rain!', 'Hooks and line, cheaper than drowning!',
];
const NOTE = {
  title: 'A note under the bell',
  text: 'If you are reading this you were nosier than the rest of them. Good.\n\nThe Ward counts the rafts every spring. They never count the one that floats under the chapel — it has no lamp, so it has no name, so it has no tax.\n\nThere is a tin on the sleeping pontoon, under the third mattress from the water. It is for whoever needs it more than I did.\n\n— M.',
};
const FIGURE_LINES = [
  'You can hear them too, can\'t you. Under the planks. Counting.',
  'I was a lighthouse keeper before the water. The light still turns, somewhere down there.',
  'Don\'t tell the Ward you saw me. They have a list, and I am on it twice.',
];

export class PortageLife {
  constructor(ctx) {
    this.ctx = ctx;
    this.callT = 12; this.raftRef = null;
    const st = (ctx.state.secrets ||= {});
    this.st = st;
    const M = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    // the note: a folded paper square
    this.noteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.16), M(0xd8cfb4, 0.95));
    // the stash: a dented tin
    this.tinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x6d6a5e, roughness: 0.5, metalness: 0.6 }));
    // the figure: a tall hooded shape, almost black
    const fg = new THREE.CapsuleGeometry(0.26, 1.35, 4, 10); fg.translate(0, 0.95, 0);
    this.figure = new THREE.Mesh(fg, M(0x0d0f10, 1));
    const spot = (id, x, z) => ({ id, x, z });
    this.spots = { note: spot('chapel', 1.4, -1.2), tin: spot('sleep1', -1.6, 0.9), figure: spot('water', 0.0, 1.6) };
    const where = (key) => (v) => { const r = this.raft(this.spots[key].id); return r ? r.worldPoint(v.set(this.spots[key].x, r.deck + 0.4, this.spots[key].z), v) : v.set(0, -999, 0); };
    ctx.interact.add({ id: 'secret:note', kind: 'secret', mode: 'foot', radius: 1.6, pos: where('note'), prompt: 'Something tucked under the bell',
      enabled: () => !!this.raft('chapel') && !st.note,
      onUse: () => { st.note = true; this.noteMesh.visible = false; ctx.story.setFlag('secret_note'); ctx.ui.showNote(NOTE.title, NOTE.text); return true; } });
    ctx.interact.add({ id: 'secret:tin', kind: 'secret', mode: 'foot', radius: 1.5, pos: where('tin'), prompt: 'A tin under the mattress',
      enabled: () => !!this.raft('sleep1') && !st.tin,
      onUse: () => { st.tin = true; this.tinMesh.visible = false; for (const [k, n] of [['scrap', 6], ['bandage', 1], ['flare', 1]]) ctx.inventory.add(k, n); ctx.story.setFlag('secret_stash'); ctx.ui.whisper('Six scrap, a clean bandage, a flare wrapped in oilcloth. Someone meant this kindly.'); return true; } });
    ctx.interact.add({ id: 'secret:figure', kind: 'secret', mode: 'foot', radius: 2.4, pos: where('figure'), prompt: 'The hooded figure',
      enabled: () => !!this.raft('water') && this.figureHour() && !st.figure,
      onUse: () => {
        st.figure = true; ctx.story.setFlag('secret_figure'); this.leaving = true;   // stays visible until it has said its piece
        this.timers = FIGURE_LINES.map((l, i) => setTimeout(() => ctx.ui.subtitle(`The hooded figure: ${l}`, 4, 'speech'), i * 4200));
        this.timers.push(setTimeout(() => { this.leaving = false; ctx.ui.whisper('When you look back, there is nobody on the raft. The water barrels are still rocking.'); }, FIGURE_LINES.length * 4200));
        return true;
      } });
  }
  figureHour() { const h = this.ctx.time.hour; return h >= 1 && h < 4; }
  raft(id) { return this.ctx.state.communities?.portage?.rafts?.get(id) || null; }
  // (re)attach the small meshes to the current raft objects (rafts are rebuilt when Portage streams back in)
  attach() {
    const com = this.ctx.state.communities?.portage;
    if (!com || com === this.raftRef) return;
    this.raftRef = com;
    const put = (mesh, key) => { const r = this.raft(this.spots[key].id); if (!r) return; r.root.add(mesh); mesh.position.set(this.spots[key].x, r.deck + 0.02, this.spots[key].z); };
    put(this.noteMesh, 'note'); put(this.tinMesh, 'tin'); put(this.figure, 'figure');
    this.noteMesh.visible = !this.st.note; this.tinMesh.visible = !this.st.tin;
  }
  update(dt) {
    const c = this.ctx;
    const mk = this.raft('market');
    if (!mk) return;
    this.attach();
    this.figure.visible = this.leaving || (!this.st.figure && this.figureHour());
    // market callouts while it's open and you're close
    const p = c.player.position, mp = mk.worldPoint(_m.set(0, mk.deck, 0), _m);
    const h = c.time.hour;
    if (h > 7 && h < 18.5 && p.distanceTo(mp) < 30 && !c.ui.open) {
      this.callT -= dt;
      if (this.callT <= 0) {
        this.callT = 18 + Math.random() * 20;
        const line = CALLS[Math.floor(Math.random() * CALLS.length)];
        c.ui.subtitle(`A vendor: ${line}`, 3.2, 'speech');
        c.audio?.speak(mp, 2.2, 1);
      }
    }
  }
  reset() { for (const k of Object.keys(this.st)) delete this.st[k]; this.raftRef = null; this.leaving = false; for (const t of this.timers || []) clearTimeout(t); this.timers = []; }
  toJSON() { return { ...this.st }; }
  load(o) { this.reset(); if (o) Object.assign(this.st, o); }
}
