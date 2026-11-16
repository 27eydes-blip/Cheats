// Radar sweep: a small HUD scope with a rotating sweep (one turn every 3 s) and a few blips. The sweep turns in CSS
// (compositor only); under Reduce Flashing it holds still.
//   createRadar({blips: [[x, y] in -1..1], label}) -> {el, setBlips(blips), destroy()}
export function createRadar({ blips = [], label = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'sp-radar';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="14"/><path d="M50 4v92M4 50h92"/></svg><span class="sp-radar-sweep"></span><span class="sp-radar-blips"></span>${label ? `<span class="sp-radar-label">${label}</span>` : ''}`;
  const b = el.querySelector('.sp-radar-blips');
  const api = {
    el,
    // each blip flares as the sweep passes it: its delay is its angle (clockwise from the top) on the 3 s turn
    setBlips(list) { b.innerHTML = (list || []).map(([x, y]) => `<i style="left:${(50 + x * 42).toFixed(1)}%;top:${(50 + y * 42).toFixed(1)}%;--d:${(((((Math.atan2(x, -y) * 180) / Math.PI) + 360) % 360) / 120).toFixed(2)}s"></i>`).join(''); },
    destroy() { el.remove(); },
  };
  api.setBlips(blips);
  return api;
}
