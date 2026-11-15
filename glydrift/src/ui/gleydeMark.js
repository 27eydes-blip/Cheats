// The Gleyde Technologies mark: a small, quiet gold diamond centred at the very bottom of the
// home screen (under the news ticker, which MenuScene.layout() lifts to make room). It's a real
// <button>, so it works with tap, click and keyboard. Opening it shows a small Art Deco "about"
// card over a dimmed background.
//
// It shows only on the clean home screen: never while flying, on other screens, behind a
// pop-up or on the loading screen, so it never covers a game button.
import { PUBLISHER } from "../legal.js";

const MARK_W = 28; // CSS px
const MARK_H = 39;
/** Room the home screen keeps free under the ticker, in CSS px (the mark + a little air). */
export const MARK_ROOM = MARK_H + 10;

// the logo exactly as supplied; only the gradient id differs per copy (two SVGs on one page
// can't share an id, and a gradient inside a hidden SVG stops drawing in some browsers)
const logo = (id, w, h, label) => `
<svg viewBox="0 0 200 280" width="${w}" height="${h}" role="img" aria-label="${label}">
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

const CSS = `
#gleyde-mark {
  position: fixed; z-index: 6; width: ${MARK_W + 16}px; height: ${MARK_H + 6}px;
  margin: 0; padding: 3px 8px; border: 0; background: none; cursor: pointer;
  opacity: 0.35; transition: opacity 200ms ease; -webkit-tap-highlight-color: transparent;
  line-height: 0;
}
#gleyde-mark:hover, #gleyde-mark:focus-visible { opacity: 1; }
#gleyde-mark:focus-visible { outline: 1px solid #b8934a; outline-offset: 2px; }
#gleyde-mark[hidden] { display: none; }
#gleyde-about {
  position: fixed; inset: 0; z-index: 12; display: none; align-items: center; justify-content: center;
  padding: 16px; box-sizing: border-box; background: rgba(0, 0, 0, 0.72);
}
#gleyde-about.open { display: flex; animation: gleyde-fade 200ms ease; }
@keyframes gleyde-fade { from { opacity: 0; } to { opacity: 1; } }
#gleyde-about .deco {
  position: relative; width: min(88vw, 340px); box-sizing: border-box; padding: 30px 26px 26px;
  background: #0b0b0a; border: 1px solid #b8934a; color: #e2c477; text-align: center;
  font-family: "Cinzel", "Times New Roman", serif; text-transform: uppercase; letter-spacing: 0.28em;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
#gleyde-about .deco::before {
  content: ""; position: absolute; inset: 6px; border: 1px solid #b8934a; opacity: 0.7; pointer-events: none;
}
#gleyde-about h2 { margin: 4px 0 0; font-size: 19px; font-weight: 600; line-height: 1.5; letter-spacing: 0.22em; }
#gleyde-about hr { width: 60%; margin: 0; border: 0; border-top: 1px solid #b8934a; }
#gleyde-about .role { font-size: 13px; letter-spacing: 0.4em; }
#gleyde-about .close {
  position: absolute; top: 10px; right: 12px; width: 32px; height: 32px; padding: 0; border: 0;
  background: none; color: #b8934a; font: 20px/32px "Cinzel", serif; cursor: pointer;
}
#gleyde-about .close:focus-visible { outline: 1px solid #b8934a; }
`;

let mark = null;
let about = null;
let fontLoaded = false;

/** Cinzel (Google Fonts), loaded the first time the mark appears, never before. */
function loadFont() {
  if (fontLoaded) return;
  fontLoaded = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap";
  document.head.appendChild(l);
}

function build() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  mark = document.createElement("button");
  mark.id = "gleyde-mark";
  mark.type = "button";
  mark.setAttribute("aria-label", "About Gleyde Technologies");
  mark.innerHTML = logo("gleyde-gold", MARK_W, MARK_H, "Gleyde Technologies");
  mark.hidden = true;
  mark.addEventListener("click", open);
  document.body.appendChild(mark);

  about = document.createElement("div");
  about.id = "gleyde-about";
  about.setAttribute("role", "dialog");
  about.setAttribute("aria-modal", "true");
  about.setAttribute("aria-label", PUBLISHER);
  about.innerHTML = `<div class="deco">
    <button type="button" class="close" aria-label="Close">×</button>
    ${logo("gleyde-gold-lg", 80, 112, "Gleyde Technologies")}
    <h2>${PUBLISHER.toUpperCase()}</h2>
    <hr />
    <div class="role">CEO</div>
  </div>`;
  about.addEventListener("click", (e) => {
    if (e.target === about) close(); // the dimmed background closes it
  });
  about.querySelector(".close").addEventListener("click", close);
  about.addEventListener("keydown", (e) => {
    e.stopPropagation(); // (the game's keyboard controls stay out of it)
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      e.preventDefault(); // (one control in the card: keep focus on it)
      about.querySelector(".close").focus();
    }
  });
  // (taps on the card never reach the game underneath)
  for (const t of ["pointerdown", "touchstart", "mousedown"])
    about.addEventListener(t, (e) => e.stopPropagation());
  document.body.appendChild(about);
}

function open() {
  if (!about) return;
  about.classList.add("open");
  about.querySelector(".close").focus();
}

function close() {
  if (!about?.classList.contains("open")) return;
  about.classList.remove("open");
  if (mark && !mark.hidden) mark.focus();
}

export const isAboutOpen = () => !!about?.classList.contains("open");

/** The home screen, with nothing over it (no other screen, pop-up, modal or loading screen). */
function homeIsClear(game) {
  const sm = game.scene;
  const menu = sm.keys.Menu;
  if (!menu || !sm.isActive("Menu") || !menu.sys.settings.visible) return false;
  for (const sc of sm.getScenes(true))
    if (sc !== menu && sc.sys.settings.key !== "Backdrop") return false;
  if (menu.popupOpen?.()) return false;
  const sp = document.getElementById("splash");
  if (sp && !sp.classList.contains("gone")) return false;
  if (document.querySelector("body > div.open:not(#gleyde-about)"))
    return false; // HTML modals
  return true;
}

function sync(game) {
  if (!mark) return;
  let show = false;
  try {
    show = homeIsClear(game);
  } catch {
    show = false;
  }
  if (!show) {
    if (!mark.hidden) mark.hidden = true;
    return;
  }
  loadFont();
  // centred on the canvas, just above its safe bottom edge (home indicator, cropping)
  const r = game.canvas.getBoundingClientRect();
  const k = r.height / game.scale.height;
  const sb = (game.registry.get("safeBottom") || 0) * k;
  const bottom = Math.min(r.bottom - sb, window.innerHeight) - 4;
  mark.style.left = `${Math.round(r.left + r.width / 2 - (MARK_W + 16) / 2)}px`;
  mark.style.top = `${Math.round(bottom - (MARK_H + 6))}px`;
  if (mark.hidden) mark.hidden = false;
}

/** Start the mark (checks a few times a second, like the VoiceOver layer: cheap). */
export function installGleydeMark(game) {
  if (mark || typeof document === "undefined") return;
  build();
  setInterval(() => sync(game), 200);
}
