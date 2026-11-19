// The Gleyde Technologies mark: a small gold diamond centred at the very bottom of the home
// screen (35% opacity, 100% on hover / focus). It's a real <button> laid over the game canvas
// (tap, click and keyboard), shown only while the home screen is up and nothing covers it, never
// during a run. Pressing it opens a small Art Deco card about Gleyde Technologies, LLC.
import { PUBLISHER } from "../legal.js";

let uid = 0;

/** The Gleyde diamond as an SVG string (each copy gets its own gradient id). */
export function gleydeSvg(width = 28) {
  const id = `gleyde-gold-${++uid}`;
  const height = Math.round((width * 280) / 200);
  return `<svg viewBox="0 0 200 280" width="${width}" height="${height}" role="img" aria-label="Gleyde Technologies" focusable="false">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6E7B0"/>
      <stop offset="0.5" stop-color="#D4AF5A"/>
      <stop offset="1" stop-color="#9C7428"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#${id})">
    <polygon points="100,20 180,140 100,260 20,140" stroke-width="3.2"/>
    <polygon points="100,33 171,140 100,247 29,140" stroke-width="1"/>
    <line x1="100" y1="20" x2="100" y2="0" stroke-width="1.6"/>
    <line x1="100" y1="20" x2="84" y2="4" stroke-width="1.2"/>
    <line x1="100" y1="20" x2="116" y2="4" stroke-width="1.2"/>
    <line x1="100" y1="20" x2="70" y2="12" stroke-width="0.9"/>
    <line x1="100" y1="20" x2="130" y2="12" stroke-width="0.9"/>
    <line x1="100" y1="260" x2="100" y2="280" stroke-width="1.6"/>
    <line x1="100" y1="260" x2="84" y2="276" stroke-width="1.2"/>
    <line x1="100" y1="260" x2="116" y2="276" stroke-width="1.2"/>
    <line x1="100" y1="260" x2="70" y2="268" stroke-width="0.9"/>
    <line x1="100" y1="260" x2="130" y2="268" stroke-width="0.9"/>
    <path d="M125.7 109.4 A40 40 0 1 0 140 140 H104" stroke-width="7" stroke-linecap="square"/>
    <line x1="140" y1="140" x2="140" y2="158" stroke-width="7" stroke-linecap="square"/>
  </g>
  <g fill="url(#${id})">
    <polygon points="8,133 15,140 8,147 1,140"/>
    <polygon points="192,133 199,140 192,147 185,140"/>
    <polygon points="100,134 106,140 100,146 94,140"/>
  </g>
</svg>`;
}

const CSS = `
#gleyde-mark {
  position: fixed; z-index: 6; margin: 0; padding: 2px 6px; border: 0; background: none;
  line-height: 0; cursor: pointer; opacity: 0.35; transition: opacity 200ms ease;
  transform: translate(-50%, -50%); -webkit-tap-highlight-color: transparent;
}
/* an invisible 44 pt tap area (Apple's smallest comfortable target) around the small logo; the
   logo's own box stays small, so it never pokes past the bottom of the screen */
#gleyde-mark::before {
  content: ""; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px;
  transform: translate(-50%, -50%);
}
#gleyde-mark:hover, #gleyde-mark:focus-visible { opacity: 1; }
#gleyde-mark:focus-visible { outline: 1px solid #B8934A; outline-offset: 2px; }
#gleyde-mark[hidden] { display: none; }
#gleyde-card-wrap {
  position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.62); animation: gleyde-in 200ms ease both;
}
#gleyde-card-wrap.closing { opacity: 0; transition: opacity 200ms ease; }
@keyframes gleyde-in { from { opacity: 0; } to { opacity: 1; } }
#gleyde-card {
  position: relative; box-sizing: border-box; width: min(86vw, 340px); padding: 30px 26px 26px;
  background: #0B0B0A; color: #E2C477; text-align: center; text-transform: uppercase;
  font-family: "Cinzel", "Times New Roman", serif; letter-spacing: 0.22em;
  border: 1px solid #B8934A; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.7);
}
#gleyde-card::before {
  content: ""; position: absolute; inset: 6px; border: 1px solid #B8934A; pointer-events: none;
}
#gleyde-card .gl-logo { line-height: 0; margin-bottom: 18px; }
#gleyde-card .gl-name { font-size: 19px; font-weight: 700; line-height: 1.35; }
#gleyde-card .gl-rule { width: 64%; height: 1px; margin: 16px auto; background: #B8934A; }
#gleyde-card .gl-role { font-size: 12px; letter-spacing: 0.32em; opacity: 0.85; }
#gleyde-card .gl-person { font-size: 15px; margin-top: 6px; }
#gleyde-card .gl-close {
  position: absolute; top: 10px; right: 12px; z-index: 1; border: 0; background: none;
  color: #B8934A; font: 20px/1 "Cinzel", serif; cursor: pointer; padding: 6px;
}
#gleyde-card .gl-close:focus-visible { outline: 1px solid #B8934A; }
`;

