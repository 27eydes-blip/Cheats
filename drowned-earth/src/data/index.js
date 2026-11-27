// Content registry. All game content is JSON in this folder; add entries there
// and they are picked up without code changes. Light validation runs at boot.
import locations from './locations.json';
import weather from './weather.json';

const optional = import.meta.glob('./*.json', { eager: true });
const mods = import.meta.glob('../mods/*.json', { eager: true });

export function loadData() {
  const get = (name) => optional[`./${name}.json`]?.default;
  const data = {
    locations, weather,
    items: get('items') || {},
    recipes: get('recipes') || [],
    lootTables: get('loot')?.tables || {},
    factions: get('factions') || {},
    logs: get('logs') || {},
    radio: get('radio') || {},
    npcs: get('npcs') || {},
    rafts: get('rafts') || {},
    raftPieces: get('raftPieces') || {},
    trade: get('trade') || {},
    story: get('story') || {},
    deep: get('deep') || { zones: [], swarms: [], listeners: [], glow: {} },
    standing: get('standing') || { tiers: {}, steps: {} },
    nightlife: get('nightlife'),
  creatures: get('creatures') || { species: {}, placements: [], encounters: {} },
    life: loadLife(optional),
  };
  data.bottles = get('bottles') || { spots: [], notes: [] };
  // content packs: merge items, recipes, events, logs, bottles, radio lines
  for (const [path, m] of Object.entries(mods)) {
    const d = m.default; if (!d) continue;
    Object.assign(data.items.items, d.items || {});
    if (d.recipes) data.recipes.recipes.push(...d.recipes);
    if (d.events) data.life.events.push(...d.events);
    Object.assign(data.logs.logs || {}, d.logs || {});
    if (d.bottles) data.bottles.notes.push(...d.bottles);
    for (const [st, lines] of Object.entries(d.radioLines || {})) data.radio.stations?.find((s) => s.id === st)?.lines.push(...lines);
    data.modPacks = [...(data.modPacks || []), path.split('/').pop()];
  }
  validate(data);
  return data;
}

// Life-sim content: every life_*.json file is merged (events concatenated).
function loadLife(all) {
  const life = { events: [], births: {}, careers: {}, names: {}, relationships: {}, scenes: {} };
  for (const [path, mod] of Object.entries(all)) {
    if (!path.startsWith('./life')) continue;
    const d = mod.default;
    if (d.events) life.events.push(...d.events);
    for (const k of ['births', 'careers', 'names', 'relationships', 'scenes', 'activities', 'world']) if (d[k]) life[k] = Object.assign(life[k] || {}, d[k]);
  }
  return life;
}

function validate(d) {
  const items = d.items.items || {};
  const warn = (m) => console.warn('[data]', m);
  for (const r of d.recipes.recipes || []) {
    for (const k of Object.keys(r.in || {})) if (!items[k]) warn(`recipe ${r.id} uses unknown item ${k}`);
    for (const k of Object.keys(r.out || {})) if (!items[k]) warn(`recipe ${r.id} makes unknown item ${k}`);
  }
  for (const [id, t] of Object.entries(d.lootTables)) for (const e of t.entries) if (!items[e.item]) warn(`loot ${id} drops unknown item ${e.item}`);
}
