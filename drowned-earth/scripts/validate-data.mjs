// Validates the JSON content in src/data: cross-references between items,
// recipes, loot, shops, NPCs, rafts and logs.  npm run validate:data
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('src/data');
const load = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
const errors = [];
const err = (m) => errors.push(m);
const items = load('items').items;
const recipes = load('recipes').recipes;
const loot = load('loot').tables;
const trade = load('trade').shops;
const npcs = load('npcs').npcs;
const rafts = load('rafts').communities;
const pieces = load('raftPieces');
const logs = load('logs').logs;
const radio = load('radio').stations;
const story = load('story');
const locations = load('locations');

for (const r of recipes) for (const k of [...Object.keys(r.in), ...Object.keys(r.out), ...(r.tool ? [r.tool] : [])]) if (!items[k]) err(`recipe ${r.id}: unknown item ${k}`);
for (const [id, t] of Object.entries(loot)) for (const e of [...t.entries, ...(t.guaranteed || [])]) if (!items[e.item]) err(`loot ${id}: unknown item ${e.item}`);
for (const [id, s] of Object.entries(trade)) for (const k of Object.keys(s.sells)) if (!items[k]) err(`shop ${id}: unknown item ${k}`);
const platformIds = new Set(Object.values(rafts).flatMap((c) => c.platforms.map((p) => p.id)));
for (const n of npcs) { if (!platformIds.has(n.raft)) err(`npc ${n.id}: unknown raft ${n.raft}`); if (n.shop && !trade[n.shop]) err(`npc ${n.id}: unknown shop ${n.shop}`); }
for (const c of Object.values(rafts)) {
  for (const p of c.platforms) for (const pc of p.pieces) if (!pieces.pieces[pc.piece]) err(`raft ${p.id}: unknown piece ${pc.piece}`);
  for (const p of c.platforms) for (const st of p.structures || []) if (!pieces.structures[st.type]) err(`raft ${p.id}: unknown structure ${st.type}`);
  for (const b of c.bridges) for (const id of [b[0], b[2]]) if (!c.platforms.some((p) => p.id === id)) err(`bridge: unknown platform ${id}`);
}
// every log referenced in source exists
const src = fs.readdirSync('src', { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join('src', f), 'utf8')).join('\n');
for (const m of src.matchAll(/logItem\(b, '([a-z_0-9]+)'/g)) if (!logs[m[1]]) err(`log ${m[1]} placed in code but missing from logs.json`);
for (const m of src.matchAll(/openLog\('([a-z_0-9]+)'\)/g)) if (!logs[m[1]]) err(`log ${m[1]} opened in code but missing from logs.json`);
for (const m of src.matchAll(/container\(b, [^,]+, '([a-z]+)'/g)) if (!loot[m[1]]) err(`container type ${m[1]} missing from loot.json`);
for (const s of radio) if (!s.lines?.length) err(`radio ${s.id}: no lines`);
for (const o of story.objectives) if (!o.text) err(`objective ${o.id}: no text`);
if (!locations.landmarks.some((l) => l.kind === 'start_tower')) err('no start_tower landmark');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`data ok: ${Object.keys(items).length} items, ${recipes.length} recipes, ${Object.keys(loot).length} loot tables, ${npcs.length} npcs, ${Object.keys(logs).length} logs`);
