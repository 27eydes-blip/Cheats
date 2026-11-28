// Button glyphs for on-screen prompts. Original line art drawn here — simple
// geometric marks on a dark disc for the four face buttons, labelled pills for
// shoulders/triggers/sticks, and keycaps for keyboard. Nothing is copied from
// any platform's artwork.

const svg = (inner, cls = '') => `<svg class="gl ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const disc = '<circle cx="12" cy="12" r="11" fill="#161b1e" stroke="#59666c" stroke-width="1.2"/>';

// face buttons: each mark in its own muted ink so it reads at a glance
const FACE = {
  cross: svg(`${disc}<path d="M7.6 7.6l8.8 8.8M16.4 7.6l-8.8 8.8" stroke="#8fb4e8" stroke-width="2.1" stroke-linecap="round"/>`),
  circle: svg(`${disc}<circle cx="12" cy="12" r="5.2" fill="none" stroke="#e58f86" stroke-width="2.1"/>`),
  square: svg(`${disc}<rect x="7.3" y="7.3" width="9.4" height="9.4" rx="0.8" fill="none" stroke="#d99bc8" stroke-width="2"/>`),
  triangle: svg(`${disc}<path d="M12 6.6l5.6 9.6H6.4z" fill="none" stroke="#7fd0b0" stroke-width="2" stroke-linejoin="round"/>`),
};
const pill = (t) => `<span class="gl pill">${t}</span>`;
const dpad = (dir) => {
  const r = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return svg(`${disc}<path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z" fill="#2a3236" stroke="#59666c" stroke-width=".8"/><path d="M12 6.4l2 2.6h-4z" fill="#e8e2d4" transform="rotate(${r} 12 12)"/>`);
};
const stick = (side, click) => svg(`${disc}<circle cx="12" cy="12" r="6" fill="#2a3236" stroke="#8a969b" stroke-width="1.2"/><text x="12" y="15.2" font-size="8" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#e8e2d4">${side}${click ? '3' : ''}</text>`);
const touchpad = svg('<rect x="2" y="6" width="20" height="12" rx="3" fill="#161b1e" stroke="#59666c" stroke-width="1.2"/><circle cx="12" cy="12" r="1.6" fill="#e8e2d4"/>');
const small = (t) => svg(`${disc}<text x="12" y="15" font-size="6.6" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#e8e2d4">${t}</text>`);

// Standard-mapping button index → glyph
export const PAD_GLYPH = {
  0: FACE.cross, 1: FACE.circle, 2: FACE.square, 3: FACE.triangle,
  4: pill('L1'), 5: pill('R1'), 6: pill('L2'), 7: pill('R2'),
  8: small('CRT'), 9: small('OPT'), 10: stick('L', true), 11: stick('R', true),
  12: dpad('up'), 13: dpad('down'), 14: dpad('left'), 15: dpad('right'), 16: small('PS'), 17: touchpad,
};
export const PAD_NAME = { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-pad up', 13: 'D-pad down', 14: 'D-pad left', 15: 'D-pad right', 16: 'PS', 17: 'Touchpad' };
export const STICK_GLYPH = { L: stick('L'), R: stick('R') };
export const key = (t) => `<span class="gl key">${t}</span>`;

export const GLYPH_CSS = `
.gl{display:inline-block;vertical-align:-0.32em;width:1.45em;height:1.45em;margin:0 .18em}
.gl.pill{width:auto;height:auto;padding:.05em .45em;border-radius:.7em;background:#161b1e;border:1px solid #59666c;color:#e8e2d4;font:700 .78em/1.35 sans-serif;letter-spacing:.04em;vertical-align:.05em}
.gl.key{width:auto;height:auto;min-width:1.2em;padding:.05em .38em;border-radius:.22em;background:#e8e2d4;color:#111;border-bottom:2px solid #8a8576;font:700 .78em/1.35 sans-serif;text-align:center;vertical-align:.05em}
body.pad-mode .padfocus{outline:2px solid #f0c75a!important;outline-offset:2px;box-shadow:0 0 0 5px rgba(240,199,90,.22)!important;position:relative;z-index:1}
.padbar{position:fixed;right:18px;bottom:16px;z-index:6;display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:flex-end;max-width:60vw;font:13px/1.5 sans-serif;color:#e8e2d4;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .4s;pointer-events:none}
body.pad-mode .padbar.on{opacity:.92}
.padbar span{white-space:nowrap}
.wwheel{position:fixed;left:50%;top:50%;width:360px;height:360px;margin:-180px 0 0 -180px;z-index:8;pointer-events:none;display:none}
.wwheel.on{display:block}
.wwheel .seg{position:absolute;left:50%;top:50%;width:118px;margin-left:-59px;padding:8px 6px;text-align:center;font:13px/1.25 Georgia,serif;color:#e8e2d4;background:rgba(10,14,16,.78);border:1px solid rgba(232,226,212,.25);border-radius:6px;transition:transform .12s,background .12s}
.wwheel .seg small{display:block;opacity:.65;font:11px sans-serif;margin-top:2px}
.wwheel .seg.sel{background:rgba(240,199,90,.9);color:#111;transform:scale(1.08)}
.wwheel .hub{position:absolute;left:50%;top:50%;width:96px;height:96px;margin:-48px;border-radius:50%;border:1px solid rgba(232,226,212,.3);background:rgba(10,14,16,.6);display:grid;place-items:center;text-align:center;font:11px/1.3 sans-serif;color:#e8e2d4}
.padhint{display:none;position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:60;gap:14px;padding:5px 14px;border-radius:16px;background:rgba(8,11,13,.85);border:1px solid rgba(232,226,212,.18);font:12px/1.6 sans-serif;color:#e8e2d4;white-space:nowrap;pointer-events:none}
body.pad-mode .padhint{display:flex}
.remap td{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.08)}
.remap .gl{font-size:15px}
`;
