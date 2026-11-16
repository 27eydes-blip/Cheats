// OBLIVION GP wordmark as an inline SVG string. The letters are hand-built stroked paths (no font),
// so the splash can show the logo before any web font loads. public/brand/wordmark.svg is generated
// from this module by scripts/brand-wordmark.mjs; edit the art here.
//
//   import { wordmarkSvg } from './brand/wordmark.js';
//   el.innerHTML = wordmarkSvg({ id: 'splash' });   // id keeps gradient/filter ids unique per copy

const H = 100, W = 18, GAP = 16, SKEW = -16; // cap height, stroke weight, letter gap, italic angle
const h = W / 2; // centre lines sit half a stroke inside the box
const R = 30; // corner radius of the round letters

// Centre-line paths for each glyph in a box `w` wide and H tall. Strokes use square caps and are
// clipped to the cap band, so diagonals end in clean horizontal cuts.
const round = (w) => `M${R + h} ${h}H${w - R - h}Q${w - h} ${h} ${w - h} ${R + h}V${H - R - h}Q${w - h} ${H - h} ${w - R - h} ${H - h}H${R + h}Q${h} ${H - h} ${h} ${H - R - h}V${R + h}Q${h} ${h} ${R + h} ${h}Z`;
const GLYPHS = {
  O: [124, round],
  B: [112, (w) => `M${h} ${H + 20}V${h}H${w - 36}Q${w - 14} ${h} ${w - 14} ${h + 21}Q${w - 14} ${H / 2} ${w - 36} ${H / 2}H${h}M${w - 36} ${H / 2}Q${w - h} ${H / 2} ${w - h} ${H / 2 + 20}Q${w - h} ${H - h} ${w - 36} ${H - h}H${h}`],
  L: [92, (w) => `M${h} -20V${H - h}H${w - h}`],
  I: [W, () => `M${h} -20V${H + 20}`],
  V: [124, (w) => `M${h} -20L${w / 2} ${H - h}L${w - h} -20`],
  N: [112, (w) => `M${h} ${H + 20}V${h}L${w - h} ${H - h}V-20`],
  G: [112, (w) => `M${w - h} ${R + h - 6}Q${w - h} ${h} ${w - R - h} ${h}H${R + h}Q${h} ${h} ${h} ${R + h}V${H - R - h}Q${h} ${H - h} ${R + h} ${H - h}H${w - R - h}Q${w - h} ${H - h} ${w - h} ${H - R - h}V${H / 2 + 2}H${w / 2 + 4}`],
  P: [104, (w) => `M${h} ${H + 20}V${h}H${w - 36}Q${w - h} ${h} ${w - h} ${h + 26}Q${w - h} ${H / 2 + 8} ${w - 36} ${H / 2 + 8}H${h}`],
};

// Lays out a word; returns { d: [paths with x offsets], width }.
function word(text) {
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const [w, fn] = GLYPHS[ch];
    parts.push(`<path transform="translate(${x} 0)" d="${fn(w)}"/>`);
    x += w + GAP;
  }
  return { paths: parts.join(''), width: x - GAP };
}

const OBL = word('OBLIVION');
const GP = word('GP');
const slant = Math.tan((-SKEW * Math.PI) / 180) * H; // how far the italic leans over the cap height

// Layout (unskewed units): OBLIVION at x 0, then the chevron badge holding GP.
const CHEV_X = OBL.width + 34, CHEV_PAD = 46, CHEV_TIP = 34, CHEV_Y = -16, CHEV_H = H + 32;
const CHEV_W = CHEV_PAD + GP.width + CHEV_PAD + 6;
const TOTAL = CHEV_X + CHEV_W + CHEV_TIP;
const VB_X = -24, VB_Y = -40, VB_W = TOTAL + slant + 60, VB_H = H + 110;

/**
 * @param {{ id?: string, title?: string, className?: string }} [opts]
 * @returns {string} a self-contained <svg> element; it scales to its CSS width (height follows).
 */
