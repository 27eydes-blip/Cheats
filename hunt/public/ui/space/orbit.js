// Missions orbit: a ring around your avatar with one arc per daily mission (filled as you make
// progress) and a small satellite circling it. The level sits in the middle.
//   createMissionOrbit({avatar, level, missions: [{f: 0..1, done}], onTap})
//     -> {el, set({avatar, level, missions}), destroy()}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const R = 44, C = 2 * Math.PI * R;
// arcs for n missions around the ring with a small gap between them (SVG dash numbers)
export function orbitArcs(missions) {
  const n = Math.max(1, missions.length), gap = 6, seg = C / n - gap;
  return missions.map((m, i) => {
    const f = m.done ? 1 : Math.max(0, Math.min(1, m.f || 0));
    return { start: i * (C / n) + gap / 2, len: seg, fill: seg * f, done: !!m.done };
  });
}

export function createMissionOrbit({ avatar = '', level = 1, missions = [], onTap = () => {} } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sp-orbit';
  const api = {
    el,
    set(o = {}) {
      avatar = o.avatar ?? avatar; level = o.level ?? level; missions = o.missions ?? missions;
      const arcs = orbitArcs(missions), done = missions.filter((m) => m.done).length;
      el.setAttribute('aria-label', `Level ${level}. Missions ${done} of ${missions.length} done`);
      el.innerHTML = `<svg class="sp-orbit-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="sp-orbit-base" cx="50" cy="50" r="${R}"/>
        ${arcs.map((a) => `<circle class="sp-orbit-seg" cx="50" cy="50" r="${R}" stroke-dasharray="${a.len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-a.start).toFixed(2)}"/><circle class="sp-orbit-fill${a.done ? ' done' : ''}" cx="50" cy="50" r="${R}" stroke-dasharray="${a.fill.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-a.start).toFixed(2)}"/>`).join('')}
        </svg><span class="sp-orbit-sat" aria-hidden="true"><i></i></span>
        <span class="sp-orbit-av">${avatar || ''}</span><span class="sp-orbit-lv">${esc(level)}</span><span class="sp-orbit-count">${done}/${missions.length}</span>`;
    },
    destroy() { el.remove(); },
  };
  el.onclick = () => onTap();
  api.set();
  return api;
}
