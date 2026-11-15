// Upright phone in a match: one small "turn your phone" hint. It never blocks play, goes away on
// a tap or when the phone is turned, and shows once per session.
const KEY = 'hunt-rotate-hint';
const seen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
let done = false;

export function initRotateHint() {
  const el = document.getElementById('rotate'), hud = document.getElementById('hud');
  if (!el || !hud || typeof matchMedia !== 'function') return;
  const upright = matchMedia('(orientation: portrait) and (any-pointer: coarse)');
  done = seen();
  const finish = () => { done = true; el.hidden = true; };
  const update = () => {
    const inMatch = document.body.classList.contains('ingame') && !hud.hidden;
    if (!el.hidden) { if (!upright.matches || !inMatch) finish(); return; }
    if (done || !inMatch || !upright.matches) return;
    el.hidden = false;
    try { sessionStorage.setItem(KEY, '1'); } catch {}
  };
  el.addEventListener('click', finish);
  upright.addEventListener('change', update);
  // the match HUD appearing / going away is the cue; these attributes change a few times a match
  const mo = new MutationObserver(update);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  mo.observe(hud, { attributes: true, attributeFilter: ['hidden'] });
  update();
}