let btn = null;
let wrap = null;

function install() {
  if (btn || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  btn = document.createElement("button");
  btn.id = "gleyde-mark";
  btn.type = "button";
  btn.setAttribute("aria-label", "About Gleyde Technologies");
  btn.innerHTML = gleydeSvg(28);
  btn.hidden = true;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openCard();
  });
  // a tap on the mark is never a tap on the game underneath
  for (const ev of ["pointerdown", "pointerup", "touchstart"]) btn.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(btn);
}

/** The About card (closes on ×, a tap outside it, or Escape). */
export function openCard() {
  if (wrap || typeof document === "undefined") return;
  wrap = document.createElement("div");
  wrap.id = "gleyde-card-wrap";
  wrap.innerHTML = `<div id="gleyde-card" role="dialog" aria-modal="true" aria-label="About ${PUBLISHER}">
    <button class="gl-close" type="button" aria-label="Close">×</button>
    <div class="gl-logo">${gleydeSvg(80)}</div>
    <div class="gl-name">${PUBLISHER.toUpperCase()}</div>
    <div class="gl-rule"></div>
    <div class="gl-role">CEO</div>
    <div class="gl-person">Sam Eyde III</div>
  </div>`;
  const stop = (e) => e.stopPropagation();
  for (const ev of ["pointerdown", "pointerup", "touchstart", "click"]) wrap.addEventListener(ev, stop);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeCard();
  });
  wrap.querySelector(".gl-close").addEventListener("click", closeCard);
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(wrap);
  wrap.querySelector(".gl-close").focus();
}

function onKey(e) {
  if (!wrap) return;
  // while the card is open no key reaches the game behind it (Space would start a run)
  e.stopPropagation();
  if (e.key === "Escape") closeCard();
}

export function closeCard() {
  if (!wrap) return;
  const w = wrap;
  wrap = null;
  document.removeEventListener("keydown", onKey, true);
  w.classList.add("closing");
  setTimeout(() => w.remove(), 200);
  if (btn && !btn.hidden) btn.focus();
}

export const isCardOpen = () => !!wrap;

/**
 * Keep the mark over a point of a scene (its centre at world x, y), visible only when `show`.
 * Call every frame from the home screen; hideGleydeMark() when it goes.
 */
export function placeGleydeMark(scene, x, y, show) {
  install();
  if (!btn) return;
  if (!show) {
    if (!btn.hidden) btn.hidden = true;
    closeCard(); // (a pop-up opening over the home screen closes the card too)
    return;
  }
  const canvas = scene.game.canvas.getBoundingClientRect();
  const k = canvas.width / scene.scale.width;
  const cam = scene.cameras.main;
  const sx = (x - cam.worldView.x) * cam.zoom;
  const sy = (y - cam.worldView.y) * cam.zoom;
  const left = `${canvas.left + sx * k}px`;
  const top = `${canvas.top + sy * k}px`;
  if (btn.style.left !== left) btn.style.left = left;
  if (btn.style.top !== top) btn.style.top = top;
  if (btn.hidden) btn.hidden = false;
}

export function hideGleydeMark() {
  if (btn) btn.hidden = true;
  closeCard();
}
