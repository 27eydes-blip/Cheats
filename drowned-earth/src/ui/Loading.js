// Boot loading screen: byte-weighted progress for the asset library, then a
// short "raising the district" phase while the first chunks are built.
const LINES = [
  'The water stopped rising in the fortieth year. Nobody trusts that it will stay stopped.',
  'Raft-folk read the weather in the colour of the gulls.',
  'Highmark keeps its lamp lit every night. Some say it is for you.',
  'Never dive where the water goes quiet.',
];
const LABEL = { materials: 'Weathering concrete', skies: 'Hanging the sky', objects: 'Gathering salvage', people: 'Waking the raft-folk', 'procedural fallback': 'Painting procedural textures' };

export function showLoading(root) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = `<div class="loading-inner"><h1>DROWNED EARTH</h1>
    <div class="loading-bar"><i></i></div><div class="loading-label">Starting…</div>
    <p class="loading-line">${LINES[Math.floor(Math.random() * LINES.length)]}</p></div>`;
  root.appendChild(el);
  const bar = el.querySelector('i'), label = el.querySelector('.loading-label');
  return {
    set(p, what) {
      bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`;
      label.textContent = `${LABEL[what] || what}… ${Math.round(p * 100)}%`;
    },
    phase(text) { label.textContent = text; },
    done() { el.classList.add('out'); setTimeout(() => el.remove(), 900); },
  };
}
