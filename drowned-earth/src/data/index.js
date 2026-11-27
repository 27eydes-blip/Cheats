// Content registry. All game content is JSON in this folder; add entries there
// and they are picked up without code changes. Light validation runs at boot.
import locations from './locations.json';
import weather from './weather.json';

const optional = import.meta.glob('./*.json', { eager: true });

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
  };
  validate(data);
  return data;
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
