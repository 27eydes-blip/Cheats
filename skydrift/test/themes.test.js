import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_ORDER, ACTIVE_THEME, readability, contrast, at, INK, INK_LIGHT } from '../public/themes.js';

const ALTS = Array.from({ length: 71 }, (_, i) => i * 10); // 0..700

test('every theme is complete and ACTIVE_THEME is one of them', () => {
  assert.ok(THEMES[ACTIVE_THEME], `ACTIVE_THEME "${ACTIVE_THEME}" is not a theme`);
  assert.deepEqual([...THEME_ORDER].sort(), Object.keys(THEMES).sort());
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    for (const k of ['name', 'mood', 'cost', 'swatches', 'sky', 'celestial', 'stars', 'clouds', 'islands', 'particles', 'debris', 'glider', 'spark']) {
      assert.ok(t[k] !== undefined, `${id}.${k} missing`);
    }
    assert.equal(t.sky[0][0], 0, `${id} sky must start at altitude 0`);
    assert.equal(t.sky.at(-1)[0], 700, `${id} sky must reach altitude 700`);
    for (const layer of ['meadows', 'reefs', 'aurora', 'harbor']) assert.equal(t.islands.layers[layer]?.length, 4, `${id} islands.${layer}`);
  }
});

test('the glider stands out from the sky and from islands (3:1, non-text contrast) in every theme at every altitude', () => {
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    const g = t.glider;
    const best = (bg) => Math.max(contrast(g.outlineDark, bg), contrast(g.outlineLight, bg));
    for (const alt of ALTS) {
      const r = readability(t, alt);
      assert.ok(r.outlineContrast >= 3, `${id} @${alt}: glider outline ${r.outlineContrast.toFixed(2)}:1 against the sky`);
    }
    for (const colors of Object.values(t.islands.layers)) {
      for (const c of colors) assert.ok(best(c) >= 3, `${id}: glider outline only ${best(c).toFixed(2)}:1 over island colour ${c}`);
    }
  }
});

test('UI cards keep text and the red "wrong answer" hint at 4.5:1 over every sky', () => {
  for (const id of THEME_ORDER) {
    for (const alt of ALTS) {
      const r = readability(THEMES[id], alt);
      assert.ok(r.cardContrast >= 4.5, `${id} @${alt}: card contrast ${r.cardContrast.toFixed(2)}:1`);
    }
  }
});

test('text drawn on the sky is readable (ink on its halo 4.5:1, ink on bare sky never below 2.5:1)', () => {
  assert.ok(contrast(INK, INK_LIGHT) >= 4.5);
  for (const id of THEME_ORDER) {
    for (const alt of ALTS) {
      const r = readability(THEMES[id], alt);
      assert.ok(contrast(r.text, r.halo) >= 4.5);
      assert.ok(r.textContrast >= 2.5, `${id} @${alt}: sky text ${r.textContrast.toFixed(2)}:1 even before its halo`);
    }
  }
});

test('backgrounds stay calmer than the foreground', () => {
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    for (const k of ['particles', 'debris']) if (t[k].kind !== 'none') assert.ok(t[k].opacity <= 0.6, `${id}.${k} too strong`);
    const { far, mid, near } = t.clouds.layers;
    assert.ok(far.speed < mid.speed && mid.speed < near.speed, `${id}: parallax must go far < mid < near`);
    assert.ok(near.speed <= 40, `${id}: near clouds faster than 40px/s get busy`);
    if (t.lightning) {
      // well under the WCAG limit of three flashes a second, and a soft brightening rather than a white flash
      assert.ok(t.lightning.maxOpacity <= 0.15, `${id}: lightning too bright`);
      assert.ok(t.lightning.minGap >= 5, `${id}: lightning too frequent`);
    }
    for (const v of [at(t.stars, 0), at(t.stars, 700)]) assert.ok(v >= 0 && v <= 1);
  }
});
