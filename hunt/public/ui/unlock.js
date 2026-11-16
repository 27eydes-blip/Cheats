// The unlock celebration: a full-screen card when a new car is won. The car spins in onto a pad
// in its rarity glow, "NEW CAR UNLOCKED", the rarity tag, the car name and its perk, EQUIP and
// LATER. Reduce Flashing: no white flash, no pulsing, rays hold still, no confetti. Low Graphics:
// no confetti or sparks, 1x canvas. The creator credit is on the card, as on every full screen.
//
//   const u = showUnlock({ id: 'prime', perk: 'Best all-round stats', onEquip, onClose });
//   u.close();
import { Showcase } from '../race/showcase2.js';
import { makeLook, RARITY, carName, rarityOf } from '../race/looks2.js';
import { revVoice, unlockJingle } from '../race/sound2.js';
import { SETTINGS } from '../settings.js';

const CSS = `
.ulk { position: fixed; inset: 0; z-index: 400; display: grid; overflow: hidden; color: #eef6ff; background: #04030c;
  font-family: "Barlow Semi Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif; -webkit-tap-highlight-color: transparent;
  grid-template: "kick" auto "car" 1fr "info" auto "cred" auto / 1fr; padding: calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 16px) 0 calc(env(safe-area-inset-left, 0px) + 16px); }
.ulk-cv { position: absolute; inset: 0; width: 100%; height: 100%; }
.ulk > :not(canvas) { position: relative; }
.ulk-kick { grid-area: kick; text-align: center; font: 700 clamp(15px, 4.2vmin, 26px)/1.1 "Chakra Petch", "Eurostile", system-ui, sans-serif; letter-spacing: .22em; color: var(--ulk-light); text-shadow: 0 0 14px var(--ulk-glow); }
.ulk-info { grid-area: info; display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 6px; text-align: center; }
.ulk-tag { padding: 3px 12px; border-radius: 99px; font: 700 12px/1.3 "Chakra Petch", system-ui, sans-serif; letter-spacing: .2em; color: #06040c; background: var(--ulk-c); box-shadow: 0 0 14px var(--ulk-glow); }
.ulk-name { margin: 0; font: 700 clamp(24px, 7.5vmin, 46px)/1.05 "Chakra Petch", "Eurostile", system-ui, sans-serif; letter-spacing: .08em; text-shadow: 0 0 18px var(--ulk-glow), 0 2px 0 #000; }
.ulk-perk { margin: 0; font-size: clamp(13px, 3.4vmin, 17px); color: #b9c6e6; max-width: 34em; }
.ulk-btns { display: flex; gap: 12px; margin-top: 4px; }
.ulk-btn { min-width: 120px; min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1.5px solid var(--ulk-c); font: 700 15px/1 "Chakra Petch", system-ui, sans-serif; letter-spacing: .14em; cursor: pointer; color: #eef6ff; background: rgba(10,14,40,.75); }
.ulk-btn.go { color: #06040c; background: var(--ulk-c); box-shadow: 0 0 16px var(--ulk-glow); }
.ulk-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ulk-cred { grid-area: cred; text-align: center; padding: 2px 0 calc(env(safe-area-inset-bottom, 0px) + 4px); font-size: 11px; letter-spacing: .06em; color: rgba(220,230,255,.72); }
/* landscape: the car on the left, the words on the right */
@media (min-aspect-ratio: 5/4) {
  .ulk { grid-template: "kick kick" auto "car info" 1fr "cred cred" auto / 1.1fr 1fr; }
  .ulk-info { align-self: center; padding-bottom: 0; }
}
/* entrance: words rise in after the car lands (none under Reduce Flashing) */
.ulk .ulk-kick, .ulk .ulk-info { transition: opacity .45s ease, transform .45s ease; }
.ulk.pre .ulk-kick { opacity: 0; transform: translateY(-10px); }
.ulk.pre .ulk-info { opacity: 0; transform: translateY(14px); }
.ulk.calm .ulk-kick, .ulk.calm .ulk-info { transition: opacity .6s linear; transform: none; }
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style'); s.dataset.unlock = '1'; s.textContent = CSS; document.head.appendChild(s);
}

const CONFETTI = 70;
// showUnlock({id, look?, perk?, steady?, low?, sound?, parent?, onEquip?, onClose?}) -> {el, close}
export function showUnlock(opts = {}) {
  style();
  const id = opts.id, L = opts.look || makeLook(id), rarity = rarityOf(L.driver) || 'rare', R = RARITY[rarity];
  const steady = opts.steady ?? !!SETTINGS.reduceFlash, low = opts.low ?? !!SETTINGS.lowGfx;
  const el = document.createElement('div');
  el.className = 'ulk pre' + (steady ? ' calm' : '');
  el.dataset.rarity = rarity; el.dataset.car = L.driver;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `New car unlocked: ${carName(L.driver)}`);
  el.style.setProperty('--ulk-c', R.color); el.style.setProperty('--ulk-light', R.light); el.style.setProperty('--ulk-glow', R.glow + 'aa');
  el.innerHTML = `<canvas class="ulk-cv" aria-hidden="true"></canvas><div class="ulk-kick">NEW CAR UNLOCKED!</div><div class="ulk-car" style="grid-area:car"></div>
    <div class="ulk-info"><span class="ulk-tag"></span><h2 class="ulk-name"></h2><p class="ulk-perk"></p>
    <div class="ulk-btns"><button type="button" class="ulk-btn go" data-act="equip">EQUIP</button><button type="button" class="ulk-btn" data-act="later">LATER</button></div></div>
    <div class="ulk-cred">Created by Sam Eyde III</div>`;
  el.querySelector('.ulk-tag').textContent = R.name;
  el.querySelector('.ulk-name').textContent = carName(L.driver);
  const perk = el.querySelector('.ulk-perk');
  if (opts.perk) perk.textContent = opts.perk; else perk.remove();
  (opts.parent || document.body).appendChild(el);

  const cv = el.querySelector('.ulk-cv'), g = cv.getContext('2d'), slot = el.querySelector('.ulk-car'), show = new Showcase();
  // confetti in the rarity colours: x, y, vx, vy, spin, colour index (one typed array, no per-frame objects)
  const cf = new Float32Array(CONFETTI * 6), cols = [R.color, R.light, '#ffffff'];
  let start = 0, raf = 0, W = 0, H = 0, dpr = 1, open = true, pre = true, confetti = false, cx = 0, cy = 0, carLen = 120;
  const bgc = document.createElement('canvas');
  // layout is read here only (on open and on resize), never per frame; the backdrop is drawn once per size
  const size = () => {
    dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    W = el.clientWidth; H = el.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const r = slot.getBoundingClientRect(), er = el.getBoundingClientRect();
    cx = r.left - er.left + r.width / 2; cy = r.top - er.top + r.height / 2;
    carLen = Math.max(80, Math.min(r.width * 0.5, r.height * 0.62, 360));
    bgc.width = cv.width; bgc.height = cv.height;
    const b = bgc.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    gr.addColorStop(0, R.color + '40'); gr.addColorStop(0.5, '#0b0830'); gr.addColorStop(1, '#04030c');
    b.fillStyle = gr; b.fillRect(0, 0, W, H);
  };
  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  if (ro) ro.observe(el);
  const burst = (cx, cy) => {
    confetti = true;
    for (let i = 0; i < CONFETTI; i++) { const a = Math.random() * Math.PI * 2, s = 180 + Math.random() * 380, j = i * 6; cf[j] = cx; cf[j + 1] = cy; cf[j + 2] = Math.cos(a) * s; cf[j + 3] = Math.sin(a) * s - 160; cf[j + 4] = Math.random() * 6; cf[j + 5] = i % 3; }
  };
  let last = 0;
  const frame = (now) => {
    if (!open) return;
    raf = requestAnimationFrame(frame);
    if (!start) { start = now; last = now; }
    const p = (now - start) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    // backdrop: deep space tinted toward the rarity colour around the car (pre-drawn)
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bgc, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(cx, cy);
    show.draw(g, L.driver, L, p, p, { size: carLen, steady, low, rarity });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (p > 1.05 && !confetti && !steady && !low) burst(cx, cy);
    if (confetti) {
      for (let i = 0; i < CONFETTI; i++) {
        const j = i * 6; cf[j + 3] += 420 * dt; cf[j] += cf[j + 2] * dt; cf[j + 1] += cf[j + 3] * dt; cf[j + 2] *= 0.985; cf[j + 4] += dt * 8;
        if (cf[j + 1] > H + 20) continue;
        g.fillStyle = cols[cf[j + 5]]; g.globalAlpha = Math.max(0, 1 - (p - 1.05) / 3.2);
        g.fillRect(cf[j] - 3, cf[j + 1] - 1.5 * Math.abs(Math.cos(cf[j + 4])) - 0.5, 6, 3 * Math.abs(Math.cos(cf[j + 4])) + 1);
      }
      g.globalAlpha = 1;
    }
    if (pre && p > (steady ? 0.2 : 1.0)) { pre = false; el.classList.remove('pre'); }
  };
  raf = requestAnimationFrame(frame);
  if (opts.sound !== false) { unlockJingle(rarity); setTimeout(() => open && revVoice(L.voice || L.driver, 0.8), 900); }

  const close = () => {
    if (!open) return;
    open = false; cancelAnimationFrame(raf); if (ro) ro.disconnect();
    removeEventListener('keydown', onKey); el.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') { close(); opts.onClose && opts.onClose(); } };
  addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    const act = e.target.closest && e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
    if (!act) return;
    close();
    if (act === 'equip' && opts.onEquip) opts.onEquip(L.driver);
    if (opts.onClose) opts.onClose(act);
  });
  setTimeout(() => { const b = el.querySelector('[data-act="equip"]'); if (open && b) b.focus({ preventScroll: true }); }, 50);
  return { el, close };
}
