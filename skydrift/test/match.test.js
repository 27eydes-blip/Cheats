import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswerList, buildIndex, matchAnswer, normalize } from '../public/shared/match.js';
import { pointsForShare, blendedShare, tierFor } from '../public/shared/score.js';
import { SEED_DAYS } from '../src/content/seed-days.js';
import { PACKS } from '../src/content/packs.js';

const list = parseAnswerList(`
Battery | 9v battery, batteries | 12
Cactus | cacti | 10
Electric fence | electrical fence | 2.5
Escalator handrail | escalator | 0.5
`);
const idx = buildIndex(list);
const hit = (s) => { const m = matchAnswer(s, idx); return m && list[m.index].answer; };

test('normalize strips case, punctuation, articles and plurals', () => {
  assert.equal(normalize('  The BATTERIES!! '), 'battery');
  assert.equal(normalize('a Cactus'), 'cactus');
});

test('exact, alias, plural and typo matches', () => {
  assert.equal(hit('battery'), 'Battery');
  assert.equal(hit('A 9V battery'), 'Battery');
  assert.equal(hit('cacti'), 'Cactus');
  assert.equal(hit('cactuss'), 'Cactus');
  assert.equal(hit('electic fence'), 'Electric fence');
  assert.equal(hit('escalator hand rail'), 'Escalator handrail');
  assert.equal(hit('a really spiky cactus'), 'Cactus');
});

test('rejects unrelated answers', () => {
  assert.equal(hit('banana'), null);
  assert.equal(hit('cat'), null);
  assert.equal(hit(''), null);
});

test('rarer answers score more, valid answers always score', () => {
  assert.ok(pointsForShare(0.005) > pointsForShare(0.05));
  assert.equal(pointsForShare(0), 100);
  assert.equal(pointsForShare(0.9), 5);
  assert.equal(tierFor(95).id, 'legendary');
  assert.equal(tierFor(0).id, 'miss');
});

test('real answers outweigh seed estimates over time', () => {
  const seeded = blendedShare({ est: 1, estTotal: 90, count: 0, total: 0 });
  assert.ok(Math.abs(seeded - 0.01) < 1e-9);
  const popular = blendedShare({ est: 1, estTotal: 90, count: 500, total: 1000 });
  assert.ok(popular > 0.45);
});

test('every seed day and pack parses, has 7 prompts and no duplicate forms across answers', () => {
  const all = [...Object.values(SEED_DAYS).map((d) => { assert.equal(d.length, 7); return d; }).flat(), ...PACKS.flatMap((p) => p.prompts)];
  for (const p of all) {
    const l = parseAnswerList(p.answers);
    assert.ok(l.length >= 10, p.prompt);
    const seen = new Map();
    buildIndex(l).forEach((e) => e.forms.forEach((f) => {
      if (seen.has(f) && seen.get(f) !== e.index) assert.fail(`"${f}" maps to two answers in "${p.prompt}"`);
      seen.set(f, e.index);
    }));
    // canonical answers must match themselves
    l.forEach((a, i) => assert.equal(matchAnswer(a.answer, buildIndex(l))?.index, i, `${a.answer} in ${p.prompt}`));
  }
});
