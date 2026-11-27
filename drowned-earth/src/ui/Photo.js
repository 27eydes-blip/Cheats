// Photo mode: freeze the world, hide the HUD, frame with free look, pick a
// filter and depth of field, and keep the shot in the journal.
const FILTERS = [['none', ''], ['memory', 'sepia(.55) hue-rotate(160deg) saturate(.8) contrast(1.05)'], ['silver', 'grayscale(1) contrast(1.15)'], ['cold', 'saturate(.7) hue-rotate(-12deg) brightness(.95)'], ['lantern', 'sepia(.35) saturate(1.3) brightness(1.05)']];
const KEY = 'drowned-earth.photos';

export class Photo {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.filter = 0;
    this.bar = document.createElement('div');
    this.bar.className = 'photobar hidden';
    document.body.appendChild(this.bar);
    ctx.events.on('key', (code) => { if (code === 'KeyK' && ctx.mode === 'play' && !ctx.ui.open) this.toggle(); });
  }
  list() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  toggle() { this.active ? this.exit() : this.enter(); }
  enter() {
    const c = this.ctx;
    this.active = true; c.paused = true; c.photoMode = true;
    document.getElementById('ui').style.visibility = 'hidden';
    this.bar.classList.remove('hidden');
    this.render();
    if (c.pipeline.uniforms.uDof) c.pipeline.uniforms.uDof.value = 1;
  }
  render() {
    this.bar.innerHTML = `<span>PHOTO</span>${FILTERS.map(([n], i) => `<button class="${i === this.filter ? 'on' : ''}" data-f="${i}">${n}</button>`).join('')}<button data-dof>${this.ctx.pipeline.uniforms.uDof?.value ? 'focus: on' : 'focus: off'}</button><button class="shoot" data-shoot>● Take</button><button data-x>Done</button>`;
    this.bar.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { this.filter = +b.dataset.f; this.ctx.canvas.style.filter = FILTERS[this.filter][1]; this.render(); }));
    this.bar.querySelector('[data-dof]').onclick = () => { const u = this.ctx.pipeline.uniforms.uDof; if (u) u.value = u.value ? 0 : 1; this.render(); };
    this.bar.querySelector('[data-shoot]').onclick = () => this.shoot();
    this.bar.querySelector('[data-x]').onclick = () => this.exit();
  }
  shoot() {
    const c = this.ctx;
    c.game.render(0);
    const src = c.canvas;
    const w = 480, h = Math.round((src.height / src.width) * w);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.filter = FILTERS[this.filter][1] || 'none';
    g.drawImage(src, 0, 0, w, h);
    const url = cv.toDataURL('image/jpeg', 0.72);
    const list = this.list();
    list.unshift({ url, day: c.time.day, time: c.time.clockString(), where: this.where() });
    while (list.length > 12) list.pop();
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { list.pop(); }
    c.audio?.play('pickup');
    this.bar.querySelector('span').textContent = 'SAVED TO JOURNAL';
    c.story.setFlag('took_photo');
  }
  where() {
    const p = this.ctx.player.position;
    let best = 'the open water', bd = 400;
    for (const l of this.ctx.worldMap.landmarks) { const d = Math.hypot(p.x - l.pos[0], p.z - l.pos[1]); if (d < bd) { bd = d; best = `near ${l.name}`; } }
    return best;
  }
  exit() {
    const c = this.ctx;
    this.active = false; c.paused = false; c.photoMode = false;
    document.getElementById('ui').style.visibility = '';
    this.bar.classList.add('hidden');
    c.canvas.style.filter = '';
    if (c.pipeline.uniforms.uDof) c.pipeline.uniforms.uDof.value = 0;
  }
}
