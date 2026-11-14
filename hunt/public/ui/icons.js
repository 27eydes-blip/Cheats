// One icon style: 32x32 SVG, chunky filled shapes, the shared ink outline (stroke 3, round joins).
const S = (body, fill = '#ffd23f') => `<svg viewBox="0 0 32 32" fill="${fill}" stroke="#1b1033" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

export const ICONS = {
  locker: S('<rect x="6" y="4" width="20" height="25" rx="3"/><path d="M16 4v25" fill="none"/><circle cx="12.5" cy="17" r="1.6" fill="#1b1033"/><circle cx="19.5" cy="17" r="1.6" fill="#1b1033"/><path d="M9 9h4M19 9h4" fill="none"/>', '#7db8ff'),
  pass: S('<path d="M5 9a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3a3 3 0 0 0 0 7v3a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-3a3 3 0 0 0 0-7z"/><path d="M16 11l1.8 3.6 4 .5-2.9 2.8.7 4L16 20l-3.6 1.9.7-4-2.9-2.8 4-.5z" fill="#fff"/>', '#c04dff'),
  road: S('<path d="M8 28c-3-5 5-6 3-11s7-6 8-11"/><circle cx="8" cy="27" r="3"/><circle cx="11.5" cy="16.5" r="3" fill="#ff9f43"/><path d="M19 3v10" fill="none"/><path d="M19 3h8l-2 3 2 3h-8z" fill="#ff4d5e"/>', '#ffd23f'),
  friends: S('<circle cx="11" cy="11" r="5"/><circle cx="22" cy="12" r="4.2" fill="#ff9fd0"/><path d="M2.5 27c0-6 4-9 8.5-9s8.5 3 8.5 9z"/><path d="M17 27c0-4 2.5-7.5 5-7.5s7.5 2 7.5 7.5z" fill="#ff9fd0"/>', '#4be0c8'),
  settings: S('<path d="M13.4 3h5.2l.8 3.6 2.6 1.5 3.5-1.2 2.6 4.5-2.8 2.4v3l2.8 2.4-2.6 4.5-3.5-1.2-2.6 1.5-.8 3.6h-5.2l-.8-3.6-2.6-1.5-3.5 1.2-2.6-4.5 2.8-2.4v-3L4.2 11.4l2.6-4.5 3.5 1.2 2.6-1.5z"/><circle cx="16" cy="16" r="4" fill="#fff"/>', '#cfc3ff'),
  coin: S('<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="7.5" fill="#ffb800"/><path d="M16 11v10" fill="none" stroke-width="2.5"/>', '#ffd23f'),
  gem: S('<path d="M9 5h14l6 8-13 15L3 13z"/><path d="M3 13h26M9 5l4 8 3 15M23 5l-4 8-3 15" fill="none" stroke-width="2"/>', '#5ff4ff'),
  plus: S('<circle cx="16" cy="16" r="12"/><path d="M16 10v12M10 16h12" stroke-width="3.5" fill="none"/>', '#4be06e'),
  mission: S('<rect x="6" y="4" width="20" height="25" rx="3"/><path d="M11 12l2 2 4-4M11 20l2 2 4-4M20 13h2M20 21h2" fill="none"/>', '#fff3c4'),
  trophy: S('<path d="M9 4h14v7a7 7 0 0 1-14 0z"/><path d="M9 7H4v2a5 5 0 0 0 5 5M23 7h5v2a5 5 0 0 1-5 5" fill="none"/><path d="M13 18h6v4h-6zM9 27h14v-5H9z"/>', '#ffd23f'),
  close: S('<circle cx="16" cy="16" r="13"/><path d="M11 11l10 10M21 11L11 21" fill="none" stroke-width="3.5"/>', '#ff4d5e'),
  back: S('<circle cx="16" cy="16" r="13"/><path d="M18 9l-7 7 7 7" fill="none" stroke-width="3.5"/>', '#7b52ff'),
  lock: S('<rect x="7" y="14" width="18" height="14" rx="3"/><path d="M11 14v-4a5 5 0 0 1 10 0v4" fill="none"/><circle cx="16" cy="21" r="2" fill="#1b1033"/>', '#cfc3ff'),
  play: S('<path d="M10 6l16 10-16 10z"/>', '#1b1033'),
  swap: S('<path d="M6 11h17l-4-4M26 21H9l4 4" fill="none" stroke-width="3.5"/>', '#fff'),
  star: S('<path d="M16 3l3.9 8 8.6 1.2-6.3 6 1.6 8.6L16 22.6 8.2 26.8l1.6-8.6-6.3-6 8.6-1.2z"/>', '#ffd23f'),
  skull: S('<path d="M16 4c-7 0-11 4.5-11 10 0 3.5 2 5.5 4 6.5V26h14v-5.5c2-1 4-3 4-6.5 0-5.5-4-10-11-10z"/><circle cx="11.5" cy="14" r="2.5" fill="#1b1033"/><circle cx="20.5" cy="14" r="2.5" fill="#1b1033"/>', '#fff'),
  music: S('<path d="M12 23V7l14-3v16" fill="none"/><circle cx="8.5" cy="23.5" r="4"/><circle cx="22.5" cy="20.5" r="4"/>', '#4be0c8'),
  speaker: S('<path d="M5 12h5l7-6v20l-7-6H5z"/><path d="M21 11c2 2 2 8 0 10M24.5 8c4 4 4 12 0 16" fill="none"/>', '#4be0c8'),
  user: S('<circle cx="16" cy="11" r="6"/><path d="M5 28c0-7 5-10 11-10s11 3 11 10z"/>', '#7db8ff'),
  share: S('<circle cx="24" cy="7" r="4"/><circle cx="24" cy="25" r="4"/><circle cx="8" cy="16" r="4"/><path d="M11.5 14l9-5M11.5 18l9 5" fill="none"/>', '#4be0c8'),
  // world-event icons (used in the mode picker)
  ev_walls: S('<rect x="4" y="14" width="10" height="14" rx="2"/><rect x="18" y="6" width="10" height="22" rx="2"/><path d="M9 4v6M7 6l2-2 2 2M23 30" fill="none"/>', '#a48ff0'),
  ev_overgrowth: S('<circle cx="11" cy="16" r="7"/><circle cx="21" cy="14" r="8"/><circle cx="16" cy="22" r="6"/>', '#51cf66'),
  ev_wildfire: S('<path d="M16 3c1 6 9 8 9 16a9 9 0 0 1-18 0c0-5 3-6 4-10 1 3 2 4 3 4 1-3 0-6 2-10z"/><path d="M16 17c3 2 4 4 4 6a4 4 0 0 1-8 0c0-2 2-3 4-6z" fill="#ffd23f"/>', '#ff6b2b'),
  ev_lava: S('<path d="M16 3C11 11 7 15 7 20a9 9 0 0 0 18 0c0-5-4-9-9-17z"/><circle cx="13" cy="20" r="2" fill="#ffd23f"/>', '#ff4d2e'),
  ev_ice: S('<path d="M16 3v26M5 9.5l22 13M27 9.5l-22 13" fill="none" stroke="#1b1033" stroke-width="6"/><path d="M16 3v26M5 9.5l22 13M27 9.5l-22 13" fill="none" stroke="#8ee8ff" stroke-width="2.5"/>', 'none'),
  ev_blackout: S('<path d="M20 4a12 12 0 1 0 8 19A10 10 0 0 1 20 4z"/>', '#6c5ce7'),
  ev_supply: S('<path d="M8 4l8 6 8-6M16 10v5" fill="none"/><rect x="6" y="15" width="20" height="13" rx="2"/><path d="M6 21h20" fill="none"/>', '#ffd23f'),
  ev_lowgrav: S('<path d="M16 4l6 7h-4v6h-4v-6h-4z"/><ellipse cx="16" cy="24" rx="10" ry="4"/>', '#c9a6ff'),
  ev_wind: S('<path d="M3 11h17a4 4 0 1 0-4-4M3 17h22a4 4 0 1 1-4 4M3 23h10" fill="none" stroke="#1b1033" stroke-width="6"/><path d="M3 11h17a4 4 0 1 0-4-4M3 17h22a4 4 0 1 1-4 4M3 23h10" fill="none" stroke="#b8f1ff" stroke-width="2.5"/>', 'none'),
};
export const icon = (name, cls = '') => `<span class="ico ${cls}" aria-hidden="true">${ICONS[name] || ''}</span>`;
