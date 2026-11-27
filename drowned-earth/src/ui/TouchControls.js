// Mobile controls: left virtual stick, right-side drag to look, action buttons.
export class TouchControls {
  constructor(ctx) {
    this.ctx = ctx;
    const input = ctx.input;
    const root = document.createElement('div');
    root.className = 'touch';
    root.innerHTML = `<div class="lookzone"></div><div class="stick"><i></i></div>
      <div class="tbtns"><div class="tbtn" data-a="light">Light</div><div class="tbtn" data-a="crouch">Crouch</div><div class="tbtn" data-a="sprint">Sprint</div>
      <div class="tbtn" data-a="radio">Radio</div><div class="tbtn" data-a="dive">Dive</div><div class="tbtn" data-a="use">Use</div></div>
      <div class="ttop"><div class="tbtn" data-a="view">View</div><div class="tbtn" data-a="inventory">Pack</div><div class="tbtn" data-a="pause">Menu</div></div>`;
    document.getElementById('ui').appendChild(root);
    this.root = root;
    const stick = root.querySelector('.stick'), knob = stick.querySelector('i');
    let sid = null, cx = 0, cy = 0;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; this.moveStick(e, cx, cy, knob); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) this.moveStick(e, cx, cy, knob); });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; input.touchMove.x = 0; input.touchMove.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const look = root.querySelector('.lookzone');
    let lid = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; input.addLook((e.clientX - lx) * 1.6, (e.clientY - ly) * 1.6); lx = e.clientX; ly = e.clientY; });
    const lend = (e) => { if (e.pointerId === lid) lid = null; };
    look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    root.querySelectorAll('[data-a]').forEach((b) => {
      const a = b.dataset.a;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.press(a); b.classList.add('held'); });
      const up = () => { input.release(a); b.classList.remove('held'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    });
    const enable = () => { input.usingTouch = true; root.classList.add('on'); };
    addEventListener('touchstart', enable, { once: true, passive: true });
    if (ctx.settings.isMobile) enable();
  }
  moveStick(e, cx, cy, knob) {
    const dx = e.clientX - cx, dy = e.clientY - cy, r = 55;
    const d = Math.min(r, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    this.ctx.input.touchMove.x = x / r; this.ctx.input.touchMove.y = -y / r;
  }
}
