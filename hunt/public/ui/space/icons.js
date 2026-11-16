// Original line icons for the space lobby (24x24, stroke = currentColor). Drawn for this game.
const P = {
  // helmet with a visor slit
  profile: '<path d="M5 13a7 7 0 0 1 14 0v3.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5z"/><path d="M7.5 12.5h9l-1.5 3h-6z"/><path d="M12 6V3.5"/>',
  // a hangar bay with a car nose rolling out
  garage: '<path d="M3 20V10l9-6 9 6v10"/><path d="M7 20v-4.5l2-2.5h6l2 2.5V20"/><path d="M8.5 17.5h1.5M14 17.5h1.5"/><path d="M6.5 11h11"/>',
  // steering ring with three spokes and a speed tick
  race: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 14.2V20M9.9 11.3 4.4 9.6M14.1 11.3l5.5-1.7"/>',
  // a hex ticket with a four-point star
  pass: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/><path d="m12 7.5 1.3 3.2 3.2 1.3-3.2 1.3L12 16.5l-1.3-3.2L7.5 12l3.2-1.3z"/>',
  // three linked pods
  crew: '<circle cx="12" cy="7" r="3"/><circle cx="5.5" cy="16" r="2.6"/><circle cx="18.5" cy="16" r="2.6"/><path d="M10.2 9.4 7 13.8M13.8 9.4l3.2 4.4M8.2 16h7.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/><circle cx="12" cy="12" r="6.2"/>',
  coin: '<path d="M12 3.5 19.4 7.8v8.4L12 20.5l-7.4-4.3V7.8z"/><path d="M9 9.2l3 2.8-3 2.8M12.5 9.2l3 2.8-3 2.8"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bot: '<rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 8V4.5M9.5 12.5h.01M14.5 12.5h.01M9 15.5h6"/><circle cx="12" cy="4" r="1"/>',
  launch: '<path d="M5 19 19 5M19 5h-7M19 5v7"/><path d="M4 14l-1.5 1.5M10 20l-1.5 1.5M7 17l-3 3"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
};
export const SPACE_ICONS = Object.keys(P);
export const spIcon = (id, cls = '') => `<svg class="sp-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[id] || P.target}</svg>`;
