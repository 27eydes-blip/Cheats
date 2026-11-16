// Holographic art for the mode cards (inline SVG, original). Lines only, in the card's --hc colour;
// space.css adds the scanlines, the shimmer and the glow. One function per racing mode.
const W = 160, H = 110;
const wrap = (id, body) => `<svg class="sp-holo" viewBox="0 0 ${W} ${H}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><defs><linearGradient id="sph-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>${body}</svg>`;
// a car seen from behind-above, as a hologram chevron
const car = (x, y, s, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M-9 6 0-8 9 6 4 4h-8z" fill="url(#sph-car)" stroke-width="1.6"/><path d="M-9 6h-2M9 6h2" stroke-width="2.4"/></g>`;

const ART = {
  // three cars racing into a gate on a perspective track
  grand: () => wrap('grand', `<linearGradient id="sph-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".6"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient>
    <path d="M20 108 68 30h24l48 78z" fill="url(#sph-grand)" stroke-width="1.4"/>
    <path d="M80 34v10M80 52v12M80 74v14M80 98v10" stroke-width="1.6" stroke-dasharray="0" opacity=".7"/>
    <path d="M44 70h72M33 88h94M56 50h48" stroke-width=".8" opacity=".4"/>
    <path d="M58 30V12h44v18" stroke-width="2"/><path d="M58 12h44" stroke-width="4" stroke-dasharray="4 4"/>
    ${car(66, 84, 1.2)}${car(95, 72, 1)}${car(80, 52, 0.75, 0.8)}`),
  // a ring of cars; the one at the back blinks out
  elim: () => wrap('elim', `<linearGradient id="sph-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".6"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient>
    <ellipse cx="80" cy="62" rx="58" ry="32" fill="url(#sph-elim)" stroke-width="1.4"/><ellipse cx="80" cy="62" rx="40" ry="20" stroke-width=".8" opacity=".5"/>
    ${car(36, 58, 0.9)}${car(66, 34, 0.8)}${car(110, 38, 0.8)}${car(124, 66, 0.9)}
    <g opacity=".9">${car(78, 90, 1.1, 0.35)}<path d="M66 80l24 20M90 80l-24 20" stroke-width="2.6"/></g>
    <circle cx="80" cy="18" r="11" stroke-width="1.6"/><path d="M80 18V11M80 18l5 3" stroke-width="1.6"/>`),
  // a hex arena floor with two cars trading shots
  battle: () => wrap('battle', `<linearGradient id="sph-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".6"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient>
    <path d="M80 18 134 46v36L80 106 26 82V46z" fill="url(#sph-battle)" stroke-width="1.4"/>
    <path d="M80 18v88M26 46l108 36M134 46 26 82" stroke-width=".7" opacity=".35"/>
    ${car(50, 62, 1)}${car(110, 66, 1)}
    <path d="M56 54q24-26 50 2" stroke-width="1.4" stroke-dasharray="3 3"/><circle cx="106" cy="56" r="5" stroke-width="1.6"/><path d="M100 50l12 12M112 50l-12 12" stroke-width="1.2"/>
    <circle cx="80" cy="62" r="9" stroke-width=".8" opacity=".5"/>`),
  // a stopwatch over a lap-time trace
  trial: () => wrap('trial', `<circle cx="80" cy="54" r="34" fill="url(#sph-trial)" stroke-width="1.6"/><circle cx="80" cy="54" r="26" stroke-width=".8" opacity=".5" stroke-dasharray="2 4"/>
    <path d="M80 54V30M80 54l14 10" stroke-width="2.2"/><path d="M72 14h16M80 14v6M108 26l5-5" stroke-width="2"/>
    <path d="M14 98l18-8 16 4 18-12 16 6 18-14 16 8 18-10 14 4" stroke-width="1.4" opacity=".85"/>
    <path d="M14 104h132" stroke-width=".8" opacity=".4"/>`),
};
export const CARD_ART_IDS = Object.keys(ART);
export const cardArt = (id) => (ART[id] || ART.grand)();
