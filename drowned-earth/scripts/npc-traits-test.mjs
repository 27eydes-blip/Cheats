// node scripts/npc-traits-test.mjs — generates 500 random people plus every named NPC and checks that no
// combination of traits is impossible: no facial hair on female-presenting people (or on boys), named NPCs
// match their recorded presentation, shaved heads show stubble on the scalp, age lines only on the old,
// women's cuts of clothing only on women, voice pitch follows presentation, and no two named people
// standing together share a face. Prints PASS/FAIL per rule. Runs in Node (no browser).
import { generatePerson, personFor, voicePitch } from '../src/humans/Roster.js';
import fs from 'node:fs';

const npcs = JSON.parse(fs.readFileSync(new URL('../src/data/npcs.json', import.meta.url))).npcs;
const people = [];
for (let i = 0; i < 500; i++) people.push({ who: `random#${i}`, p: generatePerson(10000 + i * 7919, { palette: ['portage', 'greentide', 'rusthold', 'default'][i % 4] }) });
for (const d of npcs) people.push({ who: d.id, def: d, p: personFor(d.id, { name: d.name, presents: d.presents }) });

const female = (p) => p.sex <= 0.5;
const rules = {
  'no facial hair on female-presenting people': (x) => !female(x.p) || ((x.p.look.beard || 0) === 0 && (x.p.look.stubble || 0) === 0),
  'no beard under 19, no stubble under 17': (x) => (x.p.age >= 19 || !(x.p.look.beard > 0)) && (x.p.age >= 17 || !(x.p.look.stubble > 0)),
  'named NPCs match their presentation': (x) => !x.def || !x.def.presents || (x.def.presents === 'f') === female(x.p),
  'every named NPC has a recorded presentation': (x) => !x.def || x.def.presents === 'f' || x.def.presents === 'm',
  "women's cuts of clothing only on women": (x) => female(x.p) || !x.p.clothes.some((c) => /^female_/.test(c)),
  'a shaved head shows scalp stubble': (x) => x.p.hair !== null || (x.p.look.buzz || 0) > 0 || x.p.look.covered,
  'age lines only past 50': (x) => !(x.p.dials?.['head/head-age-incr'] > 0) || x.p.age > 50,
  'voice pitch follows presentation': (x) => (female(x.p) ? voicePitch(x.p) > 1.05 : voicePitch(x.p) < 1.05),
};
let fails = 0;
for (const [name, ok] of Object.entries(rules)) {
  const bad = people.filter((x) => !ok(x));
  console.log(`${bad.length ? 'FAIL' : 'PASS'} ${name}: ${bad.length ? bad.slice(0, 5).map((x) => `${x.who} (sex ${x.p.sex.toFixed(2)}, age ${x.p.age}, beard ${x.p.look.beard || 0}, stubble ${(x.p.look.stubble || 0).toFixed?.(2)})`).join('; ') : `${people.length} people`}`);
  if (bad.length) fails++;
}
// no two named NPCs on the same raft share a face (same face dials and skin)
const faceKey = (p) => JSON.stringify([p.skin, Object.keys(p.dials).sort().map((k) => [k, +p.dials[k].toFixed(2)])]);
const byRaft = {};
for (const x of people.filter((y) => y.def)) (byRaft[x.def.raft || '?'] ||= []).push(x);
const twins = [];
for (const list of Object.values(byRaft)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (faceKey(list[i].p) === faceKey(list[j].p)) twins.push(`${list[i].who}=${list[j].who}`);
console.log(`${twins.length ? 'FAIL' : 'PASS'} no identical faces on the same raft: ${twins.join(', ') || 'none'}`);
if (twins.length) fails++;
const f = people.filter((x) => female(x.p)).length;
console.log(`(mix: ${f} female-presenting, ${people.length - f} male-presenting of ${people.length})`);
process.exit(fails ? 1 : 0);