export function wordmarkSvg({ id = 'ogp', title = 'Oblivion GP', className = '' } = {}) {
  const p = (n) => `${id}-${n}`;
  const skew = `skewX(${SKEW}) translate(${slant} 0)`;
  // Checkered flag squares inside the chevron.
  const SQ = 16;
  const chev = `M${CHEV_X} ${CHEV_Y}H${CHEV_X + CHEV_W}L${CHEV_X + CHEV_W + CHEV_TIP} ${CHEV_Y + CHEV_H / 2}L${CHEV_X + CHEV_W} ${CHEV_Y + CHEV_H}H${CHEV_X}L${CHEV_X + CHEV_TIP} ${CHEV_Y + CHEV_H / 2}Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB_X} ${VB_Y} ${VB_W.toFixed(1)} ${VB_H}" role="img" aria-label="${title}"${className ? ` class="${className}"` : ''}><title>${title}</title>
<defs>
<linearGradient id="${p('silver')}" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset=".48" stop-color="#eef2fa"/><stop offset=".52" stop-color="#aeb8cc"/><stop offset="1" stop-color="#d9e0ee"/></linearGradient>
<linearGradient id="${p('streak')}" x1="${VB_X}" y1="0" x2="${TOTAL + slant}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22e6ff" stop-opacity="0"/><stop offset=".25" stop-color="#22e6ff"/><stop offset=".6" stop-color="#ffffff"/><stop offset=".85" stop-color="#ff2fc8"/><stop offset="1" stop-color="#ff2fc8" stop-opacity="0"/></linearGradient>
<pattern id="${p('check')}" width="${SQ * 2}" height="${SQ * 2}" patternUnits="userSpaceOnUse" x="${CHEV_X}" y="${CHEV_Y}"><rect width="${SQ * 2}" height="${SQ * 2}" fill="#140a26"/><path d="M0 0h${SQ}v${SQ}H0zM${SQ} ${SQ}h${SQ}v${SQ}h-${SQ}z" fill="#ffffff" fill-opacity=".16"/></pattern>
<filter id="${p('glow')}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
<clipPath id="${p('band')}"><rect x="-40" y="0" width="${TOTAL + 80}" height="${H}"/></clipPath>
</defs>
<g transform="${skew}">
<g fill="none" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="10">
<g filter="url(#${p('glow')})" opacity=".8"><g stroke="#22e6ff" stroke-width="${W + 8}" clip-path="url(#${p('band')})">${OBL.paths}</g></g>
<g stroke="url(#${p('silver')})" stroke-width="${W}" clip-path="url(#${p('band')})">${OBL.paths}</g>
</g>
<path d="${chev}" fill="#ff2fc8" opacity=".55" filter="url(#${p('glow')})"/>
<path d="${chev}" fill="url(#${p('check')})" stroke="#ff2fc8" stroke-width="5" stroke-linejoin="miter"/>
<g transform="translate(${CHEV_X + CHEV_PAD + 4} 0)" fill="none" stroke-linecap="square" stroke-linejoin="miter">
<g filter="url(#${p('glow')})" opacity=".9"><g stroke="#ff2fc8" stroke-width="${W + 8}" clip-path="url(#${p('band')})">${GP.paths}</g></g>
<g clip-path="url(#${p('band')})"><g stroke="#ff36cf" stroke-width="${W}">${GP.paths}</g><g stroke="#ffc2f1" stroke-width="2.5" opacity=".55">${GP.paths}</g></g>
</g>
</g>
<g stroke-linecap="round">
<path d="M${VB_X + 10} ${H + 30}H${TOTAL + slant - 10}" stroke="url(#${p('streak')})" stroke-width="3.5"/>
<path d="M${(TOTAL * 0.12).toFixed(1)} ${H + 42}H${(TOTAL * 0.55).toFixed(1)}" stroke="url(#${p('streak')})" stroke-width="1.8" opacity=".7"/>
</g>
</svg>`;
}

// Width / height ratio, for reserving layout space before the SVG is in the DOM.
export const WORDMARK_ASPECT = VB_W / VB_H;
